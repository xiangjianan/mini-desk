import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_VERSION_STORAGE_KEY,
  FALLBACK_APP_VERSION,
  getIndexAppVersion,
  getStoredAppVersion,
  markAppVersionSeen,
} from "../state/version";

describe("app version", () => {
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
});
