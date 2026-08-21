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
          store.set(keyOf(request), response.clone());
        },
        async match(request: RequestInfo | URL): Promise<Response | null> {
          const hit = store.get(keyOf(request));
          return hit ? hit.clone() : null;
        },
      };
    },
    async match(request: RequestInfo | URL): Promise<Response | undefined> {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit.clone();
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
  matchAllClients: ReturnType<typeof vi.fn>;
}

function makeLoadSw() {
  return async (): Promise<SwHarness> => {
    const listeners = new Map<string, Listener>();
    const skipWaiting = vi.fn();
    const claim = vi.fn();
    const matchAllClients = vi.fn().mockResolvedValue([]);
    const fetchMock = vi.fn();
    const caches = createCacheStorage(fetchMock);

    const swScope = {
      location: { origin: ORIGIN },
      skipWaiting,
      clients: { claim, matchAll: matchAllClients },
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

    return { listeners, caches, fetchMock, skipWaiting, claim, matchAllClients };
  };
}

const loadSw = makeLoadSw();

function navigateRequest(url: string): FetchRequestLike {
  return { method: "GET", mode: "navigate", url };
}

interface DrivenFetch {
  response: Response | undefined;
  respondWith: ReturnType<typeof vi.fn>;
  waitUntil: ReturnType<typeof vi.fn>;
}

// vm 沙箱与宿主分属不同 realm，instanceof Promise 对沙箱 promise 恒为 false，改用鸭子类型判断 thenable。
function isThenable(value: Response | PromiseLike<Response> | undefined): value is PromiseLike<Response> {
  return typeof value === "object" && value !== null && typeof (value as PromiseLike<Response>).then === "function";
}

async function driveFetchWithEvent(
  harness: SwHarness,
  request: FetchRequestLike | Request,
): Promise<DrivenFetch> {
  const respondWith = vi.fn().mockResolvedValue(undefined);
  const waitUntil = vi.fn().mockResolvedValue(undefined);
  const event: FetchEventLike = { request, respondWith, waitUntil };
  (harness.listeners.get("fetch") as (e: FetchEventLike) => void)(event);
  const arg = respondWith.mock.calls[0]?.[0] as Response | PromiseLike<Response> | undefined;
  const response = isThenable(arg) ? await arg : arg;
  return { response, respondWith, waitUntil };
}

function driveFetch(harness: SwHarness, request: FetchRequestLike | Request): Promise<Response | undefined> {
  return driveFetchWithEvent(harness, request).then((driven) => driven.response);
}

async function awaitBackgroundWork(driven: DrivenFetch): Promise<unknown> {
  return Promise.all(driven.waitUntil.mock.calls.map((call) => call[0] as Promise<unknown>));
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

    const driven = await driveFetchWithEvent(sw, navigateRequest(`${ORIGIN}/`));

    expect(await driven.response?.text()).toBe("fresh index");
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    // 先响应后写缓存：等待 waitUntil 里的后台写入完成后再断言缓存内容。
    expect(driven.waitUntil).toHaveBeenCalled();
    await awaitBackgroundWork(driven);
    const cached = await sw.caches.match("/");
    expect(await cached?.text()).toBe("fresh index");
  });

  it("falls back to the cached shell when navigation gets a server error", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockImplementation(async (request: Request) => new Response(`body:${request.url}`));
    await runLifecycle(sw, "install");
    sw.fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    const { response } = await driveFetchWithEvent(sw, navigateRequest(`${ORIGIN}/`));

    expect(await response?.text()).toBe(`body:${ORIGIN}/`);
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

  it("returns a non-ok asset response as-is without caching it", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockResolvedValue(new Response("missing", { status: 404 }));

    const { response } = await driveFetchWithEvent(sw, new Request(`${ORIGIN}/assets/app-missing.js`));

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("missing");
    expect(await sw.caches.match(`${ORIGIN}/assets/app-missing.js`)).toBeFalsy();
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

  it("serves the cached copy while the network is still pending", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockImplementation(async (request: Request) => new Response(`body:${request.url}`));
    await runLifecycle(sw, "install"); // 种下缓存

    let releaseNetwork!: (value: Response) => void;
    sw.fetchMock.mockReturnValue(new Promise<Response>((resolve) => { releaseNetwork = resolve; }));

    const driven = driveFetchWithEvent(sw, new Request(`${ORIGIN}/theme-boot.js`));
    const settled = await Promise.race([
      driven.then(() => true),
      new Promise<boolean>((resolve) => { setTimeout(() => resolve(false), 0); }),
    ]);
    expect(settled).toBe(true); // 阻塞式实现会在这里失败
    const { response, waitUntil } = await driven;
    expect(await response?.text()).toBe(`body:${ORIGIN}/theme-boot.js`);

    // waitUntil 传播：后台保鲜 promise 在网络释放前不得 settle。
    expect(waitUntil).toHaveBeenCalled();
    const background = waitUntil.mock.calls[0][0] as Promise<unknown>;
    let backgroundSettled = false;
    void background.then(() => { backgroundSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(backgroundSettled).toBe(false);

    releaseNetwork(new Response("boot v2"));
    await background;
    await vi.waitFor(async () => {
      expect(await (await sw.caches.match(`${ORIGIN}/theme-boot.js`))?.text()).toBe("boot v2");
    });
  });

  it("does not let a failing SWR revalidation overwrite the cached copy", async () => {
    const sw = await loadSw();
    sw.fetchMock.mockImplementation(async (request: Request) => new Response(`body:${request.url}`));
    await runLifecycle(sw, "install");

    sw.fetchMock.mockResolvedValue(new Response("server error", { status: 500 }));
    const driven = await driveFetchWithEvent(sw, new Request(`${ORIGIN}/theme-boot.js`));

    expect(await driven.response?.text()).toBe(`body:${ORIGIN}/theme-boot.js`);
    expect(driven.waitUntil).toHaveBeenCalled();
    await awaitBackgroundWork(driven);
    const cached = await sw.caches.match(`${ORIGIN}/theme-boot.js`);
    expect(await cached?.text()).toBe(`body:${ORIGIN}/theme-boot.js`);
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

describe("service worker first-visit warm-up", () => {
  it("pre-caches /assets/* referenced by open pages right after activation", async () => {
    const sw = await loadSw();
    sw.matchAllClients.mockResolvedValue([{ url: `${ORIGIN}/` }]);
    sw.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (href === `${ORIGIN}/`) {
        return new Response(
          `<script type="module" src="/assets/index-abc.js"></script>` +
            `<link rel="stylesheet" href="/assets/index-def.css">` +
            `<link rel="icon" href="/assets/favicon-ghi.ico">`,
        );
      }
      return new Response(`body:${href}`);
    });

    await runLifecycle(sw, "activate");

    expect(await sw.caches.match(`${ORIGIN}/assets/index-abc.js`)).toBeTruthy();
    expect(await sw.caches.match(`${ORIGIN}/assets/index-def.css`)).toBeTruthy();
    expect(await sw.caches.match(`${ORIGIN}/assets/favicon-ghi.ico`)).toBeTruthy();
  });

  it("ignores non-asset references and de-duplicates repeated ones", async () => {
    const sw = await loadSw();
    sw.matchAllClients.mockResolvedValue([{ url: `${ORIGIN}/` }]);
    sw.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (href === `${ORIGIN}/`) {
        return new Response(
          `<script src="/assets/a.js"></script><script src="/assets/a.js"></script>` +
            `<link href="/assets/b.css"><img src="/logo.png">`,
        );
      }
      return new Response(`body:${href}`);
    });

    await runLifecycle(sw, "activate");

    expect(await sw.caches.match(`${ORIGIN}/assets/a.js`)).toBeTruthy();
    expect(await sw.caches.match(`${ORIGIN}/assets/b.css`)).toBeTruthy();
    expect(await sw.caches.match(`${ORIGIN}/logo.png`)).toBeFalsy();
    // 1 次 HTML 拉取 + 2 个去重后的资源。
    expect(sw.fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps activation healthy when the warm-up fetch fails", async () => {
    const sw = await loadSw();
    sw.matchAllClients.mockResolvedValue([{ url: `${ORIGIN}/` }]);
    sw.fetchMock.mockRejectedValue(new Error("offline"));

    await expect(runLifecycle(sw, "activate")).resolves.toBeUndefined();

    expect(sw.claim).toHaveBeenCalled();
  });
});
