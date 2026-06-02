import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchShell from "../components/WorkbenchShell.vue";

describe("WorkbenchShell", () => {
  it("renders rail, command bar, and four named work zones", () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        title: "今日工作台",
        saveStatusLabel: "已保存",
        theme: "light",
      },
      slots: {
        assets: "<div data-testid='assets-slot'>assets</div>",
        notes: "<div data-testid='notes-slot'>notes</div>",
        tasks: "<div data-testid='tasks-slot'>tasks</div>",
        workspace: "<div data-testid='workspace-slot'>workspace</div>",
        actions: "<button data-testid='actions-slot' aria-label='设置'>settings</button>",
      },
    });

    expect(wrapper.find('[aria-label="应用导航"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="workbench-command-bar"]').text()).toContain("今日工作台");
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
  });

  it("emits theme requests from the rail theme action", async () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        title: "今日工作台",
        saveStatusLabel: "已保存",
        theme: "dark",
      },
    });

    await wrapper.get('[data-testid="workbench-rail-theme"]').trigger("click");

    expect(wrapper.emitted("theme")).toHaveLength(1);
  });
});
