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

  it("提交新建表单时 emit create", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-create-button"]').trigger("click");
    const titleInput = wrapper.find('[data-testid="workspace-title-input"]');
    const sloganInput = wrapper.find('[data-testid="workspace-slogan-input"]');
    await titleInput.setValue("新空间");
    await sloganInput.setValue("冲");
    await wrapper.find('[data-testid="workspace-create-confirm"]').trigger("click");
    expect(wrapper.emitted("create")).toEqual([["新空间", "冲"]]);
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
