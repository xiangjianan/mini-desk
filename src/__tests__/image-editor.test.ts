import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ImageEditor from "../components/ImageEditor.vue";

const iconStub = {
  template: "<span><slot /></span>",
};

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;
let canvasContextMock: {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  strokeText: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  font?: string;
};

function installCanvasMock() {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    strokeText: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 12 })),
    setLineDash: vi.fn(),
  };
  canvasContextMock = context;

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
  await nextTick();
}

function mockRect(element: Element, rect = { width: 400, height: 300 }): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => undefined,
    }),
  });
}

describe("ImageEditor", () => {
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

  it("renders editor tools with names, tooltips, and expected icon affordances", () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    expect(wrapper.find(".image-editor").exists()).toBe(true);
    expect(wrapper.get('[aria-label="矩形"]').classes()).toContain("is-active");
    expect(wrapper.findAll(".image-editor-tool").map((button) => button.attributes("aria-label"))).toEqual([
      "裁切",
      "画笔",
      "矩形",
      "圆形",
      "箭头",
      "标注",
      "文本",
    ]);
    expect(wrapper.findAll(".image-editor-tool").map((button) => button.attributes("data-tooltip"))).toEqual([
      "裁切",
      "画笔",
      "矩形",
      "圆形",
      "箭头",
      "标注",
      "文本",
    ]);
    expect(wrapper.find('[aria-label="画笔"] .lucide-pen-line').exists()).toBe(true);
    expect(wrapper.find('[aria-label="圆形"] .image-editor-ellipse-icon').exists()).toBe(true);
    expect(wrapper.get('[aria-label="标注"] .image-editor-marker-icon').text()).toBe("1");
    expect(wrapper.findAll(".image-editor-color").map((button) => button.attributes("aria-label"))).toEqual([
      "红色",
      "绿色",
      "蓝色",
      "黄色",
      "黑色",
      "白色",
    ]);
    expect(wrapper.get(".image-editor-width").attributes("type")).toBe("range");
    expect(wrapper.get(".image-editor-width-preview").attributes("aria-hidden")).toBe("true");
    expect(wrapper.get(".image-editor-width-preview-mark").attributes("style")).toContain("width: 4px");
    expect(wrapper.get(".image-editor-save").text()).toBe("保存");
    expect(wrapper.get(".image-editor-cancel").text()).toBe("取消");

    wrapper.unmount();
  });

  it("creates a focused text box with the current slider-controlled text size", async () => {
    const wrapper = mount(ImageEditor, {
      attachTo: document.body,
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    await wrapper.get(".image-editor-width").setValue(9);
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);

    const input = wrapper.get(".image-editor-text-input");
    expect(document.activeElement).toBe(input.element);
    expect(input.attributes("style")).toContain("font-size: 29px");
    expect(input.attributes("style")).toContain("line-height: 1.35");

    await wrapper.get(".image-editor-width").setValue(12);
    expect(wrapper.get(".image-editor-text-input").attributes("style")).toContain("font-size: 32px");

    wrapper.unmount();
  });

  it("confirms text input focus after the pointer click sequence finishes", async () => {
    vi.useFakeTimers();
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    const wrapper = mount(ImageEditor, {
      attachTo: document.body,
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    try {
      const canvas = wrapper.get(".image-editor-canvas");
      mockRect(canvas.element);

      await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
      await dispatchPointer(canvas.element, "pointerdown", 100, 80);
      await dispatchPointer(canvas.element, "pointerup", 100, 80);

      expect(document.activeElement).toBe(wrapper.get(".image-editor-text-input").element);
      const focusCountAfterPointer = focusSpy.mock.calls.length;

      await vi.advanceTimersByTimeAsync(20);

      expect(document.activeElement).toBe(wrapper.get(".image-editor-text-input").element);
      expect(focusSpy.mock.calls.length).toBeGreaterThan(focusCountAfterPointer);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("scales the editing text preview to match the saved canvas text size", async () => {
    const wrapper = mount(ImageEditor, {
      attachTo: document.body,
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element, { width: 200, height: 150 });

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);
    await wrapper.get(".image-editor-text-input").setValue("Scaled");

    expect(wrapper.get(".image-editor-text-input").attributes("style")).toContain("font-size: 12px");

    await wrapper.get(".image-editor-save").trigger("click");

    expect(canvasContextMock.font).toContain("24px");
    expect(canvasContextMock.fillText).toHaveBeenCalledWith("Scaled", 200, 160);

    wrapper.unmount();
  });

  it("keeps the source image visible behind the canvas while the editor is loading", () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    expect(wrapper.get(".image-editor-source").attributes("src")).toBe("data:image/png;base64,one");
    wrapper.unmount();
  });

  it("adds numbered markers only once in click order and saves the edited image", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "标注")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);
    await dispatchPointer(canvas.element, "pointerdown", 140, 120);

    expect(wrapper.findAll(".image-editor-marker-badge")).toHaveLength(0);
    expect(canvasContextMock.fillText.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(["1", "2"]));

    await wrapper.get(".image-editor-save").trigger("click");

    expect(wrapper.emitted("save")?.[0]).toEqual([
      {
        id: "img-1",
        src: "data:image/png;base64,edited",
        displayWidth: 400,
        displayHeight: 300,
      },
    ]);
    wrapper.unmount();
  });

  it("starts crop mode with a full-image dashed box and resizes from the right edge", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "裁切")?.trigger("click");
    expect(canvasContextMock.strokeRect).toHaveBeenCalledWith(0, 0, 400, 300);

    await dispatchPointer(canvas.element, "pointerdown", 398, 150);
    await dispatchPointer(canvas.element, "pointermove", 300, 150);
    await dispatchPointer(canvas.element, "pointerup", 300, 150);

    await wrapper.get(".image-editor-save").trigger("click");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,edited",
      displayWidth: 300,
      displayHeight: 300,
    });
    wrapper.unmount();
  });

  it("resizes the crop box from a diagonal corner handle", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "裁切")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 398, 298);
    await dispatchPointer(canvas.element, "pointermove", 320, 220);
    await dispatchPointer(canvas.element, "pointerup", 320, 220);

    await wrapper.get(".image-editor-save").trigger("click");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      displayWidth: 320,
      displayHeight: 220,
    });
    wrapper.unmount();
  });

  it("does not include the crop selection overlay when saving", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "裁切")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 398, 150);
    await dispatchPointer(canvas.element, "pointermove", 220, 150);
    await dispatchPointer(canvas.element, "pointerup", 220, 150);

    expect(canvasContextMock.setLineDash).toHaveBeenCalled();
    canvasContextMock.setLineDash.mockClear();
    canvasContextMock.strokeRect.mockClear();
    canvasContextMock.fillRect.mockClear();

    await wrapper.get(".image-editor-save").trigger("click");

    expect(canvasContextMock.setLineDash).not.toHaveBeenCalled();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,edited",
    });
    wrapper.unmount();
  });

  it("keeps existing markers visible when the crop overlay changes", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "标注")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);
    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "裁切")?.trigger("click");

    canvasContextMock.clearRect.mockClear();
    canvasContextMock.fillText.mockClear();
    await dispatchPointer(canvas.element, "pointerdown", 2, 2);
    await dispatchPointer(canvas.element, "pointermove", 40, 30);

    expect(canvasContextMock.fillText).toHaveBeenCalledWith("1", 100, 80.5);
    expect(canvasContextMock.clearRect).not.toHaveBeenCalledWith(40, 30, 360, 270);
    wrapper.unmount();
  });

  it("shows crop action buttons and applies crop without dropping existing markers", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "标注")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);
    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "裁切")?.trigger("click");

    expect(wrapper.get(".image-editor-crop-cancel").attributes("aria-label")).toBe("取消裁切");
    expect(wrapper.get(".image-editor-crop-apply").attributes("aria-label")).toBe("应用裁切");
    expect(wrapper.get(".image-editor-crop-actions").attributes("style")).toContain("left: 100%");
    expect(wrapper.get(".image-editor-crop-actions").attributes("style")).toContain("top: 100%");

    await dispatchPointer(canvas.element, "pointerdown", 2, 2);
    await dispatchPointer(canvas.element, "pointermove", 40, 30);
    await dispatchPointer(canvas.element, "pointerup", 40, 30);
    await wrapper.get(".image-editor-crop-apply").trigger("click");

    expect(wrapper.find(".image-editor").exists()).toBe(true);
    expect(wrapper.find(".image-editor-crop-apply").exists()).toBe(false);

    canvasContextMock.fillText.mockClear();
    await wrapper.get(".image-editor-save").trigger("click");

    expect(canvasContextMock.fillText).toHaveBeenCalledWith("1", 60, 50.5);
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      displayWidth: 360,
      displayHeight: 270,
    });
    wrapper.unmount();
  });

  it("supports multiple editable text boxes that can be selected, moved, and saved", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);
    await wrapper.get(".image-editor-text-input").setValue("Hello");

    await dispatchPointer(canvas.element, "pointerdown", 220, 140);
    const textBoxes = wrapper.findAll(".image-editor-text-box");
    expect(textBoxes).toHaveLength(2);
    expect(textBoxes[1].classes()).toContain("is-active");

    await textBoxes[0].trigger("click");
    expect(wrapper.findAll(".image-editor-text-box")[0].classes()).toContain("is-active");

    await dispatchPointer(wrapper.findAll(".image-editor-text-box")[0].element, "pointerdown", 100, 80);
    await dispatchPointer(wrapper.findAll(".image-editor-text-box")[0].element, "pointermove", 140, 120);
    await dispatchPointer(wrapper.findAll(".image-editor-text-box")[0].element, "pointerup", 140, 120);
    expect(wrapper.findAll(".image-editor-text-box")[0].attributes("style")).toContain("left: 35%");
    expect(wrapper.findAll(".image-editor-text-box")[0].attributes("style")).toContain("top: 40%");

    canvasContextMock.fillText.mockClear();
    await wrapper.get(".image-editor-save").trigger("click");
    expect(canvasContextMock.fillText).toHaveBeenCalledWith("Hello", 140, 120);

    wrapper.unmount();
  });

  it("uses transparent multiline text boxes, removes empty text, and saves text with a white outline", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);

    const emptyTextBox = wrapper.get(".image-editor-text-input");
    expect(emptyTextBox.element.tagName).toBe("TEXTAREA");
    expect(emptyTextBox.attributes("placeholder")).toBe("");
    expect(emptyTextBox.classes()).toContain("is-transparent");

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "画笔")?.trigger("click");
    expect(wrapper.find(".image-editor-text-box").exists()).toBe(false);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 120, 90);
    await wrapper.get(".image-editor-text-input").setValue("Hello\nMini Desk");

    await dispatchPointer(wrapper.get(".image-editor-text-input").element, "pointerdown", 120, 90);
    await dispatchPointer(wrapper.get(".image-editor-text-input").element, "pointermove", 150, 120);
    await dispatchPointer(wrapper.get(".image-editor-text-input").element, "pointerup", 150, 120);
    expect(wrapper.get(".image-editor-text-box").attributes("style")).toContain("left: 37.5%");
    expect(wrapper.get(".image-editor-text-box").attributes("style")).toContain("top: 40%");

    canvasContextMock.strokeText.mockClear();
    canvasContextMock.fillText.mockClear();
    await wrapper.get(".image-editor-save").trigger("click");

    expect(canvasContextMock.strokeText.mock.calls.length).toBeGreaterThan(0);
    expect(canvasContextMock.fillText.mock.calls.length).toBeGreaterThan(0);
    expect(canvasContextMock.strokeText.mock.calls).toEqual(expect.arrayContaining([
      ["Hello", 150, 120],
      ["Mini Desk", 150, 152],
    ]));
    expect(canvasContextMock.fillText.mock.calls).toEqual(expect.arrayContaining([
      ["Hello", 150, 120],
      ["Mini Desk", 150, 152],
    ]));

    wrapper.unmount();
  });

  it("does not drag the text box when resizing from the textarea corner", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);

    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "文本")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 100, 80);
    await wrapper.get(".image-editor-text-input").setValue("Resizable");

    const input = wrapper.get(".image-editor-text-input");
    Object.defineProperty(input.element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 100,
        y: 80,
        left: 100,
        top: 80,
        right: 260,
        bottom: 160,
        width: 160,
        height: 80,
        toJSON: () => undefined,
      }),
    });

    await dispatchPointer(input.element, "pointerdown", 258, 158);
    await dispatchPointer(input.element, "pointermove", 300, 200);
    await dispatchPointer(input.element, "pointerup", 300, 200);

    expect(wrapper.get(".image-editor-text-box").attributes("style")).toContain("left: 25%");
    expect(wrapper.get(".image-editor-text-box").attributes("style")).toContain("top: 26.666666666666668%");

    wrapper.unmount();
  });

  it("stops the arrow line behind a larger arrow head", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    const canvas = wrapper.get(".image-editor-canvas");
    mockRect(canvas.element);
    await wrapper.findAll(".image-editor-tool").find((button) => button.attributes("aria-label") === "箭头")?.trigger("click");
    await dispatchPointer(canvas.element, "pointerdown", 40, 80);
    await dispatchPointer(canvas.element, "pointermove", 200, 80);
    await dispatchPointer(canvas.element, "pointerup", 200, 80);

    const firstLineTo = canvasContextMock.lineTo.mock.calls[0];
    const arrowHeadLineCalls = canvasContextMock.lineTo.mock.calls.slice(1, 3);
    expect(firstLineTo[0]).toBeLessThan(200);
    expect(arrowHeadLineCalls[0][0]).toBeLessThanOrEqual(176);
    wrapper.unmount();
  });

  it("does not save when Enter is pressed inside the editor", async () => {
    const wrapper = mount(ImageEditor, {
      props: {
        image: { id: "img-1", src: "data:image/png;base64,one", createdAt: 1, displayWidth: 400, displayHeight: 300 },
      },
      global: {
        stubs: {
          NIcon: iconStub,
        },
      },
    });

    await wrapper.get(".image-editor").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("save")).toBeUndefined();
    wrapper.unmount();
  });
});
