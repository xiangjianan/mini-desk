import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";
import ImagePanel from "../components/ImagePanel.vue";
import ImagePreview from "../components/ImagePreview.vue";
import QuickButtons from "../components/QuickButtons.vue";
import SettingsMenu from "../components/SettingsMenu.vue";
import SpacePanel from "../components/SpacePanel.vue";
import TodoPanel from "../components/TodoPanel.vue";
import { STORAGE_KEY } from "../state/defaults";

vi.mock("naive-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("naive-ui")>();
  return {
    ...actual,
    NDropdown: {
      name: "NDropdown",
      template: "<div><slot /></div>",
    },
    NPopover: {
      name: "NPopover",
      props: ["show"],
      template: "<div><slot name=\"trigger\" /><div v-if=\"show\" class=\"n-popover\"><slot /></div></div>",
    },
    NTooltip: {
      name: "NTooltip",
      template: "<span><slot name=\"trigger\" /><slot /></span>",
    },
    NModal: {
      name: "NModal",
      props: ["show", "title"],
      template: "<section v-if=\"show\" class=\"n-modal\"><h2>{{ title }}</h2><slot /></section>",
    },
  };
});

const dropdownStub = {
  template: "<div><slot /></div>",
};

const popoverStub = {
  props: ["show"],
  template: '<div><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
};

const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
};

const modalStub = {
  props: ["show", "title"],
  template: '<section v-if="show" class="n-modal"><h2>{{ title }}</h2><slot /></section>',
};

function mountApp() {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        NDropdown: dropdownStub,
        NPopover: popoverStub,
        NTooltip: tooltipStub,
        NModal: modalStub,
      },
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the preserved board regions and primary controls", async () => {
    const wrapper = mountApp();

    expect(wrapper.find('[aria-label="To Do List 看板"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("截图");
    expect(wrapper.text()).toContain("便签");
    expect(wrapper.text()).toContain("快捷链接");
    expect(wrapper.text()).toContain("早上");
    expect(wrapper.text()).toContain("中午");
    expect(wrapper.text()).toContain("晚上");
    expect(wrapper.text()).toContain("工作空间");
    expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["工作空间"]);
    expect(wrapper.find('[aria-label="切换主题"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="新增快捷链接"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="设置"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("renders a mobile drawer menu with todos selected by default", async () => {
    const wrapper = mountApp();

    expect(wrapper.get(".mobile-drawer-trigger").text()).toContain("待办");
    expect(wrapper.find(".mobile-drawer-menu").exists()).toBe(false);
    expect(wrapper.get('[aria-label="To Do List 看板"]').attributes("data-mobile-active")).toBe("todos");

    await wrapper.get(".mobile-drawer-trigger").trigger("click");

    expect(wrapper.findAll(".mobile-menu-option").map((button) => button.text())).toEqual([
      "图片",
      "便签",
      "快捷",
      "待办",
      "空间",
    ]);

    await wrapper.findAll(".mobile-menu-option").find((button) => button.text() === "空间")?.trigger("click");

    expect(wrapper.get('[aria-label="To Do List 看板"]').attributes("data-mobile-active")).toBe("spaces");
    expect(wrapper.get(".mobile-drawer-trigger").text()).toContain("空间");
    expect(wrapper.find(".mobile-drawer-menu").exists()).toBe(false);

    wrapper.unmount();
  });

  it("creates a todo from an empty section click", async () => {
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("keeps at most one blank todo when blank list space is clicked repeatedly", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "done-1", text: "已完成事项", done: true }],
        },
      }),
    );
    const wrapper = mountApp();
    const list = wrapper.get('[data-testid="todo-list-morning"]');

    await list.trigger("click");
    await wrapper.vm.$nextTick();
    await list.trigger("click");
    await wrapper.vm.$nextTick();
    await list.trigger("click");
    await wrapper.vm.$nextTick();

    const blankInputs = wrapper
      .findAll('[data-testid="todo-input-morning"]')
      .filter((input) => (input.element as HTMLInputElement).value === "");
    expect(blankInputs).toHaveLength(1);

    wrapper.unmount();
  });

  it("keeps a single blank todo across all reminder sections", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "done-1", text: "早上完成项", done: true }],
          noon: [{ id: "done-2", text: "中午完成项", done: true }],
          evening: [{ id: "done-3", text: "晚上完成项", done: true }],
        },
      }),
    );
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="todo-list-noon"]').trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="todo-list-evening"]').trigger("click");
    await wrapper.vm.$nextTick();

    const blankInputs = wrapper
      .findAll("input.todo-input")
      .filter((input) => (input.element as HTMLInputElement).value === "");
    expect(blankInputs).toHaveLength(1);

    wrapper.unmount();
  });

  it("shows the GIF companion on editor focus and the save bubble on Ctrl+S", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await wrapper.get("textarea").trigger("focus");

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
        }),
      );
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".n-popover").exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".n-popover").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/保存|收好|记下|归档|备份|存好|存档|更新|继续/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows dirty and saved status around text edits", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').text()).toBe("已保存");

      const textarea = wrapper.get("textarea");
      await textarea.trigger("dblclick");
      await textarea.setValue("临时记录");

      expect(wrapper.get('[data-testid="save-status"]').text()).toBe("有未保存内容");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="save-status"]').text()).toBe("保存中");

      await vi.advanceTimersByTimeAsync(120);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="save-status"]').text()).toBe("已保存");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps mobile save feedback near the upper right without hiding the companion", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 900px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const wrapper = mountApp();

    try {
      const workspace = wrapper.findAll(".text-panel")[1];
      await workspace.get("textarea").trigger("focus");

      const companion = wrapper.get('[data-testid="companion-bubble"]');
      expect(companion.attributes("style")).toContain("top: 118px");
      expect(companion.attributes("style")).toContain("right: 12px");
      expect(companion.find("img").exists()).toBe(true);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.get('[data-testid="companion-bubble"]').attributes("style")).toContain("top: 118px");
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not show the companion GIF after toggling the theme", async () => {
    const wrapper = mountApp();

    await wrapper.get("textarea").trigger("focus");
    expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

    await wrapper.get('[aria-label="切换主题"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    wrapper.unmount();
  });

  it("confirms clearing completed todos with the companion bubble", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "done-1", text: "已完成事项", done: true }],
        },
      }),
    );
    const confirmSpy = vi.spyOn(window, "confirm");
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit(
        "clearCompleted",
        "morning",
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-yes"]').text()).toBe("清理");
      expect(wrapper.find('[data-testid="companion-no"]').text()).toBe("取消");
      expect(wrapper.getComponent(TodoPanel).props("todos").morning).toEqual([
        expect.objectContaining({ id: "done-1", done: true }),
      ]);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/已清理完成项/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
      expect(wrapper.getComponent(TodoPanel).props("todos").morning).toEqual([]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms todo deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "待删除提醒", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const todoSection = wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("remove", "morning", "todo-1", todoSection);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll("input.todo-input").some((input) => (input.element as HTMLInputElement).value === "待删除提醒")).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/提醒已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms image deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      imagePanel.vm.$emit("delete", "img-1", imagePanel.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(0);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors image deletion undo feedback to the screenshot list after deleting from preview", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      vi.spyOn(imagePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      imagePanel.vm.$emit("preview", "img-1");
      await wrapper.vm.$nextTick();

      const preview = wrapper.get(".image-preview");
      vi.spyOn(preview.element, "getBoundingClientRect").mockReturnValue({
        x: 128,
        y: 0,
        width: 896,
        height: 720,
        top: 0,
        left: 128,
        right: 1024,
        bottom: 720,
        toJSON: () => ({}),
      });
      wrapper.getComponent(ImagePreview).vm.$emit("delete", "img-1", preview.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 128px");
      expect(style).not.toContain("100vw - 1024px");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms quick button deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [{ id: "quick-1", title: "片段", value: "复制内容", type: "text" }],
      }),
    );
    const wrapper = mountApp();

    try {
      const quickButtons = wrapper.getComponent(QuickButtons);
      quickButtons.vm.$emit("delete", "quick-1", quickButtons.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect((wrapper.getComponent(QuickButtons).props("buttons") as Array<{ id: string }>)).toHaveLength(0);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/快捷按钮已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms workspace deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        spaces: [
          { id: "workspace", title: "工作空间", lines: [] },
          { id: "project", title: "项目", lines: [{ text: "项目资料", indent: 0 }] },
        ],
        activeSpaceId: "project",
      }),
    );
    const wrapper = mountApp();

    try {
      const spacePanel = wrapper.getComponent(SpacePanel);
      vi.spyOn(spacePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 720,
        y: 0,
        width: 360,
        height: 720,
        top: 0,
        left: 720,
        right: 1080,
        bottom: 720,
        toJSON: () => ({}),
      });

      spacePanel.vm.$emit("delete", "project");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除空间");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["工作空间"]);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/空间已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when clearing an empty completed todo list", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit(
        "clearCompleted",
        "morning",
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/没有|暂无|不用清理|无需清理|为空/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("opens link quick buttons and copies text quick buttons through the companion bubble", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "link-1", title: "站点", value: "example.com", type: "link" },
          { id: "text-1", title: "片段", value: "复制内容", type: "text" },
        ],
      }),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();
    try {
      const buttons = wrapper.findAll(".quick-button");

      await buttons[0].trigger("click");

      expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");

      await buttons[1].trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("复制内容");
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/文本|文字|复制|剪贴板|粘贴/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("hides the quick-copy GIF together with the companion bubble timeout", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "text-1", title: "片段", value: "复制内容", type: "text" },
        ],
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(3000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("switches image preview with vertical and horizontal arrow keys", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
        ],
      }),
    );
    const wrapper = mountApp();

    await wrapper.get(".image-card").trigger("click");
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("2");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("2");

    wrapper.unmount();
  });

  it("reorders images from the image panel drag reorder event", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
      }),
    );
    const wrapper = mountApp();
    const imagePanel = wrapper.getComponent(ImagePanel);

    imagePanel.vm.$emit("reorder", "img-2", "img-1");
    await wrapper.vm.$nextTick();

    expect(imagePanel.props("images").map((image: { id: string }) => image.id)).toEqual(["img-2", "img-1", "img-3"]);

    imagePanel.vm.$emit("reorder", "img-2", "img-3");
    await wrapper.vm.$nextTick();

    expect(imagePanel.props("images").map((image: { id: string }) => image.id)).toEqual(["img-1", "img-3", "img-2"]);

    wrapper.unmount();
  });

  it("hides the current companion GIF when opening image preview", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get("textarea").trigger("focus");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await wrapper.get(".image-card").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".image-preview").exists()).toBe(true);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows image copy success through the companion bubble", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "data:image/png;base64,iVBORw0KGgo=",
            createdAt: 1,
          },
        ],
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("data:image/png;base64,iVBORw0KGgo=");
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片|剪贴板|粘贴|Data URL|复制/);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows missing clipboard images and added images through the companion bubble", async () => {
    vi.useFakeTimers();
    const imageBlob = new Blob(["img"], { type: "image/png" });
    const getType = vi.fn().mockResolvedValue(imageBlob);
    Object.assign(navigator, {
      clipboard: {
        read: vi
          .fn()
          .mockResolvedValueOnce([{ types: ["text/plain"], getType: vi.fn() }])
          .mockResolvedValueOnce([{ types: ["image/png"], getType }]),
      },
    });
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);

      imagePanel.vm.$emit("paste");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/没有|图片|剪贴板/);

      await vi.advanceTimersByTimeAsync(3000);
      imagePanel.vm.$emit("paste");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(getType).toHaveBeenCalledWith("image/png");
      expect(wrapper.find(".image-card").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片|截图|列表|添加|收进|保存|这张图/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("appends pasted images to the end of the image list", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "existing", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>;
      expect(images).toHaveLength(2);
      expect(images[0].id).toBe("existing");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows import and export success through the companion bubble", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:todo-board");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("export", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(createObjectURL).toHaveBeenCalled();
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导出|备份|文件|准备/);

      await vi.advanceTimersByTimeAsync(3000);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({ workspaceLines: ["导入内容"] })], "todo.json", {
        type: "application/json",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/覆盖|导入|当前数据/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain("导入内容");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导入|同步|生效|就位|更新/);
      const workspaceTextarea = wrapper.findAll("textarea")[1].element as HTMLTextAreaElement;
      expect(workspaceTextarea.value).toContain("导入内容");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows about information in the companion bubble instead of a modal", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("about", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".n-modal").exists()).toBe(false);
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("To Do List 看板");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble for invalid JSON imports", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File(["{"], "broken.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/文件格式不正确|检查文件/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble for invalid board backup data", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({ unknown: true })], "wrong.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/数据内容不适用|备份/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when clipboard image permission is denied", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/剪贴板权限受限|检查剪贴板权限/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when image reading fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const originalFileReader = window.FileReader;
    class FailingFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      error = new DOMException("read failed", "NotReadableError");
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片读取失败|重新粘贴/);
      expect(wrapper.find(".image-card").exists()).toBe(false);
    } finally {
      vi.stubGlobal("FileReader", originalFileReader);
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when image storage fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const originalIndexedDB = window.indexedDB;
    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        throw new Error("store failed");
      }),
    });
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片保存失败|重试/);
      expect(wrapper.find(".image-card").exists()).toBe(false);
    } finally {
      if (originalIndexedDB) {
        vi.stubGlobal("indexedDB", originalIndexedDB);
      } else {
        Reflect.deleteProperty(window, "indexedDB");
      }
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when link opening is blocked", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [{ id: "link-1", title: "站点", value: "example.com", type: "link" }],
      }),
    );
    vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/链接打开失败|检查链接/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("reanchors the companion to the todo section when clearing completed todos after quick copy", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "text-1", title: "片段", value: "复制内容", type: "text" },
        ],
        todos: {
          morning: [{ id: "done-1", text: "已完成事项", done: true }],
        },
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".quick-block").element, "getBoundingClientRect").mockReturnValue({
        x: 128,
        y: 360,
        width: 255,
        height: 360,
        top: 360,
        left: 128,
        right: 383,
        bottom: 720,
        toJSON: () => ({}),
      });
      vi.spyOn(wrapper.get('.todo-section[data-period="morning"]').element, "getBoundingClientRect").mockReturnValue({
        x: 384,
        y: 0,
        width: 255,
        height: 240,
        top: 0,
        left: 384,
        right: 639,
        bottom: 240,
        toJSON: () => ({}),
      });

      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(3000);
      await wrapper.vm.$nextTick();

      wrapper.getComponent(TodoPanel).vm.$emit(
        "clearCompleted",
        "morning",
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 639px");
      expect(style).toContain("100vh - 240px");
      expect(style).not.toContain("100vw - 383px");

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/完成项|完成记录|完成列表|完成事项/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors completion feedback to the checked todo section when the section was not focused", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "open-1", text: "待完成事项", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const todoSection = wrapper.get('.todo-section[data-period="morning"]');
      vi.spyOn(todoSection.element, "getBoundingClientRect").mockReturnValue({
        x: 384,
        y: 0,
        width: 255,
        height: 240,
        top: 0,
        left: 384,
        right: 639,
        bottom: 240,
        toJSON: () => ({}),
      });
      wrapper.getComponent(TodoPanel).vm.$emit("complete", "morning", "open-1", true, todoSection.element as HTMLElement);
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 639px");
      expect(style).toContain("100vh - 240px");

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text().trim().length).toBeGreaterThan(0);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("fades area click and focus guidance GIFs after ten seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".image-panel").element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      await wrapper.get(".image-panel .panel-header").trigger("click");
      await vi.advanceTimersByTimeAsync(9_999);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);

      const workspace = wrapper.findAll(".text-panel")[1];
      vi.spyOn(workspace.element, "getBoundingClientRect").mockReturnValue({
        x: 720,
        y: 0,
        width: 360,
        height: 900,
        top: 0,
        left: 720,
        right: 1080,
        bottom: 900,
        toJSON: () => ({}),
      });
      await workspace.get("textarea").trigger("focus");
      await vi.advanceTimersByTimeAsync(9_999);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows explicit context-menu guide bubbles immediately even when random hints are skipped", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      vi.spyOn(imagePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      imagePanel.vm.$emit("guide", "images", imagePanel.element as HTMLElement, true);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/截图区|图片|Ctrl\+V|方向键|右键|删除|预览|Esc/);

      await vi.advanceTimersByTimeAsync(3900);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("moves the click-triggered guide GIF to the newly clicked area without text bubbles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".image-panel").element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      await wrapper.get(".image-panel .panel-header").trigger("click");
      await vi.advanceTimersByTimeAsync(600);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      vi.spyOn(wrapper.get(".quick-block").element, "getBoundingClientRect").mockReturnValue({
        x: 128,
        y: 0,
        width: 300,
        height: 360,
        top: 0,
        left: 128,
        right: 428,
        bottom: 360,
        toJSON: () => ({}),
      });
      await wrapper.get(".quick-block").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.get('[data-testid="companion-bubble"]').attributes("style")).toContain("100vw - 428px");
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors the companion near the focused todo area and workspace area", async () => {
    const wrapper = mountApp();
    const todoList = wrapper.get('[data-testid="todo-list-morning"]');

    vi.spyOn(todoList.element, "getBoundingClientRect").mockReturnValue({
      x: 440,
      y: 34,
      width: 270,
      height: 260,
      top: 34,
      left: 440,
      right: 710,
      bottom: 294,
      toJSON: () => ({}),
    });
    await todoList.trigger("click");
    await wrapper.vm.$nextTick();
    const activeTodoList = wrapper.get('[data-testid="todo-list-morning"]');
    vi.spyOn(activeTodoList.element, "getBoundingClientRect").mockReturnValue({
      x: 440,
      y: 34,
      width: 270,
      height: 260,
      top: 34,
      left: 440,
      right: 710,
      bottom: 294,
      toJSON: () => ({}),
    });
    await wrapper.get('[data-testid="todo-input-morning"]').trigger("focus");

    const todoStyle = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
    expect(todoStyle).toContain("right: calc(10px + 100vw - 710px)");
    expect(todoStyle).toContain("bottom: calc(10px + 100vh - 294px)");

    const workspace = wrapper.findAll(".text-panel")[1];
    vi.spyOn(workspace.element, "getBoundingClientRect").mockReturnValue({
      x: 720,
      y: 0,
      width: 360,
      height: 900,
      top: 0,
      left: 720,
      right: 1080,
      bottom: 900,
      toJSON: () => ({}),
    });
    await workspace.get("textarea").trigger("focus");

    const workspaceStyle = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
    expect(workspaceStyle).toContain("right: calc(10px + 100vw - 1080px)");
    expect(workspaceStyle).toContain("bottom: calc(10px + 100vh - 900px)");

    wrapper.unmount();
  });

  it("hides the current bubble when focus switches, moves the GIF, and clears focus on Escape", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();
    try {
      const firstPanel = wrapper.find(".text-panel");
      vi.spyOn(firstPanel.element, "getBoundingClientRect").mockReturnValue({
        x: 120,
        y: 0,
        width: 300,
        height: 420,
        top: 0,
        left: 120,
        right: 420,
        bottom: 420,
        toJSON: () => ({}),
      });
      await firstPanel.get("textarea").trigger("focus");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      const workspace = wrapper.findAll(".text-panel")[1];
      vi.spyOn(workspace.element, "getBoundingClientRect").mockReturnValue({
        x: 720,
        y: 0,
        width: 360,
        height: 900,
        top: 0,
        left: 720,
        right: 1080,
        bottom: 900,
        toJSON: () => ({}),
      });
      await workspace.get("textarea").trigger("focus");

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="companion-bubble"]').attributes("style")).toContain("100vw - 1080px");
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("moves app version status into the settings menu and marks stale versions", async () => {
    localStorage.setItem("todo-board-app-version", "0.9.0");
    const wrapper = mountApp();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const settings = wrapper.getComponent(SettingsMenu);
    expect(wrapper.find('[data-testid="app-version"]').exists()).toBe(false);
    expect(settings.props("appVersion")).toMatch(/^\d+\.\d+\.\d+/);
    expect(settings.props("updateAvailable")).toBe(true);
    expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBe("true");

    wrapper.unmount();
  });

  it("opens the GitHub issue creation page from the settings suggestion action", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountApp();

    const settings = wrapper.getComponent(SettingsMenu);
    settings.vm.$emit("suggest", settings.element as HTMLElement);
    await wrapper.vm.$nextTick();

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/xiangjianan/todolist/issues/new",
      "_blank",
      "noopener,noreferrer",
    );

    wrapper.unmount();
  });
});
