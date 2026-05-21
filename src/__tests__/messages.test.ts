import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_HINTS,
  AREA_HELP,
  CONTROL_HELP,
} from "../state/defaults";
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
  "undoDeleteImage",
  "undoDeleteQuick",
  "undoDeleteTodo",
  "undoDeleteSpace",
  "undoClearCompleted",
  "importJsonInvalid",
  "importDataInvalid",
  "imageStoreFailed",
  "imageReadFailed",
  "clipboardPermissionDenied",
  "imageCopyFailed",
  "linkOpenFailed",
  "confirmDeleteImage",
  "confirmDeleteQuick",
  "confirmDeleteTodo",
  "confirmDeleteSpace",
  "confirmClearCompleted",
  "confirmImportData",
  "about",
] as const;

describe("message catalog", () => {
  it("extracts every popup and message scenario into the shared catalog", () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual([...messageKeys].sort());
  });

  it("provides ten variants for every popup message", () => {
    for (const key of messageKeys) {
      expect(MESSAGE_CATALOG[key].variants.length, key).toBe(10);
    }
  });

  it("groups kaomoji by emotion and appends a matching kaomoji to generated messages", () => {
    expect(Object.keys(KAOMOJI_BY_MOOD).sort()).toEqual(["calm", "encouraging", "happy", "surprised", "warning"]);
    const allKaomoji = Object.values(KAOMOJI_BY_MOOD).flat();

    for (const [mood, kaomoji] of Object.entries(KAOMOJI_BY_MOOD)) {
      expect(kaomoji.length, mood).toBe(10);
    }
    expect(new Set(allKaomoji).size).toBe(allKaomoji.length);

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
    expect(summary).toContain("dialog");
    expect(summary).not.toContain("naive-message");
  });

  it("keeps prompt copy brief and human with kaomoji-ready wording", () => {
    for (const [key, entry] of Object.entries(MESSAGE_CATALOG)) {
      if (key === "about") continue;
      for (const variant of entry.variants) {
        expect(variant.length, `${key}: ${variant}`).toBeLessThanOrEqual(15);
      }
    }

    const inlineHints = [
      EMPTY_HINTS.images,
      EMPTY_HINTS.quickButtons,
      ...Object.values(EMPTY_HINTS.todos),
      ...Object.values(AREA_HELP),
      ...Object.values(CONTROL_HELP),
    ];
    for (const hint of inlineHints) {
      expect(hint.length, hint).toBeLessThanOrEqual(28);
    }

    expect(EMPTY_HINTS.images).toContain("Ctrl+V");
    expect(AREA_HELP.todos).not.toMatch(/早|中|晚/);
  });

  it("includes shortcut guidance and keeps the source repository display out of shared message text", () => {
    const guideSource = readSource("src/App.vue");

    expect(guideSource).toContain("Record<GuideKey, string[]>");
    expect(guideSource).toContain("Ctrl+S");
    expect(guideSource).toContain("Tab");
    expect(guideSource).toContain("方向键");
    expect(guideSource).toContain("右键");
    expect(guideSource).not.toContain("GUIDE_REPEAT_CHANCE");
    expect(guideSource).not.toContain("maybeShowGuideBubble");
    expect(MESSAGE_CATALOG.about.variants.join("\n")).not.toContain("https://github.com/xiangjianan/todolist");
    expect(guideSource).toContain("LogoGithub");
    expect(guideSource).toContain("GITHUB_REPO_NAME");
  });

  it("provides ten guide variants for every guide bubble scenario", () => {
    const guideSource = readSource("src/App.vue");
    const guideKeys = [
      "images",
      "note",
      "quickButtons",
      "todos",
      "workspace",
      "storage",
      "addQuick",
      "toggleHiddenQuick",
      "settings",
      "theme",
    ];

    for (const key of guideKeys) {
      expect(countGuideVariants(guideSource, key), key).toBe(10);
    }
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(__dirname, "../..", file), "utf8");
}

function countGuideVariants(source: string, key: string): number {
  const match = source.match(new RegExp(String.raw`  ${key}: \[([\s\S]*?)  \]`));
  if (!match) return 0;
  return match[1].match(/^    [`"]/gm)?.length ?? 0;
}
