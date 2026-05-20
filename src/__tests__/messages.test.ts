import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KAOMOJI_BY_MOOD,
  MESSAGE_CATALOG,
  getMessage,
  getMessageCatalogSummary,
  withKaomoji,
} from "../state/messages";

const messageKeys = [
  "save",
  "todoCompleted",
  "clipboardPasteUnsupported",
  "clipboardImageMissing",
  "imageAdded",
  "imageCopied",
  "imageDataCopied",
  "quickLinkCopied",
  "quickTextCopied",
  "quickTextCopyFailed",
  "noCompletedTodos",
  "dataExported",
  "dataImported",
  "confirmDeleteImage",
  "confirmDeleteQuick",
  "confirmDeleteTodo",
  "confirmClearCompleted",
  "about",
] as const;

describe("message catalog", () => {
  it("extracts every popup and message scenario into the shared catalog", () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual([...messageKeys].sort());
  });

  it("provides multiple same-meaning variants for every message", () => {
    for (const key of messageKeys) {
      expect(MESSAGE_CATALOG[key].variants.length, key).toBeGreaterThanOrEqual(3);
    }
  });

  it("groups kaomoji by emotion and appends a matching kaomoji to generated messages", () => {
    expect(Object.keys(KAOMOJI_BY_MOOD).sort()).toEqual(["encouraging", "happy", "surprised", "warning"]);

    for (const key of messageKeys) {
      const mood = MESSAGE_CATALOG[key].mood;
      const message = getMessage(key);

      expect(KAOMOJI_BY_MOOD[mood].some((kaomoji) => message.endsWith(kaomoji)), key).toBe(true);
    }
  });

  it("appends kaomoji after every text segment", () => {
    const message = withKaomoji("第一段\n第二段", "happy", () => 0);

    expect(message).toBe(`第一段 ${KAOMOJI_BY_MOOD.happy[0]}\n第二段 ${KAOMOJI_BY_MOOD.happy[0]}`);
  });

  it("can summarize all popup text locations for maintenance", () => {
    const summary = getMessageCatalogSummary();

    expect(summary).toContain("confirmDeleteImage");
    expect(summary).toContain("companion");
    expect(summary).toContain("naive-message");
    expect(summary).toContain("dialog");
  });

  it("includes shortcut guidance and keeps the source repository display out of shared message text", () => {
    const guideSource = readSource("src/App.vue");

    expect(guideSource).toContain("Ctrl+S");
    expect(guideSource).toContain("Tab");
    expect(guideSource).toContain("方向键");
    expect(MESSAGE_CATALOG.about.variants.join("\n")).not.toContain("https://github.com/xiangjianan/todolist");
    expect(guideSource).toContain("LogoGithub");
    expect(guideSource).toContain("GITHUB_REPO_NAME");
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(__dirname, "../..", file), "utf8");
}
