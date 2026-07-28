import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import HighlightText from "../components/HighlightText.vue";

describe("HighlightText", () => {
  it("renders plain text with no mark when query is empty", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "" } });
    expect(wrapper.text()).toBe("GitHub");
    expect(wrapper.find("mark").exists()).toBe(false);
  });

  it("wraps the matched substring in mark, case-insensitive", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "GI" } });
    expect(wrapper.find("mark").text()).toBe("Gi");
    expect(wrapper.text()).toBe("GitHub");
  });

  it("renders no mark when the query does not match", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "zzz" } });
    expect(wrapper.find("mark").exists()).toBe(false);
    expect(wrapper.text()).toBe("GitHub");
  });

  it("renders the root span with the highlight-text class", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "" } });
    expect(wrapper.classes()).toContain("highlight-text");
  });
});
