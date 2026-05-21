import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";
import ImagePanel from "../components/ImagePanel.vue";
import SettingsMenu from "../components/SettingsMenu.vue";
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
    expect(wrapper.text()).toContain("双击可改名");
    expect(wrapper.find('[aria-label="切换主题"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="新增快捷链接"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="设置"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("creates a todo from an empty section double click", async () => {
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("dblclick");

    expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("keeps at most one blank todo when blank list space is double-clicked repeatedly", async () => {
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

    await list.trigger("dblclick");
    await wrapper.vm.$nextTick();
    await list.trigger("dblclick");
    await wrapper.vm.$nextTick();
    await list.trigger("dblclick");
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

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("dblclick");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="todo-list-noon"]').trigger("dblclick");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="todo-list-evening"]').trigger("dblclick");
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
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/保存|收好|记下|归档|备份|存好|存档/);
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

  it("uses the companion bubble instead of window.confirm for clearing completed todos", async () => {
    vi.useFakeTimers();
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
      await wrapper.get(".clear-completed-button").trigger("click");

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/已完成事项|完成事项/);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");

      expect(wrapper.findAll("input.todo-input").some((input) => (input.element as HTMLInputElement).value === "已完成事项")).toBe(false);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(document.activeElement).toBe(document.body);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when clearing an empty completed todo list", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await wrapper.get(".clear-completed-button").trigger("click");

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/没有|暂无|不用清理/);
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

  it("reorders images from item context-menu top and bottom actions", async () => {
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

    imagePanel.vm.$emit("moveTop", "img-2");
    await wrapper.vm.$nextTick();

    expect(imagePanel.props("images").map((image: { id: string }) => image.id)).toEqual(["img-2", "img-1", "img-3"]);

    imagePanel.vm.$emit("moveBottom", "img-2");
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导出|备份/);

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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导入|同步|生效/);
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

      await wrapper.get(".clear-completed-button").trigger("click");
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 639px");
      expect(style).toContain("100vh - 240px");
      expect(style).not.toContain("100vw - 383px");

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/已完成事项|完成事项/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps area click and focus guidance to the GIF without low-frequency text bubbles", async () => {
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
      await vi.advanceTimersByTimeAsync(25_000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

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
      await vi.advanceTimersByTimeAsync(20_000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/截图区|图片|Ctrl\+V|方向键|右键|删除/);
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
    await todoList.trigger("dblclick");
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
});
