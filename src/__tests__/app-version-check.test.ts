import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";
import { useAppVersionCheck } from "../composables/useAppVersionCheck";

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
    // jsdom 的 location.reload 是不可配置自有属性（WebIDL LegacyUnforgeable），
    // vi.spyOn 直接改写会抛 "Cannot redefine property"；先 stubGlobal 换成普通对象再 spy。
    vi.stubGlobal("location", { ...window.location });
    vi.spyOn(window.location, "reload").mockImplementation(reload);

    const { updateStaticVersion } = setup();
    await updateStaticVersion();

    expect(order).toEqual(["activate", "clear"]);
    expect(reload).toHaveBeenCalled();
    vi.mocked(window.location.reload).mockRestore();
    vi.unstubAllGlobals();
  });
});
