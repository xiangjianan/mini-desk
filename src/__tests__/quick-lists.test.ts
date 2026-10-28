import { describe, expect, it } from "vitest";
import { normalizeQuickLists } from "../state/quickLists";
import { normalizeWorkspaceData, getSerializableWorkspace } from "../state/storage";
import { nextQuickColor } from "../state/quickColors";
import { defaultWorkspace } from "../state/defaults";

const loose = { id: "a", title: "动作", value: "v", type: "text" as const, hidden: false, clicks: 3 };

describe("quick action lists", () => {
  it.each(["zh", "en"] as const)("creates an ordinary persisted default list for an empty workspace (%s)", language => {
    const workspace = normalizeWorkspaceData({}, language);
    expect(workspace.quickTags).toEqual([{ id: "quick-general", title: language === "zh" ? "常用" : "General", collapsed: false, column: 0 }]);
    expect(workspace.quickButtons).toEqual([]);
    const restored = normalizeWorkspaceData(getSerializableWorkspace(workspace), language);
    expect(restored.quickTags).toHaveLength(1);
    expect(restored.quickTags[0]).toMatchObject({ id: workspace.quickTags[0].id, title: workspace.quickTags[0].title });
    expect(Boolean(restored.quickTags[0].collapsed)).toBe(false);
  });

  it("preserves valid list colors while ignoring legacy and invalid values", () => {
    const workspace = normalizeWorkspaceData({ quickTags: [{ id: "a", title: "A", backgroundColor: "#80AED5" }, { id: "b", title: "B", color: "red", backgroundColor: "url(x)" }], quickButtons: [] });
    expect(workspace.quickTags[0].backgroundColor).toBe("#80aed5");
    expect(workspace.quickTags[1].backgroundColor).toBeUndefined();
    expect(normalizeWorkspaceData(getSerializableWorkspace(workspace)).quickTags).toEqual(workspace.quickTags);
    expect(nextQuickColor([{ id: "a", title: "A", backgroundColor: "#e88d82" }])).toBe("#e8b65f");
  });

  it("migrates untagged and dangling actions without losing content or collapsed state", () => {
    const workspace = normalizeWorkspaceData({ quickTags: [{ id: "work", title: "工作" }], quickButtons: [loose, { ...loose, id: "b", tagId: "missing" }], quickOtherCollapsed: true });
    expect(workspace.quickTags).toHaveLength(2);
    const general = workspace.quickTags[1];
    expect(general).toMatchObject({ title: "常用", collapsed: true });
    expect(workspace.quickButtons).toEqual([{ ...loose, tagId: general.id }, { ...loose, id: "b", tagId: general.id }]);
    expect(normalizeWorkspaceData(getSerializableWorkspace(workspace)).quickTags).toEqual(workspace.quickTags);
  });

  it("reuses an existing General list and does not recreate it after removal", () => {
    const general = { id: "existing", title: "常用" };
    expect(normalizeQuickLists([general], [loose], "zh").quickButtons[0].tagId).toBe("existing");
    const work = { id: "work", title: "工作" };
    expect(normalizeQuickLists([work], [], "zh").quickTags).toEqual([work]);
    expect(normalizeWorkspaceData({ ...defaultWorkspace(), quickTags: [work], quickButtons: [] }).quickTags).toEqual([{ ...work, column: 0 }]);
  });
});
