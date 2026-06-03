import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import WorkbenchShell from "../components/WorkbenchShell.vue";

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const WORKBENCH_WIDTH_STORAGE_KEY = "todo-board-workbench-widths";
const WORKBENCH_HEADER_STORAGE_KEY = "todo-board-workbench-header-hidden";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  document.documentElement.style.removeProperty("--image-preview-left");
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
    expect(wrapper.find('[aria-label="素材"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="笔记与快捷动作"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="任务流"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="工作区与工具"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="assets-slot"]').text()).toBe("assets");
    expect(wrapper.get('[data-testid="notes-slot"]').text()).toBe("notes");
    expect(wrapper.get('[data-testid="tasks-slot"]').text()).toBe("tasks");
    expect(wrapper.get('[data-testid="workspace-slot"]').text()).toBe("workspace");
    expect(wrapper.get('[data-testid="actions-slot"]').text()).toBe("settings");
    expect(wrapper.find('[data-testid="workbench-theme"][aria-label="切换到深色"]').exists()).toBe(true);
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

  it("keeps the tool zone minimum width at 320px and fits columns without oscillating", () => {
    const source = readFileSync(resolve(__dirname, "../components/WorkbenchShell.vue"), "utf8");

    expect(source).toContain("const MIN_COLUMN_WIDTHS = [160, 320, 320, 320] as const");
    expect(source).toContain("fitColumnsToWidth");
    expect(source).toContain("remainingDelta");
  });

  it("does not render dead shell controls by default", () => {
    const wrapper = mount(WorkbenchShell, {
      props: defaultProps,
    });

    expect(wrapper.find('button[aria-label="搜索或执行命令"]').exists()).toBe(false);
    expect(wrapper.find(".workbench-command-button").exists()).toBe(false);
    expect(wrapper.find('button[aria-label="设置"]').exists()).toBe(false);
    expect(wrapper.find(".workbench-rail").exists()).toBe(false);
    expect(wrapper.findAll(".workbench-command-actions button")).toHaveLength(2);
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

    await wrapper.get('[data-testid="workbench-header-hide"]').trigger("click");
    await nextTick();

    expect(localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY)).toBe("true");
    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="actions-slot"]').exists()).toBe(false);
    expect(wrapper.get(".workbench-main").classes()).toContain("is-header-hidden");
    expect(wrapper.find('[data-testid="workbench-header-reveal-zone"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="workbench-header-show"]').attributes("aria-label")).toBe("显示顶部菜单");

    await vi.advanceTimersByTimeAsync(1_999);
    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    await wrapper.get('[data-testid="workbench-header-reveal-zone"]').trigger("mouseenter");
    await nextTick();

    expect(wrapper.get('[data-testid="workbench-header-show"]').attributes("aria-label")).toBe("显示顶部菜单");

    await wrapper.get('[data-testid="workbench-header-show"]').trigger("click");
    await nextTick();

    expect(localStorage.getItem(WORKBENCH_HEADER_STORAGE_KEY)).toBe("false");
    expect(wrapper.find('[data-testid="workbench-command-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="actions-slot"]').exists()).toBe(true);

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

    await vi.advanceTimersByTimeAsync(2_000);
    await nextTick();

    expect(wrapper.find('[data-testid="workbench-header-show"]').exists()).toBe(false);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("uses the compact initial desktop workbench column widths with a 320px tool zone", async () => {
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
    expect(grid.attributes("style")).toContain("grid-template-columns: 166px 328px 333px 331px");

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

    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "clientX", { value: 200 });
    wrapper.findAll(".workbench-resizer")[0].element.dispatchEvent(pointerDown);
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 280 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await nextTick();

    const savedTemplate = wrapper.get(".workbench-grid").attributes("style");
    const storedWidths = JSON.parse(localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY) ?? "[]") as number[];
    expect(storedWidths).toHaveLength(4);
    wrapper.unmount();

    const restored = mount(WorkbenchShell, {
      attachTo: document.body,
      props: defaultProps,
    });
    await nextTick();
    await nextTick();

    expect(restored.get(".workbench-grid").attributes("style")).toBe(savedTemplate);
    expect(document.documentElement.style.getPropertyValue("--image-preview-left")).toMatch(/px$/);

    restored.unmount();
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
