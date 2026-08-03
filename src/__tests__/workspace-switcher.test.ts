import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.vue";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";

const workspaces: WorkspaceData[] = [
  { ...defaultWorkspace("a"), customTitles: { "board-title": "主空间", "board-slogan": "S1" } },
  { ...defaultWorkspace("b"), customTitles: { "board-title": "副空间" } },
];

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
    await wrapper.find('[data-testid="workspace-delete-b"]').trigger("click");
    const deleteEvents = wrapper.emitted("delete");
    expect(deleteEvents?.[0]?.[0]).toBe("b");
    wrapper.unmount();
  });

  it("点击重命名 emit rename", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-rename-b"]').trigger("click");
    const renameEvents = wrapper.emitted("rename");
    // workspace b carries board-title "副空间" and no slogan.
    expect(renameEvents?.[0]).toEqual(["b", "副空间", ""]);
    wrapper.unmount();
  });
});
