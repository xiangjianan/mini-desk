import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SettingsMenu from "../components/SettingsMenu.vue";

const dropdownStub = defineComponent({
  props: ["options", "show"],
  emits: ["select", "update:show"],
  methods: {
    // Mirrors the visible-checkmark semantics: an option is "checked" when it has
    // an icon that isn't the transparent placeholder used to reserve icon space.
    isChecked(option: { icon?: () => unknown }) {
      if (typeof option.icon !== "function") return false;
      try {
        const vnode = option.icon() as { props?: { color?: string } } | null;
        return vnode?.props?.color !== "transparent";
      } catch {
        return true;
      }
    },
  },
  template: `
    <div>
      <slot />
      <template v-for="option in options" :key="option.key">
        <button
          class="dropdown-option"
          :data-key="option.key"
          :disabled="option.disabled"
          type="button"
          @click="!option.disabled && $emit('select', option.key)"
        >
          {{ typeof option.label === "function" ? option.key : option.label }}
        </button>
        <button
          v-for="child in option.children || []"
          :key="child.key"
          class="dropdown-option dropdown-child-option"
          :class="{ 'is-selected': isChecked(child) }"
          :data-key="child.key"
          type="button"
          @click="$emit('select', child.key)"
        >
          {{ child.label }}
        </button>
      </template>
    </div>
  `,
});

const uploadStub = defineComponent({
  name: "Upload",
  props: {
    accept: String,
    max: Number,
    defaultUpload: Boolean,
    showFileList: Boolean,
  },
  emits: ["update:file-list"],
  template: '<div class="upload-stub"><slot /></div>',
});

type VNodeLike = { type: unknown; props?: { class?: string }; children?: unknown };

// The version option's label is a render function returning a root span whose
// children hold the version text and (when updating) the badge vnode.
function findVersionBadge(wrapper: ReturnType<typeof mount>) {
  const dropdown = wrapper.findComponent(dropdownStub);
  const options = dropdown.props("options") as Array<{ key: string; label?: () => VNodeLike }>;
  const versionOption = options.find((option) => option.key === "version");
  const nodes = (versionOption?.label?.()?.children ?? []) as VNodeLike[];
  return nodes.find((node) => node?.props?.class === "settings-version-badge");
}

describe("SettingsMenu", () => {
  it("groups data actions under one icon menu", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.38",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });

    expect(wrapper.find('[data-key="data"]').text()).toBe("数据");
    expect(wrapper.findAll('[data-key="create-workspace"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-key="import"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-key="export-workspace"]')).toHaveLength(1);
    expect(wrapper.find('[data-key="clear-data"]').text()).toBe("清空数据");
    expect(wrapper.find('[data-key="create-workspace"]').classes()).toContain("dropdown-child-option");
    expect(wrapper.find('[data-key="import"]').classes()).toContain("dropdown-child-option");
    expect(wrapper.find('[data-key="export-workspace"]').classes()).toContain("dropdown-child-option");
    expect(wrapper.find('[data-key="clear-data"]').classes()).toContain("dropdown-child-option");

    await wrapper.find('[data-key="create-workspace"]').trigger("click");
    expect(wrapper.emitted("createWorkspace")).toHaveLength(1);

    await wrapper.find('[data-key="clear-data"]').trigger("click");

    expect(wrapper.emitted("clearData")?.[0]).toEqual([expect.any(HTMLElement)]);
  });

  it("keeps icons on the data menu, its child actions, and the promoted inbox entry", () => {
    const source = readFileSync(resolve(__dirname, "../components/SettingsMenu.vue"), "utf8");

    expect(source).toContain("ServerOutline");
    expect(source).toContain("TrashOutline");
    expect(source).toMatch(/key:\s*"data"[\s\S]*?icon:\s*renderIcon\(ServerOutline\)/);
    expect(source).toMatch(/key:\s*"create-workspace"[\s\S]*?icon:\s*renderIcon\(AddOutline\)/);
    expect(source).toMatch(/key:\s*"import"[\s\S]*?icon:\s*renderIcon\(CloudUploadOutline\)/);
    expect(source).toMatch(/key:\s*"export-workspace"[\s\S]*?icon:\s*renderIcon\(CloudDownloadOutline\)/);
    expect(source).toMatch(/key:\s*"clear-data"[\s\S]*?icon:\s*renderIcon\(TrashOutline,\s*true\)/);
    expect(source).toMatch(/key:\s*"pair-inbox"[\s\S]*?icon:\s*renderIcon\(PhonePortraitOutline\)/);
  });

  it("pairs a phone from the settings menu for the active workspace", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.38",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    // Top-level entry renamed 手机速记, promoted to the top of the settings menu.
    expect(wrapper.find('[data-key="pair-inbox"]').text()).toBe("手机速记");
    expect(wrapper.find('[data-key="pair-inbox"]').classes()).not.toContain("dropdown-child-option");
    const keys = wrapper.findAll(".dropdown-option").map((option) => option.attributes("data-key"));
    // 一级项新序：手机速记 → 数据 → 语言 → GIF 主题 → 快捷键 → 提建议 → 关于（子项不参与，index 单调）。
    const order = ["pair-inbox", "data", "language", "gif-theme", "shortcut-help", "suggest", "about"].map((key) => keys.indexOf(key));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    await wrapper.find('[data-key="pair-inbox"]').trigger("click");

    expect(wrapper.emitted("pairInbox")?.[0]).toEqual([expect.any(HTMLElement)]);
  });

  it("adds a suggestion action that emits from the settings menu", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("提建议");

    await wrapper.find('[data-key="suggest"]').trigger("click");

    expect(wrapper.emitted("suggest")?.[0]).toEqual([expect.any(HTMLElement)]);
  });

  it("点击版本号打开更新记录（无更新时也可点）", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });

    await wrapper.find('[data-key="version"]').trigger("click");

    expect(wrapper.emitted("changelog")).toHaveLength(1);
  });

  it("有更新时点击版本号也打开更新记录而非直接更新", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: true,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });

    await wrapper.find('[data-key="version"]').trigger("click");

    expect(wrapper.emitted("changelog")).toHaveLength(1);
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("有更新时版本号右侧显示「有更新」红色角标而非小红点", () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: true,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });

    const badge = findVersionBadge(wrapper);
    expect(badge?.children).toBe("有更新");

    const quiet = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });
    expect(findVersionBadge(quiet)).toBeUndefined();
  });

  it("英文下更新角标显示 New", () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: true,
        companionGifTheme: "hermes",
        language: "en",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });

    expect(findVersionBadge(wrapper)?.children).toBe("New");
  });

  it("shows help and shortcut copy from the settings menu", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.41",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    expect(wrapper.find('[data-key="shortcut-help"]').text()).toBe("帮助与快捷键");

    await wrapper.find('[data-key="shortcut-help"]').trigger("click");

    expect(wrapper.emitted("shortcutHelp")).toHaveLength(1);
  });

  it("renders companion GIF theme choices and marks the current choice", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.18",
        updateAvailable: false,
        companionGifTheme: "none",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    expect(wrapper.find('[data-key="gif-theme"]').text()).toBe("GIF 主题");
    expect(wrapper.findAll('[data-key^="gif-theme:"]').map((item) => item.attributes("data-key"))).toEqual([
      "gif-theme:cat",
      "gif-theme:hermes",
      "gif-theme:ikun",
      "gif-theme:custom",
      "gif-theme:none",
    ]);
    expect(wrapper.find('[data-key="gif-theme:cat"]').text()).toBe("像素猫");
    expect(wrapper.find('[data-key="gif-theme:hermes"]').text()).toBe("云霞");
    expect(wrapper.find('[data-key="gif-theme:ikun"]').text()).toBe("ikun");
    expect(wrapper.find('[data-key="gif-theme:custom"]').text()).toBe("自定义");
    expect(wrapper.find('[data-key="gif-theme:none"]').text()).toBe("不显示");
    expect(wrapper.find('[data-key="gif-theme:none"]').classes()).toContain("is-selected");
    expect(wrapper.find('[data-key="gif-theme:hermes"]').classes()).not.toContain("is-selected");
  });

  it("emits the selected companion GIF theme", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.18",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    await wrapper.find('[data-key="gif-theme:ikun"]').trigger("click");

    expect(wrapper.emitted("gifTheme")?.[0]).toEqual(["ikun", expect.any(HTMLElement)]);
  });

  it("opens the saved custom GIF dialog with previews while switching back to custom", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.38",
        updateAvailable: false,
        companionGifTheme: "hermes",
        hasCustomCompanionGif: true,
        customCompanionGif: {
          light: "data:image/gif;base64,light",
          dark: "data:image/gif;base64,dark",
        },
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    await wrapper.find('[data-key="gif-theme:custom"]').trigger("click");

    expect(wrapper.emitted("gifTheme")?.[0]).toEqual(["custom", expect.any(HTMLElement)]);
    expect(wrapper.find(".gif-theme-custom-dialog").exists()).toBe(true);
    expect(wrapper.findAll(".gif-theme-custom-preview img").map((img) => img.attributes("src"))).toEqual([
      "data:image/gif;base64,light",
      "data:image/gif;base64,dark",
    ]);
  });

  it("opens a custom GIF upload dialog and emits selected GIF files", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.19",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });
    const light = new File(["light"], "light.gif", { type: "image/gif" });
    const dark = new File(["dark"], "dark.gif", { type: "image/gif" });

    await wrapper.find('[data-key="gif-theme:custom"]').trigger("click");
    const uploads = wrapper.findAllComponents(uploadStub);
    expect(uploads).toHaveLength(2);
    expect(uploads[0].props("accept")).toBe("image/gif,.gif");
    expect(uploads[0].props("max")).toBe(1);
    expect(uploads[0].props("defaultUpload")).toBe(false);
    await uploads[0].vm.$emit("update:file-list", [{ file: light }]);
    await uploads[1].vm.$emit("update:file-list", [{ file: dark }]);
    await wrapper.get(".gif-theme-custom-confirm").trigger("click");

    expect(wrapper.emitted("customGif")?.[0]).toEqual([
      { light, dark },
      expect.any(HTMLElement),
    ]);
    expect(wrapper.find(".gif-theme-custom-dialog").exists()).toBe(false);
  });

  it("replaces the custom GIF preview immediately without showing upload filenames", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.19",
        updateAvailable: false,
        companionGifTheme: "hermes",
        customCompanionGif: {
          light: "data:image/gif;base64,old-light",
        },
        hasCustomCompanionGif: true,
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
          NUpload: uploadStub,
          Upload: uploadStub,
        },
      },
    });
    const light = new File(["new-light"], "new-light.gif", { type: "image/gif" });

    await wrapper.find('[data-key="gif-theme:custom"]').trigger("click");
    const uploads = wrapper.findAllComponents(uploadStub);
    expect(uploads[0].props("showFileList")).toBe(false);
    expect(uploads[1].props("showFileList")).toBe(false);

    await uploads[0].vm.$emit("update:file-list", [{ file: light }]);
    await wrapper.vm.$nextTick();

    const lightPreview = wrapper.findAll(".gif-theme-custom-preview img")[0];
    expect(lightPreview.attributes("src")).not.toBe("data:image/gif;base64,old-light");
    expect(lightPreview.attributes("src")).toMatch(/^blob:/);
  });

  it("renders a language switch and emits the selected language", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.25",
        updateAvailable: false,
        companionGifTheme: "ikun",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    expect(wrapper.find('[data-key="language"]').text()).toBe("Language");
    expect(wrapper.find('[data-key="language:zh"]').classes()).toContain("is-selected");
    expect(wrapper.find('[data-key="language:en"]').text()).toBe("English");

    await wrapper.find('[data-key="language:en"]').trigger("click");

    expect(wrapper.emitted("language")?.[0]).toEqual(["en", expect.any(HTMLElement)]);
  });

  it("uses a globe icon for the language menu group", () => {
    const source = readFileSync(resolve(__dirname, "../components/SettingsMenu.vue"), "utf8");

    expect(source).toContain("GlobeOutline");
    expect(source).toContain('key: "language"');
    expect(source).toMatch(/key:\s*"language"[\s\S]*?icon:\s*renderIcon\(GlobeOutline\)/);
  });

  it("uses Chinese as the language switch label while English is active", () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.25",
        updateAvailable: false,
        companionGifTheme: "ikun",
        language: "en",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    expect(wrapper.find('[data-key="language"]').text()).toBe("语言");
    expect(wrapper.find('[data-key="language:en"]').classes()).toContain("is-selected");
  });
});
