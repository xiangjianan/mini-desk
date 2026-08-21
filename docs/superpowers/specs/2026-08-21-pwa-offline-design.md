# Mini Desk PWA 离线化设计（Service Worker + 可安装）

- 日期：2026-08-21
- 状态：已确认（用户逐节批准）
- 范围：为 Mini Desk 增加 Service Worker 离线缓存与 PWA 可安装能力；整合进现有版本更新机制

## 1. 目标与非目标

### 目标

1. **离线可用**：用户首次在线访问后，即使 Cloudflare Pages 宕机/断网，本地浏览器仍能完整打开并使用 Mini Desk。
2. **静态资源本地优先**：图片、GIF、JS/CSS 等静态文件优先使用本地缓存。
3. **可安装 PWA**：通过 Web App Manifest 支持安装成独立桌面应用窗口。
4. **更新可靠**：后台发新版后，在线用户刷新即得新版；复用现有"每日检查 + 红点 + 主动更新"机制，不另造更新 UI。

### 非目标（YAGNI）

- 不做消息推送（Push）、后台同步（Background Sync）等 SW 高级能力。
- 不做 SW 更新的独立 toast 提示（复用现有红点）。
- 不引入 vite-plugin-pwa / Workbox 依赖（已评估并否决：项目刻意轻量、需深度整合自研更新机制）。
- 不改动现有发布流程：普通发版**不需要**动 sw.js。

## 2. 现状关键事实（设计依据）

- 应用为纯静态本地优先 SPA：数据全在 localStorage（`mini-desk-state-v1`）与同源 IndexedDB，无后端 API。部署于 Cloudflare Pages（`npm run deploy:cloudflare`）。
- 构建产物资源分两类：
  - `dist/assets/*`（约 3.7MB，含全部 JS/CSS/GIF/图片）：Vite **内容哈希命名**，内容变则文件名变（经 `static/**` 的 `?url` 导入进入）。
  - `index.html`、`theme-boot.js`：**文件名固定**。
- 已有版本更新机制（`src/composables/useAppVersionCheck.ts` + `src/state/version.ts`）：
  - 每 24h 用 `fetch(index.html, { cache: "no-store" })` + 时间戳参数拉最新 `meta[name="app-version"]` 比对；
  - 有新版 → 红点（`versionPromptVisible`）；用户点击 → `updateStaticVersion()` = 清空全部 Cache Storage（`clearStaticCaches()`）→ `location.reload()`。
- `public/_headers` 已有 CSP：`script-src 'self'` 等，与同源 SW/manifest 兼容。
- 图标现成：`favicon.png` 与 `static/img/mini-desk-cat.png` 均为 512×512 RGBA。
- 目前无任何 SW / manifest。

## 3. 文件清单

```
public/sw.js                          新增 · Service Worker 本体（原生 JS，不经 Vite 打包，稳定路径 /sw.js，scope /）
public/manifest.webmanifest           新增 · PWA 清单
public/icons/icon-512.png             新增 · 复制自 favicon.png
public/icons/icon-192.png             新增 · 由 512 版 sips 缩放生成
public/_headers                       改动 · 追加 /sw.js 与 /manifest.webmanifest 的 Cache-Control: no-cache
index.html                            改动 · <link rel="manifest"> + <meta name="theme-color">
src/pwa.ts                            新增 · 仅生产环境注册 SW；暴露 swUpdateReady 响应式状态
src/main.ts                           改动 · 引入 src/pwa.ts
src/composables/useAppVersionCheck.ts 改动 · 红点显示条件 OR swUpdateReady；updateStaticVersion 先 postMessage SKIP_WAITING
src/__tests__/service-worker.test.ts  新增 · SW 策略测试
src/__tests__/pwa-register.test.ts    新增 · 注册与更新接线测试
```

## 4. 缓存策略

单一版本化缓存：`mini-desk-v1`。**`CACHE_VERSION` 仅在缓存策略结构性变化时手动 bump**，普通发版不动（见 §5 说明）。

SW 的 `fetch` 处理规则（仅拦截同源 GET）：

| 请求 | 策略 | 理由 |
|---|---|---|
| `request.mode === "navigate"` | 网络优先 + 3s 超时竞赛，失败/超时回退缓存的 `index.html` | 在线永远最新；宕机/挂起时离线兜底 |
| pathname 以 `/assets/` 开头 | 缓存优先，未命中走网络并写入 | 哈希文件名内容变则名变，永不陈旧；满足"静态资源本地优先" |
| `theme-boot.js`、manifest、`/icons/*` | SWR（先回缓存、后台更新） | 防主题闪烁脚本需即时；体积小可后台保鲜。注：favicon 经 Vite 哈希进 `/assets/`，由上一行 `/assets/` 缓存优先规则覆盖（已按构建产物核实），不单独列入 SWR |
| 其他一切（版本检查 fetch、API 快捷按钮外部请求、跨源、非 GET） | 不拦截，直接放行 | 现有 `fetchLatestAppVersion()`（`no-store` + 时间戳参数）是非导航请求，天然落在放行区，更新检查零影响 |

SW 生命周期事件：

- `install`：预缓存 app shell（`index.html`、`theme-boot.js`、`manifest.webmanifest`、`/icons/*`；favicon 哈希进 `/assets/` 按需缓存，不预缓存）；任一失败则本次安装失败，下次访问自动重试，页面不受影响（页面不依赖 SW 存在）。
- `activate`：删除所有非当前版本前缀的缓存；`clients.claim()` 接管已打开页面（仅影响 fetch 拦截，不打断运行；claim ≠ skipWaiting——首次安装时必须 claim，否则首访页面的资源请求不经过 SW、运行时缓存为空，离线要等第二次访问才生效）。
- `message`：收到 `{ type: "SKIP_WAITING" }` → `self.skipWaiting()`。
- fetch 处理器全程 try/catch，异常时 fall through：先试缓存，再放行浏览器默认行为；绝不让 SW 错误破坏页面。

### 为什么 CACHE_VERSION 不随发版 bump

离线兜底的 `index.html` 由网络优先策略在**每次在线导航时**用新响应覆盖缓存，天然保鲜；新哈希资源按需从网络加载并缓存。普通发版因此不产生新 SW、不进入 waiting 状态、不打扰用户。仅当 sw.js 自身逻辑/缓存结构变化时才 bump 版本号强制重建缓存。

## 5. 更新流程（双通道）

### 通道 1 · 普通发版（页面代码变化）——现有机制零改动

```
发布新版 → 24h 轮询发现新版本号 → 红点 → 用户点击
→ clearStaticCaches()（清 Cache Storage，含 SW 缓存）→ 刷新
→ 导航网络优先拿新 index.html → 新哈希资源加载并重建缓存
```

在线用户普通刷新同样直接拿到新版（网络优先 HTML）。清空缓存后 SW 不重装（sw.js 未变），缓存由导航/资源请求按需重建，自愈。

### 通道 2 · sw.js 自身更新——复用同一个红点

```
浏览器导航时字节比对发现 sw.js 变化 → 新 SW install → waiting
→ src/pwa.ts 检测 registration.waiting → swUpdateReady = true → 红点亮起
→ 用户点击 → postMessage({type:"SKIP_WAITING"}) → 新 SW 立即接管
→ clearStaticCaches() → location.reload()
```

不在 install 时自动 `skipWaiting`：避免新 SW 激活清理缓存打断正在运行的旧页面。用户点击红点即"我要更新"语义，此刻接管最干净。

### 离线行为

- 离线打开页面：导航回退缓存 `index.html` → 哈希资源全在缓存 → 应用完整可用；版本检查 fetch 失败被现有 `catch → null` 吞掉，无感。
- 服务器宕机：同上，用户无感知（核心诉求）。
- 宕机期间发的版：用户暂用缓存旧版，服务恢复后首次在线访问自动追上。

## 6. PWA Manifest

```json
{
  "name": "Mini Desk",
  "short_name": "Mini Desk",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f5f5f7",
  "theme_color": "#007aff",
  "lang": "zh-CN",
  "description": "本地优先的个人桌面工作台",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

图标用现成 mini-desk-cat 素材派生，`purpose: "any"` 起步，不做 maskable 适配（YAGNI）。

## 7. 错误处理

- SW 不支持 / 非安全上下文（如 http://IP 访问）：注册失败静默吞掉，应用照常。
- install 预缓存失败：SW 本次不激活，页面不受影响，下次访问重试。
- fetch 处理异常：try/catch 全包，回退缓存 → 放行默认行为。
- `src/pwa.ts` 所有 promise 均 catch，注册与检测永不抛出影响主流程。

## 8. 测试方案

### 自动化（Vitest + jsdom，沿用现有测试风格）

- `service-worker.test.ts`：vm 注入 mock 的 `self`/`caches`/`fetch` 加载 `public/sw.js`，断言：
  - 导航请求：网络成功走网络并更新缓存；网络失败/超时回退缓存 `index.html`；
  - `/assets/` 请求：缓存命中直接返回；未命中走网络并写缓存；
  - 版本检查类请求（非导航、`no-store`、带时间戳参数）：不被拦截；
  - `activate` 清理旧版本缓存；
  - `SKIP_WAITING` 消息触发 `self.skipWaiting()`。
- `pwa-register.test.ts`：mock `navigator.serviceWorker`，断言：
  - 仅 `import.meta.env.PROD` 注册；
  - `registration.waiting` 出现时 `swUpdateReady` 变 true；
  - `updateStaticVersion` 顺序：postMessage SKIP_WAITING → clearStaticCaches → reload。

### 手动验收清单（实现完成后执行）

1. `npm run build && npm run preview`；
2. DevTools → Application：SW 已激活、manifest 图标正常、地址栏可安装；
3. Network → Offline：刷新页面，应用完整可用（含 GIF 伴侣、主题切换）；
4. 模拟发版（改 index.html 版本 meta）→ 恢复网络 → 红点出现 → 点击 → 拿到新版；
5. 改 sw.js 内容 → 刷新 → 红点出现（通道 2）→ 点击 → 新 SW 接管。

## 9. 风险与边界

- **SW 更新滞后风险**：不点红点的用户，其新 SW 一直 waiting——可接受（缓存策略极少变化，且页面功能更新不依赖通道 2）。
- **清缓存后离线**：用户点击红点必然是在线场景（版本检查刚成功）；极端情况下清缓存后立刻断网会失去离线兜底，下次在线自愈。
- **多标签页**：SKIP_WAITING 后其他标签页由新 SW 接管 fetch 拦截，已加载页面继续运行旧资源（内存中），行为一致无害。
- **CSP**：`script-src 'self'` 不影响 SW（worker-src 回退到 script-src，同源放行）与 manifest link。

## 10. 变更记录

- **2026-08-22**（验收反馈三项调整）：
  1. **抑制安装横幅**：`src/pwa.ts` 监听 `beforeinstallprompt` 并 `preventDefault()`，浏览器不再主动弹「安装 Mini Desk」提示；用户仍可从浏览器菜单手动安装。
  2. **标题栏颜色随主题联动**：standalone 窗口标题栏浅色 `#f5f5f7` / 深色 `#1c1c1e`（与画布底色一致）。`theme-boot.js` 首帧前同步 meta、`applyTheme()` 运行时同步、`index.html` 静态值与 manifest `theme_color` 改为浅色默认，并补充 manifest `"id": "/"`。
  3. **首访缓存预热 + 本地离线验证**：SW `activate` 后对每个打开的 window client 拉取页面 HTML，解析并预缓存其中引用的 `/assets/*`，使「首次访问后立刻断网」也能完整离线。开发模式仍不注册 SW（无哈希资源 + HMR 下缓存属反模式），本地验证离线统一用 `npm run preview`（build + preview 一键）。
