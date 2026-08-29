import { describe, expect, it } from "vitest";
import { advanceTipRotation, resolveTipGuideKey } from "../state/guideTips";
import { getGuideMessages } from "../state/i18n";

function panel(...classNames: string[]): HTMLElement {
  const element = document.createElement("div");
  element.className = classNames.join(" ");
  return element;
}

describe("resolveTipGuideKey", () => {
  it("uses the active guide key directly when present", () => {
    expect(resolveTipGuideKey({ guideKey: "images", anchor: panel("todo-section") })).toBe("images");
    expect(resolveTipGuideKey({ guideKey: "theme" })).toBe("theme");
  });

  it("maps anchor containers to the same guide key their right-click Tips menu uses", () => {
    expect(resolveTipGuideKey({ anchor: panel("image-panel") })).toBe("images");
    expect(resolveTipGuideKey({ anchor: panel("image-preview") })).toBe("images");
    expect(resolveTipGuideKey({ anchor: panel("todo-panel") })).toBe("todos");
    expect(resolveTipGuideKey({ anchor: panel("quick-block") })).toBe("quickButtons");
    expect(resolveTipGuideKey({ anchor: panel("space-panel") })).toBe("workspace");
  });

  it("resolves nested space text panels to workspace, not the generic text fallback", () => {
    // TextPanel 只在 SpacePanel 内部使用：先认外层容器。
    const spacePanel = panel("space-panel");
    const textPanel = panel("text-panel");
    spacePanel.appendChild(textPanel);
    expect(resolveTipGuideKey({ anchor: textPanel })).toBe("workspace");
  });

  it("falls back to the workspace guide for unknown or missing anchors", () => {
    expect(resolveTipGuideKey({})).toBe("workspace");
    expect(resolveTipGuideKey({ anchor: panel("mystery") })).toBe("workspace");
  });
});

describe("advanceTipRotation", () => {
  it("advances within the same guide key and wraps around", () => {
    expect(advanceTipRotation({ guideKey: "note", index: 0 }, "note", 3)).toEqual({ guideKey: "note", index: 1 });
    expect(advanceTipRotation({ guideKey: "note", index: 2 }, "note", 3)).toEqual({ guideKey: "note", index: 0 });
  });

  it("restarts from zero when the guide key changes or state is missing", () => {
    expect(advanceTipRotation({ guideKey: "note", index: 2 }, "todos", 3)).toEqual({ guideKey: "todos", index: 0 });
    expect(advanceTipRotation(null, "todos", 3)).toEqual({ guideKey: "todos", index: 0 });
  });

  it("returns a safe zero index for empty tip pools", () => {
    expect(advanceTipRotation({ guideKey: "note", index: 2 }, "note", 0)).toEqual({ guideKey: "note", index: 0 });
  });

  it("rotates over the same GUIDE_MESSAGES pool the right-click Tips menu shows", () => {
    // GIF 点击的 Tips 与右键菜单「Tips」共用同一份文案池。
    const workspaceMessages = getGuideMessages("zh").workspace;
    expect(workspaceMessages.length).toBeGreaterThan(1);
    const first = advanceTipRotation(null, "workspace", workspaceMessages.length);
    const second = advanceTipRotation(first, "workspace", workspaceMessages.length);
    expect(workspaceMessages[first.index]).toBeTruthy();
    expect(workspaceMessages[second.index]).toBeTruthy();
    expect(first.index).not.toBe(second.index);
  });
});
