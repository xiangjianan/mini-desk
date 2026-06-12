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
    expect(wrapper.get(".image-editor-save").text()).toBe("保存");
    expect(wrapper.get(".image-editor-cancel").text()).toBe("取消");

    wrapper.unmount();
  });

  it("adds numbered marker badges in click order and saves the edited image", async () => {
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

    expect(wrapper.findAll(".image-editor-marker-badge").map((badge) => badge.text())).toEqual(["1", "2"]);

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
    await dispatchPointer(canvas.element, "pointerdown", 40, 40);
    await dispatchPointer(canvas.element, "pointermove", 220, 160);
    await dispatchPointer(canvas.element, "pointerup", 220, 160);

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
