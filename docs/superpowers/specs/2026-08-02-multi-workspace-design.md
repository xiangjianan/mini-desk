# 多工作空间（Multi-Workspace）设计

- 日期：2026-08-02
- 状态：已确认，待实现计划
- 范围：Mini Desk 单页应用新增「多工作空间」能力

## 1. 目标

当前整个页面是单一独立数据。本设计让用户可以创建多个「工作空间（Workspace）」，每个空间是一份**全新的页面**，其中的图片、快捷动作、提醒事项（todos）、备忘录（notes / 中间栏子标签）以及标题、slogan 都彼此完全独立。

交互入口：点击页面左上角 Header 的「Mini Desk」标题区，弹出工作空间下拉框，支持：
- 查看并切换所有工作空间
- 新增工作空间（输入标题 + slogan）
- 重命名、删除工作空间
- 拖拽排序

切换空间后：
- 标题与 slogan 显示在新空间对应内容上
- 浏览器标签页标题（`document.title`）同步为新空间标题

## 2. 背景与约束（现有架构要点）

- 单个 `state`（reactive）持久化到 `localStorage` 的 `mini-desk-state-v1`；图片存 IndexedDB（不进 localStorage）。
- 现有「整状态序列化」模型贯穿全应用：
  - `loadState()` / `saveStateWithConflictCheck(state, opts)` / `exportJsonState(state)` / `exportUndoSnapshotState(state)` / `normalizeImportedState(payload)` 均以**整个 state 对象**为单位。
  - 跨标签同步：`BroadcastChannel`（`mini-desk-state-sync`）+ `storage` 事件，基于 `state.sync.revision`。
  - 撤销：整状态快照（`createUndoSnapshot`）。
- 标题区：`boardTitle` / `boardSlogan` 取自 `state.customTitles["board-title"]` / `["board-slogan"]`，在 `WorkbenchShell.vue` 中以 `EditableTitle`（点击就地编辑）渲染；`document.title` 由 watcher 同步。
- **命名碰撞（必须规避）**：`state.spaces` / `WorkspaceSpace` / `activeSpaceId` 已用于「中间栏子标签（工作区/仓库）」。本设计的顶层「工作空间」对外叫 Workspace，内部用 `workspaces` / `activeWorkspaceId`，二者不冲突；现有 `spaces` 子标签保持不变，并随其所属工作空间隔离。
- i18n：全部文案走 `src/state/i18n.ts`（zh/en 双语）。
- 测试：`src/__tests__/` 覆盖 state、storage 迁移、各组件。

## 3. 架构抉择：存储策略

**采纳：A — 单 key + 嵌套工作空间。**

保持现有唯一 `localStorage` key（`mini-desk-state-v1`），仅把 value 升级为「全局偏好 + `workspaces[]`」。理由：
- 现有整状态序列化、跨标签同步、冲突检测、撤销快照、导入导出**几乎零结构改动**即可继续工作。
- 文本类负载（图片已在 IndexedDB）非常小，远低于 localStorage 上限。
- 与现有「每次保存写全量」行为一致，无回归。

**否决：B — 每空间独立 key + 注册表。** 扩展性更好，但需把同步/冲突/撤销/导入导出重做为多 key 模型，与现有单 blob 架构冲突，风险与工作量都高。

## 4. 数据模型

把现有 `BoardState` 的内容拆成「全局偏好」与「工作空间内容」两层。

**类型命名决策**：保留顶层类型名 `BoardState`（语义即「整个持久化应用状态」，仅 shape 变化），新增 `WorkspaceData` 表示单空间内容。避免大面积类型重命名。

```ts
// 顶层（原 BoardState 的 shape 改造）
interface BoardState {
  // —— 全局共享：不随空间切换变化 ——
  sync: BoardSyncState;
  language: AppLanguage;
  theme: ThemeMode;
  companionGifTheme: CompanionGifTheme;
  customCompanionGif: CompanionCustomGif;
  customCompanionGifStored: CompanionCustomGifStored;

  // —— 工作空间集合 ——
  workspaces: WorkspaceData[];
  activeWorkspaceId: string;
}

// 单个工作空间 = 原 BoardState 的「内容」切片
interface WorkspaceData {
  id: string;
  createdAt: number;
  customTitles: Record<string, string>;   // board-title, board-slogan + 各栏目标题
  noteLines: LineItem[];
  workspaceLines: LineItem[];             // legacy 字段，沿用现有迁移逻辑
  storageLines: LineItem[];               // legacy 字段
  spaces: WorkspaceSpace[];               // 中间栏子标签（不变）
  activeSpaceId: string;
  images: StoredImage[];
  quickTags: QuickTag[];
  quickButtons: QuickButton[];
  quickOtherCollapsed: boolean;
  showHiddenQuickButtons: boolean;
  todoLists: TodoListConfig[];
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
}
```

不变量（实现需维护）：
- `workspaces.length >= 1`，`activeWorkspaceId` 始终指向数组中存在的某个空间。
- 全局偏好（theme/language/companion GIF）不属于任何空间，切换空间时不变。

## 5. 运行时与切换流程

- `state` 仍是单个 reactive 对象（= `BoardState`，含全局偏好 + `workspaces[]` + `activeWorkspaceId`）。
- 新增 computed：
  ```ts
  const activeWorkspace = computed<WorkspaceData>(
    () => state.workspaces.find(w => w.id === state.activeWorkspaceId)!
  );
  ```
  返回的是**当前活动空间的 reactive 对象引用**（非拷贝）。
- App.vue 中现有 `state.images` / `state.todos` / `state.customTitles` … 的读写，改为走 `activeWorkspace.value.X`：
  - 读：模板与计算属性用 `activeWorkspace.value.images` 等。
  - 写：`activeWorkspace.value.todos = addTodoToMap(...)`、`activeWorkspace.value.images.push(...)` 仍直接改变原 reactive 对象，`state` 始终是唯一真源——**无双重账本**。
  - 组件 props 由 App.vue 统一传入（`:images="activeWorkspace.value.images"`），各子组件不受影响。
- `boardTitle` / `boardSlogan` 计算属性需重新取值源：由 `state.customTitles[...]` 改为 `activeWorkspace.value.customTitles[...]`（两者仍驱动标题区显示与 `document.title`）。
- **切换空间**：仅修改 `state.activeWorkspaceId`；`activeWorkspace` 自动重算，所有面板内容随之切换。`persistNow()` 落盘。
- **`document.title`**：现有 watcher 已绑定 `boardTitle`；切换空间时 `boardTitle` 随活动空间变化 → 标签标题自动更新，无需额外代码。
- 保存 / 跨标签同步 / 撤销：继续走整状态序列化（单 blob），逻辑不变。

> 备选（不采纳）：在 `state` 里保留活动空间内容的「扁平字段 + 注册表」双份，切换时 capture/restore。会引入双重账本风险，故选用上面的 computed 投影方案。

## 6. UI 设计

### 6.1 标题区改造（`WorkbenchShell.vue`）

- 现 `board-title` 的 `EditableTitle`（就地编辑）→ 替换为**切换器触发按钮**（logo + 标题 + ▾），点击打开 `WorkspaceSwitcher`。标题不再就地可编辑。
- slogan 作为静态文本展示在旁（不再就地编辑）。
- `WorkbenchShell` 移除 board-title / board-slogan 的 `@update-title` / `@update-slogan` 通路；重命名改由 `WorkspaceSwitcher` 内完成（调用 App.vue 新增的处理函数，写入 `activeWorkspace.value.customTitles`）。
- 触发按钮范围 = logo + 标题（slogan 不参与点击）。

### 6.2 新组件 `WorkspaceSwitcher.vue`

参照现有 `SettingsMenu`（NDropdown）下拉模式。结构：

```
┌─────────────────────┐
│ ✓ Mini Desk         │  ← 当前空间（点击切换）
│   个人项目           │
│   阅读笔记           │
│ ─────────────────── │
│ ＋ 新建工作空间       │
│ ✎ 重命名   🗑 删除    │  ← 行内操作（每行）
└─────────────────────┘
```

能力：
- **查看 / 切换**：列出全部空间（活动项带 ✓），点击即切换。
- **新建**：弹对话框，输入标题（必填）+ slogan（选填）→ 生成空白 `WorkspaceData`（各栏目标题取默认、内容为空）→ 设为活动空间 → 刷新标签标题。标题重名时自动加后缀（参照现有 `nextSpaceTitle` 去重逻辑）。
- **重命名**：编辑 `customTitles.board-title` / `board-slogan`（覆盖默认 `Mini Desk` / `Do less, do it well.`）。
- **删除**：走现有确认机制（`requestConfirmation`）；至少保留 1 个空间（参照 `deleteSpace` 的 `length <= 1` 拦截 + 气泡提示）；删活动空间则切到相邻空间。
- **拖拽排序**：复用现有拖拽模式（`moveItem` 思路）重排 `state.workspaces`。
- **导出此空间**：见 §7（单空间导出入口可放在每行操作里）。

### 6.3 对话框

新建 / 重命名使用 Naive UI 对话框（或沿用现有自定义对话框模式 `.gif-theme-custom-dialog`）：标题输入（必填校验）+ slogan 输入（选填）+ 确认/取消。

## 7. 导入导出（扩展：单空间 / 全部）

导出与导入均放入设置菜单（`SettingsMenu`，NDropdown）。导入同时支持三种文件形状。

### 7.1 导出

- **导出所有空间**（Settings 菜单）：输出完整 `BoardState`（含 `workspaces[]` + 全局偏好）。文件名 `mini-desk-YYYY-MM-DD.json`。
- **导出单个空间**（Settings 菜单「导出当前空间」+ WorkspaceSwitcher 行内「导出此空间」）：输出带标记的信封：
  ```jsonc
  {
    "miniDeskWorkspaceExport": true,
    "version": 1,
    "workspace": { /* WorkspaceData */ }
  }
  ```
  文件名 `mini-desk-<标题 slug>-YYYY-MM-DD.json`，便于与全量备份区分。

### 7.2 导入（按形状分流）

`importData` 解析后，按形状分三种处理（确认弹窗文案需体现「新增」还是「替换全部」）：

1. **信封 `miniDeskWorkspaceExport: true`** → **作为新空间追加**：生成新 id（避免与现有空间碰撞），标题冲突则加后缀；保留现有所有空间，并把活动空间切换到新导入项（与「新建空间」行为一致）。
2. **含 `workspaces[]` 的完整 BoardState** → **替换全部**（整盘恢复）：用文件覆盖 `state`，`activeWorkspaceId` 取文件值（缺失则回退首个空间）。
3. **旧版扁平 BoardState**（无 `workspaces`，含内容字段）→ 视为整盘旧备份：迁移成单个工作空间后 **替换全部**（沿用旧备份「整盘恢复」语义，保持向后兼容）。

形状判定可在 `isImportPayload` / `normalizeImportedState` 中扩展（已具备按 key 判形的基础）。

## 8. 迁移（现有数据 → 多空间）

`loadState()` / `normalizeImportedState()` 检测到旧扁平结构（无 `workspaces` 字段）时：
- 把现有全部内容字段（`customTitles`、`noteLines`、`spaces`、`images`、`quickButtons`、`todoLists`、`todos` …）包装成单个 `WorkspaceData`（生成 id，沿用当前标题/slogan）。
- 全局偏好（`theme` / `language` / `companionGif*` / `sync`）上提到顶层。
- 设 `activeWorkspaceId` 指向该空间。
- 沿用现有 legacy-key 迁移套路（`todo-board-state-v1` → `mini-desk-state-v1`），**不新增 storage key**；通过「shape 内是否含 `workspaces`」判定是否需要迁移。

升级对用户无感：现有页面自动变为「工作空间 #1」。

## 9. 跨标签同步 / 撤销 / 图片

- **跨标签同步**：`BroadcastChannel` + `storage` 事件基于整状态 `sync.revision`，无需改动。
- **撤销**：整状态快照，照旧；切换空间本身也可被撤销（符合现有整状态语义）。
- **图片**：IndexedDB 仍按 `payloadId` 全局共享（id 唯一，无碰撞）；裁剪逻辑 `collectRetainedImagePayloadIds()` 需改为扫描**所有** `state.workspaces[].images`（而非仅 `state.images`），并继续纳入 undo 快照与权威 localStorage。每个空间只持有各自的 images 元数据数组。

## 10. i18n

在 `src/state/i18n.ts` 新增 zh/en 双语 key，至少覆盖：
- 切换器触发按钮 aria-label
- 「工作空间 / Workspaces」「当前空间」
- 「新建工作空间 / New workspace」「标题 / Title」「Slogan」
- 「重命名 / Rename」「删除 / Delete」「导出此空间 / Export this workspace」「导出所有空间 / Export all workspaces」「导出当前空间 / Export current workspace」
- 新建/重命名对话框：确认 / 取消 / 标题必填提示
- 导入确认：「作为新空间追加」/「替换全部空间」
- 至少保留一个空间的提示

## 11. 测试计划

- **迁移**：旧扁平 BoardState → 单工作空间，全局偏好上提；新增/更新于 `storage-key-migration.test.ts` 或 `state.test.ts`。
- **CRUD**：新建 / 重命名 / 删除（含「至少保留 1 个」）/ 排序；独立测试 + 接入 App 行为测试。
- **隔离性**：在空间 A 修改 images/todos/quickButtons/notes/标题，切换到 B 后为空或各自独立，切回 A 完好。
- **`document.title` 同步**：切换空间后标签标题更新。
- **导入导出**：全量导出再导入 = 还原；单空间导出再导入 = 追加为新空间（id 不同、标题冲突加后缀）；旧扁平文件导入 = 整盘替换。
- **图片裁剪**：多空间下被引用的 payload 不被误删。
- **组件**：新增 `WorkspaceSwitcher` 渲染/交互测试；更新 `WorkbenchShell`（标题区为切换器触发）相关测试。

## 12. 范围外（YAGNI）

- 工作空间数量**无任何限制**（不设硬上限，不做软映射限制；密度提示仅为信息性，不构成限制）。
- 跨设备云同步。
- 单空间的「复制 / 克隆」操作。
- 导入「合并去重」（多空间导入仅支持「替换全部」或「追加单空间」两种清晰语义）。

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `BoardState` shape 变更影响面广 | 保留顶层类型名；集中由 `loadState`/`normalizeImportedState` 收口形状；先补迁移测试再改运行时 |
| `activeWorkspace.value` 可能为空 | 维护「≥1 空间、activeWorkspaceId 永远有效」不变量；迁移/导入/删除均保证 |
| 标题从「就地编辑」改为「下拉切换」，改变既有习惯 | 重命名入口在下拉内显著提供（✎）；切换器触发带 ▾ 明示意 |
| 误删空间 | `requestConfirmation` + 至少保留 1 个 + 气泡提示 |
| 图片 payload 跨空间误裁剪 | `collectRetainedImagePayloadIds` 扫描全部空间 + 测试覆盖 |
