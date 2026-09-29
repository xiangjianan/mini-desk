import { describe, expect, it } from "vitest";
import { pickRandomTip, resolveTipGuideKey } from "../state/guideTips";
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

describe("pickRandomTip", () => {
  it("returns a safe zero index for empty or single-entry tip pools", () => {
    expect(pickRandomTip({ guideKey: "note", index: 2 }, "note", 0)).toEqual({ guideKey: "note", index: 0 });
    expect(pickRandomTip({ guideKey: "note", index: 0 }, "note", 1)).toEqual({ guideKey: "note", index: 0 });
  });

  it("picks uniformly from the whole pool when the guide key changes or state is missing", () => {
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy.mockReturnValue(0);
    expect(pickRandomTip({ guideKey: "note", index: 4 }, "todos", 5)).toEqual({ guideKey: "todos", index: 0 });
    randomSpy.mockReturnValue(0.999);
    expect(pickRandomTip(null, "todos", 5)).toEqual({ guideKey: "todos", index: 4 });
    randomSpy.mockRestore();
  });

  it("never repeats the previous tip of the same area regardless of the random draw", () => {
    const randomSpy = vi.spyOn(Math, "random");
    for (let previous = 0; previous < 5; previous++) {
      for (let draw = 0; draw < 10; draw++) {
        randomSpy.mockReturnValue(draw / 10);
        const next = pickRandomTip({ guideKey: "note", index: previous }, "note", 5);
        expect(next.index).toBeGreaterThanOrEqual(0);
        expect(next.index).toBeLessThan(5);
        expect(next.index).not.toBe(previous);
      }
    }
    randomSpy.mockRestore();
  });

  it("every pool index is reachable across random draws", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const seen = new Set<number>();
    for (let draw = 0; draw < 50; draw++) {
      randomSpy.mockReturnValue(draw / 50);
      seen.add(pickRandomTip(null, "note", 7).index);
    }
    randomSpy.mockRestore();
    expect(seen.size).toBe(7);
  });

  it("picks over the same GUIDE_MESSAGES pool the right-click Tips menu shows", () => {
    // GIF 点击的 Tips 与右键菜单「Tips」共用同一份文案池（各自随机抽取）。
    const workspaceMessages = getGuideMessages("zh").workspace;
    expect(workspaceMessages.length).toBeGreaterThan(1);
    const first = pickRandomTip(null, "workspace", workspaceMessages.length);
    const second = pickRandomTip(first, "workspace", workspaceMessages.length);
    expect(workspaceMessages[first.index]).toBeTruthy();
    expect(workspaceMessages[second.index]).toBeTruthy();
    expect(first.index).not.toBe(second.index);
  });
});
