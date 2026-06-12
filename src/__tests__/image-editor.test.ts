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
  lineTo: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
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

  it("renders crop, drawing, shape, arrow, marker, color, width, and save controls", () => {
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
    expect(wrapper.findAll(".image-editor-tool").map((button) => button.attributes("aria-label"))).toEqual([
      "裁切",
      "画笔",
      "矩形",
      "圆形",
      "箭头",
      "标注",
    ]);
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

  it("saves when Enter is pressed inside the editor", async () => {
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
});
