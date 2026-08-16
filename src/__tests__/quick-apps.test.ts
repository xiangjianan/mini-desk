import { describe, expect, it } from "vitest";
import { QUICK_APP_PRESETS, isQuickAppScheme } from "../state/quickApps";

describe("isQuickAppScheme", () => {
  it("accepts the curated presets' schemes", () => {
    for (const preset of QUICK_APP_PRESETS) {
      expect(isQuickAppScheme(preset.scheme)).toBe(true);
    }
  });

  it("accepts legitimate custom schemes with payloads", () => {
    expect(isQuickAppScheme("wechat://")).toBe(true);
    expect(isQuickAppScheme("im:10012345")).toBe(true);
    expect(isQuickAppScheme("sms:13800138000")).toBe(true);
    expect(isQuickAppScheme("vscode://file/~/notes.md")).toBe(true);
    expect(isQuickAppScheme("x-apple.systempreferences:com.apple.preference.security")).toBe(true);
    expect(isQuickAppScheme("slack://channel?id=C123")).toBe(true);
  });

  it("rejects plain and web URLs", () => {
    expect(isQuickAppScheme("http://example.com")).toBe(false);
    expect(isQuickAppScheme("https://example.com")).toBe(false);
    expect(isQuickAppScheme("example.com")).toBe(false);
    expect(isQuickAppScheme("")).toBe(false);
    expect(isQuickAppScheme("no scheme here")).toBe(false);
  });

  it("rejects script-executing and local-resource schemes", () => {
    expect(isQuickAppScheme("javascript:alert(1)")).toBe(false);
    expect(isQuickAppScheme("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isQuickAppScheme("vbscript:msgbox")).toBe(false);
    expect(isQuickAppScheme("blob:https://evil.example/uuid")).toBe(false);
    expect(isQuickAppScheme("file:///etc/passwd")).toBe(false);
    expect(isQuickAppScheme("filesystem:https://evil.example/temporal/")).toBe(false);
    expect(isQuickAppScheme("view-source:https://evil.example")).toBe(false);
    expect(isQuickAppScheme("jar:https://evil.example/app.jar!/x.html")).toBe(false);
    expect(isQuickAppScheme("ws://evil.example")).toBe(false);
  });

  it("rejects browser-internal schemes", () => {
    expect(isQuickAppScheme("about:blank")).toBe(false);
    expect(isQuickAppScheme("chrome://settings")).toBe(false);
    expect(isQuickAppScheme("chrome-extension://abc/x.html")).toBe(false);
    expect(isQuickAppScheme("moz-extension://abc/x.html")).toBe(false);
    expect(isQuickAppScheme("resource://gre/res/x.html")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isQuickAppScheme("JAVASCRIPT:alert(1)")).toBe(false);
    expect(isQuickAppScheme("JavaScript:alert(1)")).toBe(false);
    expect(isQuickAppScheme("DATA:text/html,x")).toBe(false);
    expect(isQuickAppScheme("WECHAT://")).toBe(true);
    expect(isQuickAppScheme("IM:10012345")).toBe(true);
  });

  it("defeats whitespace filter bypasses", () => {
    // Browsers strip \t/\n/\r when resolving anchor hrefs, so "jav\tascript:"
    // executes as javascript:. The guard must sanitize before matching.
    expect(isQuickAppScheme("jav\tascript:alert(1)")).toBe(false);
    expect(isQuickAppScheme("java\nscript:alert(1)")).toBe(false);
    expect(isQuickAppScheme("java\rscript:alert(1)")).toBe(false);
    expect(isQuickAppScheme(" javascript:alert(1)")).toBe(false);
    expect(isQuickAppScheme("  wechat://  ")).toBe(true);
  });
});
