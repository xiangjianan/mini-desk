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
});
