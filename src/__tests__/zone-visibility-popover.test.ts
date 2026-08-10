import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ZoneVisibilityPopover from "../components/ZoneVisibilityPopover.vue";
import type { ZoneVisibility } from "../types";

const allVisible: ZoneVisibility = { assets: true, notes: true, tasks: true, workspace: true };

// Shallow mount stubs NPopover (whose real implementation lazily renders content
// only when opened) while still rendering its default slot, so the zone options
// are queryable. The real "stays open on toggle" behavior lives in NPopover's
// own click handling; here we verify the emitted contract and structure.
function mountPopover(visibility: ZoneVisibility, language: "zh" | "en" = "zh") {
  return mount(ZoneVisibilityPopover, {
    props: { visibility, language },
    shallow: true,
    global: { renderStubDefaultSlot: true },
  });
}

describe("ZoneVisibilityPopover", () => {
  it("wires an ellipsis trigger button labeled with the zone-visibility title", () => {
    const source = readFileSync(resolve(__dirname, "../components/ZoneVisibilityPopover.vue"), "utf8");

    expect(source).toContain('data-testid="zone-visibility-trigger"');
    expect(source).toContain("GridOutline");
    expect(source).toContain(':aria-label="text.zoneVisibility.title"');
  });

  it("renders four localized zone options", () => {
    const wrapper = mountPopover(allVisible, "zh");

    expect(wrapper.findAll(".zone-visibility-option").map((option) => option.text())).toEqual([
      "图片",
      "快捷动作",
      "提醒事项",
      "便签",
    ]);
  });

  it("renders English labels", () => {
    const wrapper = mountPopover(allVisible, "en");

    expect(wrapper.findAll(".zone-visibility-option").map((option) => option.text())).toEqual([
      "Images",
      "Quick actions",
      "Reminders",
      "Sticky notes",
    ]);
  });

  it("marks only the visible zones as checked", () => {
    const wrapper = mountPopover({ assets: true, notes: true, tasks: false, workspace: true }, "zh");

    const tasks = wrapper.get('[data-testid="zone-option-tasks"]');
    expect(tasks.classes()).not.toContain("is-checked");
    expect(tasks.attributes("aria-pressed")).toBe("false");
    for (const zone of ["assets", "notes", "workspace"] as const) {
      const option = wrapper.get(`[data-testid="zone-option-${zone}"]`);
      expect(option.classes()).toContain("is-checked");
      expect(option.attributes("aria-pressed")).toBe("true");
    }
  });

  it("keeps a fixed-width check slot for every zone whether checked or not", () => {
    // When nothing is checked the check column must still occupy its width so
    // the labels never jump left.
    const wrapper = mountPopover({ assets: false, notes: false, tasks: false, workspace: false }, "zh");

    expect(wrapper.findAll(".zone-visibility-check")).toHaveLength(4);
  });

  it("emits toggle with the zone key when an option is clicked", async () => {
    const wrapper = mountPopover(allVisible, "zh");

    await wrapper.get('[data-testid="zone-option-tasks"]').trigger("click");

    expect(wrapper.emitted("toggle")?.[0]).toEqual(["tasks"]);
  });

  it("allows toggling multiple zones while the popover content stays mounted", async () => {
    const wrapper = mountPopover(allVisible, "zh");

    await wrapper.get('[data-testid="zone-option-assets"]').trigger("click");
    await wrapper.get('[data-testid="zone-option-notes"]').trigger("click");

    const toggles = wrapper.emitted("toggle");
    expect(toggles?.[0]).toEqual(["assets"]);
    expect(toggles?.[1]).toEqual(["notes"]);
    expect(wrapper.findAll('[data-testid^="zone-option-"]')).toHaveLength(4);
  });
});
