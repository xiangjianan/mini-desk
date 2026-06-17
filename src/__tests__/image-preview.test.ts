import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImagePreview from "../components/ImagePreview.vue";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

const dropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <button
        v-for="option in options"
        :key="option.key"
        class="dropdown-option"
        type="button"
        @click="$emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  `,
};

const modalStub = {
  props: ["show"],
  template: '<section v-if="show" class="n-modal"><slot /></section>',
};

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

function installCanvasMock(): void {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setLineDash: vi.fn(),
  };

  originalGetContext = HTMLCanvasElement.prototype.getContext;
  originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => context as unknown as CanvasRenderingContext2D),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: vi.fn(() => "data:image/png;base64,edited"),
  });
}

async function dispatchPointer(target: Element, type: string, clientX: number, clientY: number): Promise<void> {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { configurable: true, value: 1 });
  target.dispatchEvent(event);
  await Promise.resolve();
}

async function flushPendingImagePreviewWork(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function mockRect(element: Element): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => undefined,
    }),
  });
}

describe("ImagePreview", () => {
  beforeEach(() => {
    installCanvasMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: originalGetContext,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,
      value: originalToDataURL,
    });
  });

  it("keeps the preview open when clicking blank preview space or the image", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-stage img").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    try {
      await wrapper.get(".preview-stage").trigger("click");
      expect(wrapper.get(".image-preview").classes()).not.toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a floating toolbar close action in the preview surface", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    expect(wrapper.find(".preview-sidebar").exists()).toBe(false);
    expect(wrapper.find(".preview-close-button").exists()).toBe(false);
    const closeButton = wrapper.get(".preview-toolbar-button.is-close");
    expect(closeButton.attributes("aria-label")).toBe("取消预览");

    try {
      await closeButton?.trigger("click");
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not render a duplicate thumbnail list inside the preview", () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    expect(wrapper.find(".preview-main").exists()).toBe(true);
    expect(wrapper.find(".preview-sidebar").exists()).toBe(false);
    expect(wrapper.find(".preview-image-list").exists()).toBe(false);
    expect(wrapper.find(".preview-thumb").exists()).toBe(false);

    wrapper.unmount();
  });

  it("fits preview images inside the preview region without overflowing", () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          {
            id: "img-1",
            src: "data:image/png;base64,one",
            createdAt: 1,
            displayWidth: 96,
            displayHeight: 48,
          },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const style = wrapper.get(".preview-stage img").attributes("style");
    expect(style).not.toContain("width: 100%");
    expect(style).not.toContain("height: 100%");
    expect(style).toContain("scale(1)");

    wrapper.unmount();
  });

  it("does not navigate when wheel events happen outside the preview stage", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -80 });

    wrapper.get(".image-preview").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");
    expect(wrapper.emitted("navigate")).toBeUndefined();
    wrapper.unmount();
  });

  it("does not navigate from wheel events inside the preview stage", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 1600 });

    try {
      wrapper.get(".preview-stage").element.dispatchEvent(wheelEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(wheelEvent.defaultPrevented).toBe(true);
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");
      expect(wrapper.emitted("navigate")).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("renders navigation controls in the liquid floating toolbar", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
          { id: "img-4", src: "data:image/png;base64,four", createdAt: 4 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const previous = wrapper.get(".preview-nav-button.is-previous");
    const next = wrapper.get(".preview-nav-button.is-next");
    const toolbar = wrapper.get(".preview-actions");

    expect(previous.attributes("aria-label")).toBe("上一张图片");
    expect(next.attributes("aria-label")).toBe("下一张图片");
    expect(wrapper.find(".preview-nav-stack").exists()).toBe(false);
    expect(toolbar.findAll(".preview-nav-button").map((button) => button.attributes("aria-label"))).toEqual([
      "上一张图片",
      "下一张图片",
    ]);

    await previous.trigger("click");
    await next.trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[-1], [1]]);
    wrapper.unmount();
  });

  it("keeps the transformed image state while closing", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.get(".preview-zoom-button.is-zoom-in").trigger("click");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1.1)");

      await wrapper.get(".preview-toolbar-button.is-close").trigger("click");

      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1.1)");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps both stacked navigation controls visible and disables unavailable edge actions", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    expect(wrapper.find(".preview-actions").exists()).toBe(true);
    expect(wrapper.find(".preview-nav-stack").exists()).toBe(false);
    const previous = wrapper.get(".preview-nav-button.is-previous");
    const next = wrapper.get(".preview-nav-button.is-next");

    expect(previous.attributes("disabled")).toBeDefined();
    expect(previous.attributes("aria-disabled")).toBe("true");
    expect(next.attributes("disabled")).toBeUndefined();

    await previous.trigger("click");
    await next.trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[1]]);
    wrapper.unmount();
  });

  it("disables the next stacked navigation control at the final image", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-3",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const previous = wrapper.get(".preview-nav-button.is-previous");
    const next = wrapper.get(".preview-nav-button.is-next");

    expect(previous.attributes("disabled")).toBeUndefined();
    expect(next.attributes("disabled")).toBeDefined();
    expect(next.attributes("aria-disabled")).toBe("true");

    await previous.trigger("click");
    await next.trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[-1]]);
    wrapper.unmount();
  });

  it("renders a liquid floating toolbar with navigation zoom delete and close actions", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const toolbar = wrapper.get(".preview-actions");
    expect(toolbar.attributes("role")).toBe("toolbar");
    const buttons = toolbar.findAll("button");
    expect(buttons).toHaveLength(7);
    expect(buttons.map((button) => button.text())).toEqual(["", "", "", "", "", "", ""]);
    expect(buttons.map((button) => button.attributes("aria-label"))).toEqual([
      "上一张图片",
      "下一张图片",
      "缩小图片",
      "放大图片",
      "编辑",
      "删除",
      "取消预览",
    ]);

    try {
      await wrapper.get(".preview-zoom-button.is-zoom-in").trigger("click");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1.1)");

      await wrapper.get(".preview-zoom-button.is-zoom-out").trigger("click");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");

      await wrapper.get(".preview-toolbar-button.is-edit").trigger("click");
      expect(wrapper.find(".preview-main").exists()).toBe(true);
      expect(wrapper.find(".preview-stage .image-editor").exists()).toBe(false);
      expect(wrapper.find(".image-editor").exists()).toBe(true);
      expect(wrapper.get(".image-editor-toolbar").classes()).toContain("preview-actions");
      await wrapper.get(".image-editor-cancel").trigger("click");

      await wrapper.get(".preview-toolbar-button.is-delete").trigger("click");
      expect(wrapper.emitted("delete")?.[0]?.[0]).toBe("img-1");
      expect(wrapper.emitted("copy")).toBeUndefined();

      await wrapper.get(".preview-toolbar-button.is-close").trigger("click");
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      await vi.advanceTimersByTimeAsync(220);
      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("opens the editor from the preview context menu", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-stage img").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "取消预览",
      "复制",
      "编辑",
      "删除",
      "置顶",
      "置底",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");

    expect(wrapper.find(".image-editor").exists()).toBe(true);
    wrapper.unmount();
  });

  it("matches the image-list context menu pinning actions in preview", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-stage img").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置顶")?.trigger("click");
    expect(wrapper.emitted("reorder")?.[0]).toEqual(["img-2", "img-1"]);

    await wrapper.get(".preview-stage img").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置底")?.trigger("click");
    expect(wrapper.emitted("moveToBottom")?.[0]).toEqual(["img-2"]);

    wrapper.unmount();
  });

  it("emits preview tips from the context menu instead of using an alert dialog", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-stage img").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");

    expect(alertSpy).not.toHaveBeenCalled();
    expect(wrapper.emitted("tips")).toHaveLength(1);
    expect(wrapper.emitted("tips")?.[0]?.[0]).toBe(wrapper.get(".preview-stage img").element);
    wrapper.unmount();
  });

  it("focuses the text input immediately when creating text from preview edit mode", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(ImagePreview, {
      attachTo: host,
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.get(".preview-toolbar-button.is-edit").trigger("click");
      await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
      const canvas = wrapper.get(".image-editor-canvas");
      mockRect(canvas.element);

      await dispatchPointer(canvas.element, "pointerdown", 100, 80);

      const input = wrapper.get(".image-editor-text-input");
      expect(document.activeElement).toBe(input.element);
      expect((input.element as HTMLTextAreaElement).selectionStart).toBe(0);
      expect((input.element as HTMLTextAreaElement).selectionEnd).toBe(0);
      expect(input.classes()).toContain("is-transparent");
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  it("toggles image zoom on double click", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const image = wrapper.get(".preview-stage img");
    Object.defineProperty(image.element, "getBoundingClientRect", {
      value: () => ({
        x: 50,
        y: 50,
        left: 50,
        top: 50,
        right: 250,
        bottom: 150,
        width: 200,
        height: 100,
        toJSON: () => undefined,
      }),
    });

    await image.trigger("dblclick", { clientX: 200, clientY: 125 });
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("translate(-50px, -25px) scale(2)");

    await wrapper.get(".preview-stage img").trigger("dblclick");
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("translate(0px, 0px) scale(1)");
    wrapper.unmount();
  });

  it("keeps the preview image transform when entering edit mode", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-zoom-button.is-zoom-in").trigger("click");
    const previewTransform = wrapper.get(".preview-stage img").attributes("style");
    expect(previewTransform).toContain("scale(1.1)");

    await wrapper.get(".preview-toolbar-button.is-edit").trigger("click");

    expect(wrapper.get(".image-editor-canvas-wrap").attributes("style")).toContain("scale(1.1)");
    wrapper.unmount();
  });

  it("uses the measured preview image size as the editor canvas frame", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const image = wrapper.get(".preview-stage img");
    Object.defineProperty(image.element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 320,
        y: 140,
        left: 320,
        top: 140,
        right: 640,
        bottom: 320,
        width: 320,
        height: 180,
        toJSON: () => undefined,
      }),
    });

    await wrapper.get(".preview-toolbar-button.is-edit").trigger("click");

    const style = wrapper.get(".image-editor-canvas-wrap").attributes("style");
    expect(style).toContain("width: 320px");
    expect(style).toContain("height: 180px");
    wrapper.unmount();
  });

  it("does not double-apply zoom when measuring the editor canvas frame", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-zoom-button.is-zoom-in").trigger("click");
    const image = wrapper.get(".preview-stage img");
    Object.defineProperty(image.element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 320,
        y: 140,
        left: 320,
        top: 140,
        right: 672,
        bottom: 338,
        width: 352,
        height: 198,
        toJSON: () => undefined,
      }),
    });

    await wrapper.get(".preview-toolbar-button.is-edit").trigger("click");

    const style = wrapper.get(".image-editor-canvas-wrap").attributes("style");
    expect(style).toContain("width: 320px");
    expect(style).toContain("height: 180px");
    expect(style).toContain("scale(1.1)");
    wrapper.unmount();
  });

  it("uses the preview fit size when editing opens directly from the image list", async () => {
    const getBoundingClientRect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("image-editor-stage")) {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 320,
          bottom: 300,
          width: 320,
          height: 300,
          toJSON: () => undefined,
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => undefined,
      } as DOMRect;
    });
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 800, displayHeight: 400 }],
        activeId: "img-1",
        editId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await flushPendingImagePreviewWork();
    await wrapper.vm.$nextTick();

    const style = wrapper.get(".image-editor-canvas-wrap").attributes("style");
    expect(style).toContain("width: 320px");
    expect(style).toContain("height: 160px");

    wrapper.unmount();
    getBoundingClientRect.mockRestore();
  });

  it("uses the image natural size for direct editing when display size is unavailable", async () => {
    const OriginalImage = globalThis.Image;
    class TestImage {
      naturalWidth = 1200;
      naturalHeight = 600;
      width = 1200;
      height = 600;
      onload: ((event: Event) => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event("load")));
      }
    }
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: TestImage,
    });
    const getBoundingClientRect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("image-editor-stage")) {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 300,
          bottom: 200,
          width: 300,
          height: 200,
          toJSON: () => undefined,
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => undefined,
      } as DOMRect;
    });
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
        editId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.vm.$nextTick();
      await flushPendingImagePreviewWork();
      await wrapper.vm.$nextTick();

      const style = wrapper.get(".image-editor-canvas-wrap").attributes("style");
      expect(style).toContain("width: 300px");
      expect(style).toContain("height: 150px");
    } finally {
      wrapper.unmount();
      getBoundingClientRect.mockRestore();
      Object.defineProperty(globalThis, "Image", {
        configurable: true,
        value: OriginalImage,
      });
    }
  });

  it("closes the preview when pressing Space", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.get(".image-preview").trigger("keydown", { key: " " });

      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("closes the preview when Space is pressed after a navigation button keeps focus", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      const next = wrapper.get(".preview-nav-button.is-next");
      await next.trigger("click");
      await next.trigger("keydown", { key: " " });

      expect(wrapper.emitted("navigate")).toEqual([[1]]);
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("returns focus to the preview surface after pointer navigation so Enter opens the editor without repeating navigation", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(ImagePreview, {
      attachTo: host,
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      const next = wrapper.get(".preview-nav-button.is-next");
      const nextElement = next.element as HTMLElement;
      nextElement.focus();
      expect(document.activeElement).toBe(nextElement);

      await next.trigger("click");
      expect(document.activeElement).toBe(wrapper.get(".image-preview").element);

      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("navigate")).toEqual([[1]]);
      expect(wrapper.find(".image-editor").exists()).toBe(true);
      expect(wrapper.emitted("copy")).toBeUndefined();
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  it("opens a compact context menu over preview images", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 16, clientY: 18 });

    wrapper.get(".preview-stage img").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "取消预览",
      "复制",
      "编辑",
      "删除",
      "置顶",
      "置底",
      "Tips",
    ]);

    try {
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "取消预览")?.trigger("click");
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("opens the editor with Enter and keeps destructive preview shortcuts disabled while editing", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
    expect(wrapper.find(".image-editor").exists()).toBe(true);
    expect(wrapper.emitted("copy")).toBeUndefined();

    await wrapper.get(".image-preview").trigger("keydown", { key: "5" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "w" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "D" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "Backspace" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "Delete" });
    try {
      expect(wrapper.emitted("copy")).toBeUndefined();
      expect(wrapper.emitted("navigate")).toBeUndefined();
      expect(wrapper.emitted("delete")).toBeUndefined();
      expect(wrapper.emitted("saveEdit")).toBeUndefined();
      expect(wrapper.get(".image-preview").classes()).not.toContain("is-closing");
      expect(wrapper.find(".image-editor").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toBeUndefined();

      await wrapper.get(".image-editor-cancel").trigger("click");
      expect(wrapper.find(".image-editor").exists()).toBe(false);

      await wrapper.get(".image-preview").trigger("keydown", { key: "5" });
      await wrapper.get(".image-preview").trigger("keydown", { key: "D" });
      await wrapper.get(".image-preview").trigger("keydown", { key: "Delete" });

      expect(wrapper.emitted("copy")).toEqual([["img-2"]]);
      expect(wrapper.emitted("navigate")).toEqual([[1]]);
      expect(wrapper.emitted("delete")?.map((event) => event[0])).toEqual(["img-2"]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("closes the preview on Escape while editing was opened from preview", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
      expect(wrapper.find(".image-editor").exists()).toBe(true);

      await wrapper.get(".image-preview").trigger("keydown", { key: "Escape" });

      expect(wrapper.find(".image-editor").exists()).toBe(false);
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps editing active when Space is pressed in preview edit mode", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
    expect(wrapper.find(".image-editor").exists()).toBe(true);

    await wrapper.get(".image-preview").trigger("keydown", { key: " " });

    expect(wrapper.find(".image-editor").exists()).toBe(true);
    expect(wrapper.find(".image-preview").classes()).not.toContain("is-closing");
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("captures window Escape while editing and closes the preview", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    try {
      await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
      expect(wrapper.find(".image-editor").exists()).toBe(true);

      window.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(event.defaultPrevented).toBe(true);
      expect(wrapper.find(".image-editor").exists()).toBe(false);
      expect(wrapper.find(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("closes the preview on Escape when editing was opened directly from the image list", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
        editId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      expect(wrapper.find(".image-editor").exists()).toBe(true);

      await wrapper.get(".image-preview").trigger("keydown", { key: "Escape" });

      expect(wrapper.find(".image-editor").exists()).toBe(false);
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps direct editing active when Space is pressed", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
        editId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: " " });

    expect(wrapper.find(".image-editor").exists()).toBe(true);
    expect(wrapper.find(".image-preview").classes()).not.toContain("is-closing");
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("captures window Escape from direct edit mode and closes the preview", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
        editId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    try {
      window.dispatchEvent(event);
      await wrapper.vm.$nextTick();

      expect(event.defaultPrevented).toBe(true);
      expect(wrapper.find(".image-editor").exists()).toBe(false);
      expect(wrapper.find(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("saves and exits edit mode when Enter is pressed while the editor is open", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("saveEdit")?.[0]?.[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,edited",
      displayWidth: 400,
      displayHeight: 300,
    });
    expect(wrapper.find(".image-editor").exists()).toBe(false);
    expect(wrapper.emitted("copy")).toBeUndefined();
    wrapper.unmount();
  });

  it("keeps Enter available for new lines in image editor text inputs", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);
    await dispatchPointer(canvas.element, "pointerdown", 120, 90);

    const input = wrapper.get(".image-editor-text-input");
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted("saveEdit")).toBeUndefined();
    expect(wrapper.find(".image-editor").exists()).toBe(true);
    wrapper.unmount();
  });

  it("uses WASD keys to navigate images", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "w" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "A" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "s" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "D" });

    expect(wrapper.emitted("navigate")).toEqual([[-1], [-1], [1], [1]]);
    wrapper.unmount();
  });
});
