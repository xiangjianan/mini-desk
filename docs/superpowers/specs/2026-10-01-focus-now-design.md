# 「现在做这个」专注弹窗设计

日期：2026-10-01
状态：已与用户对齐，待实施

## 背景与目标

把今天要做的那件事放在眼前：在提醒事项上右键选「现在做这个」，弹出全屏专注弹窗——当前屏幕上所有内容被毛玻璃虚化，只显示弹窗。弹窗内可对该任务计时、随手贴图、随手记笔记。

## 决策记录（用户已确认）

| 决策点 | 结论 |
| --- | --- |
| 数据存放 | 挂 `TodoItem` 可选字段（方案 A），随任务跨工作区移动 |
| 暂停后可见性 | 行内显示累计时长徽标；**点击徽标即重新打开弹窗续做** |
| 虚化强度 | 加强虚化（约 18px + 加深蒙层），仅作用于本弹窗 |
| 下方区域 | 左 ~10% 贴图条 + 右 ~90% 记事本（完整复用既有编辑器） |
| 完成任务 | 计时/笔记/图片**全部保留**，徽标与菜单入口继续可用 |
| 删除任务 | 三个字段随 todo 一并移除；IndexedDB 载荷走撤销宽限删除 |

## 数据模型

```ts
interface TodoItem {
  // ...既有字段
  focusElapsedMs?: number;      // 累计专注毫秒；仅 >0 时存在
  focusNotes?: LineItem[];      // 随手记；与便签/空间 Tab 同构（含 marks 高亮元数据）
  focusImages?: StoredImage[];  // 贴图元数据；载荷走既有 IndexedDB（按 id 全局存）
}
```

- 字段全部可选、按需存在，导入归一化无需特殊迁移（缺省即无痕）。
- 图片元数据存 localStorage、载荷存 IndexedDB，与工作区贴图同一套设施（`src/state/images.ts`）。

## 入口（两个，汇到同一事件）

1. **右键菜单**：单条提醒的菜单首项「现在做这个」（`key: "focus-now"`），对所有任务（含已完成）可用。
2. **行内徽标**：`focusElapsedMs > 0` 的任务行显示 `⏱ 12:34`（超过 1 小时显示 `1:02:03`），点击打开弹窗续做。普通列表行与「今日聚焦」区行两处都渲染。

`TodoPanel` 新增 emit `focusNow: [period, id]`，App.vue 打开弹窗。

## 弹窗（新组件 `src/components/TodoFocusModal.vue`）

- 复用 `NModal`：遮罩天然盖住顶部命令栏（全局 z-index 处理已有）；**本弹窗专属** 18px 虚化 + 加深蒙层，通过容器类作用域，不影响其他弹窗材质。
- 布局自上而下：
  1. 标题 = 任务文本；
  2. 顶部居中大号计时器；
  3. 右上角关闭按钮（Esc 等价）；
  4. 下方约 70% 高度：左右分栏——左侧 ~10% 贴图条、右侧 ~90% 记事本。
- **计时**：打开时从 `focusElapsedMs` 起跳；组件内 `setInterval` 每秒驱动本地显示 ref（不逐秒写 state）。关闭（按钮/Esc/遮罩）= 暂停：把本次增量合并回 `focusElapsedMs` 并 `persistNow()`。每 60 秒静默落盘一次，`beforeunload` 冲刷，崩溃最多丢一分钟。
- **记事本（右侧）**：直接嵌入 `TextPanel`（`lines` 进 `update` 出，同 SpacePanel 复用方式）。快捷键、Tab/Shift+Tab 缩进、列表续行与重编号、选中右键「格式」高亮/删除线/下划线/文字颜色、AI 润色（注入同一 `polish` 通道）全部与记事本一致。保存管线复用 todo 文本口径：1 秒防抖写入 `focusNotes`，失焦/关窗/Ctrl+S/beforeunload 冲刷。
- **贴图条（左侧）**：直接嵌入 `ImagePanel`，为其新增 `hideHeader` 式紧凑形态 prop（对齐 TextPanel 已有 `hideHeader` 先例）。粘贴按钮、点开预览、复制、编辑、删除、拖拽排序全部继承。预览复用 App 层 `ImagePreview`（Naive zindexable 后开者更高，自然盖在本弹窗之上）。快捷粘贴：弹窗打开期间 document 级 `handlePaste` 的图片粘贴路由到本任务的图片条（文本仍进编辑器）；剪贴板读不到图的降级引导复用 `pendingBrowserImagePasteRequest` 机制，新增弹窗落位目标。

## 生命周期语义

- **完成任务**：`focusElapsedMs` / `focusNotes` / `focusImages` 原地保留；徽标继续显示，可回看、可继续计时。
- **右键删除提醒**：todo 连同三字段从状态移除（`window.confirm` 流程不变）；其图片的 IndexedDB 载荷复用「删除工作区」的撤销宽限删除机制（宽限期后同步删除，期间靠保留 id 扫描防 prune 误伤）。
- **清空全部数据**：走既有整库删除（`deleteImageDatabases`），天然覆盖。

## 必须同步扩展的设施

1. **保留 id 扫描**：`collectRetainedImagePayloadIds()`（App.vue）与 `extractRetainedImageIds`（storage.ts，含撤销快照与 localStorage 权威副本扫描）加上 `todos[*].focusImages`——否则 prune 会把这些图片载荷当孤儿删掉。
2. **`ImagePanel.hideHeader`** 紧凑形态。
3. **document 粘贴路由**：弹窗打开时图片粘贴落图片条。

## i18n

`src/state/i18n.ts` 补 zh/en：菜单项「现在做这个」/ "Do it now"、弹窗内计时暂停提示、笔记占位文案、图片条 aria 标签等。所有 UI 文案走既有 i18n 体系。

## 边界与风险

- **焦点还原描边**：NModal 关闭后 FocusTrap 还原焦点到触发元素，可能触发 desk.css 全局焦点环——有 (0,3,0) 特异性豁免先例，实测见到再豁免。
- **10% 宽度排版**：贴图条是单列窄条，用本机 playwright 视觉取证确认不破版；兜底方案是抽薄壳 rail 组件复用 ImagePanel 的预览/删除原语。
- **命名冲突**：内部键名统一 `focus-now` 前缀，与既有 `today-focus`（今日聚焦）严格区分。
- **移动端**：弹窗做响应式、徽标可点（tap 即续做）；右键菜单入口以桌面为主。

## 测试计划（vitest，`src/__tests__/` 现有模式）

- `formatFocusDuration(ms)`：mm:ss / h:mm:ss 边界。
- 状态迁移：`updateTodoFocus`（合并增量、写入笔记/图片、字段按需存在）。
- 组件流：打开→计时→关闭合并增量→重开接续；Esc/关闭等价暂停。
- 笔记防抖冲刷（关窗/blur/beforeunload）。
- 保留 id 扫描覆盖 `focusImages`（含撤销快照内）。
- 删除提醒后载荷清理（宽限期语义，fake timers）。
