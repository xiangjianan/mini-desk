import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SpacePanel from "../components/SpacePanel.vue";
import TextPanel from "../components/TextPanel.vue";
import type { WorkspaceSpace } from "../types";

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
        :data-key="option.key"
        :disabled="option.disabled"
        type="button"
        @click="!option.disabled && $emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  `,
};

function mountSpacePanel(spaces: WorkspaceSpace[], activeSpaceId = spaces[0].id) {
  return mount(SpacePanel, {
    props: {
      spaces,
      activeSpaceId,
    },
    global: {
      stubs: {
        Dropdown: dropdownStub,
        NDropdown: dropdownStub,
      },
    },
  });
}

function ruleBodies(styles: string, selector: string): string[] {
  const bodies: string[] = [];
  const regex = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of styles.matchAll(regex)) {
    const selectors = match[1].split(",").map((part) => part.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies;
}

describe("SpacePanel", () => {
  it("renders tabs, switches spaces, and creates new spaces", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ]);

    expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["工作空间", "项目"]);

    await wrapper.findAll(".space-tab")[1].trigger("click");
    await wrapper.get(".space-add-button").trigger("click");

    expect(wrapper.emitted("activate")?.[0]).toEqual(["project"]);
    expect(wrapper.emitted("create")?.[0]).toEqual([]);
  });

  it("renames and updates the active space", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    wrapper.getComponent(TextPanel).vm.$emit("update", [{ text: "记录", indent: 0 }]);

    expect(wrapper.emitted("update")?.[0]).toEqual(["workspace", [{ text: "记录", indent: 0 }]]);
  });

  it("edits a space name from the tab double click", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    await wrapper.get(".space-tab").trigger("dblclick");
    await wrapper.get(".space-tab-edit-input").setValue("资料");
    await wrapper.get(".space-tab-edit-input").trigger("keydown.enter");

    expect(wrapper.emitted("rename")?.[0]).toEqual(["workspace", "资料"]);
  });

  it("starts editing a newly created active space name", async () => {
    const wrapper = mount(SpacePanel, {
      attachTo: document.body,
      props: {
        activeSpaceId: "new",
        editSpaceId: "new",
        spaces: [
          { id: "old", title: "旧空间", lines: [] },
          { id: "new", title: "新空间", lines: [] },
        ],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const input = wrapper.get(".space-tab-edit-input").element as HTMLInputElement;
    expect(input.value).toBe("新空间");
    expect(document.activeElement).toBe(input);
    wrapper.unmount();
  });

  it("emits editDone when Esc cancels editing requested by editSpaceId", async () => {
    const wrapper = mount(SpacePanel, {
      props: {
        activeSpaceId: "new",
        editSpaceId: "new",
        spaces: [
          { id: "old", title: "旧空间", lines: [] },
          { id: "new", title: "新空间", lines: [] },
        ],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await wrapper.get(".space-tab-edit-input").trigger("keydown.esc");

    expect(wrapper.emitted("editDone")?.[0]).toEqual(["new"]);
  });

  it("emits editDone without rename when blur commits an empty space name", async () => {
    const wrapper = mount(SpacePanel, {
      props: {
        activeSpaceId: "new",
        editSpaceId: "new",
        spaces: [
          { id: "old", title: "旧空间", lines: [] },
          { id: "new", title: "新空间", lines: [] },
        ],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await wrapper.get(".space-tab-edit-input").setValue("   ");
    await wrapper.get(".space-tab-edit-input").trigger("blur");

    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.emitted("editDone")?.[0]).toEqual(["new"]);
  });

  it("does not save a space name while Chinese IME composition is confirming", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    await wrapper.get(".space-tab").trigger("dblclick");
    await wrapper.get(".space-tab-edit-input").setValue("ziliao");
    await wrapper.get(".space-tab-edit-input").trigger("compositionstart");
    await wrapper.get(".space-tab-edit-input").trigger("keydown.enter", { isComposing: true, keyCode: 229 });

    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.find(".space-tab-edit-input").exists()).toBe(true);

    await wrapper.get(".space-tab-edit-input").trigger("compositionend");
    await wrapper.get(".space-tab-edit-input").trigger("keydown.enter");

    expect(wrapper.emitted("rename")?.[0]).toEqual(["workspace", "ziliao"]);
  });

  it("opens tab context actions for editing and deleting", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ], "project");

    await wrapper.findAll(".space-tab")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["重命名", "删除"]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除")?.trigger("click");

    expect(wrapper.emitted("delete")?.[0]).toEqual(["project"]);
  });

  it("prevents deleting the final remaining space from the tab context menu", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    await wrapper.get(".space-tab").trigger("contextmenu");

    expect(wrapper.get('[data-key="delete"]').attributes("disabled")).toBeDefined();

    await wrapper.get('[data-key="delete"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });

  it("does not repeat the active space title or show a permanent delete button above the editor", () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    expect(wrapper.find(".space-text-panel .panel-header").exists()).toBe(false);
    expect(wrapper.find(".space-delete-button").exists()).toBe(false);
  });

  it("emits tab reorder while keeping the add button fixed", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
      { id: "notes", title: "资料", lines: [] },
    ]);

    await wrapper.findAll(".space-tab")[0].trigger("dragstart");
    await wrapper.findAll(".space-tab")[2].trigger("drop");
    await wrapper.findAll(".space-tab")[0].trigger("dragend");

    expect(wrapper.emitted("reorder")?.[0]).toEqual(["workspace", "notes"]);
    expect(wrapper.find(".space-add-button").exists()).toBe(true);
  });

  it("animates workspace tab position changes while drag sorting", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ]);
    const source = readFileSync(resolve(__dirname, "../components/SpacePanel.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(source).toContain('name="space-reorder"');
    expect(source).toContain('class="space-tabs"');
    expect(source).toContain(':key="space.id"');
    expect(source).not.toContain(':key="`edit-${space.id}`"');
    expect(source).toContain('key="space-add"');
    expect(styles).toMatch(/\.space-reorder-move,[\s\S]*?\.space-reorder-enter-active,[\s\S]*?\.space-reorder-leave-active\s*\{[^}]*transform 0\.22s/s);

    await wrapper.findAll(".space-tab")[0].trigger("dragstart");
    expect(wrapper.findAll(".space-tab")[0].classes()).toContain("is-dragging");

    await wrapper.findAll(".space-tab")[0].trigger("dragend");
    expect(wrapper.findAll(".space-tab")[0].classes()).not.toContain("is-dragging");
    wrapper.unmount();
  });

  it("keeps a newly committed tab from flashing during the edit-to-label swap", () => {
    const source = readFileSync(resolve(__dirname, "../components/SpacePanel.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const shellRule = ruleBodies(styles, ".space-tab-edit-shell").join("\n");
    const measureRule = ruleBodies(styles, ".space-tab-edit-measure").join("\n");
    const inputRule = ruleBodies(styles, ".space-tab-edit-input").join("\n");

    expect(source).toContain("suppressTabCommitTransition");
    expect(source).toContain("is-committing-tab");
    expect(source).toContain("space-tab-edit-shell");
    expect(source).toContain("space-tab-edit-measure");
    expect(shellRule).toContain("flex: 0 0 var(--space-tab-edit-width, auto)");
    expect(shellRule).toContain("width: var(--space-tab-edit-width, auto)");
    expect(shellRule).toContain("min-width: 84px");
    expect(shellRule).toContain("max-width: 180px");
    expect(shellRule).toContain("display: grid");
    expect(measureRule).toContain("visibility: hidden");
    expect(measureRule).toContain("white-space: pre");
    expect(inputRule).toContain("position: absolute");
    expect(inputRule).toContain("inset: 0");
    expect(inputRule).toContain("box-sizing: border-box");
    expect(inputRule).toContain("width: 100%");
    expect(inputRule).toContain("min-width: 0");
    expect(inputRule).not.toContain("width: 84px");
    expect(inputRule).not.toContain("flex: 0 0 84px");
    expect(styles).toMatch(/\.space-tabs\.is-committing-tab > \.space-reorder-move,[\s\S]*?transition: none/s);
  });

  it("keeps the tab edit control sized from the original title while typing", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "一个很长的工作空间标签", lines: [] }]);

    await wrapper.get(".space-tab").trigger("dblclick");

    expect(wrapper.get(".space-tab-edit-measure").text()).toBe("一个很长的工作空间标签");
    expect(wrapper.get(".space-tab-edit-input").classes()).toContain("space-tab-edit-input");

    await wrapper.get(".space-tab-edit-input").setValue("一个更长的工作空间标签名称");

    expect(wrapper.get(".space-tab-edit-measure").text()).toBe("一个很长的工作空间标签");
    wrapper.unmount();
  });

  it("locks the edit shell to the clicked tab width before replacing the tab label", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getMockRect() {
      if (this instanceof HTMLElement && this.classList.contains("space-tab")) {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 137,
          bottom: 34,
          width: 137,
          height: 34,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "一个会被截断的工作空间标签", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ]);

    try {
      await wrapper.findAll(".space-tab")[0].trigger("dblclick");

      expect(wrapper.get(".space-tab-edit-shell").attributes("style") ?? "").toContain("--space-tab-edit-width: 137px");
    } finally {
      wrapper.unmount();
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("keeps workspace tab drags off the plain-text payload", async () => {
    const setData = vi.fn();
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ]);

    await wrapper.findAll(".space-tab")[0].trigger("dragstart", {
      dataTransfer: { effectAllowed: "", setData, setDragImage: vi.fn() },
    });

    expect(setData).not.toHaveBeenCalledWith("text/plain", "workspace");
    expect(setData).toHaveBeenCalledWith("application/x-space-id", "workspace");
  });

  it("translates mouse wheel movement into horizontal tab scrolling", async () => {
    const wrapper = mountSpacePanel(
      Array.from({ length: 8 }, (_, index) => ({
        id: `space-${index}`,
        title: `空间 ${index + 1}`,
        lines: [],
      })),
    );
    const tabs = wrapper.get(".space-tabs").element as HTMLElement;
    Object.defineProperty(tabs, "scrollWidth", { value: 900, configurable: true });
    Object.defineProperty(tabs, "clientWidth", { value: 240, configurable: true });
    tabs.scrollLeft = 0;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 72 });

    tabs.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(tabs.scrollLeft).toBe(72);
    wrapper.unmount();
  });

  it("translates mouse wheel movement from the tab scrollbar shell", async () => {
    const wrapper = mountSpacePanel(
      Array.from({ length: 8 }, (_, index) => ({
        id: `space-${index}`,
        title: `空间 ${index + 1}`,
        lines: [],
      })),
    );
    const tabs = wrapper.get(".space-tabs").element as HTMLElement;
    Object.defineProperty(tabs, "scrollWidth", { value: 900, configurable: true });
    Object.defineProperty(tabs, "clientWidth", { value: 240, configurable: true });
    tabs.scrollLeft = 0;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 48 });

    wrapper.get(".space-tabs-scrollbar").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(tabs.scrollLeft).toBe(48);
    wrapper.unmount();
  });

  it("translates vertical wheel movement into the Naive horizontal scrollbar container", async () => {
    const wrapper = mountSpacePanel(
      Array.from({ length: 8 }, (_, index) => ({
        id: `space-${index}`,
        title: `空间 ${index + 1}`,
        lines: [],
      })),
    );
    const container = wrapper.get(".space-tabs-scrollbar .n-scrollbar-container").element as HTMLElement;
    Object.defineProperty(container, "scrollWidth", { value: 900, configurable: true });
    Object.defineProperty(container, "clientWidth", { value: 240, configurable: true });
    container.scrollLeft = 0;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 64 });

    wrapper.get(".space-tabs-scrollbar").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(container.scrollLeft).toBe(64);
    wrapper.unmount();
  });

  it("does not reserve an empty horizontal scrollbar gutter for workspace tabs", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const workspaceTabsRule = styles.match(/\.workspace-panel \.space-tabs \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(workspaceTabsRule).toContain("overflow-x: auto");
    expect(workspaceTabsRule).not.toContain("overflow-x: scroll");
    expect(workspaceTabsRule).not.toContain("scrollbar-gutter: stable");
  });

  it("renders workspace tab labels with bold text", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const spaceTabRule = styles.match(/\.space-tab \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(spaceTabRule).toContain("font-weight: 600");
  });

  it("keeps active workspace tabs highlighted by background only", () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ], "project");
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const activeTabRule = styles.match(/\.space-tab\.is-active \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(wrapper.find(".space-tab-indicator").exists()).toBe(false);
    expect(activeTabRule).toContain("background: var(--button-hover)");
    expect(activeTabRule).not.toContain("box-shadow");
    expect(styles).not.toContain(".space-tab-indicator");
  });

  it("hides the workspace tab right border on hover", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const hoverRule = styles.match(/\.space-tab:hover \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(hoverRule).toContain("border-right-color: transparent");
  });
});
