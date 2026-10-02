# 手机速记手动同步按钮与设置菜单重排设计

日期：2026-10-02
状态：已与用户对齐，待实施

## 背景与目标

手机速记目前只有自动拉取（5 分钟轮询 / 窗口聚焦 / 切到已配对空间 / Ctrl+S）。用户想即时把手机端刚发的内容拉到桌面时没有手动入口。同时设置菜单经多次单点调整后顺序零散，需要按使用习惯重排。

## 决策记录（用户已确认）

| 决策点 | 结论 |
| --- | --- |
| 按钮位置 | 提醒事项与记事本**两个面板标题栏各自居中各一颗**，同一动作两处入口 |
| 可见性 | 当前工作区已配对手机速记才渲染；未配对不出现 |
| 菜单重排 | 按功能入口 → 数据 → 个性化 → 查询 → 反馈 → 关于 排序（见下） |

## 同步按钮

- `TodoPanel.vue` / `SpacePanel.vue` 各新增可选 props：`inboxSyncEnabled?: boolean`（是否渲染）、`inboxSyncing?: boolean`（忙碌态）；新增 emit `syncInbox: []`。
- 按钮渲染在 `.panel-header`（`desk-zone-heading`）内**绝对居中**：`position: absolute; left: 50%; transform: translateX(-50%)`，图标 `SyncOutline`，复用 `icon-button` 样式口径，`data-testid="inbox-sync"`，title/aria-label = i18n `syncInbox`。
- 拉取中：图标 CSS 旋转动画、按钮 `disabled`、`aria-busy="true"`；重复点击由 `pullInboxes` 既有 in-flight 守卫兜底。
- App.vue 在 `#tasks`（TodoPanel）与 `#workspace`（SpacePanel）两处传入 `:inbox-sync-enabled="hasInboxConfigured"`、`:inbox-syncing="inboxSyncing"`、`@sync-inbox="requestManualInboxSync"`。
- 移动端布局不渲染这两个面板，按钮天然桌面专属，无需额外处理。

## 手动同步反馈管线（App.vue + pull.ts）

现状：`fetchInboxItems` 失败一律返回 `null` 不抛错，轮询路径静默等下次自愈；手动点击若毫无反馈，离线时会像「点了没反应」。

- `inboxPullInFlight` 由模块级 `let` 改为 `ref`（按钮忙碌态需要响应式），`pullInboxes` 内部守卫逻辑不变。
- `pullInboxes()` 改为返回结果枚举 `"applied" | "uptodate" | "failed" | "skipped"`：
  - `applied`：`changed && applicable.length > 0`（内部照旧重放、持久化、按工作区弹「收到 N 条」）；
  - `uptodate`：无补丁可应用且非全灭（`!changed || applicable.length === 0`，部分失败也归此态——成功的部分确认无新内容，失败部分轮询自愈）；
  - `failed`：网络层全灭（见下）；
  - `skipped`：守卫拒绝（未挂载 / 在途 / 未配对）。
- `pullAllInboxes`（`src/sync/pull.ts`）的 `InboxPullResult` 新增 `networkFailed: boolean`：**所有已配对工作区的拉取全部失败**时为 true。注意内部 map 对「未配对」与「拉取失败」都返回 `null`，需区分计数（未配对不计入分母；部分失败不算全灭，轮询会自愈）。
- 新增 `requestManualInboxSync()`：调 `pullInboxes()`，`applied` 不额外弹（内部已弹）；`uptodate` → 气泡 `inboxUpToDate`；`failed` → 气泡 `inboxSyncFailed`；`skipped` 静默。
- 自动路径（定时/聚焦/切空间/启动）返回值被忽略，行为与现在完全一致。
- i18n 新增（zh / en）：
  - `syncInbox`：`同步手机速记` / `Sync mobile notes`
  - `inboxUpToDate`：`已是最新，暂无新内容` / `Up to date — nothing new`
  - `inboxSyncFailed`：`同步失败，请检查网络后重试` / `Sync failed — check your connection`

## 设置菜单重排

```
现在                          改后
├ 数据 (组)                   ├ 手机速记      ← 一级功能入口置顶（配套同步按钮已就位）
├ 语言 (组)                   ├ 数据 (组)     ← 高频工作区操作；破坏性「清空数据」仍居组内末位
├ GIF 主题 (组)               ├ 语言 (组)
├ 手机速记                    ├ GIF 主题 (组)
├ 提建议                      ├ 快捷键        ← 查询类提到反馈类之前
├ 快捷键                      ├ 提建议
├ 关于                        ├ 关于
└ 分隔线 + 版本               └ 分隔线 + 版本（不变）
```

排序逻辑：功能入口 → 数据操作 → 个性化（语言 / GIF 主题）→ 查询（快捷键）→ 反馈（提建议）→ 关于。仅调整 `SettingsMenu.vue` options 数组顺序与对应顺序断言，无行为变化。

## 测试

- `app-render.test.ts`：未配对工作区两面板无 `[data-testid="inbox-sync"]`；已配对两颗都在；点击触发拉取——stub 网络层覆盖三路：有新内容（弹「收到 N 条」）、无新内容（弹「已是最新」）、全灭（弹「同步失败」）。
- `settings-menu.test.ts`：顺序断言改为新序。
- pull 单测（`sync-pull.test.ts` 已有 `pullAllInboxes` 用例，直接扩展）：`networkFailed` 在全灭 / 部分失败 / 正常 三态下的取值。
- TodoPanel / SpacePanel 组件级：props 驱动按钮渲染与居中位置（若两面板无独立组件测试文件，并入 app-render 断言，不新建文件）。

## 不在范围

- `server/` 无改动；拉取协议原样。
- 自动拉取路径的行为、节流参数不变。
- changelog 条目由 `/release-mini-desk` 发布流程追加。
