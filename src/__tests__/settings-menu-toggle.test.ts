import { mount } from "@vue/test-utils";
import { NDropdown } from "naive-ui";
import { expect, it } from "vitest";
import SettingsMenu from "../components/SettingsMenu.vue";

it("closes settings on a second click without a persistent library focus background", async () => {
  const wrapper = mount(SettingsMenu, {
    props: { appVersion: "1.0.0", updateAvailable: false, companionGifTheme: "cat" },
  });
  try {
    const button = wrapper.get(".settings-btn");
    const dropdown = wrapper.findAllComponents(NDropdown).at(-1)!;
    expect(button.element.tagName).toBe("BUTTON");
    expect(button.classes()).not.toContain("n-button");
    await button.trigger("click");
    expect(dropdown.props("show")).toBe(true);
    await button.trigger("click");
    expect(dropdown.props("show")).toBe(false);
    expect(button.classes()).not.toContain("n-button--focus");
  } finally {
    wrapper.unmount();
  }
});
