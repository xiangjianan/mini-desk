# Mini Desk PWA 离线化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Mini Desk 增加 Service Worker 离线缓存与 PWA 可安装能力，并整合进现有"每日检查 + 红点 + 主动更新"机制。

**Architecture:** 手写零依赖 `public/sw.js`（导航网络优先回退缓存、`/assets/*` 缓存优先、固定名小文件 SWR、其余放行）；`src/pwa.ts` 仅生产环境注册并暴露 `swUpdateReady`；`useAppVersionCheck` 把 SW waiting 并入红点条件、更新点击时先发 `SKIP_WAITING`。

**Tech Stack:** 原生 Service Worker / Cache API、Vue 3 ref/computed、Vitest + jsdom + node:vm、Cloudflare Pages `_headers`。

**Spec:** `docs/superpowers/specs/2026-08-21-pwa-offline-design.md`（已批准）

**约定：** 提交信息用 `<type>: <描述>` 格式，不加 Co-Authored-By（用户全局已禁用 attribution）。测试命令均在仓库根目录执行。

---

### Task 1: Service Worker 本体（TDD）

**Files:**
- Create: `public/sw.js`
- Test: `src/__tests__/service-worker.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/service-worker.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 在 node:vm 沙箱中加载 public/sw.js，注入 mock 的 self/caches/fetch，
 * 用捕获的 addEventListener 处理器驱动 install/fetch/message/activate 事件。
 * 说明：Request 构造器禁止 mode:"navigate"，导航请求用鸭子类型裸对象模拟。
 */

type Listener = (event: never) => void;

interface FetchRequestLike {
  method: string;
  mode: string;
  url: string;
}

interface FetchEventLike {
  request: FetchRequestLike | Request;
  respondWith: (r: Promise<Response> | Response) => Promise<void>;
  waitUntil: (p: Promise<unknown>) => Promise<void>;
}

const ORIGIN = "http://localhost";

function createCacheStorage(fetchFn: (request: RequestInfo | URL) => Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();

  const keyOf = (input: RequestInfo | URL | string): string => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    try {
      return new URL(raw, ORIGIN).href;
    } catch {
      return raw;
    }
  };

  const storage = {
    async open(name: string) {
      let store = stores.get(name);
      if (!store) {
        store = new Map();
        stores.set(name, store);
      }
      return {
        async add(request: Request): Promise<void> {
          const response = await fetchFn(request);
          store.set(keyOf(request), response);
        },
        async addAll(requests: Request[]): Promise<void> {
          for (const request of requests) {
            const response = await fetchFn(request);
            if (!response.ok) throw new Error(`prefetch failed: ${request.url}`);
            store.set(keyOf(request), response);
          }
        },
        async put(request: RequestInfo | URL, response: Response): Promise<void> {
          store.set(keyOf(request), response);
        },
        async match(request: RequestInfo | URL): Promise<Response | null> {
          return store.get(keyOf(request)) ?? null;
        },
      };
    },
    async match(request: RequestInfo | URL): Promise<Response | undefined> {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit;
      }
      return undefined;
    },
    async keys(): Promise<string[]> {
      return [...stores.keys()];
    },
    async delete(name: string): Promise<boolean> {
      return stores.delete(name);
    },
  };
  return storage;
}

interface SwHarness {
  listeners: Map<string, Listener>;
  caches: ReturnType<typeof createCacheStorage>;
  fetchMock: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
}

function makeLoadSw() {
  return async (): Promise<SwHarness> => {
    const listeners = new Map<string, Listener>();
    const skipWaiting = vi.fn();
    const claim = vi.fn();
    const fetchMock = vi.fn();
    const caches = createCacheStorage(fetchMock);

    const swScope = {
      location: { origin: ORIGIN },
      skipWaiting,
      clients: { claim },
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    };

    const sandbox = {
      self: swScope,
      caches,
      fetch: fetchMock,
      Request,
      Response,
      URL,
      setTimeout,
    };

    const code = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");
    vm.runInNewContext(code, sandbox);

    return { listeners, caches, fetchMock, skipWaiting, claim };
  };
}

const loadSw = makeLoadSw();

function navigateRequest(url: string): FetchRequestLike {
  return { method: "GET", mode: "navigate", url };
}

async function driveFetch(harness: SwHarness, request: FetchRequestLike | Request): Promise<Response | undefined> {
  const event: FetchEventLike = {
    request,
    respondWith: vi.fn().mockResolvedValue(undefined),
    waitUntil: vi.fn().mockResolvedValue(undefined),
  };
  (harness.listeners.get("fetch") as (e: FetchEventLike) => void)(event);
  const arg = event.respondWith.mock.calls[0]?.[0];
  return arg instanceof Promise ? await arg : arg;
}

async function runLifecycle(harness: SwHarness, type: "install" | "activate"): Promise<void> {
  const waitUntil = vi.fn().mockResolvedValue(undefined);
  (harness.listeners.get(type) as (e: { waitUntil: (p: Promise<unknown>) => Promise<void> }) => void)({ waitUntil });
  await waitUntil.mock.calls[0][0];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("service worker install", () => {
  it("pre-caches the app shell", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockImplementation(async (request: Request) => new Response(`body:${request.url}`));

    await runLifecycle(sw, "install");

    expect(await sw.caches.match("/")).toBeTruthy();
    expect(await sw.caches.match("/theme-boot.js")).toBeTruthy();
    expect(await sw.caches.match("/manifest.webmanifest")).toBeTruthy();
    expect(await sw.caches.match("/icons/icon-192.png")).toBeTruthy();
    expect(await sw.caches.match("/icons/icon-512.png")).toBeTruthy();
  });

  it("fails install when a shell resource cannot be fetched, so the next visit retries", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockRejectedValue(new Error("network down"));

    const waitUntil = vi.fn().mockResolvedValue(undefined);
    (sw.listeners.get("install") as (e: { waitUntil: (p: Promise<unknown>) => Promise<void> }) => void)({ waitUntil });

    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow("network down");
  });
});

describe("service worker fetch strategies", () => {
  it("serves navigation from network first and refreshes the cached shell", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockResolvedValue(new Response("fresh index"));

    const response = await driveFetch(sw, navigateRequest(`${ORIGIN}/`));

    expect(await response?.text()).toBe("fresh index");
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    const cached = await sw.caches.match("/");
    expect(await cached?.text()).toBe("fresh index");
  });

  it("falls back to the cached shell when the network is down", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockImplementation(async (request: Request) => new Response(`body:${request.url}`));
    await runLifecycle(sw, "install");
    sw.fetchMock.mockRejectedValue(new Error("offline"));

    const response = await driveFetch(sw, navigateRequest(`${ORIGIN}/`));

    expect(response).toBeTruthy();
    expect(await response?.text()).toBe(`body:${ORIGIN}/`);
  });

  it("falls back to the cached shell when the network hangs past the timeout", async () => {
    vi.useFakeTimers();
    const loadWithFakeTimers = makeLoadSw();
    const sw = await loadWithFakeTimers();
    sw.fetchMock.mockImplementation(async (request: Request) => new Response(`body:${request.url}`));
    await runLifecycle(sw, "install");
    sw.fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    const pending = driveFetch(sw, navigateRequest(`${ORIGIN}/`));
    await vi.advanceTimersByTimeAsync(3001);
    const response = await pending;

    expect(await response?.text()).toBe(`body:${ORIGIN}/`);
  });

  it("serves /assets/* cache-first without touching the network on later hits", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockResolvedValue(new Response("asset v1"));
    const request = () => new Request(`${ORIGIN}/assets/app-abc123.js`);

    const first = await driveFetch(sw, request());
    expect(await first?.text()).toBe("asset v1");
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);

    sw.fetchMock.mockResolvedValue(new Response("asset v2"));
    const second = await driveFetch(sw, request());
    expect(await second?.text()).toBe("asset v1");
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves fixed-name small files stale-while-revalidate", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockResolvedValue(new Response("boot v1"));

    const first = await driveFetch(sw, new Request(`${ORIGIN}/theme-boot.js`));
    expect(await first?.text()).toBe("boot v1");

    sw.fetchMock.mockResolvedValue(new Response("boot v2"));
    const second = await driveFetch(sw, new Request(`${ORIGIN}/theme-boot.js`));
    expect(await second?.text()).toBe("boot v1");

    await vi.waitFor(async () => {
      const cached = await sw.caches.match(`${ORIGIN}/theme-boot.js`);
      expect(await cached?.text()).toBe("boot v2");
    });
  });

  it("does not intercept the daily version-check fetch (non-navigation with no-store style params)", async () => {
    const sw = await loadSw();

    const event: FetchEventLike = {
      request: new Request(`${ORIGIN}/?_mini_desk_version=1755800000000`),
      respondWith: vi.fn().mockResolvedValue(undefined),
      waitUntil: vi.fn().mockResolvedValue(undefined),
    };
    (sw.listeners.get("fetch") as (e: FetchEventLike) => void)(event);

    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it("does not intercept cross-origin or non-GET requests", async () => {
    const sw = await loadSw();

    for (const request of [
      new Request("https://cdn.example.com/pixel.png"),
      new Request(`${ORIGIN}/api/x`, { method: "POST", body: "x" }),
    ]) {
      const event: FetchEventLike = {
        request,
        respondWith: vi.fn().mockResolvedValue(undefined),
        waitUntil: vi.fn().mockResolvedValue(undefined),
      };
      (sw.listeners.get("fetch") as (e: FetchEventLike) => void)(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    }
  });
});

describe("service worker activate and message", () => {
  it("deletes stale cache versions and claims clients", async () => {
    const sw = await loadSw();
    await sw.caches.open("mini-desk-v0");
    await sw.caches.open("mini-desk-v1");

    await runLifecycle(sw, "activate");

    expect(await sw.caches.keys()).toEqual(["mini-desk-v1"]);
    expect(sw.claim).toHaveBeenCalled();
  });

  it("activates a waiting worker on SKIP_WAITING", async () => {
    const sw = await loadSw();

    (sw.listeners.get("message") as (e: { data: { type: string } }) => void)({ data: { type: "SKIP_WAITING" } });

    expect(sw.skipWaiting).toHaveBeenCalled();
  });
});
```


*注：上块为计划初稿，已提交的 `src/__tests__/service-worker.test.ts` 以其为基础并做了如下修正/扩充（以提交文件为准）：`createCacheStorage(fetchFn)` 注入 fetch mock（原稿 `add/addAll` 误闭包宿主全局 fetch，会真连网络）；`driveFetch` 的 respondWith/waitUntil mock 提升为局部变量并经 `driveFetchWithEvent` 暴露（原稿 `event.respondWith.mock` 过不了 vue-tsc，且沙箱 promise 与宿主分属不同 realm，须按 thenable 鸭子类型解包）；mock `put` 存 clone、`match` 返回 clone 以贴近真实 CacheStorage；新增 4 个用例（SWR 网络挂起不阻塞首响应 / SWR 500 不覆盖缓存 / assets 404 原样返回且不缓存 / 导航 500 回退缓存壳），共 15 个用例。*

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/service-worker.test.ts`
Expected: FAIL —— `ENOENT ... public/sw.js`（文件还不存在，readFileSync 抛错）

- [ ] **Step 3: 实现 sw.js**

创建 `public/sw.js`：

```js
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
        caches.open(CACHE_VERSION).then((cache) => cache.put(new URL("/", self.location.origin).href, cloned)).catch(() => null),
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
```

注意：`cache.put(new URL("/", self.location.origin).href, ...)` 用绝对 URL 作键——真实浏览器会把 "/" 解析为 scope 下的绝对地址，两者一致；这也是测试 mock 的归一化规则。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/service-worker.test.ts`
Expected: PASS（15 个用例全绿）

- [ ] **Step 5: 提交**

```bash
git add public/sw.js src/__tests__/service-worker.test.ts
git commit -m "feat: Service Worker 离线缓存（导航网络优先/assets 缓存优先/SWR/其余放行）"
```

---

### Task 2: SW 注册模块 src/pwa.ts（TDD）

**Files:**
- Create: `src/pwa.ts`
- Test: `src/__tests__/pwa-register.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/pwa-register.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * swUpdateReady 是模块级 ref，用 vi.resetModules() + 动态 import 保证用例间隔离。
 * import.meta.env.PROD 默认为 false，用 vi.stubEnv 打开生产分支。
 */

interface MockServiceWorker {
  state: string;
  addEventListener: (type: string, cb: () => void) => void;
}

interface MockRegistration {
  waiting: { postMessage: (message: unknown) => void } | null;
  installing: MockServiceWorker | null;
  addEventListener: (type: string, cb: () => void) => void;
}

function makeRegistration(options: { waiting?: { postMessage: (message: unknown) => void } | null } = {}): {
  registration: MockRegistration;
  fireUpdateFound: () => void;
  fireStateChange: () => void;
  installing: MockServiceWorker;
} {
  const listeners = { updateFound: [] as Array<() => void>, stateChange: [] as Array<() => void> };
  const installing: MockServiceWorker = {
    state: "installing",
    addEventListener: (_type, cb) => listeners.stateChange.push(cb),
  };
  const registration: MockRegistration = {
    waiting: options.waiting ?? null,
    installing,
    addEventListener: (type, cb) => {
      if (type === "updatefound") listeners.updateFound.push(cb);
    },
  };
  return {
    registration,
    installing,
    fireUpdateFound: () => listeners.updateFound.forEach((cb) => cb()),
    fireStateChange: () => {
      installing.state = "installed";
      listeners.stateChange.forEach((cb) => cb());
    },
  };
}

function installNavigatorServiceWorker(options: {
  controller: unknown;
  register: ReturnType<typeof vi.fn>;
  registration: MockRegistration;
}): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller: options.controller,
      register: options.register,
      getRegistration: vi.fn().mockResolvedValue(options.registration),
    },
  });
}

function removeNavigatorServiceWorker(): void {
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
}

async function loadPwa(): Promise<typeof import("../pwa")> {
  vi.resetModules();
  return await import("../pwa");
}

describe("service worker registration (src/pwa.ts)", () => {
  beforeEach(() => {
    vi.stubEnv("PROD", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    removeNavigatorServiceWorker();
  });

  it("does not register outside production", async () => {
    vi.stubEnv("PROD", false);
    const register = vi.fn();
    installNavigatorServiceWorker({
      controller: undefined,
      register,
      registration: makeRegistration().registration,
    });
    const pwa = await loadPwa();

    await pwa.registerServiceWorker();

    expect(register).not.toHaveBeenCalled();
  });

  it("registers /sw.js and marks update-ready immediately when a worker is already waiting", async () => {
    const { registration } = makeRegistration({ waiting: { postMessage: vi.fn() } });
    const register = vi.fn().mockResolvedValue(registration);
    installNavigatorServiceWorker({ controller: {}, register, registration });
    const pwa = await loadPwa();

    await pwa.registerServiceWorker();

    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(pwa.swUpdateReady.value).toBe(true);
  });

  it("marks update-ready when a newly found worker finishes installing on an updated page", async () => {
    const harness = makeRegistration();
    const register = vi.fn().mockResolvedValue(harness.registration);
    installNavigatorServiceWorker({ controller: {}, register, registration: harness.registration });
    const pwa = await loadPwa();
    await pwa.registerServiceWorker();
    expect(pwa.swUpdateReady.value).toBe(false);

    harness.fireUpdateFound();
    harness.fireStateChange();

    expect(pwa.swUpdateReady.value).toBe(true);
  });

  it("ignores a first install (no controller) as an update", async () => {
    const harness = makeRegistration();
    const register = vi.fn().mockResolvedValue(harness.registration);
    installNavigatorServiceWorker({ controller: null, register, registration: harness.registration });
    const pwa = await loadPwa();
    await pwa.registerServiceWorker();

    harness.fireUpdateFound();
    harness.fireStateChange();

    expect(pwa.swUpdateReady.value).toBe(false);
  });

  it("swallows registration failures silently", async () => {
    const register = vi.fn().mockRejectedValue(new Error("insecure context"));
    installNavigatorServiceWorker({
      controller: undefined,
      register,
      registration: makeRegistration().registration,
    });
    const pwa = await loadPwa();

    await expect(pwa.registerServiceWorker()).resolves.toBeUndefined();
  });

  it("posts SKIP_WAITING to the waiting worker on activateWaitingServiceWorker", async () => {
    const postMessage = vi.fn();
    const { registration } = makeRegistration({ waiting: { postMessage } });
    installNavigatorServiceWorker({ controller: {}, register: vi.fn(), registration });
    const pwa = await loadPwa();

    await pwa.activateWaitingServiceWorker();

    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("does nothing without serviceWorker support", async () => {
    const pwa = await loadPwa();
    removeNavigatorServiceWorker();

    await expect(pwa.activateWaitingServiceWorker()).resolves.toBeUndefined();
    await expect(pwa.registerServiceWorker()).resolves.toBeUndefined();
  });
});
```

*注：上块为计划初稿，已提交的 `src/__tests__/pwa-register.test.ts` 后续经质量评审加固（`fireStateChange` 参数化支持传入任意状态；新增 4 个用例：非 installed 状态不点亮 / updatefound 时 `installing` 为 null 不崩不点亮 / `getRegistration()` 解析 undefined 时干净 no-op / 注册返回时已在安装的 worker 不经 updatefound 直接补挂），共 11 个用例，以提交文件为准。*

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/pwa-register.test.ts`
Expected: FAIL —— `Cannot find module '../pwa'`

- [ ] **Step 3: 实现 src/pwa.ts**

```ts
import { ref } from "vue";

export const SW_REGISTER_URL = "/sw.js";

/** 新版 Service Worker 已进入 waiting（通道 2 更新就绪），供版本红点消费。 */
export const swUpdateReady = ref(false);

/** 生产环境注册 Service Worker 并监听新 SW 进入 waiting；开发环境与不支持环境直接跳过。 */
export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_REGISTER_URL);
    if (registration.waiting) swUpdateReady.value = true;

    const watchInstallingWorker = (): void => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // controller 存在说明这是一次更新而非首次安装。
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          swUpdateReady.value = true;
        }
      });
    };

    // 注册返回时可能已有 worker 在安装（updatefound 早于监听器挂载就触发过），立即补挂。
    watchInstallingWorker();
    registration.addEventListener("updatefound", watchInstallingWorker);
  } catch {
    // 注册失败静默降级：应用本身不依赖 SW（spec §7）。
  }
}

/** 让 waiting 中的新 SW 立即接管；随后由调用方清空缓存并刷新。 */
export async function activateWaitingServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    // 无注册或 postMessage 失败都不阻塞更新流程。
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/pwa-register.test.ts`
Expected: PASS（11 个用例全绿）

- [ ] **Step 5: 提交**

```bash
git add src/pwa.ts src/__tests__/pwa-register.test.ts
git commit -m "feat: 生产环境注册 Service Worker 并暴露 waiting 检测"
```

---

### Task 3: 整合进版本更新红点（TDD）

**Files:**
- Modify: `src/composables/useAppVersionCheck.ts`（全文替换，见 Step 3）
- Test: `src/__tests__/app-version-check.test.ts`

背景：`App.vue:176-185` 解构 `versionPromptVisible`（只读）并把 `updateStaticVersion` 用于 changelog 弹窗"立即更新"（`App.vue:2862`）。本任务把 `versionPromptVisible` 从 ref 变为双通道 computed，App.vue 无需改动。

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/app-version-check.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppVersionCheck } from "../composables/useAppVersionCheck";
import type { MockedFunction } from "vitest";

vi.mock("../state/version", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/version")>();
  return {
    ...actual,
    fetchLatestAppVersion: vi.fn(),
    clearStaticCaches: vi.fn(),
  };
});
vi.mock("../pwa", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pwa")>();
  return {
    ...actual,
    activateWaitingServiceWorker: vi.fn(),
  };
});

const { fetchLatestAppVersion, clearStaticCaches } = await import("../state/version");
const { activateWaitingServiceWorker, swUpdateReady } = await import("../pwa");

const fetchMock = fetchLatestAppVersion as MockedFunction<typeof fetchLatestAppVersion>;
const clearMock = clearStaticCaches as MockedFunction<typeof clearStaticCaches>;
const activateMock = activateWaitingServiceWorker as MockedFunction<typeof activateWaitingServiceWorker>;

function setup() {
  return useAppVersionCheck(() => true);
}

beforeEach(() => {
  fetchMock.mockReset();
  clearMock.mockReset();
  activateMock.mockReset();
  swUpdateReady.value = false;
});

describe("useAppVersionCheck red-dot channels", () => {
  it("lights the prompt when a newer deployed version is found", async () => {
    const { versionPromptVisible, checkLatestAppVersion } = setup();
    fetchMock.mockResolvedValue("99.0.0");

    await checkLatestAppVersion();

    expect(versionPromptVisible.value).toBe(true);
  });

  it("keeps the prompt off when the deployed version matches", async () => {
    const { versionPromptVisible, availableAppVersion, checkLatestAppVersion } = setup();
    fetchMock.mockResolvedValue(availableAppVersion.value);

    await checkLatestAppVersion();

    expect(versionPromptVisible.value).toBe(false);
  });

  it("lights the same prompt when a service worker is waiting (channel 2)", async () => {
    const { versionPromptVisible } = setup();
    fetchMock.mockResolvedValue(null);

    swUpdateReady.value = true;
    expect(versionPromptVisible.value).toBe(true);

    swUpdateReady.value = false;
    expect(versionPromptVisible.value).toBe(false);
  });

  it("clears the version channel after the user is marked up to date", async () => {
    const { versionPromptVisible, checkLatestAppVersion, checkAppVersion } = setup();
    fetchMock.mockResolvedValue("99.0.0");
    await checkLatestAppVersion();
    expect(versionPromptVisible.value).toBe(true);

    checkAppVersion();

    expect(versionPromptVisible.value).toBe(false);
  });
});

describe("useAppVersionCheck updateStaticVersion ordering", () => {
  it("activates the waiting worker, clears caches, then reloads", async () => {
    const order: string[] = [];
    activateMock.mockImplementation(async () => {
      order.push("activate");
    });
    clearMock.mockImplementation(async () => {
      order.push("clear");
    });
    const reload = vi.fn();
    vi.spyOn(window.location, "reload").mockImplementation(reload);

    const { updateStaticVersion } = setup();
    await updateStaticVersion();

    expect(order).toEqual(["activate", "clear"]);
    expect(reload).toHaveBeenCalled();
    vi.mocked(window.location.reload).mockRestore();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/app-version-check.test.ts`
Expected: FAIL —— SW 通道用例失败（`versionPromptVisible` 还是 ref，不随 `swUpdateReady` 变化）；顺序用例失败（`activateWaitingServiceWorker` 未被调用）

- [ ] **Step 3: 改造 useAppVersionCheck.ts**

`src/composables/useAppVersionCheck.ts` 全文替换为：

```ts
import { computed, ref } from "vue";
import {
  APP_VERSION_CHECK_INTERVAL_MS,
  clearStaticCaches,
  fetchLatestAppVersion,
  getIndexAppVersion,
  getStoredAppVersion,
  markAppVersionSeen,
} from "../state/version";
import { activateWaitingServiceWorker, swUpdateReady } from "../pwa";

/**
 * App version watcher: seeds the running version, polls the deployed
 * index.html for a newer one, and marks the running version as seen in
 * localStorage so a fresh visit doesn't re-prompt. The prompt is fed by
 * two channels: deployed-version polling and a waiting service worker.
 */
export function useAppVersionCheck(isMounted: () => boolean) {
  const appVersion = ref(getIndexAppVersion());
  const availableAppVersion = ref(appVersion.value);
  const storedAppVersion = ref<string | null>(null);
  const versionChannelVisible = ref(false);
  // 红点双通道：版本号轮询（通道 1）或新 SW waiting（通道 2），见 spec §5。
  const versionPromptVisible = computed(() => versionChannelVisible.value || swUpdateReady.value);
  const versionCheckTimer = ref<number | undefined>();

  function checkAppVersion(): void {
    storedAppVersion.value = getStoredAppVersion();
    if (storedAppVersion.value !== appVersion.value) {
      markAppVersionSeen(appVersion.value);
      storedAppVersion.value = appVersion.value;
    }
    availableAppVersion.value = appVersion.value;
    versionChannelVisible.value = false;
  }

  async function checkLatestAppVersion(): Promise<void> {
    const latestVersion = await fetchLatestAppVersion();
    if (!isMounted() || !latestVersion) return;

    if (latestVersion === appVersion.value) {
      availableAppVersion.value = appVersion.value;
      versionChannelVisible.value = false;
      return;
    }

    availableAppVersion.value = latestVersion;
    versionChannelVisible.value = true;
  }

  async function updateStaticVersion(): Promise<void> {
    await activateWaitingServiceWorker();
    await clearStaticCaches();
    versionChannelVisible.value = false;
    window.location.reload();
  }

  function startPolling(): void {
    versionCheckTimer.value = window.setInterval(() => {
      void checkLatestAppVersion();
    }, APP_VERSION_CHECK_INTERVAL_MS);
  }

  function clearTimers(): void {
    window.clearInterval(versionCheckTimer.value);
    versionCheckTimer.value = undefined;
  }

  return {
    appVersion,
    availableAppVersion,
    storedAppVersion,
    versionPromptVisible,
    checkAppVersion,
    checkLatestAppVersion,
    updateStaticVersion,
    startPolling,
    clearTimers,
  };
}
```

（返回值签名不变：`versionPromptVisible` 由 ref 变 computed，`App.vue` 解构处只读，无需改动。）

- [ ] **Step 4: 运行确认通过 + 回归全量**

Run: `npx vitest run src/__tests__/app-version-check.test.ts`
Expected: PASS（5 个用例全绿）

Run: `npm test`
Expected: 全量 PASS（重点看 `app-render`、`settings-menu`、`version` 无回归）

- [ ] **Step 5: 提交**

```bash
git add src/composables/useAppVersionCheck.ts src/__tests__/app-version-check.test.ts
git commit -m "feat: 版本红点并入 SW waiting 通道并更新时先接管新 SW"
```

---

### Task 4: Manifest、图标、注册接线与部署配置

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-512.png`、`public/icons/icon-192.png`
- Modify: `index.html:6` 之后插入两行
- Modify: `public/_headers`（文件末尾追加）
- Modify: `src/main.ts`（全文替换）
- Modify: `src/__tests__/deployment-config.test.ts`（追加 describe）

- [ ] **Step 1: 生成图标**

```bash
mkdir -p public/icons
cp favicon.png public/icons/icon-512.png
sips -Z 192 public/icons/icon-512.png --out public/icons/icon-192.png
```

Expected: `sips` 输出写入完成；`file public/icons/icon-192.png` 显示 192x192

- [ ] **Step 2: 创建 manifest**

创建 `public/manifest.webmanifest`：

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

- [ ] **Step 3: index.html 加 manifest 链接与主题色**

在 `<meta name="app-version" content="1.0.137" />` 行后插入：

```html
    <meta name="theme-color" content="#007aff" />
    <link rel="manifest" href="/manifest.webmanifest" />
```

- [ ] **Step 4: _headers 追加 SW/manifest 的 no-cache**

在 `public/_headers` 文件末尾追加：

```
/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
```

（保证浏览器导航时对 sw.js 的更新检查不被 HTTP 缓存挡住——spec §5 通道 2 的前提。）

- [ ] **Step 5: main.ts 接线**

`src/main.ts` 全文替换为：

```ts
import { createApp } from "vue";
import "./styles.css";
import App from "./App.vue";
import { registerServiceWorker } from "./pwa";

createApp(App).mount("#app");
void registerServiceWorker();
```

- [ ] **Step 6: 扩展部署配置断言**

在 `src/__tests__/deployment-config.test.ts` 文件末尾追加：

```ts
describe("pwa configuration", () => {
  it("links the manifest and registers the service worker in the production entry", () => {
    const index = read("index.html");

    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(read("src/main.ts")).toContain("registerServiceWorker");
  });

  it("serves sw.js and the manifest with no-cache headers", () => {
    const headers = read("public/_headers");

    expect(headers).toContain("/sw.js");
    expect(headers).toContain("Cache-Control: no-cache");
  });

  it("pre-caches the app shell declared by the service worker", () => {
    const sw = read("public/sw.js");

    expect(sw).toContain('"/theme-boot.js"');
    expect(sw).toContain('"/manifest.webmanifest"');
    expect(sw).toContain('"/icons/icon-192.png"');
    expect(sw).toContain('"/icons/icon-512.png"');
  });
});
```

- [ ] **Step 7: 全量验证（含 vue-tsc 类型检查与构建产物）**

Run: `npm test`
Expected: 全量 PASS

Run: `npm run build`
Expected: 构建成功；且 `ls dist` 包含 `sw.js`、`manifest.webmanifest`、`icons/`：

```bash
ls dist dist/icons
```

Expected: `dist/sw.js`、`dist/manifest.webmanifest`、`dist/icons/icon-192.png`、`dist/icons/icon-512.png` 均存在

- [ ] **Step 8: 提交**

```bash
git add public/manifest.webmanifest public/icons index.html public/_headers src/main.ts src/__tests__/deployment-config.test.ts
git commit -m "feat: PWA manifest、图标与生产注册接线（含 no-cache 头）"
```

---

### Task 5: 手动验收（spec §8 清单）

**Files:** 无代码改动；仅验证。发现问题回到对应 Task 修复。

- [ ] **Step 1: 启动生产预览**

```bash
npm run build && npm run preview
```

- [ ] **Step 2: SW 激活与可安装性**

浏览器打开预览地址 → DevTools → Application：
- Service Workers：`sw.js` 状态 activated and is running；Cache Storage 出现 `mini-desk-v1` 且含 shell 条目
- Manifest：图标与名称正常，无报错；地址栏出现安装入口，可安装成独立窗口

- [ ] **Step 3: 离线可用**

DevTools → Network → Offline（或 Application → Service Workers → 勾选 Offline）→ 刷新页面：
- 页面完整打开，便签/待办/GIF 伴侣/主题切换全部可用（数据本就在 localStorage/IndexedDB）

- [ ] **Step 4: 通道 1 更新（版本号变化）**

恢复在线 → 修改 `dist/index.html` 里 `meta[name="app-version"]` 为 `1.0.138` → 等待/触发 `checkLatestAppVersion`（可在 Console 里直接刷新页面，轮询周期 24h，验收时可临时把 `APP_VERSION_CHECK_INTERVAL_MS` 缩短重跑）→ 红点出现 → 点击 → 版本变为 1.0.138

- [ ] **Step 5: 通道 2 更新（sw.js 变化）**

在 `public/sw.js` 末尾加一行注释 → `npm run build && npm run preview` → 刷新页面 → Application → Service Workers 出现 waiting worker → 红点出现 → 点击 → 新 SW activated → 移除临时注释重新构建

- [ ] **Step 6: 收尾提交（若验收中产生修复）**

```bash
git status   # 确认无未预期改动
```

如验收全部通过且无修复，本任务无提交。

---

## Self-Review 结论（已核对）

1. **Spec 覆盖**：§3 文件清单 → Task 1-4 全部落地；§4 缓存策略 → Task 1（含测试逐条对应）；§5 双通道 → Task 2/3；§6 manifest → Task 4；§7 错误处理 → 各 try/catch 与守卫；§8 测试 → Task 1-4 自动化 + Task 5 手动清单。
2. **占位符**：无 TBD/TODO，所有步骤含完整代码或精确命令。
3. **类型一致性**：`registerServiceWorker` / `activateWaitingServiceWorker` / `swUpdateReady` / `SW_REGISTER_URL` / `SKIP_WAITING` / `mini-desk-v1` 在各任务与 sw.js 间一致；`versionPromptVisible` 保持原名，App.vue 零改动。
