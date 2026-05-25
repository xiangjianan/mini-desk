import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SettingsMenu from "../components/SettingsMenu.vue";

const dropdownStub = {
  props: ["options"],
  emits: ["select"],
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
          :class="{ 'is-selected': Boolean(child.icon) }"
          :data-key="child.key"
          type="button"
          @click="$emit('select', child.key)"
        >
          {{ child.label }}
        </button>
      </template>
    </div>
  `,
};

describe("SettingsMenu", () => {
  it("adds a suggestion action that emits from the settings menu", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: false,
        companionGifTheme: "hermes",
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

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("提建议");

    await wrapper.find('[data-key="suggest"]').trigger("click");

    expect(wrapper.emitted("suggest")?.[0]).toEqual([expect.any(HTMLElement)]);
  });

  it("renders companion GIF theme choices and marks the current choice", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.18",
        updateAvailable: false,
        companionGifTheme: "none",
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
    expect(wrapper.find('[data-key="gif-theme:hermes"]').text()).toBe("默认 Hermes");
    expect(wrapper.find('[data-key="gif-theme:none"]').text()).toBe("无 GIF");
    expect(wrapper.find('[data-key="gif-theme:none"]').classes()).toContain("is-selected");
    expect(wrapper.find('[data-key="gif-theme:hermes"]').classes()).not.toContain("is-selected");
  });

  it("emits the selected companion GIF theme", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.18",
        updateAvailable: false,
        companionGifTheme: "hermes",
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

    await wrapper.find('[data-key="gif-theme:none"]').trigger("click");

    expect(wrapper.emitted("gifTheme")?.[0]).toEqual(["none", expect.any(HTMLElement)]);
  });
});
