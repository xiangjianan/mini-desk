import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SettingsMenu from "../components/SettingsMenu.vue";

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
        {{ typeof option.label === "function" ? option.key : option.label }}
      </button>
    </div>
  `,
};

describe("SettingsMenu", () => {
  it("adds a suggestion action that emits from the settings menu", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.11",
        updateAvailable: false,
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
});
