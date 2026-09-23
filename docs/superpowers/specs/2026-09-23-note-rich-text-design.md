# 记事本富文本标注（高亮 / 中划线 / 文字颜色）设计

日期：2026-09-23
状态：已与用户确认

## 背景与目标

记事本区（`SpacePanel.vue` 的空间 Tab + 共用的 `TextPanel.vue`）底层是单个原生 `<textarea>`：纯文本 + `\n` 分行 + 4 空格缩进（`INDENT_UNIT`，`src/utils/textEditor.ts:6`）。挂在这份文本上的行为都必须原样保住：自动重编号、Enter 续列表前缀、Tab/Shift+Tab 缩进、Cmd+方向键移行、AI 润色选区替换（纯字符串偏移落位）、智能粘贴、待办拖入、手机速记外部追加、双层撤销（组件内字符串快照 + 看板级 JSON 快照）、跨标签页同步。

> 注：CLAUDE.md「Line Editors (ws-editor)」一节描述的 `div.ws-row` + `input.ws-input` 行编辑器在当前源码中不存在（历史上也从未存在），实际实现即上述 TextPanel textarea。`noteLines` 已无组件渲染，`workspaceLines/storageLines` 是 spaces[0]/spaces[1] 的兼容投影。CLAUDE.md 该节应在本设计落地时一并修正。

本设计为记事本文本增加**标注型行内富文本**：背景色高亮、中划线（顺带下划线）、文字颜色，粒度精确到一行中的部分文字。

已确认的产品决策：

1. **用途定位**：重点标注 + 标记作废，不是完整富文本编辑器；不含粗体（粗体改变字宽，textarea 兼容方案无法支持）。
2. **粒度**：行内局部（选中几个字单独加格式）。
3. **范围**：全部行编辑区——即当前唯一行编辑组件 TextPanel（各空间 Tab 共用）。
4. **交互**：右键菜单（主入口）+ 键盘快捷键（辅入口）。
5. **格式集合**：背景色高亮、中划线、下划线、文字颜色，全部为不改变字形宽度的格式。

## 技术路线（已选定：方案 A 镜像渲染层）

textarea 原封不动（文字透明、光标可见），其正下方叠一个排版完全一致的镜像 `<div>`，渲染同一文本并按 marks 元数据输出带样式的 `<span>`。格式数据是与文本平行的元数据，编辑面不变，因此所有既有行为天然保住、零新依赖、旧数据零迁移。

放弃的备选：换 TipTap/Quill 富文本内核（重依赖 + TextPanel 全部契约重写，中文 IME 回归风险高）；自研 contenteditable（同样重写且无库兜底）。

## 数据模型（`src/types.ts`）

```ts
type MarkType = "highlight" | "strike" | "underline" | "color";
type MarkColor = "amber" | "rose" | "green" | "blue" | "violet"; // 语义名，非裸 CSS 值
type TextMark = { type: MarkType; start: number; end: number; color?: MarkColor };
```

- `LineItem` 新增可选字段 `marks?: TextMark[]`；`[start, end)` 相对 `line.text`（不含 4 空格缩进），缩进增删不影响偏移。
- `strike`/`underline` 无 `color`；`highlight`/`color` 必须带合法 `color`，否则归一化丢弃。
- 颜色一律存语义 token 名，明暗主题由 CSS 变量各自映射：浅色主题高亮为荧光笔式半透明底，深色主题为低饱和深色底。

## 编辑器与 marks 同步（核心机制）

编辑器内部仍是一个大字符串（textarea `v-model` 不动）。组件维护全文坐标的 `editorMarks`，与 `text` 同步：

- **偏移平移器**：每次 `input` 或程序化改写后，对旧/新字符串做公共前后缀 diff，得到替换区间 `[editStart, editEnd)` 与插入长度 `delta`；与区间相交的 marks 裁剪到区间外、区间后的 marks 平移 `delta`。打字、粘贴、IME 提交、AI 润色替换、撤销、自动重编号（`9.` → `10.` 前缀变长）全部走这同一个 diff 通道，无任何特判。
- **双向转换**：`textLinesToEditorText` / `editorTextToLines`（`src/utils/textEditor.ts`）升级为携带 marks——拆行时按行边界把全文 marks 切回每行（跨行 mark 截断为两条行内 mark），拼接时反向合并。
- **本地撤销**：`undoStack` 快照从 `string` 升级为 `{ text, marks }`（`TextPanel.vue`）。
- 看板级撤销、跨标签同步、导入导出都是整 state JSON 序列化，marks 随 lines 自动包含，无额外处理。

## 渲染层（`TextPanel.vue` + `src/styles.css`）

- `.text-editor-frame`（已 `position:relative`）内、textarea 之前插入 `<div class="text-mirror" aria-hidden="true">`，绝对定位铺满。
- **排版锁死一致**：mirror 与 textarea 的排版声明（padding、font-size、line-height、letter-spacing、tab-size、white-space: pre-wrap、盒宽）必须写在同一条 CSS 规则里（同选择器列表），从结构上杜绝两处漂移；测试守护这一点。
- textarea 文字 `color: transparent`，`caret-color: var(--text)` 保留光标；placeholder 颜色单独指定不受透明影响。
- mirror 按行渲染：无 marks 的行为纯文本；带 marks 的行切分成 `<span>` 段（highlight→背景色变量、strike→`text-decoration: line-through`、underline→`text-decoration: underline`、color→文字色变量）。渲染前对 marks 按行 clamp、排序、规范化重叠；渲染是纯 computed，无抛错路径。
- **滚动同步**：textarea 为内部滚动（`scrollTop` 已在用），mirror `overflow: hidden`，监听 textarea `scroll` 事件同步 `scrollTop`。
- 只读态同样渲染（格式可见不可改）。原生选区高亮半透明叠在 mirror 颜色上，视觉可接受。

## 交互

### 右键菜单（主入口）

现有 `menuOptions`（`TextPanel.vue:101`）在 `selectionText` 非空时出现「格式」子菜单，与「AI 润色」并列：

```
格式 ▸
  高亮     ▸ 色板（amber/rose/green/blue/violet）+ 清除高亮
  文字颜色 ▸ 色板（同上 5 色）+ 恢复默认
  中划线      （toggle）
  下划线      （toggle）
  ──────────
  清除全部格式
```

- **toggle 语义**：选区已带该格式 → 再选即移除；高亮重复选同色 = 清除该色，选不同色 = 换色。
- **跨行选区**：按行边界拆成多条行内 marks 分别施加。
- 无选区时「格式」组不出现（与「删除」「AI 润色」gating 一致）。
- 菜单文案进 i18n（zh/en）。

### 键盘快捷键（编辑态生效，均要求非空选区，无选区不动作不提示）

- `Cmd/Ctrl+Shift+H` → 高亮（默认 amber，toggle）
- `Cmd/Ctrl+Shift+X` → 中划线（toggle）
- `Cmd/Ctrl+Shift+U` → 下划线（toggle）

已核对与现有绑定不冲突（现存 Shift 组合仅 Shift+Z 重做与 Shift+Tab/Enter；Cmd+←→↑↓、Ctrl+S 另属他人）。快捷键需加 IME 组合输入守卫（拼字期间不触发，与 `TodoPanel.vue:654` 的 `isImeComposing` 口径一致）。

## 既有链路相容（逐条）

| 链路 | 影响 |
|---|---|
| AI 润色选区替换 | 新文本经 diff 通道落位，被替换区间内旧 marks 清除（格式不复活）；润色结果为纯文本 |
| 智能粘贴 / 待办拖入 | 插入纯文本，区间后 marks 自动右移 |
| 手机速记追加 | plain 行无 marks，零影响 |
| 双层撤销 | 本地栈快照含 marks；看板级 JSON 快照自动包含 |
| 复制 / 站内拖动文字 | textarea 本性纯文本，格式不进剪贴板（预期行为） |
| 重编号 / Enter 续前缀 / Tab 缩进 | 走同一 diff 平移，marks 跟文本走 |
| 跨标签页同步 / 导入导出 | marks 随 lines 序列化，归一化统一修剪 |

## 存储与归一化

- `normalizeLineCollection`（`src/state/storage/normalize.ts:313`）读取并修剪 marks：`start >= end` 丢弃；越界 clamp 到 `[0, text.length]`；未知 `type`/`color` 丢弃；`highlight`/`color` 缺合法 color 丢弃；`strike`/`underline` 剥离多余 color。
- 序列化沿 `{ ...line }` 浅拷贝输出；marks 更新必须整体替换数组（不可变风格）。
- 旧数据无 marks 字段 = 无格式，零迁移。

## 错误处理

- 归一化修剪一切非法输入（上一节）。
- 渲染健壮性：marks 渲染前 clamp + 规范化，纯 computed 无抛错；最坏情况只是视觉层退化，编辑面（textarea）永不因此阻断。

## 测试（vitest 现有套件）

1. 偏移平移器单测：插入/删除/替换/行首行尾/重叠 marks/重编号前缀增长。
2. `editorTextToLines` ⇄ `textLinesToEditorText` 双向携带 marks（含缩进、多行、跨行 mark 截断）。
3. normalize：无 marks 旧数据、非法 marks 修剪、导入含 marks 数据。
4. 序列化往返一致。
5. toggle 语义（同色清除、换色、跨行选区拆分施加）。
6. 右键菜单 gating（有选区才出现格式组）。
7. 契约守护：读 `styles.css` 断言 mirror 与 textarea 的排版选择器出现在同一条规则里，防止将来只改一边导致错位。
8. 快捷键绑定与 toggle 行为。

## 落地时顺带修正

CLAUDE.md「Line Editors (ws-editor)」一节改写为 TextPanel textarea 现状 + 本设计引入的镜像渲染层说明。
