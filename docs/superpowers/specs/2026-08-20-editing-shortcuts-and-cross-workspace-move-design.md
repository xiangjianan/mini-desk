# 设计：提醒事项快捷键、便签 Tab 短横线、右键跨空间移动

日期：2026-08-20
状态：已与用户逐节确认

## 概述

三组独立但同属「编辑与整理效率」的功能：

1. **提醒事项编辑快捷键**：Ctrl/Cmd+←→ 跳行首行尾；Ctrl/Cmd+↑↓ 调整提醒事项顺序。
2. **便签 Tab 智能短横线**：无标记行按 Tab，若上一行是空行或无序号/短横线开头，则加一级缩进并补 `- ` 前缀。
3. **右键「移动到空间」**：快捷按钮、快捷标签（连带其按钮）、提醒列表、单条提醒、便签 Tab 页，均可通过右键菜单移动到其他工作空间。

术语：「空间」= 工作空间（`WorkspaceData`）；中栏 Tab 标签页（`WorkspaceSpace`）即「便签」。

## 已确认的决策

- 单条提醒移动到其他空间时，通过 **二级子菜单**（空间 → 该空间的提醒列表）精确选择目标列表。
- 移动快捷标签时，**标签连同其下所有按钮**一起迁移。
- 移动单个快捷按钮时，若目标空间没有同名标签则 **自动创建**（保留颜色），有同名则挂到现有标签。
- 架构采用 **方案 A**：`src/state/workspaceMoves.ts` 纯函数模块 + 各面板自持子菜单 + `App.vue` 薄接线。

## 第 1 节：提醒事项编辑快捷键

### Ctrl/Cmd + ←/→ 跳行首/行尾

- 作用域：`input.todo-input`（普通提醒列表）与 today-focus 输入框。
- 修饰键判定：`event.ctrlKey || event.metaKey`，与便签面板现有行首行尾快捷键（`TextPanel.vue` 的 `handleKeydown`）一致，Mac 上 Cmd 同样可用。
- 行首 = 光标 0；行尾 = `value.length`。提醒文本没有列表标记，缩进即文本的一部分，取绝对 0/末尾最可预期。
- 仅在条目可编辑（非 readonly）时拦截并 `preventDefault`，随后 `setSelectionRange`。
- IME 组合期间不响应（沿用 `isImeComposing` 守卫）。

### Ctrl/Cmd + ↑/↓ 上下移动顺序

- 在 `handleTodoArrowKey` 内分流：带 Ctrl/Cmd → 移动条目顺序；不带 → 维持现状（焦点上下移动）。
- 作用域：仅普通提醒列表；today-focus 区不启用（跨列表置顶视图，移动语义不明确），Ctrl+↑↓ 在该区回落为普通焦点移动。
- 移动限制在**同一视觉分组**内（相同 done + 相同 starred），因为已完成沉底、置顶上浮，跨组移动在数组换位后视觉上无变化。
- 复用现有 `move` 事件与 `state/todos.ts` 的 `moveTodo`（落位语义：`targetIndex` 在移除被移条目前计算——上移 = 插到目标前，下移 = 落在目标原索引处即目标之后；已由 `state.test.ts` 的 image-style ordering 用例固化）：
  - 上移：`targetId` = 上一条同组可见提醒的 id。
  - 下移：`targetId` = 下一条同组提醒的 id。
- 偏移换算封装为 `state/todos.ts` 纯函数 `getTodoReorderTarget(orderedTodos, id, direction)`：返回 `{ targetId: string }`，组内无移动空间时返回 `null` 表示无操作（不触发保存）。（勘误：初稿按 insert-before 写成"下移取再下一条"，实施时对照 `moveTodo` 源码与既有测试证伪并修正。）
- 条目随 DOM 重排保持焦点，`nextTick` 后把光标放回原偏移位置，可连续按。
- 边界：组内第一条上移 / 最后一条下移 → 无操作。

## 第 2 节：便签 Tab 智能短横线

改动位置：`utils/textEditor.ts` 的 `applySingleLineIndent`（Tab 单行路径），纯函数。

### 术语

- **紧邻上一行**：物理上直接位于当前行上方的行（不跳过空行）；首行视为没有上一行。
- **有标记**：去掉缩进后以 `1. ` 类序号或 `- ` / `* ` 短横线开头。

### 规则（只改 Tab，不动 Shift+Tab）

对**本身无标记**的行按 Tab：

- 紧邻上一行 (a) 不存在（首行）、(b) 是空行、或 (c) 去缩进后没有序号/短横线开头 → 结果为 **缩进 +1 且加 `- ` 前缀**。
- 紧邻上一行**有**标记 → 现有继承逻辑：按目标层级的最近同级兄弟继承 `1. ` / `- `，无兄弟默认 `- `。
- 关键变化：**不再要求光标在行首、不要求当前行无缩进**。统一后「无标记的行按 Tab 总会获得一个标记」。

### 保持不变

- 已有标记的行（`1. x` / `- x`）按 Tab：标记随层级同步（现状）。
- Shift+Tab、多行选区 Tab、Enter 续行、光标保持文本内相对偏移：全部不变。

### 示例

```
购物清单        ← 无标记
买牛奶|         ← 光标在行尾按 Tab
```
现状 → `    买牛奶`；新规则 → `    - 买牛奶`。

```
1. 第一项
第二项|         ← 按 Tab
```
上一行有序号 → 走继承，目标层级无兄弟 → `    - 第二项`（与现状光标在行首时一致，不再依赖光标位置）。

## 第 3 节：右键「移动到空间」

### 状态层：`src/state/workspaceMoves.ts`（新建，全部纯函数、不可变更新）

入参 `(workspaces, fromWorkspaceId, …)`，返回新的 `workspaces` 数组：

| 函数 | 行为 |
|---|---|
| `moveQuickButtonToWorkspace` | 按钮追加到目标 `quickButtons` 末尾；若带有效 `tagId`（标签仍存在于源空间），目标按**标签标题**匹配：有同名挂现有标签，没有则新建同名同色标签；`tagId` 悬空（标签已不存在）视为无标签，直接迁移 |
| `moveQuickTagToWorkspace` | 标签 + 其下全部按钮一起迁移，分别追加到目标 `quickTags` / `quickButtons` 末尾 |
| `moveTodoListToWorkspace` | 迁移 `TodoListConfig` + `todos[listId]` + `showCompletedTodos[listId]`，追加到目标 `todoLists` 末尾；列表的 `column` 保留原值（展示时会被现有 clamp 逻辑收敛）；源只剩 1 个列表时拒绝（返回原数组） |
| `moveTodoToWorkspace` | 单条提醒迁移到目标空间指定列表，插在「最后一条未完成之后」（复用 `addTodo` 语义） |
| `moveSpaceToWorkspace` | `WorkspaceSpace` 追加到目标 `spaces` 末尾；源只剩 1 个空间时拒绝；移动的是源激活空间时，源 `activeSpaceId` 切到相邻空间（优先前一个，同 `deleteSpace` 规则） |

### UI 层

- 各面板新增 `moveTargets` prop：`{ id, title; lists?: { id; title }[] }[]`，App 侧已排除当前空间；空数组则不渲染移动菜单项。
- **快捷按钮**右键菜单：加「移动到空间 ›」子菜单（子项 = 空间名）。
- **快捷标签**：`.quick-tag-heading` 新增专属右键菜单，仅含「移动到空间 ›」一项（重命名仍是双击，删除仍在标签管理弹窗）；「其他」伪分组（`__other`）不提供右键移动。
- **提醒条目**右键：加「移动到空间 › 空间 › 列表」三级子菜单。
- **提醒列表**右键（sectionActions 菜单）：加「移动到空间 ›」；源只剩 1 个列表时禁用。
- **便签 Tab**右键（现有 重命名/删除 菜单）：加「移动到空间 ›」；源空间只剩 1 个便签时禁用。

### App.vue 接线

- 每个面板 emit 窄类型事件：`moveButtonToWorkspace` / `moveTagToWorkspace` / `moveTodoListToWorkspace` / `moveTodoToWorkspace` / `moveSpaceToWorkspace`。
- App 调用对应纯函数后 `persistNow()`；便签移动后额外调用现有 `syncLegacySpaceLines()`。
- 守卫失败（最后列表/最后空间）时 `showBubble` 提示：复用现有「至少保留一个空间」文案，新增「至少保留一个提醒事项列表」（zh/en）。
- 移动是结构变更，`persistNow()` 自动记录撤销快照（`useUndoHistory` 的 `onBeforeSave`），Ctrl+Z 可回退；不是删除操作，无需确认弹窗。

### i18n

- `common.moveToWorkspace`：zh「移动到空间」/ en "Move to workspace"。
- `app.keepOneTodoList`：zh「至少保留一个提醒事项列表」/ en 对应文案。

## 测试

- `workspaceMoves.test.ts`：五类移动正例；守卫（最后列表/最后空间拒绝）；标签按标题复用与新建；`activeSpaceId` 修正；不可变性（原数组不被修改）。
- `text-editor.test.ts`：新 Tab 规则用例（上一行空行/无标记 → 加短横线；光标在行中也生效；已有缩进；首行；上一行有标记 → 继承）；更新「caret 不在行首仅缩进」的既有用例期望值。
- `todos.test.ts`：`getTodoReorderTarget` 上移/下移/组内边界/跨组不动。
- `todo-panel.test.ts` / `quick-buttons.test.ts` / `space-panel.test.ts` 模式：菜单渲染（有/无其他空间）与事件 emit。

## 不做的事（范围外）

- 不改 Shift+Tab、多行选区 Tab、Enter 续行行为。
- today-focus 区不做 Ctrl+↑↓ 顺序移动。
- 不为移动操作加确认弹窗（非删除、可撤销）。
- 不支持拖拽跨空间移动（本次仅右键菜单）。
