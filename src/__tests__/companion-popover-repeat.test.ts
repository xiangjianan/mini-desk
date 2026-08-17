import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompanionBubble from "../components/CompanionBubble.vue";

// NOTE: deliberately NOT stubbing naive-ui here — real NPopover state machine.
function mountBubble() {
  return mount(CompanionBubble, {
    attachTo: document.body,
    props: { visible: false, message: "" },
  });
}

async function requestConfirm(wrapper: ReturnType<typeof mountBubble>, message: string, position?: { right: string; bottom: string }) {
  await wrapper.setProps({
    visible: true,
    message,
    confirm: true,
    confirmText: "删除",
    cancelText: "取消",
    ...(position ? { position } : {}),
  });
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

function popoverText(): string {
  const el = document.body.querySelector('[data-testid="companion-confirm"]');
  return el?.textContent ?? "";
}

describe("repeat companion bubbles with the REAL naive-ui popover", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("same position (no key change): second confirm shows after full fade", async () => {
    vi.useFakeTimers();
    const wrapper = mountBubble();
    const pos = { right: "100px", bottom: "200px" };

    await requestConfirm(wrapper, "确认删除这条提醒？", pos);
    await advance(400);
    expect(popoverText()).toContain("确认删除这条提醒");

    // confirm -> "已删除" bubble (same position => same popover key)
    await wrapper.setProps({ message: "已删除", confirm: false, confirmText: undefined, cancelText: undefined });
    await advance(3000);
    await wrapper.setProps({ message: "" });
    await advance(2000);
    await wrapper.setProps({ visible: false });
    expect(popoverText()).not.toContain("已删除");

    // second request, identical position
    await requestConfirm(wrapper, "要删掉这条提醒吗？", pos);
    await advance(400);
    expect(popoverText(), "second confirm bubble should render").toContain("要删掉这条提醒吗");

    wrapper.unmount();
  });

  it("changed position (key remount): second confirm shows after full fade", async () => {
    vi.useFakeTimers();
    const wrapper = mountBubble();

    await requestConfirm(wrapper, "确认删除这条提醒？", { right: "100px", bottom: "200px" });
    await advance(400);
    expect(popoverText()).toContain("确认删除这条提醒");

    await wrapper.setProps({ message: "已删除", confirm: false, confirmText: undefined, cancelText: undefined, position: { right: "100px", bottom: "180px" } });
    await advance(3000);
    await wrapper.setProps({ message: "" });
    await advance(2000);
    await wrapper.setProps({ visible: false });

    await requestConfirm(wrapper, "要删掉这条提醒吗？", { right: "100px", bottom: "160px" });
    await advance(400);
    expect(popoverText(), "second confirm bubble should render after remount").toContain("要删掉这条提醒吗");

    wrapper.unmount();
  });

  it("changed position (key remount): second confirm shows while '已删除' visible", async () => {
    vi.useFakeTimers();
    const wrapper = mountBubble();

    await requestConfirm(wrapper, "确认删除这条提醒？", { right: "100px", bottom: "200px" });
    await advance(400);

    await wrapper.setProps({ message: "已删除", confirm: false, confirmText: undefined, cancelText: undefined, position: { right: "100px", bottom: "180px" } });
    await advance(1500);

    await requestConfirm(wrapper, "要删掉这条提醒吗？", { right: "100px", bottom: "160px" });
    await advance(400);
    expect(popoverText(), "confirm should replace the deleted-toast").toContain("要删掉这条提醒吗");

    wrapper.unmount();
  });

  // Regression (2026-08): with >=7 visible todos, focusing a todo input (a
  // right-click focuses it in Chromium) fires showCompanion →
  // hideBubbleMessage({clearRetainedContent:true}) → clearSignal++, then the
  // declutter tip re-shows in the SAME tick — `visible` never drops, so
  // popoverVisible never makes an F→T transition and the clearSignal watch is
  // the only thing that ran, leaving delayedPopoverVisible=false forever. The
  // next requestConfirmation then renders an INVISIBLE confirm (zombie:
  // pendingConfirm set, Enter still confirms).
  it("clearSignal during a live bubble must not silence the next confirm (declutter-on-focus race)", async () => {
    vi.useFakeTimers();
    const wrapper = mountBubble();
    const pos = { right: "100px", bottom: "200px" };

    // A live toast ("已删除") is up; companionFocused keeps `visible` bridged.
    await wrapper.setProps({ visible: true, message: "这条待办已删", position: pos });
    await advance(400); // delayedPopoverVisible = true

    // Right-click focus: clearSignal bumps and the declutter tip replaces the
    // toast within one flush — no visible F→T transition ever happens.
    await wrapper.setProps({ clearSignal: 1, message: "少一点负担，多一点余量" });
    await advance(300);

    // User picks 删除 in the context menu → requestConfirmation.
    await requestConfirm(wrapper, "删除这条提醒？", pos);
    await advance(400);

    expect(popoverText(), "confirm must not be silenced by the clearSignal race").toContain("删除这条提醒");
    expect(document.body.querySelector('[data-testid="companion-yes"]'), "confirm buttons must be reachable").not.toBeNull();

    // Confirming must not strand the follow-up toast either: the answer hides
    // and re-shows within one flush (still no F→T transition), so the "已删除"
    // message arriving in the same bridged state must also become visible.
    await wrapper.setProps({ message: "这条待办已删", confirm: false, confirmText: undefined, cancelText: undefined });
    await advance(400);
    expect(popoverText(), "follow-up toast must not be silenced either").toContain("这条待办已删");

    wrapper.unmount();
  });
});
