import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.vue";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";

const workspaces: WorkspaceData[] = [
  { ...defaultWorkspace("a"), customTitles: { "board-title": "主空间", "board-slogan": "S1" } },
  { ...defaultWorkspace("b"), customTitles: { "board-title": "副空间" } },
];

// The kebab ("⋯") menu teleports to <body> via NPopover, so menu items must be
// found through the document rather than the component subtree.
function menuAction(id: string, action: "export" | "pair" | "rename" | "delete"): HTMLElement {
  const item = document.body.querySelector<HTMLElement>(`[data-testid="workspace-${action}-${id}"]`);
  if (!item) throw new Error(`Menu action not found: workspace-${action}-${id}`);
  return item;
}

async function openWorkspaceMenu(wrapper: VueWrapper, id: string): Promise<void> {
  await wrapper.find(`[data-testid="workspace-menu-${id}"]`).trigger("click");
  await nextTick();
}

async function clickMenuAction(wrapper: VueWrapper, id: string, action: "export" | "pair" | "rename" | "delete"): Promise<void> {
  await openWorkspaceMenu(wrapper, id);
  menuAction(id, action).click();
  await nextTick();
}

describe("WorkspaceSwitcher", () => {
  it("渲染当前工作空间标题作为触发按钮", () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    expect(wrapper.text()).toContain("主空间");
  });

  it("点击触发后展开列表并切换空间", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-option-b"]').trigger("click");
    expect(wrapper.emitted("switch")).toEqual([["b"]]);
  });

  it("点击空白区域收起下拉框（outside click 关闭）", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    const trigger = wrapper.find('[data-testid="workspace-trigger"]');
    await trigger.trigger("click");
    await nextTick(); // outside-click guard attaches on nextTick after open
    expect(trigger.attributes("aria-expanded")).toBe("true");
    // Simulate a click on blank board area (document.body) that bubbles to document.
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(trigger.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  it("点击调用了 stopPropagation 的空白区域仍收起下拉框（capture 阶段兜底）", async () => {
    // Several board panels (todo list blank space, context menus, drop targets)
    // call event.stopPropagation() on click. A bubble-phase document listener
    // never sees those clicks, so the dropdown stayed open. The guard must run
    // in the capture phase to close reliably regardless of such handlers.
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    const trigger = wrapper.find('[data-testid="workspace-trigger"]');
    await trigger.trigger("click");
    await nextTick();
    const blocker = document.createElement("div");
    blocker.addEventListener("click", (event) => event.stopPropagation());
    document.body.append(blocker);
    blocker.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(trigger.attributes("aria-expanded")).toBe("false");
    blocker.remove();
    wrapper.unmount();
  });

  it("再次点击触发按钮收起下拉框（一展开一收起）", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    const trigger = wrapper.find('[data-testid="workspace-trigger"]');
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find('[data-testid="workspace-option-b"]').exists()).toBe(true);
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  it("点击新建按钮 emit create", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-create-button"]').trigger("click");
    expect(wrapper.emitted("create")).toHaveLength(1);
  });

  it("点击导入按钮 emit import（带 anchor）", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-import-button"]').trigger("click");
    const importEvents = wrapper.emitted("import");
    expect(importEvents).toHaveLength(1);
    expect(importEvents?.[0]?.[0]).toBeInstanceOf(HTMLElement);
    wrapper.unmount();
  });

  it("点击删除 emit delete", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await clickMenuAction(wrapper, "b", "delete");
    const deleteEvents = wrapper.emitted("delete");
    expect(deleteEvents?.[0]?.[0]).toBe("b");
    wrapper.unmount();
  });

  it("仅有一个工作空间时仍渲染红色删除按钮（三按钮齐全）", async () => {
    const single: WorkspaceData[] = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "主空间", "board-slogan": "S1" } },
    ];
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces: single, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await openWorkspaceMenu(wrapper, "a");
    const deleteButton = menuAction("a", "delete");
    expect(deleteButton).toBeTruthy();
    expect(deleteButton.classList).toContain("is-delete");
    wrapper.unmount();
  });

  it("点击重命名 emit rename", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await clickMenuAction(wrapper, "b", "rename");
    const renameEvents = wrapper.emitted("rename");
    // workspace b carries board-title "副空间" and no slogan.
    expect(renameEvents?.[0]).toEqual(["b", "副空间", ""]);
    wrapper.unmount();
  });

  it("无自定义标题或标题全空白时回退默认标题 Mini Desk", async () => {
    const plain: WorkspaceData[] = [
      defaultWorkspace("a"),
      { ...defaultWorkspace("b"), customTitles: { "board-title": "   " } },
    ];
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces: plain, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    // workspace a has no custom board-title: the trigger falls back to the default.
    expect(wrapper.get(".workspace-trigger-title").text()).toBe("Mini Desk");
    // workspace b has a whitespace-only title: the dropdown entry falls back too.
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    expect(wrapper.get('[data-testid="workspace-option-b"] .workspace-switcher-name').text().trim()).toBe("Mini Desk");
    wrapper.unmount();
  });
});

describe("WorkspaceSwitcher 配对入口", () => {
  it("每个工作区提供配对手机按钮并 emit pairInbox", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await clickMenuAction(wrapper, "a", "pair");
    expect(wrapper.emitted("pairInbox")).toHaveLength(1);
    expect(wrapper.emitted("pairInbox")?.[0]).toEqual(["a"]);
    wrapper.unmount();
  });
});
