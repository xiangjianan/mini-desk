import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

/** 直接执行 public/theme-boot.js（同步外链脚本，不经打包），验证首帧前的主题与标题栏着色。 */

const STATE_KEY = "mini-desk-state-v1";

function runThemeBoot(): void {
  vm.runInThisContext(readFileSync(resolve(__dirname, "../../public/theme-boot.js"), "utf8"));
}

function themeColorMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    // 真实页面里 meta 已存在于 index.html；jsdom 空文档需自建。
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  return meta;
}

describe("theme-boot.js (pre-first-frame theming)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    themeColorMeta().setAttribute("content", "#f5f5f7");
  });

  it("applies the persisted dark theme and its title bar color before first paint", () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ theme: "dark" }));

    runThemeBoot();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(themeColorMeta().content).toBe("#1c1c1e");
  });

  it("applies the persisted light theme and its title bar color before first paint", () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ theme: "light" }));

    runThemeBoot();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeColorMeta().content).toBe("#f5f5f7");
  });

  it("leaves the defaults untouched when no state has been persisted", () => {
    runThemeBoot();

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(themeColorMeta().content).toBe("#f5f5f7");
  });

  it("does not throw on malformed persisted state", () => {
    localStorage.setItem(STATE_KEY, "{not json");

    expect(() => runThemeBoot()).not.toThrow();
  });
});
