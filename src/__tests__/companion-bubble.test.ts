import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompanionBubble from "../components/CompanionBubble.vue";

const popoverStub = {
  name: "NPopover",
  props: ["show"],
  template: '<div><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
};

describe("CompanionBubble", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the GIF immediately and delays the message bubble by 200ms", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "提示内容",
      },
      global: {
        stubs: {
          NPopover: popoverStub,
        },
      },
    });

    expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
    expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(199);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[data-testid="companion-confirm"]')?.textContent).toContain("提示内容");

    wrapper.unmount();
  });
});
