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
import { GUIDE_MESSAGES } from "../state/i18n";

const messageKeys = [
  "save",
  "saveStatusLegend",
  "todoCompleted",
  "clipboardPasteUnsupported",
  "clipboardImageMissing",
  "imageAdded",
  "imageCopied",
  "imageDataCopied",
  "imageDropIgnored",
  "imageDropEmpty",
  "quickLinkCopied",
  "quickTextCopied",
  "quickTextCopyFailed",
  "noCompletedTodos",
  "dataExported",
  "dataImported",
  "deleteImage",
  "deleteQuick",
  "deleteTodo",
  "deleteSpace",
  "clearCompleted",
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
  "confirmDeleteTodoList",
  "confirmUnstarTodo",
  "confirmUnstarTodoDeadline",
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
      if (key === "about") {
        expect(MESSAGE_CATALOG.about.variants).toEqual([
          [
            "To Do List 看板",
            "一个本地优先的轻量工作台，用来整理截图、便签、提醒事项、快捷链接和工作空间。",
          ].join("\n"),
        ]);
        continue;
      }
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
      if (key === "about") continue;
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
    expect(summary).not.toContain("dialog");
    expect(summary).not.toContain("naive-message");
  });

  it("does not keep undo keys or undo wording in delete and clear flows", () => {
    expect(Object.keys(MESSAGE_CATALOG).some((key) => key.startsWith("undo"))).toBe(false);
    for (const key of ["confirmDeleteImage", "confirmDeleteQuick", "confirmDeleteTodo", "confirmClearCompleted"] as const) {
      expect(MESSAGE_CATALOG[key].variants.join("\n"), key).not.toMatch(/(^|[^不])可(撤销|恢复)/);
    }
  });

  it("keeps prompt copy brief and human with kaomoji-ready wording", () => {
    for (const [key, entry] of Object.entries(MESSAGE_CATALOG)) {
      if (key === "about") continue;
      for (const variant of entry.variants) {
        const maxLength = key === "saveStatusLegend" ? 28 : key === "confirmUnstarTodoDeadline" ? 24 : 15;
        expect(variant.length, `${key}: ${variant}`).toBeLessThanOrEqual(maxLength);
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

  it("has separate cancel-star confirmation copy for todos with and without deadlines", () => {
    expect(MESSAGE_CATALOG.confirmUnstarTodo.variants).toHaveLength(10);
    expect(MESSAGE_CATALOG.confirmUnstarTodoDeadline.variants).toHaveLength(10);
    for (const variant of MESSAGE_CATALOG.confirmUnstarTodo.variants) {
      expect(variant).not.toContain("截止时间");
    }
    for (const variant of MESSAGE_CATALOG.confirmUnstarTodoDeadline.variants) {
      expect(variant).toContain("截止时间");
    }
  });

  it("includes shortcut guidance and keeps repository URLs out of shared message text", () => {
    const guideSource = Object.values(GUIDE_MESSAGES.zh).flat().join("\n");
    const appSource = readSource("src/App.vue");

    expect(guideSource).toContain("Ctrl+S");
    expect(guideSource).toContain("Tab");
    expect(guideSource).toContain("方向键");
    expect(guideSource).toContain("右键");
    expect(guideSource).toContain("试试把外部图片拖到这里");
    expect(appSource).not.toContain("GUIDE_REPEAT_CHANCE");
    expect(appSource).not.toContain("maybeShowGuideBubble");
    expect(MESSAGE_CATALOG.about.variants.join("\n")).not.toContain("https://github.com/xiangjianan/todolist");
    expect(MESSAGE_CATALOG.about.variants.join("\n")).not.toContain("下方");
    expect(MESSAGE_CATALOG.about.variants.join("\n")).not.toContain("给老婆做的 todolist 看板");
    expect(appSource).toContain("GITHUB_ISSUE_URL");
    expect(appSource).toContain("/issues/new");
    expect(appSource).not.toContain("GITHUB_REPO_NAME");
    expect(appSource).not.toContain("绿色表示已保存");
    expect(appSource).not.toContain("Green means saved");
  });

  it("provides ten guide variants for every guide bubble scenario", () => {
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
    ] as const;

    for (const key of guideKeys) {
      expect(GUIDE_MESSAGES.zh[key].length, key).toBeGreaterThanOrEqual(10);
      expect(GUIDE_MESSAGES.en[key].length, key).toBeGreaterThanOrEqual(10);
    }
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(__dirname, "../..", file), "utf8");
}
