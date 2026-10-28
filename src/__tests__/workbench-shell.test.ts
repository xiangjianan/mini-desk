import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import WorkbenchShell from "../components/WorkbenchShell.vue";
import { menuDropdownStub } from "./helpers/menu-dropdown-stub";

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const WORKBENCH_WIDTH_STORAGE_KEY = "mini-desk-workbench-widths";
const LEGACY_WORKBENCH_WIDTH_STORAGE_KEY = "todo-board-workbench-widths";
const WORKBENCH_HEADER_STORAGE_KEY = "mini-desk-workbench-header-hidden";
const LEGACY_WORKBENCH_HEADER_STORAGE_KEY = "todo-board-workbench-header-hidden";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  document.documentElement.style.removeProperty("--image-preview-left");
  document.documentElement.style.removeProperty("--image-preview-top");
  localStorage.clear();
});

describe("WorkbenchShell", () => {
  it("captures scrolling from all four slot regions and clears activity on unmount", async () => {
    vi.useFakeTimers();
    const wrapper = mount(WorkbenchShell, {
      props: { title: "MiniDesk", saveStatusLabel: "已保存" },
      slots: {
        assets: '<div class="n-scrollbar"><div class="n-scrollbar-container"></div></div>',
        notes: '<div class="n-scrollbar"><div class="n-scrollbar-container"></div></div>',
        tasks: '<div class="todo-column"></div>',
        workspace: '<textarea class="text-editor-textarea"></textarea>',
      },
    });
    await nextTick();
    for (const target of wrapper.findAll(".n-scrollbar-container, .todo-column, .text-editor-textarea")) {
      target.element.dispatchEvent(new Event("scroll"));
      expect(target.classes()).toContain("is-scrolling");
    }
    const root = wrapper.element;
    wrapper.unmount();
    expect(root.querySelector(".is-scrolling")).toBeNull();
  });

  const defaultProps = {
    title: "MiniDesk",
    saveStatusLabel: "已保存",
  };

  it("opens Tips on blank header space while leaving controls alone", async () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      global: { stubs: { Dropdown: menuDropdownStub, NDropdown: menuDropdownStub } },
    });
    const header = wrapper.get('[data-testid="workbench-command-bar"]');
    await wrapper.get('[data-testid="workbench-header-hide"]').trigger("contextmenu");
    expect(wrapper.find('[data-key="guide"]').exists()).toBe(false);
    await header.trigger("contextmenu");
    expect(wrapper.get('[data-key="guide"]').text()).toBe("Tips");
    await wrapper.get('[data-key="guide"]').trigger("click");
    expect(wrapper.emitted("randomTip")?.[0]).toEqual([header.element]);
    expect(wrapper.find('[data-key="guide"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("refits fixed columns when the grid width changes without a window resize", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(2400);
    let width = 1200;
    let callback: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(handler: ResizeObserverCallback) { callback = handler; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.classList.contains("workbench-grid")
        ? { width, height: 748, top: 52, left: 0, right: width, bottom: 800, x: 0, y: 52, toJSON: () => undefined }
        : originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, { props: defaultProps });
    await nextTick(); await nextTick();
    const total = () => [...wrapper.get(".workbench-grid").attributes("style")!.matchAll(/(\d+)px/g)]
      .reduce((sum, match) => sum + Number(match[1]), 0);
    const initial = total();
    width = 2000;
    callback!([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(20);
    await nextTick();
    expect(total() - initial).toBeCloseTo(800, -1);
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("restores imported area proportions and refreshes them within the same workspace", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("workbench-grid")) return { width: 1200, height: 748, top: 52, left: 0, right: 1200, bottom: 800, x: 0, y: 52, toJSON: () => undefined };
      return originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, { attachTo: document.body, props: { ...defaultProps, workspaceId: "imported", zoneWidthRatios: [0.1, 0.2, 0.3, 0.4] } });
    await nextTick(); await nextTick();
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 116px 232px 347px 463px");
    await wrapper.setProps({ zoneWidthRatios: [0.4, 0.3, 0.2, 0.1] });
    await nextTick(); await nextTick();
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 463px 347px 232px 116px");
    wrapper.unmount();
  });

  it("renders a single rounded command shell and four named work zones", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      slots: {
        assets: "<div data-testid='assets-slot'>assets</div>",
        notes: "<div data-testid='notes-slot'>notes</div>",
        tasks: "<div data-testid='tasks-slot'>tasks</div>",
        workspace: "<div data-testid='workspace-slot'>workspace</div>",
        actions: "<button data-testid='actions-slot' aria-label='设置'>settings</button>",
      },
    });

    expect(wrapper.find('[aria-label="应用导航"]').exists()).toBe(false);
    expect(wrapper.find(".workbench-rail").exists()).toBe(false);
    expect(wrapper.get('[data-testid="workbench-command-bar"]').text()).toContain("MiniDesk");
    expect(wrapper.find(".workbench-slogan").exists()).toBe(false);
    expect(wrapper.get('[data-testid="workbench-command-bar"]').text()).not.toContain("搜索或执行命令");
    expect(wrapper.get('[data-testid="workbench-command-bar"]').text()).not.toContain("⌘K");
    expect(wrapper.get('[data-testid="workbench-save-status"]').text()).toBe("已保存");
    expect(wrapper.get(".workbench-zone-assets").attributes("aria-label")).toBe("🎨 贴图");
    expect(wrapper.get(".workbench-zone-notes").attributes("aria-label")).toBe("⚡ 快捷动作");
    expect(wrapper.get(".workbench-zone-tasks").attributes("aria-label")).toBe("✅ 提醒事项");
    expect(wrapper.get(".workbench-zone-workspace").attributes("aria-label")).toBe("📝 便签");
    expect(wrapper.get('[data-testid="assets-slot"]').text()).toBe("assets");
    expect(wrapper.get('[data-testid="notes-slot"]').text()).toBe("notes");
    expect(wrapper.get('[data-testid="tasks-slot"]').text()).toBe("tasks");
    expect(wrapper.get('[data-testid="workspace-slot"]').text()).toBe("workspace");
    expect(wrapper.get('[data-testid="actions-slot"]').text()).toBe("settings");
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
  });

  it("labels each collapsed rail with the zone's area title or a fixed name", () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        ...defaultProps,
        assetsTitle: "我的图床",
        notesTitle: "常用动作",
      },
    });

    // Rails are visually hidden until a zone collapses, but their text content
    // is always present in the DOM.
    expect(wrapper.get(".workbench-zone-assets .workbench-zone-rail").text()).toBe("我的图床");
    expect(wrapper.get(".workbench-zone-notes .workbench-zone-rail").text()).toBe("常用动作");
    expect(wrapper.get(".workbench-zone-tasks .workbench-zone-rail").text()).toBe("✅ 提醒事项");
    expect(wrapper.get(".workbench-zone-workspace .workbench-zone-rail").text()).toBe("📝 便签");
  });

  it("falls back to the default area titles when no custom title is provided", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    expect(wrapper.get(".workbench-zone-assets .workbench-zone-rail").text()).toBe("🎨 贴图");
    expect(wrapper.get(".workbench-zone-notes .workbench-zone-rail").text()).toBe("⚡ 快捷动作");
  });

  it("renders a compact slogan after the title and save status when provided", () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        ...defaultProps,
        slogan: "Do less, do it well.",
      },
    });

    expect(wrapper.get(".workbench-title-group").text()).toContain("MiniDesk");
    expect(wrapper.get(".workbench-title-group").text()).toContain("已保存");
    expect(wrapper.get(".workbench-slogan").text()).toBe("Do less, do it well.");
  });

  it("renders the title fallback when no workspace-trigger slot is provided", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    expect(wrapper.get(".workbench-title-fallback").text()).toBe("MiniDesk");
  });

  it("renders provided workspace-trigger slot content in place of the fallback", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      slots: {
        "workspace-trigger": "<button data-testid='slotted-trigger'>switcher</button>",
      },
    });

    expect(wrapper.find(".workbench-title-fallback").exists()).toBe(false);
    expect(wrapper.get('[data-testid="slotted-trigger"]').text()).toBe("switcher");
  });

  it("keeps every zone minimum width at 100px and fits columns without oscillating", () => {
    const source = readFileSync(resolve(__dirname, "../components/WorkbenchShell.vue"), "utf8");

    expect(source).toContain("const MIN_COLUMN_WIDTHS = [100, 100, 100, 100] as const");
    expect(source).toContain("fitColumnsToWidth");
    expect(source).toContain("splitWidthByWeights");
  });

  it("does not render dead shell controls by default", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    expect(wrapper.find('button[aria-label="搜索或执行命令"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="设置"]').exists()).toBe(false);
    expect(wrapper.find(".workbench-rail").exists()).toBe(false);
    // The collapse control stays in the right-side actions even without slotted settings.
    expect(wrapper.findAll(".workbench-command-actions button")).toHaveLength(1);
    expect(wrapper.find('[data-testid="zone-visibility-trigger"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="workbench-header-hide"]').attributes("aria-label")).toBe("收起顶部栏");
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
  });

  it("keeps a focusable reveal button after collapsing and restores on one click", async () => {
    vi.useFakeTimers();
    const wrapper = mount(WorkbenchShell, { props: defaultProps });
    try {
      await wrapper.get('[data-testid="workbench-header-hide"]').trigger("click");
      expect(localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY)).toBe("true");
      expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(false);
      const button = wrapper.get('[data-testid="workbench-header-show"]');
      expect(button.attributes("aria-label")).toBe("展开顶部栏");
      expect(button.attributes("aria-expanded")).toBe("false");
      await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseenter");
      await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseleave");
      await vi.advanceTimersByTimeAsync(5000);
      expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);
      await button.trigger("click");
      expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(true);
      expect(localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY)).toBe("false");
      expect(document.documentElement.style.getPropertyValue("--image-preview-top")).toBe("52px");
    } finally { wrapper.unmount(); vi.useRealTimers(); }
  });

  it("keeps the reveal control at the collapse control position", async () => {
    const wrapper = mount(WorkbenchShell, { props: defaultProps });
    vi.spyOn(wrapper.get(".workbench-main").element, "getBoundingClientRect").mockReturnValue({ right: 1200, top: 0 } as DOMRect);
    vi.spyOn(wrapper.get('[data-testid="workbench-header-hide"]').element, "getBoundingClientRect").mockReturnValue({ right: 1070, top: 10, width: 32 } as DOMRect);
    await wrapper.get('[data-testid="workbench-header-hide"]').trigger("click");
    const zone = wrapper.get('[data-testid="workbench-header-reveal-zone"]').element as HTMLElement;
    expect(zone.style.right).toBe("130px");
    expect(zone.style.top).toBe("10px");
    wrapper.unmount();
  });

  it("labels header controls in English", async () => {
    const wrapper = mount(WorkbenchShell, { props: { ...defaultProps, language: "en" } });
    expect(wrapper.get('[data-testid="workbench-header-hide"]').attributes("title")).toBe("Collapse top bar");
    await wrapper.get('[data-testid="workbench-header-hide"]').trigger("click");
    expect(wrapper.get('[data-testid="workbench-header-show"]').attributes("title")).toBe("Expand top bar");
    wrapper.unmount();
  });

  it("keeps the command header out of the very first render when it was hidden", () => {
    localStorage.setItem(WORKBENCH_HEADER_STORAGE_KEY, "true");

    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    // 首帧（mounted 钩子未跑、未等 nextTick）就不能渲染 header：此前先渲染再在
    // onMounted 里隐藏，200ms 离场过渡会在刷新时把导航栏画出来（闪现）。
    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
    expect(wrapper.get(".workbench-main").classes()).toContain("is-header-hidden");

    wrapper.unmount();
  });

  it("restores the persisted command header hidden state after remounting", async () => {
    vi.useFakeTimers();
    localStorage.setItem(WORKBENCH_HEADER_STORAGE_KEY, "true");

    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      slots: {
        actions: "<button data-testid='actions-slot' aria-label='设置'>settings</button>",
      },
    });
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="actions-slot"]').exists()).toBe(false);
    expect(wrapper.get(".workbench-main").classes()).toContain("is-header-hidden");
    expect(wrapper.find('[data-testid="workbench-header-reveal-zone"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("restores legacy command header hidden state after the project rename", async () => {
    vi.useFakeTimers();
    localStorage.setItem(LEGACY_WORKBENCH_HEADER_STORAGE_KEY, "true");

    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      slots: {
        actions: "<button data-testid='actions-slot' aria-label='设置'>settings</button>",
      },
    });
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(false);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("seeds golden-ratio default workbench column widths that match the on-screen zone split", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    const template = wrapper.get(".workbench-grid").attributes("style") ?? "";
    const columns = (template.match(/grid-template-columns:\s*([^;]+)/)?.[1] ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseFloat(value));

    // 黄金比例 φ：四区从左到右按 (1−0.618):0.618:0.618:1（= φ⁻²:φ⁻¹:φ⁻¹:1）分摊，
    // 归一化 ≈ 14.6%/23.6%/23.6%/38.2%。权重划分的是竖线到竖线的整段可见跨度
    // （1200px 网格 − jsdom 下 padding 0 + 3×14px gap 回退 = 内容宽 1158px）。
    expect(columns).toEqual([169, 273, 273, 442]);
    const phi = (1 + Math.sqrt(5)) / 2;
    expect(columns[1]).toBe(columns[2]);
    expect(columns[0] / 1158).toBeCloseTo((1 - 1 / phi) / (phi * phi), 2);
    expect(columns[1] / 1158).toBeCloseTo((1 / phi) / (phi * phi), 2);
    expect(columns[3] / 1158).toBeCloseTo(1 / (phi * phi), 2);
    expect(columns[1] / columns[0]).toBeCloseTo(phi, 1);
    expect(columns[3] / columns[1]).toBeCloseTo(phi, 1);

    wrapper.unmount();
  });

  it("coalesces drag moves per frame and saves only on release", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    let frameCallback: FrameRequestCallback | undefined;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 123;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const save = vi.spyOn(Storage.prototype, "setItem");
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    const grid = wrapper.get(".workbench-grid");
    const before = grid.attributes("style");
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 200 });
    wrapper.findAll(".workbench-resizer")[0].element.dispatchEvent(down);
    save.mockClear();
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 240 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 260 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 999 }));
    await nextTick();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(grid.attributes("style")).toBe(before);
    frameCallback!(0);
    await nextTick();
    expect(grid.attributes("style")).not.toBe(before);
    expect(save).not.toHaveBeenCalled();
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 280 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();
    expect(save).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(4);
    wrapper.unmount();
  });

  it("resizes adjacent workbench zones and syncs the image preview start edge", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    const grid = wrapper.get(".workbench-grid");
    const beforeTemplate = grid.attributes("style");
    expect(wrapper.findAll(".workbench-resizer")).toHaveLength(3);
    expect(beforeTemplate).toContain("grid-template-columns:");
    expect(document.documentElement.style.getPropertyValue("--image-preview-left")).toMatch(/px$/);

    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "clientX", { value: 200 });
    wrapper.findAll(".workbench-resizer")[0].element.dispatchEvent(pointerDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 280 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    const afterTemplate = grid.attributes("style");
    expect(afterTemplate).toContain("grid-template-columns:");
    expect(afterTemplate).not.toBe(beforeTemplate);
    expect(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY)).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue("--image-preview-left")).toMatch(/px$/);

    wrapper.unmount();
  });

  it("keeps shrinking a zone past its minimum into a collapsed title rail", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 169px 273px 273px 442px");
    expect(wrapper.get(".workbench-zone-tasks").classes()).not.toContain("workbench-zone-collapsed");

    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "clientX", { value: 900 });
    wrapper.findAll(".workbench-resizer")[2].element.dispatchEvent(pointerDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 640 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    // The task zone shrinks below its 100px minimum instead of clamping and
    // collapses to the 44px title rail — its golden default (273px) is narrower
    // than the 260px drag, so the leftover shrink spills into notes, and the
    // freed space flows to the neighboring workspace zone.
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 169px 243px 44px 702px");
    expect(wrapper.get(".workbench-zone-tasks").classes()).toContain("workbench-zone-collapsed");
    expect(wrapper.get(".workbench-zone-tasks .workbench-zone-rail").text()).toBe("✅ 提醒事项");
    expect(wrapper.findAll(".workbench-zone-notes .workbench-zone-rail")).toHaveLength(1);

    wrapper.unmount();
  });

  it("expands a collapsed zone back above its minimum to reveal its content", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    // Collapse the notes zone by dragging the assets/notes divider rightward.
    const collapseDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(collapseDown, "clientX", { value: 200 });
    wrapper.findAll(".workbench-resizer")[0].element.dispatchEvent(collapseDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 480 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();
    expect(wrapper.get(".workbench-zone-notes").classes()).toContain("workbench-zone-collapsed");

    // Drag the notes/tasks divider rightward to grow the notes zone back above
    // its 100px minimum; the collapsed rail hides and content reappears.
    const expandDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(expandDown, "clientX", { value: 500 });
    wrapper.findAll(".workbench-resizer")[1].element.dispatchEvent(expandDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 600 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    expect(wrapper.get(".workbench-zone-notes").classes()).not.toContain("workbench-zone-collapsed");

    wrapper.unmount();
  });

  it("expands a collapsed zone to its default width when its rail is clicked", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    // Collapse the tasks zone by dragging the tasks/workspace divider leftward.
    const collapseDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(collapseDown, "clientX", { value: 900 });
    wrapper.findAll(".workbench-resizer")[2].element.dispatchEvent(collapseDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 640 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();
    expect(wrapper.get(".workbench-zone-tasks").classes()).toContain("workbench-zone-collapsed");

    // Click the collapsed rail: tasks returns to its default width (~273px) and
    // content reappears, funded by shrinking the expanded neighbors.
    await wrapper.get(".workbench-zone-tasks .workbench-zone-rail").trigger("click");
    await nextTick();

    expect(wrapper.get(".workbench-zone-tasks").classes()).not.toContain("workbench-zone-collapsed");
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("273px");
    expect(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY)).not.toBeNull();

    wrapper.unmount();
  });

  it("restores resized workbench widths after the shell remounts", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    // Dragging the assets/notes divider rightward shrinks the notes zone below
    // its 100px minimum, collapsing it to the title rail.
    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "clientX", { value: 200 });
    wrapper.findAll(".workbench-resizer")[0].element.dispatchEvent(pointerDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 480 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    expect(wrapper.get(".workbench-zone-notes").classes()).toContain("workbench-zone-collapsed");
    const storedWidths = JSON.parse(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY) ?? "[]") as number[];
    expect(storedWidths).toHaveLength(4);
    expect(storedWidths[1]).toBeLessThan(100);
    wrapper.unmount();

    const restored = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    // The collapsed notes zone stays collapsed after remount (pinned to the rail
    // width) and the saved layout is reapplied from storage.
    expect(restored.get(".workbench-zone-notes").classes()).toContain("workbench-zone-collapsed");
    expect(restored.get(".workbench-grid").attributes("style")).toContain("grid-template-columns:");
    expect(document.documentElement.style.getPropertyValue("--image-preview-left")).toMatch(/px$/);

    restored.unmount();
  });

  it("restores legacy resized workbench widths after the project rename", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    // Legacy widths are always at or above the column minimums (the old shrink
    // logic clamped at the same minima), so use realistic >=min values.
    localStorage.setItem(LEGACY_WORKBENCH_WIDTH_STORAGE_KEY, JSON.stringify([180, 360, 340, 380]));
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    // 自定义宽度按「可见宽度的比例」等比拟合：180/360/340/380（和 1260）缩放到
    // 内容宽 1158 → 165/331/312/349，竖线到竖线的相对比例与保存时一致。
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 165px 331px 312px 349px");
    // No zone is collapsed because the legacy widths are all at/above their minima.
    expect(wrapper.find(".workbench-zone-collapsed").exists()).toBe(false);

    wrapper.unmount();
  });

  it("stores workbench widths per workspace and switches layouts independently", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: { ...defaultProps, workspaceId: "ws-a" },
    });
    await nextTick();
    await nextTick();

    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "clientX", { value: 200 });
    wrapper.findAll(".workbench-resizer")[0].element.dispatchEvent(pointerDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 400 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    // 拖动结果落在工作区自己的键上，旧的共享键不被写入。
    const storedA = localStorage.getItem(`${WORKBENCH_WIDTH_STORAGE_KEY}:ws-a`);
    expect(storedA).toBeTruthy();
    expect(JSON.parse(storedA ?? "[]")).toHaveLength(4);
    expect(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY)).toBeNull();
    wrapper.unmount();

    // 工作区 B 有自己独立的尺寸：挂载后应用 B 的布局，也不会碰 A 的键。
    localStorage.setItem(`${WORKBENCH_WIDTH_STORAGE_KEY}:ws-b`, JSON.stringify([180, 360, 340, 380]));
    const workspaceB = mount(WorkbenchShell, {
      attachTo: document.body,
      props: { ...defaultProps, workspaceId: "ws-b" },
    });
    await nextTick();
    await nextTick();

    // 与「旧共享键种子」用例相同的数值 → 相同的等比拟合结果，证明读取的是 B 自己的键。
    expect(workspaceB.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 165px 331px 312px 349px");
    expect(localStorage.getItem(`${WORKBENCH_WIDTH_STORAGE_KEY}:ws-a`)).toBe(storedA);

    // 在已挂载的壳上切换工作区 id：watcher 丢弃当前列宽并按 A 的存储尺寸重排。
    await workspaceB.setProps({ workspaceId: "ws-a" });
    await nextTick();
    await nextTick();
    const switchedColumns = workspaceB.get(".workbench-grid").attributes("style") ?? "";
    expect(switchedColumns).toContain("grid-template-columns:");
    expect(switchedColumns).not.toContain("165px 331px 312px 349px");
    workspaceB.unmount();
  });

  const mockWideGridMetrics = () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1600);
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("workbench-grid")) {
        return {
          x: 0,
          y: 52,
          left: 0,
          top: 52,
          right: 1200,
          bottom: 800,
          width: 1200,
          height: 748,
          toJSON: () => undefined,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
  };

  const readColumnTracks = (wrapper: ReturnType<typeof mount>) => {
    const style = wrapper.get(".workbench-grid").attributes("style") ?? "";
    const value = style.match(/grid-template-columns:\s*([^;]+)/)?.[1].trim();
    return value ? value.split(/\s+/) : [];
  };

  it("hides a zone entirely and redivides the width across the remaining zones", async () => {
    mockWideGridMetrics();
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: {
        ...defaultProps,
        zoneVisibility: { assets: true, notes: true, tasks: false, workspace: true },
      },
    });
    await nextTick();
    await nextTick();

    expect(wrapper.find(".workbench-zone-tasks").exists()).toBe(false);
    expect(wrapper.findAll(".workbench-zone")).toHaveLength(3);
    expect(wrapper.find(".workbench-zone-assets").exists()).toBe(true);
    expect(wrapper.find(".workbench-zone-notes").exists()).toBe(true);
    expect(wrapper.find(".workbench-zone-workspace").exists()).toBe(true);
    expect(wrapper.findAll(".workbench-resizer")).toHaveLength(2);
    expect(readColumnTracks(wrapper)).toHaveLength(3);

    wrapper.unmount();
  });

  it("widens the remaining zones when one is hidden versus all visible", async () => {
    mockWideGridMetrics();
    const allVisible = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();
    const allVisibleAssets = Number.parseFloat(readColumnTracks(allVisible)[0]);
    allVisible.unmount();

    mockWideGridMetrics();
    const hiddenTasks = mount(WorkbenchShell, {
      attachTo: document.body,
      props: {
        ...defaultProps,
        zoneVisibility: { assets: true, notes: true, tasks: false, workspace: true },
      },
    });
    await nextTick();
    await nextTick();
    const hiddenTasksAssets = Number.parseFloat(readColumnTracks(hiddenTasks)[0]);

    expect(hiddenTasksAssets).toBeGreaterThan(allVisibleAssets);

    hiddenTasks.unmount();
  });

  it("animates surviving column widths when zones are hidden and shown", async () => {
    mockWideGridMetrics();
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockReturnValue(0);
    const wrapper = mount(WorkbenchShell, { props: defaultProps });
    await nextTick(); await nextTick();
    const initial = Number.parseFloat(readColumnTracks(wrapper)[0]);
    await wrapper.setProps({ zoneVisibility: { assets: true, notes: true, tasks: false, workspace: true } });
    await nextTick(); await nextTick();
    expect(Number.parseFloat(readColumnTracks(wrapper)[0])).toBe(initial);
    frame!(120);
    await nextTick();
    const middle = Number.parseFloat(readColumnTracks(wrapper)[0]);
    expect(middle).toBeGreaterThan(initial);
    frame!(240);
    await nextTick();
    const expanded = Number.parseFloat(readColumnTracks(wrapper)[0]);
    expect(expanded).toBeGreaterThan(middle);
    await wrapper.setProps({ zoneVisibility: { assets: true, notes: true, tasks: true, workspace: true } });
    await nextTick(); await nextTick();
    expect(Number.parseFloat(readColumnTracks(wrapper)[0])).toBe(expanded);
    frame!(120);
    await nextTick();
    expect(Number.parseFloat(readColumnTracks(wrapper)[0])).toBeLessThan(expanded);
    await wrapper.setProps({ zoneVisibility: { assets: true, notes: false, tasks: true, workspace: true } });
    await nextTick(); await nextTick();
    expect(cancel).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("restores all four zones when a hidden zone becomes visible again", async () => {
    mockWideGridMetrics();
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: {
        ...defaultProps,
        zoneVisibility: { assets: true, notes: true, tasks: false, workspace: true },
      },
    });
    await nextTick();
    await nextTick();
    expect(wrapper.find(".workbench-zone-tasks").exists()).toBe(false);

    await wrapper.setProps({
      zoneVisibility: { assets: true, notes: true, tasks: true, workspace: true },
    });
    await nextTick();
    await nextTick();

    expect(wrapper.findAll(".workbench-zone")).toHaveLength(4);
    expect(wrapper.find(".workbench-zone-tasks").exists()).toBe(true);
    expect(wrapper.findAll(".workbench-resizer")).toHaveLength(3);
    expect(readColumnTracks(wrapper)).toHaveLength(4);

    wrapper.unmount();
  });

  it("keeps the image zone narrow when it is the only visible zone", async () => {
    mockWideGridMetrics();
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
      props: {
        ...defaultProps,
        zoneVisibility: { assets: true, notes: false, tasks: false, workspace: false },
      },
    });
    await nextTick();
    await nextTick();

    expect(wrapper.findAll(".workbench-zone")).toHaveLength(1);
    expect(wrapper.find(".workbench-zone-assets").exists()).toBe(true);
    // A trailing resizer sits on the right edge of the solo image zone so it can
    // be widened/narrowed against the empty area (there is no right neighbor).
    expect(wrapper.findAll(".workbench-resizer")).toHaveLength(1);

    const tracks = readColumnTracks(wrapper);
    expect(tracks).toHaveLength(1);
    const width = Number.parseFloat(tracks[0]);
    // ~15% of the 1200px grid (not stretched to the full ~1170px content width).
    expect(width).toBeGreaterThan(150);
    expect(width).toBeLessThan(200);

    // Dragging the trailing resizer widens the image zone...
    const resizer = wrapper.findAll(".workbench-resizer")[0];
    const widenDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(widenDown, "clientX", { value: 200 });
    resizer.element.dispatchEvent(widenDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 320 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();
    const widened = Number.parseFloat(readColumnTracks(wrapper)[0]);
    expect(widened).toBeGreaterThan(width);

    // ...and dragging it back narrows the zone again (down to the rail floor).
    const narrowDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(narrowDown, "clientX", { value: 200 });
    resizer.element.dispatchEvent(narrowDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 140 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();
    const narrowed = Number.parseFloat(readColumnTracks(wrapper)[0]);
    expect(narrowed).toBeLessThan(widened);
    expect(narrowed).toBeGreaterThan(44);

    wrapper.unmount();
  });

  it("keeps appearance controls exclusively in the settings slot", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      slots: { actions: '<button aria-label="设置">设置</button>' },
    });
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="设置"]').exists()).toBe(true);
    expect(wrapper.emitted("theme")).toBeUndefined();
  });
});
