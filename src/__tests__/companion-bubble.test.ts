import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompanionBubble from "../components/CompanionBubble.vue";

const popoverStub = {
  name: "NPopover",
  props: ["show"],
  template: '<div><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
};

const persistentPopoverStub = {
  name: "NPopover",
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div class="n-popover" :data-show="String(show)"><slot /></div></div>',
};

const fadingShellPopoverStub = {
  name: "NPopover",
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div class="n-popover" :data-show="String(show)"><slot /></div></div>',
};

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

describe("CompanionBubble", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
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
          NButton: buttonStub,
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

  it("fades the popover out before removing cleared message content", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "提示内容",
      },
      global: {
        stubs: {
          NButton: buttonStub,
          NPopover: persistentPopoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".n-popover")).not.toBeNull();

    await wrapper.setProps({ message: "" });
    await wrapper.vm.$nextTick();

    const fadingBubble = document.body.querySelector('[data-testid="companion-confirm"]');
    expect(document.body.querySelector(".companion-popover-shell")?.classList.contains("is-popover-fading")).toBe(true);
    expect(fadingBubble?.classList.contains("is-popover-fading")).toBe(false);
    expect(fadingBubble?.textContent).toContain("提示内容");

    await vi.advanceTimersByTimeAsync(260);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("keeps the previous bubble content during the hide animation", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "保存好了",
      },
      global: {
        stubs: {
          NButton: buttonStub,
          NPopover: persistentPopoverStub,
          Popover: persistentPopoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".n-popover").text()).toContain("保存好了");

    await wrapper.setProps({ message: "" });

    expect(wrapper.find(".n-popover").text()).toContain("保存好了");
    expect(document.body.querySelector(".companion-popover-shell")?.classList.contains("is-popover-fading")).toBe(true);
    expect(wrapper.get('[data-testid="companion-confirm"]').classes()).not.toContain("is-popover-fading");

    await vi.advanceTimersByTimeAsync(260);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".n-popover").text()).toBe("");

    wrapper.unmount();
  });

  it("fades the popover shell instead of fading only the text content", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "关于信息",
      },
      global: {
        stubs: {
          NButton: buttonStub,
          NPopover: fadingShellPopoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    await wrapper.setProps({ message: "" });
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector(".companion-popover-shell")?.classList.contains("is-popover-fading")).toBe(true);
    expect(document.body.querySelector('[data-testid="companion-confirm"]')?.classList.contains("is-popover-fading")).toBe(false);
    expect(document.body.querySelector('[data-testid="companion-confirm"]')?.textContent).toContain("关于信息");

    wrapper.unmount();
  });

  it("removes the companion surface immediately when hidden", async () => {
    const wrapper = mount(CompanionBubble, {
      props: {
        visible: true,
        message: "",
      },
      global: {
        stubs: {
          NPopover: popoverStub,
        },
      },
    });

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

    await wrapper.setProps({ visible: false });

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("uses bordered action buttons for confirmation bubbles", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "确认删除吗",
        confirm: true,
      },
      global: {
        stubs: {
          NButton: buttonStub,
          NPopover: popoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="companion-yes"]')?.classList.contains("companion-action-button")).toBe(true);
    expect(document.body.querySelector('[data-testid="companion-no"]')?.classList.contains("companion-action-button")).toBe(true);

    wrapper.unmount();
  });

  it("uses semantic labels for confirmation bubbles", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "确认删除图片",
        confirm: true,
        confirmText: "删除",
        cancelText: "取消",
      },
      global: {
        stubs: {
          NButton: buttonStub,
          NPopover: popoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="companion-yes"]')?.textContent).toBe("删除");
    expect(document.body.querySelector('[data-testid="companion-no"]')?.textContent).toBe("取消");

    wrapper.unmount();
  });

  it("does not render a single undo action button", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "提醒已删除",
        actionText: "撤销",
      },
      global: {
        stubs: {
          NButton: buttonStub,
          NPopover: popoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="companion-action"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="companion-yes"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="companion-no"]')).toBeNull();

    wrapper.unmount();
  });

  it("fades the GIF surface out after ten seconds before removing it", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      props: {
        visible: true,
        message: "持续提示",
      },
      global: {
        stubs: {
          NPopover: popoverStub,
        },
      },
    });

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(9999);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).toContain("is-fading");

    await vi.advanceTimersByTimeAsync(260);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("switches the companion GIF for dark theme", async () => {
    const wrapper = mount(CompanionBubble, {
      props: {
        visible: true,
        message: "",
        theme: "light",
      },
      global: {
        stubs: {
          NPopover: popoverStub,
        },
      },
    });

    expect(wrapper.get("img").attributes("src")).toBe("/static/video/hermes.gif");

    await wrapper.setProps({ theme: "dark" });

    expect(wrapper.get("img").attributes("src")).toBe("/static/video/hermes-dark.gif");

    wrapper.unmount();
  });
});
