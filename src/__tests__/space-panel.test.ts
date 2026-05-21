import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SpacePanel from "../components/SpacePanel.vue";
import TextPanel from "../components/TextPanel.vue";
import type { WorkspaceSpace } from "../types";

const dropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: "<div><slot /></div>",
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

    wrapper.getComponent(TextPanel).vm.$emit("titleUpdate", "space-workspace-title", "资料");
    wrapper.getComponent(TextPanel).vm.$emit("update", [{ text: "记录", indent: 0 }]);

    expect(wrapper.emitted("rename")?.[0]).toEqual(["workspace", "资料"]);
    expect(wrapper.emitted("update")?.[0]).toEqual(["workspace", [{ text: "记录", indent: 0 }]]);
  });

  it("prevents deleting the final remaining space", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    expect(wrapper.get(".space-delete-button").attributes("disabled")).toBeDefined();

    await wrapper.get(".space-delete-button").trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });

  it("emits delete for non-final spaces", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ], "project");

    await wrapper.get(".space-delete-button").trigger("click");

    expect(wrapper.emitted("delete")?.[0]).toEqual(["project"]);
  });
});
