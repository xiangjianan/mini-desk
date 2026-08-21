// Mini Desk Service Worker：离线缓存 + PWA 基础。
// 策略详见 docs/superpowers/specs/2026-08-21-pwa-offline-design.md §4：
//   导航请求      → 网络优先（3s 超时竞赛），失败/超时回退缓存的 index.html；成功时先响应、后台写缓存
//   /assets/*    → 缓存优先（Vite 内容哈希文件名，内容变则文件名变，永不陈旧）
//   固定名小文件  → SWR（命中缓存立即返回，后台保鲜交给 waitUntil 保住 SW 生命周期）
//   其余请求      → 不拦截（含每日版本检查 fetch 与外部 API 快捷按钮请求）
// 假设部署在根路径（与 Cloudflare Pages 部署一致）。
// CACHE_VERSION 仅在缓存策略结构性变化时手动 bump；普通发版不需要动本文件。
const CACHE_VERSION = "mini-desk-v1";
const APP_SHELL_URLS = [
  "/",
  "/theme-boot.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
// 刻意不含 favicon：spec §4 虽提及，但构建期 Vite 把 favicon 哈希进 /assets/，
// 运行时不存在稳定的 /favicon.ico 根路径；哈希后的 favicon 已被 /assets/ 缓存优先规则覆盖。
// SWR 用精确匹配，避免 startsWith 过度命中（如 /theme-boot.js.map）；图标目录保持前缀匹配。
const SWR_EXACT_URLS = ["/theme-boot.js", "/manifest.webmanifest"];
const SWR_URL_PREFIXES = ["/icons/"];
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // cache:"reload" 绕过 HTTP 缓存确保拿到最新；任一失败让本次 install 失败，下次访问重试（spec §7）。
      await cache.addAll(
        APP_SHELL_URLS.map((url) => new Request(new URL(url, self.location.origin).href, { cache: "reload" })),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      // claim ≠ skipWaiting：首次安装必须 claim，否则首访页面资源请求不经过 SW，运行时缓存为空（spec §4）。
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 各策略末端的 .catch(() => Response.error())：respondWith 已调用后无法真正放行请求，
  // Response.error() 等价网络错误（仅在离线兜底已穷尽时才会走到），spec §7。
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, request).catch(() => Response.error()));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request).catch(() => Response.error()));
    return;
  }
  if (SWR_EXACT_URLS.includes(url.pathname) || SWR_URL_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staleWhileRevalidate(event, request).catch(() => Response.error()));
  }
  // 其余请求不拦截（含每日版本检查：非导航、no-store、时间戳参数）。
});

async function handleNavigation(event, request) {
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (response && response.ok) {
      // 先把响应交还页面，缓存写入放后台并靠 waitUntil 保住 SW 生命周期；
      // clone 必须在返回前同步完成，避免 body 被页面消费后无法克隆。
      const cloned = response.clone();
      event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => cache.put(new URL("/", self.location.origin).href, cloned)),
      );
      return response;
    }
  } catch {
    // 网络失败或超时 → 回退缓存。
  }
  const cached = (await caches.match(request)) || (await caches.match("/"));
  if (cached) return cached;
  throw new Error("offline-no-cache");
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("navigation-timeout")), ms);
    }),
  ]);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cached = await caches.match(request);
  const networkFetch = fetch(request).then(async (response) => {
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    // 命中缓存：立即返回，后台保鲜交给 waitUntil 保住 SW 生命周期
    // （respondWith settle 后浮空 promise 可能让 worker 在 cache.put 中途被 kill）；
    // .catch(() => null) 避免页面控制台出现 unhandled rejection。
    event.waitUntil(networkFetch.catch(() => null));
    return cached;
  }
  // 未命中：只剩网络一条路（install 已预缓存，正常不会走到）。
  const fresh = await networkFetch.catch(() => null);
  if (fresh) return fresh;
  throw new Error("offline-no-cache");
}
