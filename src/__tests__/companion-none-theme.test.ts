import { describe, expect, it, vi } from "vitest";
import { useCompanionBubble } from "../composables/useCompanionBubble";
import type { CompanionBubbleDeps } from "../composables/useCompanionBubble";

function createDeps(companionGifTheme: "none" | "cat"): CompanionBubbleDeps {
  return {
    state: { language: "zh", companionGifTheme } as CompanionBubbleDeps["state"],
    setActiveGuideKey: vi.fn(),
    confirmLabels: () => ({ yes: "是", no: "否" }),
    isBoardBlocked: () => false,
    isMobileLayout: () => false,
  };
}

describe("companion none theme gating", () => {
  it("none 主题时普通气泡不显示", () => {
    const { showBubbleText, bubbleVisible, bubbleMessage, companionFocused } = useCompanionBubble(createDeps("none"));
    showBubbleText("已保存", undefined);
    expect(bubbleVisible.value).toBe(false);
    expect(bubbleMessage.value).toBe("");
    expect(companionFocused.value).toBe(false);
  });

  it("none 主题时二次确认弹框照常弹出", () => {
    const { requestConfirmation, bubbleVisible, pendingConfirm } = useCompanionBubble(createDeps("none"));
    requestConfirmation("confirmDeleteTodo", undefined, vi.fn());
    expect(pendingConfirm.value).not.toBeNull();
    expect(bubbleVisible.value).toBe(true);
  });

  it("none 主题时 force 气泡仍显示（手机发送反馈）", () => {
    const { showBubbleText, bubbleVisible, bubbleMessage } = useCompanionBubble(createDeps("none"));
    showBubbleText("已发送 1 条", undefined, { force: true });
    expect(bubbleVisible.value).toBe(true);
    expect(bubbleMessage.value).toBe("已发送 1 条");
  });

  it("非 none 主题普通气泡不受影响（回归）", () => {
    const { showBubbleText, bubbleVisible, bubbleMessage } = useCompanionBubble(createDeps("cat"));
    showBubbleText("已保存", undefined);
    expect(bubbleVisible.value).toBe(true);
    expect(bubbleMessage.value).toBe("已保存");
  });
});
