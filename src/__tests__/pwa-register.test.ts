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
