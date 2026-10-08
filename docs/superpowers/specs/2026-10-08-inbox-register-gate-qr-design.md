# 配对码注册失败时不生成二维码设计

日期：2026-10-08
状态：已与用户对齐，待实施

## 背景与问题

手机速记配对弹窗（`WorkspaceInboxDialog.vue`）的「生成配对码」是本地生码 → 立即 `emit("update")` 落盘并展示配对码 + 二维码；注册中继（`App.vue` 的 `registerInbox(code, true)` → `registerInboxKey`）是事后后台调用，失败只弹气泡「配对码注册失败……下次启动会自动重试」。

注册制下未注册的码在手机端 `/status` 校验与发送时都会 404 `unknown_code`：用户扫码配不上，但桌面端二维码已经亮出来了。「重置配对码」更糟——失败瞬间旧码已在服务端注销、新码又没注册上，配对彻底断到下次启动自愈。

目标：注册中继调用失败时，配对码不生成、不落盘、二维码不渲染，用户可立即重试。

## 决策记录（用户已确认）

| 决策点 | 结论 |
| --- | --- |
| 失败表现 | 回到未配对态 + 可重试：不显示配对码/地址/二维码、不落盘，「生成配对码」按钮保持可点，内联提示失败，再点一次即重试（重新生码重新注册） |
| 重置口径 | 一并拦截：先注册新码，成功才换码 + 注销旧码；失败则旧码与旧二维码原样保留 |
| 架构 | 方案 A：弹窗内直接引用 `inboxKeyHash` + `registerInboxKey` 先注册再落码（先例：`MobileInboxCapture.vue` 直接调 sync 客户端）；App 侧事后二次注册删除 |

## 改动 1：`WorkspaceInboxDialog.vue` 状态机

- 新增 `registering = ref(false)`（在途守卫，兼作按钮 loading）与 `registerError = ref(false)`。
- `generate()` 改异步：
  1. `registering = true`、`registerError = false`；
  2. `nextCode = generateInboxCode()`（先本地生码才能算 key hash 去注册）；
  3. `ok = await registerInboxKey(await inboxKeyHash(nextCode))`；
  4. 成功：`code.value = nextCode`、`emit("update", buildInbox())` —— 码/地址/二维码随 `hasCode` 变真才出现；
  5. 失败：`registerError = true`，码不落、不 emit，停留空态；
  6. `finally` 复位 `registering`。
- `rotate()` 同口径：`window.confirm` 后先注册新码，成功才 `code.value` 换新 + `emit`（App 随后注销旧码）；失败保留旧码。
- 在途态：生成按钮 `:loading`，重置按钮 `disabled`；`registering` 守卫防双击/并发。
- 卸载守卫：弹窗已关闭后迟到的成功结果直接丢弃（不写 `code`、不 emit），惯例同 App.vue 既有「卸载后不再写输码态」守卫。
- 模板：空态与有码态共用一行错误提示 `<p class="workspace-inbox-error" role="status" v-if="registerError">`（放 footer 上方，两态都可见）。

## 改动 2：`App.vue` 职责收缩

- `handleInboxUpdate` 删除事后的 `registerInbox(inbox.code, true)`：
  - generate/rotate 已在弹窗内前置注册成功才 emit；
  - save 只改目标清单/空间、码未变（码恒已注册）；
  - 启动路径 `onMounted` 仍幂等补注册存量码，自愈能力不丢。
- `registerInbox` 只剩启动路径静默调用 → 删掉 `warn` 参数与气泡分支，简化为静默幂等注册；同步更新注释。
- `revokeInbox`（旧码注销）不动。新顺序天然是「先注册新码 → 再注销旧码」，无断档窗口。
- 附带消除一个现存 UX 毛刺：原二次注册若瞬时失败，会在已成功生成后弹出误导性的「注册失败」气泡。

## 改动 3：i18n（`src/state/i18n.ts`）

- 新增 `inboxRegisterFailedRetry`：zh「配对码注册失败，请检查网络后重试」 / en `Pairing-code registration failed — check your network and try again`。
- 删除 `inboxRegisterFailed`（zh/en 两侧，随 App 侧调用移除而无消费方）。

## 边界与非目标

- 注册成功但用户已关弹窗（迟到结果被卸载守卫丢弃）：服务端多一个无人引用的注册码，无数据写入，无害。
- 15s 请求超时沿用 `INBOX_FETCH_TIMEOUT_MS`，loading 态覆盖整段等待。
- 存量已配对空间打开弹窗直接显示码 + 二维码（启动已幂等注册），不在本次范围。

## 测试（`app-render.test.ts`，沿用模块级 `vi.mock("../sync/inboxClient")`）

- 生成失败：`registerInboxKey` 返回 `false` → 停留空态（无 `inbox-code`、无 update 落盘、`workspace.inbox` 不存在）、错误提示可见。
- 重试成功：再点生成按钮（mock 翻转为 `true`）→ 码 + 二维码区域出现、`workspace.inbox` 落盘。
- 重置失败：旧码保留、未 emit；成功：换新码且旧码被 `revokeInboxKey` 注销。
- 在途态：生成按钮 loading、重置按钮 disabled。
- 关闭弹窗后迟到成功不落盘。
- 现有「生成即 emit」相关用例：默认 mock 已是 `async () => true`，预计无需大改；逐例核对断言时序（emit 现在晚一个微任务）。
