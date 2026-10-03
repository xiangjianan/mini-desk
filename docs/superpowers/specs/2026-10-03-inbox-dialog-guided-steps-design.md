# 手机速记弹窗四步引导设计

日期：2026-10-03
状态：已与用户对齐，待实施

## 背景与目标

手机速记配对弹窗（`WorkspaceInboxDialog.vue`）目前只有两段说明文案（`inboxDialogIntro` / `inboxSyncHint`）加一堆表单字段：新用户打开后看不出「先做什么、再做什么」。目标：

1. 用「一、二、三、四」四步静态引导替换两段文案，让操作路径显而易见。
2. 引导中提供两个链接：App Store 下载链接（暂用占位，之后替换为真实链接）与可点击的移动端配对地址（形如 `https://minidesk.online/#inbox=<配对码>`，动态生成）。

## 决策记录（用户已确认）

| 决策点 | 结论 |
| --- | --- |
| App Store 链接 | 先写固定占位常量 `https://apps.apple.com/app/mini-desk`，醒目 TODO 注释标记，之后用户自行替换真实链接 |
| 引导组织方式 | 方案 A：静态四步，直接替换现有两段文案；未生成码 / 已配对两种状态都显示（引导先于动作） |
| 配对地址 | 由纯文本 `<span>` 改为可点击 `<a>`（新标签页打开），沿用 `buildInboxAddress` 动态生成 |
| 步数 | 固定四步，中文用「一、二、三、四」，英文用 `1. / 2. / 3. / 4.` |

## 四步文案

| # | 标题（加粗） | 正文（灰色小字） |
| --- | --- | --- |
| 一 | 手机安装 | App Store 下载「Mini Desk」＋「下载」链接（占位） |
| 二 | 扫码配对 | 用手机扫下方二维码，或打开配对地址 |
| 三 | 手机速记 | 在手机上输入内容，发送到提醒事项或便签 |
| 四 | 自动同步 | 手机内容每 5 分钟自动同步；顶栏「手动同步」可立即收取 |

- 「每 5 分钟」同步频率信息从原 `inboxSyncHint` 折入步骤四，不单独保留段落。
- en 侧同结构直译，不做精雕。

## 改动 1：i18n 词条（`src/state/i18n.ts`）

- 删除 `inboxDialogIntro`、`inboxSyncHint`（zh/en 两侧），组件不再消费。
- 新增扁平 key（沿用 `mobilePairStep1..3` 的命名惯例，标题/正文成对）：
  - `inboxStep1Title`: `一、手机安装` / `1. Install`
  - `inboxStep1Body`: `App Store 下载「Mini Desk」` / `Download Mini Desk from the App Store`
  - `inboxStep2Title`: `二、扫码配对` / `2. Pair by QR`
  - `inboxStep2Body`: `用手机扫下方二维码，或打开配对地址` / `Scan the QR code below with your phone, or open the pairing address`
  - `inboxStep3Title`: `三、手机速记` / `3. Capture on phone`
  - `inboxStep3Body`: `在手机上输入内容，发送到提醒事项或便签` / `Type on your phone and send to reminders or notes`
  - `inboxStep4Title`: `四、自动同步` / `4. Auto sync`
  - `inboxStep4Body`: `手机内容每 5 分钟自动同步；顶栏「手动同步」可立即收取` / `Phone items sync every 5 minutes; use “Sync now” in the top bar to pull immediately`

## 改动 2：组件模板（`src/components/WorkspaceInboxDialog.vue`）

- `src/sync/pairing.ts` 新增导出常量（组件内常量无法被测试 import，放既有配对工具模块；带 TODO 注释标记占位）：
  ```ts
  // TODO(占位链接)：App 上架后替换为真实 App Store 地址（测试 import 本常量断言，改这里即可）。
  export const INBOX_APP_STORE_URL = "https://apps.apple.com/app/mini-desk";
  ```
- `inbox-workspace` 段落之后，替换原 intro/hint 两个 `<p>` 为：
  ```html
  <ol class="workspace-inbox-steps" data-testid="inbox-steps">
    <li class="workspace-inbox-step">
      <span class="workspace-inbox-step-title">{{ text.app.inboxStep1Title }}</span>
      <span class="workspace-inbox-step-body">
        {{ text.app.inboxStep1Body }}
        <a class="workspace-inbox-step-link" data-testid="inbox-app-store"
           :href="INBOX_APP_STORE_URL" target="_blank" rel="noopener noreferrer">下载</a>
      </span>
    </li>
    <!-- 步骤二/三/四同结构，无链接 -->
  </ol>
  ```
  步骤二/三/四的 `<li>` 同构，仅文案 key 不同，不引入 v-for（链接只在步骤一，手写四条更直白）。
- 配对地址行 `<span class="workspace-inbox-address">` → `<a class="workspace-inbox-address" :href="address" target="_blank" rel="noopener noreferrer" data-testid="inbox-address">`；`data-testid` 与文案 key 不变。
- 其余不动：配对码/复制/重置、二维码、落点下拉、底部按钮、两段式关闭逻辑。

## 改动 3：样式（`src/styles.css` 7142–7143 一带）

- 删除 `.workspace-inbox-intro`、`.workspace-inbox-hint` 两条规则（元素已移除）。
- 新增：
  - `.workspace-inbox-steps`：`list-style: none; margin/padding: 0; display: grid; gap: 6px; margin-bottom: 10px;`（对齐原 hint 的底部间距）。
  - `.workspace-inbox-step`：`display: grid; gap: 2px;`
  - `.workspace-inbox-step-title`：`font-size: 12px; font-weight: 600; line-height: 1.6;`
  - `.workspace-inbox-step-body`：`color: var(--muted); font-size: 12px; line-height: 1.6;`
  - `.workspace-inbox-step-link`：`color: var(--primary); text-decoration: none;`，`:hover` 下划线。
- `.workspace-inbox-address` 改为链接形态：保留 `word-break: break-all`，去掉 `user-select: all`（点击选择文本会与链接跳转打架），着色 `var(--primary)`，`:hover` 下划线。
- 全部走既有 CSS 变量（`--muted` / `--primary`），明暗主题自动适配。

## 测试（`src/__tests__/workspace-inbox-dialog.test.ts`）

- 改「渲染介绍与同步频率提示」用例 → 断言四步标题（`一、手机安装` … `四、自动同步`）渲染、「每 5 分钟」仍出现在步骤四正文、旧 intro 文案不再出现。
- 新增：App Store 链接断言——`href` 等于 import 的 `INBOX_APP_STORE_URL`（真实链接替换后测试零改动）、`target="_blank"`、`rel` 含 `noopener`、文案为「下载」。
- 新增：配对地址是 `<a>`，`href` 含 `#inbox=AB2CDE4FGHJK` 且 `target="_blank"`。
- 新增：未生成码（空态）时四步引导可见（`inbox-steps` 存在），生成按钮在其下。

## 明确不做

- changelog 条目：release 流程统一添加。
- en 文案精雕：直译即可。
- 未配对态的分步向导（方案 C）：YAGNI。
- 手机端（MobileHome.vue）引导：本设计只动桌面弹窗。
