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

  it("renders an optional companion link as a clickable external link", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "项目信息",
        linkText: "xiangjianan / todolist",
        linkHref: "https://github.com/xiangjianan/todolist",
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

    const link = document.body.querySelector<HTMLAnchorElement>('[data-testid="companion-link"]');
    expect(link?.textContent?.trim()).toBe("xiangjianan / todolist");
    expect(link?.querySelector(".companion-link-icon")).not.toBeNull();
    expect(link?.href).toBe("https://github.com/xiangjianan/todolist");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");

    wrapper.unmount();
  });

  it("emits pause and resume when the pointer enters and leaves the message bubble", async () => {
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

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    document.body.querySelector('[data-testid="companion-confirm"]')?.dispatchEvent(new MouseEvent("mouseenter"));
    document.body.querySelector('[data-testid="companion-confirm"]')?.dispatchEvent(new MouseEvent("mouseleave"));

    expect(wrapper.emitted("pause")).toHaveLength(1);
    expect(wrapper.emitted("resume")).toHaveLength(1);

    wrapper.unmount();
  });

  it("emits pause and resume when the pointer enters and leaves the GIF surface", async () => {
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

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="companion-bubble"]').trigger("mouseenter");
    await wrapper.get('[data-testid="companion-bubble"]').trigger("mouseleave");

    expect(wrapper.emitted("pause")).toHaveLength(1);
    expect(wrapper.emitted("resume")).toHaveLength(1);

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

  it("keeps the GIF surface visible while the pointer is hovering past ten seconds", async () => {
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

    await wrapper.get('[data-testid="companion-bubble"]').trigger("mouseenter");
    await vi.advanceTimersByTimeAsync(12000);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).toContain("is-visible");
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).not.toContain("is-fading");

    await wrapper.get('[data-testid="companion-bubble"]').trigger("mouseleave");
    await vi.advanceTimersByTimeAsync(9999);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).not.toContain("is-fading");

    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).toContain("is-fading");

    wrapper.unmount();
  });

  it("keeps the GIF surface visible when hover is reported by mouse movement", async () => {
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

    await wrapper.get('[data-testid="companion-bubble"]').trigger("mousemove");
    await vi.advanceTimersByTimeAsync(12000);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).toContain("is-visible");
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).not.toContain("is-fading");

    wrapper.unmount();
  });

  it("resumes the GIF timer when the mouse moves outside without a leave event", async () => {
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
    const surface = wrapper.get('[data-testid="companion-bubble"]').element as HTMLElement;
    surface.getBoundingClientRect = vi.fn(() => ({
      x: 100,
      y: 100,
      width: 82,
      height: 82,
      top: 100,
      right: 182,
      bottom: 182,
      left: 100,
      toJSON: () => ({}),
    }));

    await wrapper.get('[data-testid="companion-bubble"]').trigger("mousemove", { clientX: 120, clientY: 120 });
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, clientY: 20 }));

    await vi.advanceTimersByTimeAsync(9999);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).not.toContain("is-fading");

    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="companion-bubble"]').classes()).toContain("is-fading");

    wrapper.unmount();
  });

  it("switches the companion GIF for dark theme", async () => {
    const wrapper = mount(CompanionBubble, {
      props: {
        visible: true,
        message: "",
        theme: "light",
        gifTheme: "hermes",
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

  it("renders bubble content without an image when GIF theme is none", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      props: {
        visible: true,
        message: "只显示气泡",
        gifTheme: "none",
      },
      global: {
        stubs: {
          NPopover: popoverStub,
        },
      },
    });

    expect(wrapper.find("img").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(200);

    expect(document.body.querySelector('[data-testid="companion-confirm"]')?.textContent).toContain("只显示气泡");
    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("keeps gif-free bubble content during the hide animation", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CompanionBubble, {
      attachTo: document.body,
      props: {
        visible: true,
        message: "只显示气泡",
        gifTheme: "none",
      },
      global: {
        stubs: {
          NPopover: persistentPopoverStub,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
    expect(document.body.querySelector('[data-testid="companion-confirm"]')?.textContent).toContain("只显示气泡");

    await wrapper.setProps({ message: "" });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
    expect(document.body.querySelector(".companion-popover-shell")?.classList.contains("is-popover-fading")).toBe(true);
    expect(document.body.querySelector('[data-testid="companion-confirm"]')?.textContent).toContain("只显示气泡");

    await vi.advanceTimersByTimeAsync(260);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("renders no companion surface for GIF-only visibility when GIF theme is none", () => {
    const wrapper = mount(CompanionBubble, {
      props: {
        visible: true,
        message: "",
        gifTheme: "none",
      },
      global: {
        stubs: {
          NPopover: popoverStub,
        },
      },
    });

    expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

    wrapper.unmount();
  });
});
