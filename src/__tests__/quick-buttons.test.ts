import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import QuickButtons from "../components/QuickButtons.vue";
import { buildVisibleQuickButtonGroups, formatQuickCopiedPreview, hasOverloadedVisibleQuickButtonGroup } from "../state/quickButtons";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

const checkboxStub = {
  props: ["checked"],
  emits: ["update:checked"],
  template: '<button class="checkbox-stub" type="button" :data-checked="checked ? \'true\' : \'false\'" @click="$emit(\'update:checked\', !checked)"><slot /></button>',
};

const inputStub = {
  props: ["value", "type"],
  emits: ["update:value"],
  template: `
    <textarea
      v-if="type === 'textarea'"
      v-bind="$attrs"
      :value="value"
      @input="$emit('update:value', $event.target.value)"
    />
    <input
      v-else
      v-bind="$attrs"
      :value="value"
      @input="$emit('update:value', $event.target.value)"
    />
  `,
};

const selectStub = {
  props: ["value", "options"],
  emits: ["update:value"],
  template: `
    <select
      v-bind="$attrs"
      :value="value"
      @change="$emit('update:value', $event.target.value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  `,
};

const modalStub = {
  props: ["show", "title"],
  template: '<section v-if="show" class="quick-dialog"><h2>{{ title }}</h2><slot /></section>',
};

const persistentModalStub = {
  props: ["show", "title"],
  template: '<section class="quick-dialog" :data-show="show ? \'true\' : \'false\'"><h2>{{ title }}</h2><slot /></section>',
};

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
        type="button"
        @click="$emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  `,
};

function mountQuickButtons(options: Partial<InstanceType<typeof QuickButtons>["$props"]> = {}) {
  return mount(QuickButtons, {
    props: {
      title: "快捷链接",
      buttons: [],
      showHidden: false,
      ...options,
    },
    global: {
      stubs: {
        Button: buttonStub,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        Icon: true,
        Input: inputStub,
        Modal: modalStub,
        Select: selectStub,
        NButton: buttonStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NIcon: true,
        NInput: inputStub,
        NModal: modalStub,
        NSelect: selectStub,
      },
    },
    attachTo: document.body,
  });
}

function mountQuickButtonsWithPersistentModal(options: Partial<InstanceType<typeof QuickButtons>["$props"]> = {}) {
  return mount(QuickButtons, {
    props: {
      title: "快捷链接",
      buttons: [],
      showHidden: false,
      ...options,
    },
    global: {
      stubs: {
        Button: buttonStub,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        Icon: true,
        Input: inputStub,
        Modal: persistentModalStub,
        Select: selectStub,
        NButton: buttonStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NIcon: true,
        NInput: inputStub,
        NModal: persistentModalStub,
        NSelect: selectStub,
      },
    },
    attachTo: document.body,
  });
}

async function openDialog(wrapper: ReturnType<typeof mountQuickButtons>) {
  await wrapper.get(".quick-menu-button").trigger("click");
  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "新增")?.trigger("click");
  await wrapper.vm.$nextTick();
}

function readSource(path: string): string {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

describe("QuickButtons", () => {
  it("builds visible quick button groups in tag order with untagged buttons last", () => {
    const tags = [
      { id: "tag-a", title: "标签 A" },
      { id: "tag-b", title: "标签 B" },
      { id: "tag-empty", title: "空标签" },
    ];
    const buttons = [
      { id: "hidden", title: "Hidden", value: "hidden", type: "text" as const, hidden: true, tagId: "tag-a" },
      { id: "b", title: "B1", value: "b", type: "text" as const, hidden: false, tagId: "tag-b" },
      { id: "other", title: "Other", value: "other", type: "text" as const, hidden: false },
      { id: "a", title: "A1", value: "a", type: "text" as const, hidden: false, tagId: "tag-a" },
      { id: "orphan", title: "Orphan", value: "orphan", type: "text" as const, hidden: false, tagId: "missing" },
    ];

    const groups = buildVisibleQuickButtonGroups(buttons, tags, false, "其他");

    expect(groups.map((group) => [group.id, group.title, group.reorderable, group.buttons.map((button) => button.id)])).toEqual([
      ["tag-a", "标签 A", true, ["a"]],
      ["tag-b", "标签 B", true, ["b"]],
      ["__other", "其他", false, ["other", "orphan"]],
    ]);
  });

  it("detects overloaded visible quick button groups while ignoring hidden buttons", () => {
    const tags = [{ id: "tag-a", title: "标签 A" }];
    const visibleButtons = Array.from({ length: 13 }, (_item, index) => ({
      id: `button-${index}`,
      title: `Button ${index}`,
      value: String(index),
      type: "text" as const,
      hidden: false,
      tagId: "tag-a",
    }));
    const hiddenButtons = Array.from({ length: 20 }, (_item, index) => ({
      id: `hidden-${index}`,
      title: `Hidden ${index}`,
      value: String(index),
      type: "text" as const,
      hidden: true,
      tagId: "tag-a",
    }));

    expect(hasOverloadedVisibleQuickButtonGroup([...visibleButtons, ...hiddenButtons], tags, 12)).toBe(true);
    expect(hasOverloadedVisibleQuickButtonGroup([...visibleButtons.slice(0, 12), ...hiddenButtons], tags, 12)).toBe(false);
  });

  it("groups visible quick buttons by tag order and keeps untagged buttons under other", () => {
    const wrapper = mountQuickButtons({
      tags: [
        { id: "tag-a", title: "标签 A" },
        { id: "tag-b", title: "标签 B" },
      ],
      buttons: [
        { id: "b", title: "B1", value: "b", type: "text", hidden: false, tagId: "tag-b" },
        { id: "other", title: "未分类", value: "other", type: "text", hidden: false },
        { id: "a", title: "A1", value: "a", type: "text", hidden: false, tagId: "tag-a" },
      ],
    });

    expect(wrapper.findAll(".quick-tag-title").map((item) => item.text())).toEqual(["标签 A", "标签 B", "其他"]);
    expect(wrapper.findAll(".quick-tag-group").map((group) => group.findAll(".quick-button").map((button) => button.text()))).toEqual([
      ["A1"],
      ["B1"],
      ["未分类"],
    ]);

    wrapper.unmount();
  });

  it("offers existing quick tags as single-select button choices", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-tools", title: "工具" }],
    });

    await openDialog(wrapper);
    expect(wrapper.find(".quick-tag-select").exists()).toBe(false);
    expect(wrapper.findAll(".quick-tag-choice").map((option) => option.text())).toEqual(["无标签", "工具"]);
    expect(wrapper.findAll(".quick-tag-choice").map((option) => option.attributes("aria-pressed"))).toEqual(["true", "false"]);

    await wrapper.findAll("input")[0].setValue("接口");
    await wrapper.findAll("input")[1].setValue("https://api.example.test");
    await wrapper.findAll(".quick-tag-choice").find((option) => option.text() === "工具")?.trigger("click");
    expect(wrapper.findAll(".quick-tag-choice").map((option) => option.attributes("aria-pressed"))).toEqual(["false", "true"]);
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "接口",
      tagTitle: "工具",
      value: "https://api.example.test",
      type: "link",
    });

    wrapper.unmount();
  });

  it("allows typing a new quick tag while keeping existing tag buttons single-select", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-tools", title: "工具" }],
    });

    await openDialog(wrapper);
    await wrapper.findAll("input")[0].setValue("资料入口");
    await wrapper.findAll("input")[1].setValue("https://docs.example.test");
    await wrapper.findAll(".quick-tag-choice").find((option) => option.text() === "工具")?.trigger("click");
    await wrapper.get(".quick-tag-new-inline-input").setValue("资料");

    expect(wrapper.findAll(".quick-tag-choice").map((option) => option.attributes("aria-pressed"))).toEqual(["false", "false"]);

    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "资料入口",
      tagTitle: "资料",
      value: "https://docs.example.test",
      type: "link",
    });

    wrapper.unmount();
  });

  it("keeps the tag manager layout from creating horizontal scrolling", () => {
    const styles = readSource("styles.css");

    expect(styles).toMatch(/\.quick-tag-manager\s*\{[^}]*overflow-x: hidden/s);
    expect(styles).toMatch(/\.quick-tag-manager-list\s*\{[^}]*overflow-x: hidden/s);
    expect(styles).toMatch(/\.quick-tag-manager-row\s*\{[^}]*min-width: 0/s);
    expect(styles).toMatch(/\.quick-tag-manager-body\s*\{[^}]*padding: 3px/s);
    expect(styles).toMatch(/\.quick-tag-add-row\s*\{[^}]*padding: 3px/s);
  });

  it("emits tag reorder when a quick tag heading is dropped on another tag", async () => {
    const wrapper = mountQuickButtons({
      tags: [
        { id: "tag-a", title: "标签 A" },
        { id: "tag-b", title: "标签 B" },
      ],
      buttons: [
        { id: "a", title: "A1", value: "a", type: "text", hidden: false, tagId: "tag-a" },
        { id: "b", title: "B1", value: "b", type: "text", hidden: false, tagId: "tag-b" },
      ],
    });

    await wrapper.findAll(".quick-tag-heading")[0].trigger("dragstart");
    await wrapper.findAll(".quick-tag-heading")[1].trigger("drop");

    expect(wrapper.emitted("reorderTag")?.[0]).toEqual(["tag-a", "tag-b"]);

    wrapper.unmount();
  });

  it("emits a tag move when a quick button is dropped on another tag heading", async () => {
    const wrapper = mountQuickButtons({
      tags: [
        { id: "tag-a", title: "标签 A" },
        { id: "tag-b", title: "标签 B" },
      ],
      buttons: [
        { id: "a", title: "A1", value: "a", type: "text", hidden: false, tagId: "tag-a" },
        { id: "b", title: "B1", value: "b", type: "text", hidden: false, tagId: "tag-b" },
      ],
    });

    await wrapper.findAll(".quick-button")[0].trigger("dragstart");
    await wrapper.findAll(".quick-tag-heading")[1].trigger("drop");

    expect(wrapper.emitted("moveToTag")?.[0]).toEqual(["a", "tag-b"]);

    wrapper.unmount();
  });

  it("emits a tag move when a quick button is dropped on another tag area", async () => {
    const wrapper = mountQuickButtons({
      tags: [
        { id: "tag-a", title: "标签 A" },
        { id: "tag-b", title: "标签 B" },
      ],
      buttons: [
        { id: "a", title: "A1", value: "a", type: "text", hidden: false, tagId: "tag-a" },
        { id: "b", title: "B1", value: "b", type: "text", hidden: false, tagId: "tag-b" },
      ],
    });

    await wrapper.findAll(".quick-button")[0].trigger("dragstart");
    await wrapper.findAll(".quick-tag-group")[1].trigger("drop");

    expect(wrapper.emitted("moveToTag")?.[0]).toEqual(["a", "tag-b"]);

    wrapper.unmount();
  });

  it("emits an untagged move when a quick button is dropped on the other tag area", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-a", title: "标签 A" }],
      buttons: [
        { id: "a", title: "A1", value: "a", type: "text", hidden: false, tagId: "tag-a" },
        { id: "other", title: "未分类", value: "other", type: "text", hidden: false },
      ],
    });

    await wrapper.findAll(".quick-button")[0].trigger("dragstart");
    await wrapper.findAll(".quick-tag-group")[1].trigger("drop");

    expect(wrapper.emitted("moveToTag")?.[0]).toEqual(["a", undefined]);

    wrapper.unmount();
  });

  it("accepts an external text/plain drop and creates a text quick button", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "a", title: "A", value: "a", type: "text", hidden: false }],
    });
    const dataTransfer = {
      types: ["text/plain"],
      files: [],
      getData: (type: string) => (type === "text/plain" ? "随便一段文字" : ""),
    };

    await wrapper.get(".quick-block").trigger("dragover", { dataTransfer });
    expect(wrapper.get(".quick-block").classes()).toContain("drag-hover");

    await wrapper.get(".quick-block").trigger("drop", { dataTransfer });

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "随便一段文字",
      value: "随便一段文字",
      type: "text",
    });

    wrapper.unmount();
  });

  it("accepts an external text/uri-list drop without text/plain (Windows drag scenario)", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "a", title: "A", value: "a", type: "text", hidden: false }],
    });
    const dataTransfer = {
      types: ["text/uri-list"],
      files: [],
      getData: (type: string) => (type === "text/uri-list" ? "https://example.com/page" : ""),
    };

    await wrapper.get(".quick-block").trigger("dragover", { dataTransfer });
    expect(wrapper.get(".quick-block").classes()).toContain("drag-hover");

    await wrapper.get(".quick-block").trigger("drop", { dataTransfer });

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "example.com",
      value: "https://example.com/page",
      type: "link",
    });

    wrapper.unmount();
  });

  it("creates a tagged quick button when external text is dropped on a tag group", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-work", title: "工作" }],
      buttons: [
        { id: "tagged", title: "T", value: "t", type: "text", hidden: false, tagId: "tag-work" },
        { id: "other", title: "未分类", value: "o", type: "text", hidden: false },
      ],
    });
    const dataTransfer = {
      types: ["text/uri-list"],
      files: [],
      getData: (type: string) => (type === "text/uri-list" ? "https://example.com/page" : ""),
    };

    await wrapper.findAll(".quick-tag-group")[0].trigger("drop", { dataTransfer });

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "example.com",
      value: "https://example.com/page",
      type: "link",
      tagTitle: "工作",
    });

    wrapper.unmount();
  });

  it("creates an untagged quick button when external text is dropped on the other group", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-work", title: "工作" }],
      buttons: [
        { id: "tagged", title: "T", value: "t", type: "text", hidden: false, tagId: "tag-work" },
        { id: "other", title: "未分类", value: "o", type: "text", hidden: false },
      ],
    });
    const dataTransfer = {
      types: ["text/plain"],
      files: [],
      getData: (type: string) => (type === "text/plain" ? "一段外部文字" : ""),
    };

    await wrapper.findAll(".quick-tag-group")[1].trigger("drop", { dataTransfer });

    const savePayload = wrapper.emitted("save")?.[0][0] as Record<string, unknown>;
    expect(savePayload).toMatchObject({ title: "一段外部文字", value: "一段外部文字", type: "text" });
    expect(savePayload.tagTitle).toBeUndefined();

    wrapper.unmount();
  });

  it("emits a declutter prompt when one quick tag has more than eight visible buttons", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-work", title: "工作" }],
      buttons: Array.from({ length: 9 }, (_, index) => ({
        id: `quick-${index}`,
        title: `按钮 ${index + 1}`,
        value: `https://example.com/${index}`,
        type: "link" as const,
        hidden: false,
        tagId: "tag-work",
      })),
    });

    await wrapper.get(".quick-block").trigger("click");

    expect(wrapper.emitted("declutter")?.[0]).toEqual([expect.any(HTMLElement)]);

    wrapper.unmount();
  });

  it("emits a declutter prompt when the other quick tag has more than eight visible buttons", async () => {
    const wrapper = mountQuickButtons({
      buttons: Array.from({ length: 9 }, (_, index) => ({
        id: `quick-${index}`,
        title: `按钮 ${index + 1}`,
        value: `https://example.com/${index}`,
        type: "link" as const,
        hidden: false,
      })),
    });

    await wrapper.get(".quick-block").trigger("click");

    expect(wrapper.emitted("declutter")?.[0]).toEqual([expect.any(HTMLElement)]);

    wrapper.unmount();
  });

  it("does not show a declutter prompt when more than twelve visible quick buttons are split across tags", async () => {
    const wrapper = mountQuickButtons({
      tags: [
        { id: "tag-a", title: "标签 A" },
        { id: "tag-b", title: "标签 B" },
      ],
      buttons: [
        ...Array.from({ length: 7 }, (_, index) => ({
          id: `a-${index}`,
          title: `A ${index + 1}`,
          value: `https://example.com/a/${index}`,
          type: "link" as const,
          hidden: false,
          tagId: "tag-a",
        })),
        ...Array.from({ length: 7 }, (_, index) => ({
          id: `b-${index}`,
          title: `B ${index + 1}`,
          value: `https://example.com/b/${index}`,
          type: "link" as const,
          hidden: false,
          tagId: "tag-b",
        })),
      ],
    });

    await wrapper.get(".quick-block").trigger("click");

    expect(wrapper.emitted("declutter")).toBeUndefined();
    expect(wrapper.emitted("guide")?.[0]).toEqual(["quickButtons", expect.any(HTMLElement)]);

    wrapper.unmount();
  });

  it("ignores hidden quick buttons when deciding whether to show the declutter prompt", async () => {
    const wrapper = mountQuickButtons({
      buttons: [
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `quick-${index}`,
          title: `按钮 ${index + 1}`,
          value: `https://example.com/${index}`,
          type: "link" as const,
          hidden: false,
        })),
        { id: "hidden", title: "隐藏", value: "https://example.com/hidden", type: "link" as const, hidden: true },
      ],
    });

    await wrapper.get(".quick-block").trigger("click");

    expect(wrapper.emitted("declutter")).toBeUndefined();

    wrapper.unmount();
  });

  it("keeps the add/edit dialog open when clicking outside the modal card", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });

  it("does not save a quick link when the title is empty", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll("input")[1].setValue("https://example.com");
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });

  it("does not save a quick link when the link text is empty", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll("input")[0].setValue("示例链接");
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });

  it("shows mutually exclusive link, text, and API type checkboxes with link selected by default", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);

    const options = wrapper.findAll(".checkbox-stub");
    expect(options.map((option) => option.text())).toEqual(["链接属性", "复制文本属性", "接口调用属性"]);
    expect(options[0].attributes("data-checked")).toBe("true");
    expect(options[1].attributes("data-checked")).toBe("false");
    expect(options[2].attributes("data-checked")).toBe("false");

    await options[1].trigger("click");
    await wrapper.vm.$nextTick();

    expect(options[0].attributes("data-checked")).toBe("false");
    expect(options[1].attributes("data-checked")).toBe("true");
    expect(options[2].attributes("data-checked")).toBe("false");

    wrapper.unmount();
  });

  it("collects multiple API headers as key-value pairs", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll(".checkbox-stub")[2].trigger("click");
    await wrapper.findAll("input")[0].setValue("创建用户");
    await wrapper.findAll("input")[1].setValue("https://api.example.test/users");
    await wrapper.get(".quick-api-method-select").setValue("POST");
    await wrapper.get(".quick-api-body-type-select").setValue("json");
    await wrapper.get(".quick-api-header-key").setValue("Authorization");
    await wrapper.get(".quick-api-header-value").setValue("Bearer test");
    await wrapper.get(".quick-api-add-header").trigger("click");
    await wrapper.findAll(".quick-api-header-key")[1].setValue("X-Trace-Id");
    await wrapper.findAll(".quick-api-header-value")[1].setValue("abc");
    await wrapper.get("textarea").setValue('{"name":"Kun"}');
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "创建用户",
      value: "https://api.example.test/users",
      type: "api",
      apiMethod: "POST",
      apiHeaders: [
        { key: "Authorization", value: "Bearer test" },
        { key: "X-Trace-Id", value: "abc" },
      ],
      apiBodyType: "json",
      apiBody: '{"name":"Kun"}',
    });

    wrapper.unmount();
  });

  it("uses a multiline editor for copy-text quick buttons", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll(".checkbox-stub")[1].trigger("click");
    await wrapper.findAll("input")[0].setValue("片段");
    await wrapper.get("textarea").setValue("第一行\n第二行");
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "片段",
      value: "第一行\n第二行",
      type: "text",
    });

    wrapper.unmount();
  });

  it("keeps edit actions mounted while the dialog closes after saving", async () => {
    const wrapper = mountQuickButtonsWithPersistentModal({
      buttons: [{ id: "a", title: "示例", value: "https://example.com", type: "link", hidden: false }],
    });

    await wrapper.get(".quick-button").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");
    expect(wrapper.find(".quick-dialog-cancel").exists()).toBe(true);

    await wrapper.get("form").trigger("submit.prevent");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({ id: "a", title: "示例" });
    expect(wrapper.get(".quick-dialog").attributes("data-show")).toBe("false");
    expect(wrapper.find(".quick-dialog-cancel").exists()).toBe(true);
    expect(wrapper.find(".quick-dialog-submit").exists()).toBe(true);

    wrapper.unmount();
  });

  it("opens the usage guide from the blank quick-button area context menu", async () => {
    const wrapper = mountQuickButtons();

    await wrapper.get(".quick-buttons").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["quickButtons", expect.any(HTMLElement), true]);
    wrapper.unmount();
  });

  it("offers tag management from the header and blank-area quick menus", async () => {
    const headerWrapper = mountQuickButtons();

    await headerWrapper.get(".quick-menu-button").trigger("click");
    expect(headerWrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("标签管理");
    headerWrapper.unmount();

    const areaWrapper = mountQuickButtons();

    await areaWrapper.get(".quick-buttons").trigger("contextmenu");
    expect(areaWrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("标签管理");
    areaWrapper.unmount();
  });

  it("opens tag management and emits add, edit, and delete tag actions", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-work", title: "工作" }],
    });

    await wrapper.get(".quick-menu-button").trigger("click");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "标签管理")?.trigger("click");

    expect(wrapper.get(".quick-tag-manager").text()).toContain("标签管理");

    await wrapper.get(".quick-tag-new-input").setValue("资料");
    await wrapper.get(".quick-tag-add").trigger("click");

    expect(wrapper.emitted("saveTag")?.[0]).toEqual([{ title: "资料" }]);

    await wrapper.get(".quick-tag-name-input").setValue("工作台");
    await wrapper.get(".quick-tag-name-input").trigger("blur");
    await wrapper.get(".quick-tag-delete").trigger("click");

    expect(wrapper.emitted("saveTag")?.[1]).toEqual([{ id: "tag-work", title: "工作台" }]);
    expect(wrapper.emitted("deleteTag")?.[0]).toEqual(["tag-work", expect.any(HTMLElement)]);

    expect(wrapper.find(".quick-tag-save").exists()).toBe(false);
    expect(wrapper.find(".quick-tag-manager .quick-dialog-action").exists()).toBe(false);

    wrapper.unmount();
  });

  it("renames a tag inline by double-clicking its heading", async () => {
    const wrapper = mountQuickButtons({
      tags: [{ id: "tag-work", title: "工作" }],
      buttons: [{ id: "b1", title: "Btn", value: "v", type: "link", tagId: "tag-work", hidden: false }],
    });

    await wrapper.get(".quick-tag-heading").trigger("dblclick");

    const input = wrapper.get(".quick-tag-title-input");
    await input.setValue("工作台");
    await input.trigger("blur");

    expect(wrapper.emitted("saveTag")?.[0]).toEqual([{ id: "tag-work", title: "工作台" }]);
    wrapper.unmount();
  });

  it("keeps an empty quick-button area visually blank without rendering an empty box", async () => {
    const wrapper = mountQuickButtons();

    expect(wrapper.find(".empty-hint").exists()).toBe(false);

    await wrapper.get(".quick-buttons").trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["quickButtons", expect.any(HTMLElement)]);
    expect(wrapper.find(".quick-dialog").exists()).toBe(false);
    wrapper.unmount();
  });

  it("opens the title edit menu from any blank point in the header bar", async () => {
    const wrapper = mountQuickButtons();

    await wrapper.get(".panel-header").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["重命名"]);

    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.find(".title-edit-input").exists()).toBe(true);
    wrapper.unmount();
  });

  it("moves add and hidden visibility actions into a compact area menu", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "hidden-1", title: "隐藏项", value: "value", type: "text", hidden: true }],
      showHidden: false,
    });

    expect(wrapper.find('[aria-label="新增快捷链接"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="显示全部快捷链接"]').exists()).toBe(false);

    await wrapper.get(".quick-menu-button").trigger("click");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "新增",
      "显示隐藏项",
      "标签管理",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "显示隐藏项")?.trigger("click");
    expect(wrapper.emitted("toggleShowHidden")).toHaveLength(1);

    await wrapper.setProps({ showHidden: true });
    await wrapper.get(".quick-menu-button").trigger("click");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "新增",
      "收起隐藏项",
      "标签管理",
      "Tips",
    ]);

    wrapper.unmount();
  });

  it("uses compact quick-button context menu labels without a copy action", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "quick-1", title: "片段", value: "第一行\n第二行", type: "text", hidden: false }],
    });

    await wrapper.get(".quick-button").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "编辑",
      "隐藏",
      "删除",
      "Tips",
    ]);

    expect(wrapper.findAll(".dropdown-option").some((option) => option.text() === "复制")).toBe(false);

    wrapper.unmount();
  });

  it("emits delete from the quick-button context menu", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "quick-1", title: "片段", value: "第一行\n第二行", type: "text", hidden: false }],
    });

    await wrapper.get(".quick-button").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除")?.trigger("click");

    expect(wrapper.emitted("delete")?.[0]).toEqual(["quick-1", expect.any(HTMLElement)]);

    wrapper.unmount();
  });

  it("shows cancel instead of delete in the edit dialog", async () => {
    const wrapper = mountQuickButtons({
      title: "快捷按钮",
      showHidden: true,
      buttons: [{ id: "a", title: "链接", value: "https://example.com", type: "link", hidden: false }],
    });

    await wrapper.get(".quick-button").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");

    expect(wrapper.text()).toContain("取消");
    expect(wrapper.text()).not.toContain("删除");
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    await wrapper.findAll("button").find((button) => button.text() === "取消")?.trigger("click");

    expect(wrapper.find(".quick-dialog").exists()).toBe(false);
    expect(wrapper.emitted("delete")).toBeUndefined();

    wrapper.unmount();
  });

  it("animates quick-button position changes while drag sorting", async () => {
    const wrapper = mountQuickButtons({
      buttons: [
        { id: "a", title: "A", value: "a", type: "text", hidden: false },
        { id: "b", title: "B", value: "b", type: "text", hidden: false },
      ],
    });
    const source = readSource("components/QuickButtons.vue");
    const styles = readSource("styles.css");

    expect(source).toContain(':css="false"');
    expect(source).toContain('onQuickBeforeMove');
    expect(styles).toMatch(/\.quick-block\s*\{[^}]*display: flex/s);
    expect(styles).toMatch(/\.quick-block\s*\{[^}]*overflow: hidden/s);
    expect(styles).toMatch(/\.quick-buttons\s*\{[^}]*padding: 10px 10px 18px/s);
    expect(styles).toMatch(/\.quick-button\.is-dragging\s*\{[^}]*opacity: 0\.45/s);

    await wrapper.findAll(".quick-button")[0].trigger("dragstart");
    expect(wrapper.findAll(".quick-button")[0].classes()).toContain("is-dragging");

    await wrapper.findAll(".quick-button")[1].trigger("drop");
    expect(wrapper.emitted("reorder")?.[0]).toEqual(["a", "b"]);

    await wrapper.findAll(".quick-button")[0].trigger("dragend");
    expect(wrapper.findAll(".quick-button")[0].classes()).not.toContain("is-dragging");
    wrapper.unmount();
  });
});

describe("formatQuickCopiedPreview", () => {
  it("collapses whitespace and trims the copied text", () => {
    expect(formatQuickCopiedPreview("  hello   world  ")).toBe("hello world");
  });

  it("returns short text unchanged aside from trimming", () => {
    expect(formatQuickCopiedPreview("已复制内容")).toBe("已复制内容");
  });

  it("truncates long text with an ellipsis", () => {
    const long = "a".repeat(200);
    const preview = formatQuickCopiedPreview(long);
    expect(preview.length).toBeLessThan(long.length);
    expect(preview.endsWith("…")).toBe(true);
  });
});
