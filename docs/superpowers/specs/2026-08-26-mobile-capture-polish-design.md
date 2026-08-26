# 手机速记页微调设计（占位词简洁化 + 换码防误触）

## 背景与目标

1. 提醒事项占位词含例子（"如：周五前取快递"），信息冗余——去掉例子，只留"每行一条提醒"。
2. 速记页脚「更换配对码」按钮易误触，一旦触碰立即退回输码表单且旧码被清出记忆，用户可能忘记原配对码。目标：误触不再产生后果。

## 设计

### 1. 占位词（`src/state/i18n.ts`，zh/en 同步）

- `mobileInboxPlaceholderTodo`：zh `每行一条提醒，如：周五前取快递` → `每行一条提醒`；en `One reminder per line, e.g. Pick up the package Friday` → `One reminder per line`。
- `mobileInboxPlaceholderNote` 不变（无例子、语义完整）。

### 2. 换码防误触（`src/App.vue` + i18n）

- 页脚「更换配对码」按钮（`mobile-inbox-change-code`）点击改为走新函数 `confirmForgetMobileInboxCode()`：`window.confirm(app.mobileInboxChangeCodeConfirm)` 通过后才执行既有 `forgetMobileInboxCode()`；取消原地不动。
- 新 i18n 键 `mobileInboxChangeCodeConfirm`：zh `更换后需要重新输入配对码，确定更换吗？` / en `You'll need to re-enter a pairing code after changing. Change anyway?`。
- `forgetMobileInboxCode` 原注释「不弹确认——没有可破坏的数据」的rationale已过时（实测用户会忘码），更新注释；函数本体不变——失效提示区的「去更换配对码」（`@change-code`，用户报错后的主动动作）**不加确认**。
- 与仓库惯例一致（删除类操作一律 window.confirm）。

## 测试

- `i18n.test.ts`：占位词新文案断言（zh/en）＋ 新确认文案断言。
- `mobile-inbox-capture.test.ts`：两处占位词断言更新为新文案。
- `app-render.test.ts`：既有两处点击 `mobile-inbox-change-code` 的用例补 `vi.spyOn(window, "confirm").mockReturnValue(true)`；新增用例——confirm 拒绝时留在速记页（输码表单不出现）。

## 发布

两处均为小改，不满足 changelog 门槛（curation policy：仅显著用户可见变化入册）；下次发版时把置顶条目版本号 bump 到目标版本即可。
