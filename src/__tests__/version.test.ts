import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  APP_VERSION_CHECK_INTERVAL_MS,
  APP_VERSION_STORAGE_KEY,
  FALLBACK_APP_VERSION,
  LEGACY_APP_VERSION_STORAGE_KEY,
  fetchLatestAppVersion,
  getAppVersionFromHtml,
  getIndexAppVersion,
  getStoredAppVersion,
  markAppVersionSeen,
} from "../state/version";

describe("app version", () => {
  it("checks deployed versions at most once per day on the timer", () => {
    expect(APP_VERSION_CHECK_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("records the current static version in index.html", () => {
    const root = resolve(__dirname, "../..");
    const index = readFileSync(resolve(root, "index.html"), "utf8");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(index).toContain(`<meta name="app-version" content="${pkg.version}"`);
    expect(FALLBACK_APP_VERSION).toBe(pkg.version);
  });

  it("reads and stores the local app version marker", () => {
    const storage = localStorage;
    storage.clear();
    const doc = document.implementation.createHTMLDocument();
    const meta = doc.createElement("meta");
    meta.name = "app-version";
    meta.content = "9.9.9";
    doc.head.append(meta);

    expect(getIndexAppVersion(doc)).toBe("9.9.9");
    expect(getStoredAppVersion(storage)).toBeNull();

    markAppVersionSeen("9.9.9", storage);

    expect(storage.getItem(APP_VERSION_STORAGE_KEY)).toBe("9.9.9");
  });

  it("reads the legacy local app version marker after the project rename", () => {
    const storage = localStorage;
    storage.clear();
    storage.setItem(LEGACY_APP_VERSION_STORAGE_KEY, "1.0.39");

    expect(getStoredAppVersion(storage)).toBe("1.0.39");
  });

  it("parses the app version from fetched index HTML", () => {
    expect(getAppVersionFromHtml('<html><head><meta name="app-version" content="2.0.0"></head></html>')).toBe("2.0.0");
    expect(getAppVersionFromHtml("<html><head></head></html>")).toBeNull();
  });

  it("fetches the latest app version with a cache-busting request", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<meta name="app-version" content="2.0.1">'),
    });

    await expect(fetchLatestAppVersion(fetcher, "https://example.com/workbench")).resolves.toBe("2.0.1");

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toMatch(/^https:\/\/example\.com\/\?_mini_desk_version=/);
    expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });
});
