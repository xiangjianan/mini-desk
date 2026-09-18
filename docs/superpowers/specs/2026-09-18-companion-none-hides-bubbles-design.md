# 伴宠「不显示」时隐藏普通消息气泡 — 设计文档

日期：2026-09-18
状态：已确认（用户批准）

## 背景与问题

伴宠 GIF 主题（`state.companionGifTheme`，全局共享偏好）提供「不显示」（`none`）选项。当前 `none` 只让 `getCompanionGifSrc` 返回空串、`CompanionBubble.vue` 不渲染 GIF 图片，但消息气泡（NPopover）仍挂在隐形锚点 `<span class="companion-popover-anchor">` 上照常弹出——保存提示、Tips、速记反馈等普通提示依旧可见。

用户期望：`none` = 完全安静模式。GIF 与普通消息气泡全部不显示，仅保留删除/清空类的二次确认弹框（`requestConfirmation` 路径）。

## 现状结构

- `src/composables/useCompanionBubble.ts` 是气泡唯一状态机：
  - 普通提示（含 `showBubble` 委托）：`showBubbleText(message, anchor, options, duration)` → 右下角 toast；
  - 二次确认：`requestConfirmation(...)` → 贴鼠标 confirm 弹框（pendingConfirm，不随定时器过期）；
  - `bubbleVisible` 只在这两条路径被置 true。
- `BubbleOptions.force`：现语义为「绕过 `isBoardBlocked`（移动壳/遮罩）强制显示」，全库唯一使用点是手机速记发送成功反馈（`App.vue` `handleMobileInboxSent`）。

## 设计（方案 A：状态机入口拦截）

在 `showBubbleText` 入口新增主题判断，与现有 `isBoardBlocked` 拦截并列：

```ts
if (deps.isBoardBlocked() && !options.force) return;
if (deps.state.companionGifTheme === "none" && !options.force) return;  // 新增
```

- `requestConfirmation` 不做任何改动——二次确认弹框照常弹出（贴鼠标、带确认/取消按钮、Enter 快捷确认）。
- `force` 语义升级为「绕过移动壳拦截 + `none` 主题拦截」，注释与 `BubbleOptions.force` 的 JSDoc 同步更新。用户已确认：手机速记发送成功反馈在 `none` 下保留（它是手机端唯一反馈渠道）。

## 边界行为

1. **切到「不显示」的确认提示**：设置菜单切主题后 App.vue 会 `showBubbleText(gifDisabled)`，此时主题已是 `none`，该提示被拦——GIF 当场消失本身就是反馈，符合安静模式本意。GIF 右键菜单「不显示」路径同理。
2. **在屏旧气泡**：切换主题前已弹出的气泡按原定时器自然消失（普通 toast ≤3s / 自定义时长），不做强杀。
3. **待办提醒**：走系统 Notification（`useTodoNotifications`，图标经 `getCompanionNotificationIconSrc`，`none` 时本就返回空），不经气泡路径，不受影响。
4. **确认后的成功提示**（如「已删除」）：走 `showBubbleText`，`none` 下不显示——属普通提示，符合预期。
5. **`custom` 主题但自定义图为空**：`shouldRenderGif` 同样为 false，但不在本次范围（用户只要求 `none`），行为不变。

## 测试计划

新增 `src/__tests__/companion-none-theme.test.ts`，composable 级单测，复用 `companion-position.test.ts` 的 `createDeps` 装配模式（`state` 覆写 `companionGifTheme`）：

- `none` 时 `showBubbleText`：`bubbleVisible` 不置位、`bubbleMessage` 保持空、`companionFocused` 不置位；
- `none` 时 `requestConfirmation`：`pendingConfirm` 正常设置、`bubbleVisible` 为 true；
- `none` + `force: true`：`showBubbleText` 正常显示；
- 非 `none`（如 `cat`）：`showBubbleText` 行为与现状一致（回归）。

## 影响面

- 改动文件：`src/composables/useCompanionBubble.ts`（1 处判断 + 注释）、对应测试。
- 不动：`CompanionBubble.vue`、`requestConfirmation`、全部调用点、移动壳逻辑。
