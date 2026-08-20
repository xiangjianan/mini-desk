import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeWorkspaceData } from "../state/storage/normalize";

const THEMES_DIR = join(__dirname, "../../samples/themes");

/**
 * Same drift guard as import-samples.test.ts, scoped to the themed demo
 * workspaces in samples/themes/ (used for customer demos and promo material).
 * Content is validated structurally so the suite never rots; the demo reminder
 * dates themselves start in 2026-08 and reach into 2027.
 */
describe("themed sample import files", () => {
  const files = readdirSync(THEMES_DIR).filter((name) => name.endsWith(".json"));

  it("ships the four themed demo workspaces", () => {
    expect(files.sort()).toEqual(["健身训练.json", "家庭理财.json", "旅行规划.json", "自媒体创作.json"]);
  });

  for (const file of files) {
    it(`imports ${file} cleanly`, () => {
      const payload = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf-8"));
      // Mirrors importData's guards: isImportPayload + isSingleWorkspaceExport.
      expect(payload).toBeTypeOf("object");
      expect(payload.miniDeskWorkspaceExport).toBe(true);

      const workspace = normalizeWorkspaceData(payload.workspace, "zh");

      // Board title survives (drives the same-name conflict check).
      expect(workspace.customTitles["board-title"]?.trim()).toBeTruthy();

      // Sticky-note spaces: every space keeps lines, activeSpaceId resolves.
      expect(workspace.spaces.length).toBeGreaterThanOrEqual(2);
      workspace.spaces.forEach((space) => expect(space.lines.length).toBeGreaterThan(0));
      expect(workspace.spaces.some((space) => space.id === workspace.activeSpaceId)).toBe(true);

      // Quick actions: tags referenced by buttons all exist; demo mix of types present.
      const tagIds = new Set(workspace.quickTags.map((tag) => tag.id));
      workspace.quickButtons.forEach((button) => {
        if (button.tagId) expect(tagIds.has(button.tagId)).toBe(true);
      });
      expect(workspace.quickButtons.length).toBeGreaterThanOrEqual(5);
      expect(new Set(workspace.quickButtons.map((button) => button.type)).size).toBeGreaterThanOrEqual(2);

      // Reminder lists: titles survive and todos land under the right list ids.
      expect(workspace.todoLists.length).toBeGreaterThanOrEqual(2);
      workspace.todoLists.forEach((list) => {
        expect(list.title.trim()).toBeTruthy();
        expect(Array.isArray(workspace.todos[list.id])).toBe(true);
      });

      // Reminder times survive as valid notifyAt values, alongside done/starred demos.
      const allTodos = workspace.todoLists.flatMap((list) => workspace.todos[list.id]);
      expect(allTodos.filter((todo) => typeof todo.notifyAt === "number").length).toBeGreaterThanOrEqual(3);
      expect(allTodos.some((todo) => todo.done)).toBe(true);
      expect(allTodos.some((todo) => todo.starred)).toBe(true);
    });
  }
});
