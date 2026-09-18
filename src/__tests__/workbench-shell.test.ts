import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import WorkbenchShell from "../components/WorkbenchShell.vue";

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const WORKBENCH_WIDTH_STORAGE_KEY = "mini-desk-workbench-widths";
const LEGACY_WORKBENCH_WIDTH_STORAGE_KEY = "todo-board-workbench-widths";
const WORKBENCH_HEADER_STORAGE_KEY = "mini-desk-workbench-header-hidden";
const LEGACY_WORKBENCH_HEADER_STORAGE_KEY = "todo-board-workbench-header-hidden";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  document.documentElement.style.removeProperty("--image-preview-left");
  document.documentElement.style.removeProperty("--image-preview-top");
  localStorage.clear();
});

describe("WorkbenchShell", () => {
  const defaultProps = {
    title: "Mini Desk",
    saveStatusLabel: "已保存",
    theme: "light" as const,
  };

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
    expect(wrapper.get('[data-testid="workbench-command-bar"]').text()).toContain("Mini Desk");
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
    expect(wrapper.find('[data-testid="workbench-theme"][aria-label="切换到深色"]').exists()).toBe(true);
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

    expect(wrapper.get(".workbench-title-group").text()).toContain("Mini Desk");
    expect(wrapper.get(".workbench-title-group").text()).toContain("已保存");
    expect(wrapper.get(".workbench-slogan").text()).toBe("Do less, do it well.");
  });

  it("renders the title fallback when no workspace-trigger slot is provided", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    expect(wrapper.get(".workbench-title-fallback").text()).toBe("Mini Desk");
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
    expect(source).toContain("remainingDelta");
  });

  it("does not render dead shell controls by default", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    expect(wrapper.find('button[aria-label="搜索或执行命令"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="设置"]').exists()).toBe(false);
    expect(wrapper.find(".workbench-rail").exists()).toBe(false);
    // Header actions: zone visibility + hide header + theme (settings comes via the actions slot).
    expect(wrapper.findAll(".workbench-command-actions button")).toHaveLength(3);
    expect(wrapper.get('[data-testid="zone-visibility-trigger"]').attributes("aria-label")).toBe("显示区域");
    expect(wrapper.get('[data-testid="workbench-header-hide"]').attributes("aria-label")).toBe("隐藏顶部菜单");
    expect(wrapper.get('[data-testid="workbench-theme"]').attributes("aria-label")).toBe("切换到深色");
  });

  it("hides the command header and restores it from a centered reveal control", async () => {
    vi.useFakeTimers();
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
      slots: {
        actions: "<button data-testid='actions-slot' aria-label='设置'>settings</button>",
      },
    });

    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="actions-slot"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);
    await nextTick();
    expect(document.documentElement.style.getPropertyValue("--image-preview-top")).toBe("52px");

    await wrapper.get('[data-testid="workbench-header-hide"]').trigger("click");
    await nextTick();

    expect(localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY)).toBe("true");
    expect(document.documentElement.style.getPropertyValue("--image-preview-top")).toBe("0px");
    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="actions-slot"]').exists()).toBe(false);
    expect(wrapper.get(".workbench-main").classes()).toContain("is-header-hidden");
    expect(wrapper.find('[data-testid="workbench-header-reveal-zone"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(199);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.get('[data-testid="workbench-header-show"]').attributes("aria-label")).toBe("显示顶部菜单");

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseenter");
    await nextTick();
    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseleave");
    await vi.advanceTimersByTimeAsync(149);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("click");
    await nextTick();
    expect(wrapper.get('[data-testid="workbench-header-show"]').attributes("aria-label")).toBe("显示顶部菜单");

    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseleave");
    await vi.advanceTimersByTimeAsync(150);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("click");
    await nextTick();
    expect(wrapper.get('[data-testid="workbench-header-show"]').attributes("aria-label")).toBe("显示顶部菜单");

    await wrapper.get('[data-testid="workbench-header-show"]').trigger("click");
    await nextTick();

    expect(localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY)).toBe("false");
    expect(document.documentElement.style.getPropertyValue("--image-preview-top")).toBe("52px");
    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="actions-slot"]').exists()).toBe(true);

    vi.useRealTimers();
  });

  it("keeps the delayed reveal control open when the pointer is already over it", async () => {
    vi.useFakeTimers();
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    await wrapper.get('[data-testid="workbench-header-hide"]').trigger("click", { clientX: 110, clientY: 10 });
    await nextTick();

    Object.defineProperty(wrapper.get('[data-testid="workbench-header-reveal-zone"]').element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 100,
        y: 0,
        left: 100,
        top: 0,
        right: 132,
        bottom: 32,
        width: 32,
        height: 32,
        toJSON: () => undefined,
      }),
    });

    await vi.advanceTimersByTimeAsync(200);
    await nextTick();
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_500);
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseleave", { clientX: 160, clientY: 40 });
    await vi.advanceTimersByTimeAsync(149);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    wrapper.unmount();
    vi.useRealTimers();
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

    await vi.advanceTimersByTimeAsync(100);
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

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

  it("seeds golden-ratio default workbench column widths with a 100px minimum per zone", async () => {
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

    // 黄金比例 φ：图片区固定 10% 窄轨，其余三区按 便签:提醒:工作区 = 1:1:φ
    // 分摊（份额 = 列宽 − 100px 最小列宽），总宽 1200px 时即 176/289/289/405。
    expect(columns).toEqual([176, 289, 289, 405]);
    const phi = (1 + Math.sqrt(5)) / 2;
    expect(columns[1]).toBe(columns[2]);
    expect((columns[3] - 100) / (columns[1] - 100)).toBeCloseTo(phi, 1);
    expect((columns[1] - 100) / (columns[0] - 100)).toBeCloseTo(0.9 / (0.1 * (2 + phi)), 1);

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

    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 176px 289px 289px 405px");
    expect(wrapper.get(".workbench-zone-tasks").classes()).not.toContain("workbench-zone-collapsed");

    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "clientX", { value: 900 });
    wrapper.findAll(".workbench-resizer")[2].element.dispatchEvent(pointerDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 640 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    // The task zone shrinks below its 100px minimum instead of clamping and
    // collapses to the 44px title rail — its golden default (289px) is narrower
    // than the 260px drag, so the leftover shrink spills into notes, and the
    // freed space flows to the neighboring workspace zone.
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 176px 273px 44px 665px");
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

    // Click the collapsed rail: tasks returns to its default width (~289px) and
    // content reappears, funded by shrinking the expanded neighbors.
    await wrapper.get(".workbench-zone-tasks .workbench-zone-rail").trigger("click");
    await nextTick();

    expect(wrapper.get(".workbench-zone-tasks").classes()).not.toContain("workbench-zone-collapsed");
    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("289px");
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

    expect(wrapper.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 171px 329px 312px 347px");
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
    expect(workspaceB.get(".workbench-grid").attributes("style")).toContain("grid-template-columns: 171px 329px 312px 347px");
    expect(localStorage.getItem(`${WORKBENCH_WIDTH_STORAGE_KEY}:ws-a`)).toBe(storedA);

    // 在已挂载的壳上切换工作区 id：watcher 丢弃当前列宽并按 A 的存储尺寸重排。
    await workspaceB.setProps({ workspaceId: "ws-a" });
    await nextTick();
    await nextTick();
    const switchedColumns = workspaceB.get(".workbench-grid").attributes("style") ?? "";
    expect(switchedColumns).toContain("grid-template-columns:");
    expect(switchedColumns).not.toContain("171px 329px 312px 347px");
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

  it("emits theme requests from the top command theme action", async () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        title: "Mini Desk",
        saveStatusLabel: "已保存",
        theme: "dark",
      },
    });

    await wrapper.get('[data-testid="workbench-theme"]').trigger("click");

    expect(wrapper.emitted("theme")).toHaveLength(1);
  });
});
