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
  const respondWith = vi.fn().mockResolvedValue(undefined);
  const event: FetchEventLike = {
    request,
    respondWith,
    waitUntil: vi.fn().mockResolvedValue(undefined),
  };
  (harness.listeners.get("fetch") as (e: FetchEventLike) => void)(event);
  const arg = respondWith.mock.calls[0]?.[0];
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
