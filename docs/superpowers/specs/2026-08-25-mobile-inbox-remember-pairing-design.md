# 手机速记记住配对码设计

## 背景

配对码目前只存在于 URL fragment（`#inbox=<码>`）中：扫码或手动输码后写入 `location.hash`，刷新页面能保住。但用户实际入口是主屏图标与微信内置浏览器：

- 主屏图标按 `manifest.webmanifest` 的 `start_url: "/"` 启动，永远不带 fragment。
- 微信内转发/重开链接同样丢 fragment。

两条路每次都落在裸引导页，必须手输 12 位 Crockford 码——配对码在手机端没有任何本地持久化，这是"记不住"的根因。

## 目标

1. 手机端在本地记住最近一次使用的有效配对码；裸访问（无 fragment）时自动带出，直接显示速记表单，打开即写。
2. 速记页脚显示当前配对码（12 位按 4 位分组），并提供「更换配对码」一键回到输码表单。
3. 零服务端改动；不改变现有扫码/手动输码/桌面端任何行为。

## 非目标

- 不做多码管理或工作区列表（一码记忆，最后使用者优先）。
- 不做码掩码/显隐开关（自己手机，可见性利于比对，YAGNI）。
- 不做 Worker 侧配对失效探测（服务端无法在不知码的情况下验证码有效性，见权衡）。
- 不改变配对码格式、熵与加密方案。

## 方案

### 存储层（`src/sync/pairing.ts` 扩展）

沿用 `version.ts` 的可注入 storage 模式，新增独立专用 key（不写入 `mini-desk-state-v1`——手机壳不读写桌面状态）：

```ts
const REMEMBERED_INBOX_CODE_KEY = "mini-desk-inbox-code";

loadRememberedInboxCode(storage = localStorage): string | null
saveRememberedInboxCode(code, storage = localStorage): void
clearRememberedInboxCode(storage = localStorage): void
```

- `load` 读出后必须过 `normalizeInboxCode` 校验，非法/缺失返回 `null`（损坏自愈，落回输码表单）。
- key 只存码本身，无版本包装（格式校验即全部约束）。

### 接线（`App.vue` 手机壳）

- 初始化：`parseInboxFragment(hash) ?? loadRememberedInboxCode()`，fragment 永远优先于记忆。
- 保存：仅当处于移动壳（`isMobileBlocked` 为 true）时，任何有效码到手（初始 URL 解析 / `hashchange` / 手动输码确认）→ `saveRememberedInboxCode`。桌面端访问带 `#inbox=` 的地址不产生手机记忆。
- 「更换配对码」：`clearRememberedInboxCode()` + `mobileInboxCode = null` + `history.replaceState(null, "", pathname + search)` 清掉 URL 残留 fragment（否则刷新后旧码又回来了）。

### UI（`App.vue` 手机壳模板，不进 `MobileInboxCapture` 表单组件）

速记表单下方一行小字页脚：

- `已配对：AB2D EFG4 HJK7`（12 位按 4 位分组，便于与桌面配对面板人工比对）。
- 「更换配对码」文字按钮：清记忆、清 fragment、回到输码表单。不弹 `confirm`——没有可破坏的数据，码随时可从桌面配对面板重新获得，与"删除需确认"公约（保护看板数据）不冲突。

i18n 新增 `mobileInboxPairedAs`（含 `{code}` 占位）、`mobileInboxChangeCode`，中英双语。

## 边界与已接受权衡

- **轮换死码黑洞**：桌面轮换配对码后，手机自动配对到旧码——Worker 照常收件（写入旧 keyHash 的队列），桌面永远不拉取，发送"成功"但静默丢失。这与现有书签/收藏旧链接同性质，不是本设计新引入的风险；缓解手段是页脚码可见可比对 + 一键更换。记入威胁模型，接受不改。
- **明文存码**：码即加密密钥，明文存手机 localStorage。与桌面端一致（`mini-desk-state-v1` 中 `inbox.code` 本来就是明文），设备本地存储的威胁模型不变：能读到该 localStorage 的攻击者已经能读到整块看板数据。
- **存储容器隔离**：iOS 主屏图标（Safari 内核）与微信内置浏览器是两个隔离的存储容器，首次需各自配对一次（扫码或输码），之后独立记忆。
- **存储被清**（iOS 罕见清理、用户清网站数据）→ 回到手输一次，自愈，可接受。

## 测试计划

### 单元测试（`src/__tests__/sync-pairing.test.ts` 扩展）

- `loadRememberedInboxCode`：有效码往返返回；非法值（手改损坏）返回 `null`；缺失返回 `null`。
- `saveRememberedInboxCode` / `clearRememberedInboxCode`：写入、覆盖（最后使用者优先）、清除。

### 壳级测试（沿用 `mobile-inbox-capture.test.ts` / `app-render.test.ts` 风格）

- 裸访问 + localStorage 有记忆码 → 直接渲染速记表单，不显示输码表单。
- 带 `#inbox=` fragment 访问 → 表单可用且码写入 localStorage。
- fragment 与记忆码并存 → fragment 优先。
- 「更换配对码」→ 记忆清空、回到输码表单、URL fragment 被清。
- 桌面视口（非移动壳）访问带 `#inbox=` → 不写入记忆。

### 手动验证

- 主屏图标：首次扫码配对 → 杀掉重开图标 → 直接进表单，页脚码与桌面一致。
- 微信内：输码配对一次 → 退出重进 → 直接进表单。
- 桌面轮换配对码 → 手机页脚码与桌面不一致 → 点「更换配对码」输新码 → 恢复。
