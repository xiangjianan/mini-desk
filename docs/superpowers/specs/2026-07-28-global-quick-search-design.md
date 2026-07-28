# 全局快捷搜索设计（快捷动作 / 提醒事项 / 备忘录）

- 日期：2026-07-28
- 分支：`quick-title`（实现时建议切独立分支）
- 状态：待评审

## 1. 背景与目标

快捷动作区按标签分组，数据量一大就有两个痛点：

1. **收起态找不到标签**：标签标题用 `var(--muted)`（`#6e6e73`）、字号 `var(--app-font-size) - 1px`（=11px），又淡又小，扫视无锚点。
2. **展开态找不到按钮**：按钮按文字宽度自适应（`white-space: nowrap`，无固定宽度），背景 `--muted-surface`（`#eef0f4`）对比极低，换行后无列对齐，是一片参差色块。

用户决策：把搜索框做成**顶栏全局搜索**，一个框同时筛三个面板——快捷动作、提醒事项、备忘录——匹配的留下并高亮，不匹配的隐藏，提升视觉查找效率。

### 目标
- 收起的标签更易定位（标题加重 + 每组数量徽章）。
- 展开的按钮等宽网格化，可按列扫视。
- 顶栏一个搜索框，跨三面板同时过滤 + `<mark>` 高亮命中。
- 备忘录（多 Tab 空间，textarea）在搜索时提供只读过滤视图，且**搜索后仍可切换空间**。

### 非目标（YAGNI）
- 不加 `/` 聚焦快捷键（除非后续明确要求）。
- 不做按类型（链接/文本/API）配色。
- 不改持久化结构；搜索 query 不写入 localStorage。
- 搜索态下备忘录不可编辑（清空搜索后恢复编辑）。
- 工作区/收纳等其它空间的额外 UI 不在本次范围（复用同一套过滤即可，按需追加）。

## 2. 现状（已核实）

- `WorkbenchShell.vue` 的 `workbench-command-bar` 右侧 `workbench-command-actions` 有图标按钮（隐藏/主题），并已有 `<slot name="actions" />` 被 `SettingsMenu` 占用。
- 面板通过具名插槽注入：
  - `#notes` → `QuickButtons`（快捷动作，按钮按 `quickTags` 分组）
  - `#tasks` → `TodoPanel`（提醒事项，入参 `todo-lists` + `todos`，每项 `{id, text, done, ...}`）
  - `#workspace` → `SpacePanel`（备忘录，i18n `workspace: "📝 备忘录"`；多 Tab 多空间 `WorkspaceSpace[]`，每空间 `lines: LineItem[]` 由 `TextPanel` 渲染）
- `TextPanel` 底层是 `<textarea>`（**不是** CLAUDE.md 所述的 `.ws-row`/`.ws-input` 行编辑器——已过时）。因此备忘录无法在 textarea 内"隐藏行 + 高亮 + 可编辑"三者兼得。
- `noteLines/workspaceLines/storageLines` 是从 `state.spaces` 派生的旧视图，本次不依赖。
- 已有密度感知：`QUICK_DENSITY_THRESHOLD = 8` + `declutter` 气泡（本次不动）。

## 3. 架构

### 3.1 全局搜索状态（不持久化）
新增 `src/state/globalSearch.ts`，模块级响应式单例（参考现有 `createExclusiveContextMenu` 模块单例模式）：

```ts
export const globalSearchQuery = ref("");
export const globalSearchNormalized = computed(() => globalSearchQuery.value.trim().toLowerCase());
export const isGlobalSearchActive = computed(() => globalSearchNormalized.value.length > 0);
export function setGlobalSearch(value: string): void;
export function clearGlobalSearch(): void;
export function resetGlobalSearch(): void; // 测试隔离用
```

- 头栏写入；`QuickButtons`/`TodoPanel`/`SpacePanel` 直接 `import` 读取，**零 prop 透传**。
- query **不进** localStorage；`saveState()` 无需改动。
- `resetGlobalSearch()` 供测试在每个用例前后清理模块状态。

### 3.2 高亮与匹配纯函数
新增 `src/utils/searchHighlight.ts`（纯函数，独立单测）：

```ts
export function normalizeSearchQuery(q: string): string;        // trim + toLowerCase
export function matchesSearch(text: string, normalized: string): boolean; // 子串匹配；normalized 为空 → false
export function splitHighlightSegments(text: string, normalized: string): { text: string; match: boolean }[];
```

- `splitHighlightSegments`：对 query 做正则转义后按大小写不敏感切分，返回交替的命中/非命中段；normalized 为空时返回整段非命中（即不高亮）。

### 3.3 复用的高亮组件
新增 `src/components/HighlightText.vue`：props `{ text: string; query: string }`，内部用 `splitHighlightSegments` 渲染 `<span>` + 命中段包 `<mark>`；query 为空时退化为纯文本。三个面板共用，避免重复。

## 4. 顶栏搜索框

- `WorkbenchShell.vue` 在 `workbench-command-actions` 内、现有图标按钮**左侧**新增 `<slot name="search" />`（默认空，无回退内容）。
- `App.vue` 往 `#search` 填一个 `NInput`：
  - `v-model:value` 绑 `globalSearchQuery`；前缀 `SearchOutline` 图标；`clearable`；`placeholder`（如"搜索快捷动作 / 提醒事项 / 备忘录"）；`@keydown.esc.prevent="clearGlobalSearch"`。
  - 宽度约 220px，窄屏收窄（响应式）。
- 顶栏隐藏（`headerHidden`）时搜索框一并隐藏——可接受。

## 5. 面板行为（query 非空时三面板同时过滤 + 高亮）

### 5.1 快捷动作（`QuickButtons.vue` + `styles.css`）
合并此前已确认的视觉改造，再叠加全局过滤：

- **标题强化**：`.quick-tag-heading` 标题颜色升到 `var(--text)`、字号 `var(--app-font-size)`、`font-weight: 600`；标题 `flex:1; min-width:0`。
- **数量徽章**：标题右侧 `<span class="quick-tag-count">`（`margin-left:auto`），显示该组当前展示的按钮数。
- **等宽网格**：`.quick-tag-content > .quick-buttons` 改 `display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:8px;`（用 `auto-fill` 非 Autofit，末位不被拉伸）；文字截断移到内部 `<span>`（`min-width:0; overflow:hidden; text-overflow:ellipsis`），按钮加 `:title="button.title"`。
- **过滤**：新增纯函数 `filterVisibleQuickButtonGroups(groups, normalized)`（放 `src/state/quickButtons.ts`，可单测）：
  - normalized 为空 → 原样返回，collapse 态跟随 `state`。
  - normalized 非空 → 每组：若**组标题命中**或**任一按钮命中**（匹配 `title|value`）则保留；仅组标题命中时整组按钮都展示；仅按钮命中时只展示命中按钮；0 命中组丢弃；保留的组 `collapsed` 强制为 `false`。
- **高亮**：按钮标题用 `<HighlightText :text="button.title" :query="globalSearchQuery">`。
- 组件内 `filteredGroups` computed 取代模板里直接用 `groupedButtons`；徽章计数随之反映过滤结果。
- 此前面板内本地搜索框的计划**取消**，统一走全局。

### 5.2 提醒事项（`TodoPanel.vue`）
- 读 `globalSearchNormalized`；按条目 `text` 过滤；隐藏 0 命中列表；已完成项同样可搜。
- 搜索态下**忽略"隐藏已完成"开关**（让已完成命中也显示），便于找回历史项。
- 命中文字用 `<HighlightText>` 高亮。
- query 为空时一切照常。

### 5.3 备忘录（`SpacePanel.vue` + `TextPanel.vue`）—— 只读过滤视图，Tab 保留
搜索时**不改动 textarea 真实内容**（清空即恢复，光标/撤销不受影响）。

- `SpacePanel` 读 `globalSearchNormalized` + `isGlobalSearchActive`：
  - **Tab 栏始终可见且可点**。每个空间 Tab 计算命中数：命中 > 0 的 Tab 显示**命中数量徽章**；0 命中的 Tab **变淡但仍可点击**（便于切过去确认）。
  - **当前空间的正文区**：把可编辑 textarea 换成该空间的**只读过滤行列表**——仅展示 `matchesSearch(line.text)` 的行，用 `<HighlightText>` 高亮，保留缩进（按 `line.indent` 设 `padding-left`）；无匹配显示"无匹配"提示。
  - **搜索态下切换 Tab**：允许；切到目标空间后正文区显示该空间的只读过滤视图。
- `TextPanel` 新增可选 prop `filterQuery?: string`：非空时内部用 `v-show` 隐藏 textarea、渲染只读过滤行列表（基于自身 `lines`）；为空时正常可编辑。`SpacePanel` 把全局 query 传给当前渲染的 `TextPanel`。
- query 清空 → `isGlobalSearchActive` 为 false → TextPanel 恢复 textarea、SpacePanel Tab 指示器消失。

## 6. 分期（一个 spec，三期独立可发布）

1. **Phase 1**：`globalSearch.ts` + `searchHighlight.ts` + `HighlightText.vue` + `WorkbenchShell` 的 `#search` 插槽 + `App.vue` 搜索框 + `QuickButtons`（网格/标题/数量/过滤/高亮/强制展开）+ `filterVisibleQuickButtonGroups`。端到端先跑通快捷动作。
2. **Phase 2**：`TodoPanel` 集成（过滤/高亮/隐藏空列表/搜索态忽略隐藏已完成）。
3. **Phase 3**：`SpacePanel` + `TextPanel` 只读过滤视图 + Tab 命中指示器 + 搜索态切换空间。

## 7. 改动文件

- 新增：`src/state/globalSearch.ts`、`src/utils/searchHighlight.ts`、`src/components/HighlightText.vue`
- 改：`src/components/WorkbenchShell.vue`（`#search` 插槽）、`src/App.vue`（填搜索框）、`src/components/QuickButtons.vue` + `src/styles.css`（标题/徽章/网格/截断/过滤/高亮）、`src/state/quickButtons.ts`（`filterVisibleQuickButtonGroups`）、`src/components/TodoPanel.vue`、`src/components/SpacePanel.vue` + `src/components/TextPanel.vue`

## 8. 测试策略（TDD / 80%）

先写测试（RED）再实现（GREEN）：

- `src/__tests__/search-highlight.test.ts`：`matchesSearch` / `splitHighlightSegments` —— 大小写不敏感、首尾空白、正则特殊字符、多命中、空 query、中文。
- `src/__tests__/global-search.test.ts`：`globalSearchQuery` 读写、`isGlobalSearchActive`、`resetGlobalSearch` 隔离。
- 扩展 `src/__tests__/quick-buttons.test.ts`：`filterVisibleQuickButtonGroups` —— 组标题命中整组展示、按钮 title/value 命中、0 命中组丢弃、forceExpand、尊重 `showHidden`。
- 组件/渲染测试：数量徽章存在、`HighlightText` 渲染 `<mark>`、备忘录只读视图在 query 非空时出现、Tab 命中指示器；按需调整既有快照/断言。
- 每个 Phase 结束手测浅色/深色两套主题。

## 9. 风险与边界

- **拖拽/动画**：QuickButtons 的 `TransitionGroup` 与拖拽排序在 grid 下仍生效（子元素仍是按钮）；需回归拖拽与 collapse 动画。
- **窄列网格**：`minmax(80px,1fr)` 在极窄列会退化为 1 列，可接受；该值可在 Phase 1 微调。
- **测试隔离**：模块级 query 必须在测试间 `resetGlobalSearch()`，避免串扰。
- **备忘录切换空间**：搜索态切换 Tab 仅切换只读视图，不写 textarea；确保不触发保存。
- **顶栏隐藏**：搜索框随顶栏隐藏；如后续需要常驻，再单独排期。
