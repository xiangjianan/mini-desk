import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import VersionHistory from "../components/VersionHistory.vue";

const modalStub = { name: "Modal", props: ["show"], template: '<section v-if="show"><slot /></section>' };
const scrollbarStub = { name: "Scrollbar", template: "<div><slot /></div>" };

function mountHistory(props: Record<string, unknown>) {
  return mount(VersionHistory, {
    props: { show: true, language: "zh", ...props },
    global: {
      stubs: {
        Modal: modalStub,
        NModal: modalStub,
        Scrollbar: scrollbarStub,
        NScrollbar: scrollbarStub,
      },
    },
  });
}

describe("VersionHistory", () => {
  it("按当前语言渲染首个版本的分点说明", () => {
    const wrapper = mountHistory({ language: "zh" });
    const first = wrapper.find(".version-history-entry");
    expect(first.find(".version-history-version").text()).toContain("v");
    const notes = first.findAll(".version-history-notes li").map((li) => li.text());
    expect(notes.length).toBeGreaterThan(0);
  });

  it("切换为英文时渲染英文说明", () => {
    const wrapper = mountHistory({ language: "en" });
    const first = wrapper.find(".version-history-entry");
    expect(first.find(".version-history-version").text()).toContain("v");
    // English notes differ from the Chinese ones for the same (first) entry.
    const zhWrapper = mountHistory({ language: "zh" });
    const enNotes = first.findAll(".version-history-notes li").map((li) => li.text());
    const zhNotes = zhWrapper.find(".version-history-entry").findAll(".version-history-notes li").map((li) => li.text());
    expect(enNotes).not.toEqual(zhNotes);
  });

  it("最新条目带有「最新」标记", () => {
    const wrapper = mountHistory({ language: "zh" });
    expect(wrapper.find(".version-history-entry .version-history-badge").text()).toBe("最新");
  });

  it("仅在 updateAvailable 时展示「立即更新」按钮并 emit update", async () => {
    const withoutUpdate = mountHistory({ updateAvailable: false });
    expect(withoutUpdate.find(".version-history-update").exists()).toBe(false);

    const withUpdate = mountHistory({ updateAvailable: true, availableVersion: "1.0.130" });
    const button = withUpdate.find(".version-history-update");
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain("1.0.130");
    await button.trigger("click");
    expect(withUpdate.emitted("update")).toHaveLength(1);
  });

  it("有更新时弹框顶部携带当前与最新版本信息", () => {
    const wrapper = mountHistory({
      updateAvailable: true,
      availableVersion: "1.0.130",
      currentVersion: "1.0.129",
    });
    const status = wrapper.find(".version-history-status");
    expect(status.exists()).toBe(true);
    expect(status.find(".version-history-status-current").text()).toBe("当前版本 v1.0.129");
    expect(status.find(".version-history-status-latest").text()).toBe("最新版本 v1.0.130");
    // 状态行已标明最新版本，列表首条不再重复标「最新」。
    expect(wrapper.find(".version-history-entry .version-history-badge").exists()).toBe(false);
  });

  it("无更新时不展示版本状态行", () => {
    const wrapper = mountHistory({ updateAvailable: false, availableVersion: "", currentVersion: "1.0.129" });
    expect(wrapper.find(".version-history-status").exists()).toBe(false);
  });

  it("英文下版本状态行渲染英文文案", () => {
    const wrapper = mountHistory({
      updateAvailable: true,
      availableVersion: "1.0.130",
      currentVersion: "1.0.129",
      language: "en",
    });
    expect(wrapper.find(".version-history-status-current").text()).toBe("Current v1.0.129");
    expect(wrapper.find(".version-history-status-latest").text()).toBe("Latest v1.0.130");
  });
});
