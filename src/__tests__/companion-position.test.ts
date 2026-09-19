import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanionBubble } from "../composables/useCompanionBubble";
import type { CompanionBubbleDeps } from "../composables/useCompanionBubble";
import { getLastPointerPosition, resetLastPointerPosition } from "../utils/pointerPosition";

function createDeps(overrides: Partial<CompanionBubbleDeps> = {}): CompanionBubbleDeps {
  return {
    state: { language: "zh" } as CompanionBubbleDeps["state"],
    setActiveGuideKey: vi.fn(),
    confirmLabels: () => ({ yes: "是", no: "否" }),
    isBoardBlocked: () => false,
    isMobileLayout: () => false,
    ...overrides,
  };
}

/** 区域锚点：传入各 showBubble/requestConfirmation 调用，定位已不读取它（统一屏幕角）。 */
function createZoneAnchor(rect: Partial<DOMRect> = {}): HTMLElement {
  const anchor = document.createElement("div");
  anchor.className = "todo-section";
  const full = {
    x: 384,
    y: 0,
    width: 255,
    height: 240,
    top: 0,
    left: 384,
    right: 639,
    bottom: 240,
    toJSON: () => ({}),
    ...rect,
  };
  anchor.getBoundingClientRect = () => full as DOMRect;
  return anchor;
}

function movePointerTo(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
}

describe("companion bubble placement", () => {
  beforeEach(() => {
    resetLastPointerPosition();
  });
  afterEach(() => {
    resetLastPointerPosition();
  });

  it("places plain toasts at the screen corner and ignores the zone anchor", () => {
    const { showBubble, companionPosition } = useCompanionBubble(createDeps());
    showBubble("deleteTodo", createZoneAnchor());
    // 屏幕右下角由 CSS 默认值（.focus-companion 的 right/bottom）承接，无需内联定位。
    expect(companionPosition.value).toBeUndefined();
  });

  it("keeps guide Tips at the screen corner too, ignoring the zone anchor", () => {
    const { showBubbleText, companionPosition } = useCompanionBubble(createDeps());
    // 右键「Tips」/ GIF 点击轮换的指南气泡也统一落屏幕右下角。
    showBubbleText("区域指南", createZoneAnchor(), { guideKey: "todos" });
    expect(companionPosition.value).toBeUndefined();
  });

  it("sends declutter prompts to the screen corner even though they carry a guideKey", () => {
    const { showBubbleText, companionPosition } = useCompanionBubble(createDeps());
    showBubbleText("数量有点多，适当做减法", createZoneAnchor(), { guideKey: "todos" });
    expect(companionPosition.value).toBeUndefined();
  });

  it("places the confirm at the mouse's upper right with the GIF level with the pointer", () => {
    const { requestConfirmation, companionPosition } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    requestConfirmation("confirmDeleteTodo", createZoneAnchor(), vi.fn());
    // GIF 左缘在鼠标右侧 52px，右缘即 300+52+50=402；垂直中心对齐鼠标 y=200 → top=175，
    // 弹框经 NPopover top-end 落在 GIF 上方 → 删除按钮在鼠标上方。
    expect(companionPosition.value).toEqual({
      right: "calc(100vw - 402px)",
      bottom: "auto",
      top: "175px",
    });
  });

  it("clamps the confirm GIF inside the right viewport edge", () => {
    const { requestConfirmation, companionPosition } = useCompanionBubble(createDeps());
    // jsdom 视口宽 1024：鼠标贴近右缘时 GIF 右缘最多到 1024-8=1016。
    movePointerTo(1000, 200);
    requestConfirmation("confirmDeleteTodo", createZoneAnchor(), vi.fn());
    expect(companionPosition.value).toEqual({
      right: "calc(100vw - 1016px)",
      bottom: "auto",
      top: "175px",
    });
  });

  it("reserves popover space above the GIF when the pointer is near the top edge", () => {
    const { requestConfirmation, companionPosition } = useCompanionBubble(createDeps());
    movePointerTo(300, 0);
    requestConfirmation("confirmDeleteTodo", createZoneAnchor(), vi.fn());
    // 鼠标贴近顶部时 GIF 下压到预留线（150px），确认框保持在 GIF 上方、按钮在鼠标上方，
    // 避免 NPopover 因上方空间不足翻转到 GIF 下方。
    expect(companionPosition.value).toEqual({
      right: "calc(100vw - 402px)",
      bottom: "auto",
      top: "150px",
    });
  });

  it("falls back to the screen corner when no pointer has been recorded", () => {
    const { requestConfirmation, companionPosition } = useCompanionBubble(createDeps());
    requestConfirmation("confirmDeleteTodo", createZoneAnchor(), vi.fn());
    expect(companionPosition.value).toBeUndefined();
  });

  it("keeps the fixed mobile spot for both toasts and confirms", () => {
    const toast = useCompanionBubble(createDeps({ isMobileLayout: () => true }));
    toast.showBubble("deleteTodo", createZoneAnchor());
    expect(toast.companionPosition.value).toEqual({ right: "12px", top: "118px" });

    const confirm = useCompanionBubble(createDeps({ isMobileLayout: () => true }));
    movePointerTo(300, 200);
    confirm.requestConfirmation("confirmDeleteTodo", createZoneAnchor(), vi.fn());
    expect(confirm.companionPosition.value).toEqual({ right: "12px", top: "118px" });
  });

  it("tracks clicks and context menus as pointer positions", () => {
    useCompanionBubble(createDeps());
    window.dispatchEvent(new MouseEvent("contextmenu", { clientX: 40, clientY: 60 }));
    expect(getLastPointerPosition()).toEqual({ x: 40, y: 60 });
    window.dispatchEvent(new MouseEvent("click", { clientX: 80, clientY: 90 }));
    expect(getLastPointerPosition()).toEqual({ x: 80, y: 90 });
  });

  it("highlights the confirm target element and clears it on cancel", () => {
    const { requestConfirmation, cancelCompanionAction } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    const target = createZoneAnchor();
    requestConfirmation("confirmDeleteTodo", target, vi.fn());
    expect(target.hasAttribute("data-confirm-target")).toBe(true);
    cancelCompanionAction();
    expect(target.hasAttribute("data-confirm-target")).toBe(false);
  });

  it("clears the highlight when the confirm is accepted", async () => {
    const onConfirm = vi.fn();
    const { requestConfirmation, confirmCompanionAction } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    const target = createZoneAnchor();
    requestConfirmation("confirmDeleteTodo", target, onConfirm);
    await confirmCompanionAction();
    expect(target.hasAttribute("data-confirm-target")).toBe(false);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("moves the highlight when a new confirm targets another element", () => {
    const { requestConfirmation } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    const first = createZoneAnchor();
    const second = createZoneAnchor();
    requestConfirmation("confirmDeleteTodo", first, vi.fn());
    requestConfirmation("confirmDeleteQuick", second, vi.fn());
    expect(first.hasAttribute("data-confirm-target")).toBe(false);
    expect(second.hasAttribute("data-confirm-target")).toBe(true);
  });

  it("highlights every element of a group delete and clears them together", () => {
    const { requestConfirmation, cancelCompanionAction } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    const heading = createZoneAnchor();
    const rowA = createZoneAnchor();
    const rowB = createZoneAnchor();
    const untouched = createZoneAnchor();

    requestConfirmation("confirmDeleteQuickTagWithButtons", heading, vi.fn(), undefined, {
      highlightTarget: [heading, rowA, rowB],
    });
    expect(heading.hasAttribute("data-confirm-target")).toBe(true);
    expect(rowA.hasAttribute("data-confirm-target")).toBe(true);
    expect(rowB.hasAttribute("data-confirm-target")).toBe(true);
    expect(untouched.hasAttribute("data-confirm-target")).toBe(false);

    cancelCompanionAction();
    expect(heading.hasAttribute("data-confirm-target")).toBe(false);
    expect(rowA.hasAttribute("data-confirm-target")).toBe(false);
    expect(rowB.hasAttribute("data-confirm-target")).toBe(false);

    // 组高亮被新的单目标确认整体替换，不残留。
    requestConfirmation("confirmDeleteQuickTagWithButtons", heading, vi.fn(), undefined, {
      highlightTarget: [heading, rowA],
    });
    requestConfirmation("confirmDeleteTodo", untouched, vi.fn());
    expect(heading.hasAttribute("data-confirm-target")).toBe(false);
    expect(rowA.hasAttribute("data-confirm-target")).toBe(false);
    expect(untouched.hasAttribute("data-confirm-target")).toBe(true);
  });

  it("supports an explicit highlightTarget override and a null opt-out", () => {
    const { requestConfirmation } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    const anchor = createZoneAnchor();
    const row = createZoneAnchor();
    requestConfirmation("confirmDeleteTodo", anchor, vi.fn(), undefined, { highlightTarget: row });
    expect(anchor.hasAttribute("data-confirm-target")).toBe(false);
    expect(row.hasAttribute("data-confirm-target")).toBe(true);

    const anchor2 = createZoneAnchor();
    requestConfirmation("confirmClearData", anchor2, vi.fn(), undefined, { highlightTarget: null });
    expect(anchor2.hasAttribute("data-confirm-target")).toBe(false);
    expect(row.hasAttribute("data-confirm-target")).toBe(false);
  });

  it("clears the highlight when a toast replaces the pending confirm", () => {
    const { requestConfirmation, showBubbleText } = useCompanionBubble(createDeps());
    movePointerTo(300, 200);
    const target = createZoneAnchor();
    requestConfirmation("confirmDeleteTodo", target, vi.fn());
    showBubbleText("已移除");
    expect(target.hasAttribute("data-confirm-target")).toBe(false);
  });
});
