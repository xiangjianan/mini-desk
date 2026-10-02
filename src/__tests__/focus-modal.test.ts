import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodoFocusModal from "../components/TodoFocusModal.vue";

// NModal teleports to <body>（VTU 的 find 无法穿透），按 app-render 等文件的
// 惯例 mock naive-ui 模块换轻量桩；TextPanel/ImagePanel 用默认桩保留 props
// 声明，供 findComponent(...).props(...) 断言接线。
vi.mock("naive-ui", async () => {
  const { createNaiveUiStubModule } = await import("./helpers/naive-ui-mock");
  return createNaiveUiStubModule();
});

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(TodoFocusModal, {
    props: {
      show: true,
      title: "写周报",
      baseMs: 754_000,
      notes: [{ text: "第一行", indent: 0 }],
      images: [],
      ...overrides,
    },
    global: { stubs: { TextPanel: true, ImagePanel: true, ImageEditor: true } },
  });
}

const IMG = { id: "i1", src: "data:image/png;base64,AAA", createdAt: 1 };

function pressKey(key: string, code?: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

describe("TodoFocusModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("渲染任务标题与初始累计计时（h:mm）", () => {
    const wrapper = mountModal();
    expect(wrapper.text()).toContain("写周报");
    expect(wrapper.find(".focus-now-timer").text()).toBe("0:12"); // 754s → 12.5 分钟向下取整
  });

  it("计时按分钟推进显示", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("0:13");
  });

  it("baseMs 提升（App checkpoint）后显示接续不跳变", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(60_000);
    await wrapper.setProps({ baseMs: 754_000 + 60_000 });
    vi.advanceTimersByTime(1_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("0:13"); // 754s + 60s + 1s
  });

  it("关闭按钮 emit close（App 负责合并增量）", async () => {
    const wrapper = mountModal();
    await wrapper.get(".focus-now-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("mask 不关弹窗；无预览时 Esc 可关（close-on-esc 开启）", async () => {
    const wrapper = mountModal();
    const modal = wrapper.findComponent({ name: "NModal" });
    expect(modal.attributes("mask-closable")).toBe("false");
    expect(modal.attributes("close-on-esc")).toBe("true");
    // update:show(false) 兜底转发仍视作关闭。
    modal.vm.$emit("update:show", false);
    await nextTick();
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("update:show(true) 不误触发 close", async () => {
    const wrapper = mountModal();
    wrapper.findComponent({ name: "NModal" }).vm.$emit("update:show", true);
    await nextTick();
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("TextPanel 收到 notes/占位文案，更新上抛为 notesUpdate", async () => {
    const wrapper = mountModal();
    const textPanel = wrapper.findComponent({ name: "TextPanel" });
    expect(textPanel.props("lines")).toEqual([{ text: "第一行", indent: 0 }]);
    expect(textPanel.props("placeholder")).toContain("随手记");
    textPanel.vm.$emit("update", [{ text: "新", indent: 0 }]);
    await nextTick();
    expect(wrapper.emitted("notesUpdate")?.[0]).toEqual([[{ text: "新", indent: 0 }]]);
  });

  it("ImagePanel hideHeader 渲染且 paste 事件上抛", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    const imagePanel = wrapper.findComponent({ name: "ImagePanel" });
    expect(imagePanel.props("hideHeader")).toBe(true);
    imagePanel.vm.$emit("paste", { placement: "append" });
    await nextTick();
    expect(wrapper.emitted("pasteImage")).toHaveLength(1);
  });

  it("向 ImagePanel 传 canEdit=false 抑制编辑入口", () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    expect(wrapper.findComponent({ name: "ImagePanel" }).props("canEdit")).toBe(false);
  });

  it("点左栏缩略图在右侧浮层看大图，点「关预览」回到记事本", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", src: "data:image/png;base64,AAA", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();

    const preview = wrapper.get(".focus-now-preview");
    expect(preview.find("img").attributes("src")).toBe("data:image/png;base64,AAA");
    // 记事本仍在 DOM（浮层盖住而非卸载，滚动位置得以保留）。
    expect(wrapper.findComponent({ name: "TextPanel" }).exists()).toBe(true);

    await wrapper.get(".focus-now-preview-close").trigger("click");
    expect(wrapper.find(".focus-now-preview").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "TextPanel" }).exists()).toBe(true);
    wrapper.unmount();
  });

  it("预览打开时 Esc 只关预览：截停事件、不 emit close、NModal Esc 关闭临时禁用", async () => {
    const wrapper = mountModal({ images: [IMG] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();
    // 预览期外层 Esc 关闭禁用（防 FocusTrap 在冒泡阶段收 Esc 误关弹窗）。
    expect(wrapper.findComponent({ name: "NModal" }).attributes("close-on-esc")).toBe("false");

    const escape = pressKey("Escape");
    await nextTick();

    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(wrapper.find(".focus-now-preview").exists()).toBe(false);
    // 预览收起后恢复 Esc 关弹窗。
    expect(wrapper.findComponent({ name: "NModal" }).attributes("close-on-esc")).toBe("true");
    wrapper.unmount();
  });

  it("空格键关闭预览（不关弹窗）", async () => {
    const wrapper = mountModal({ images: [IMG] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();

    const space = pressKey(" ", "Space");
    await nextTick();

    expect(space.defaultPrevented).toBe(true);
    expect(wrapper.find(".focus-now-preview").exists()).toBe(false);
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("回车键进入编辑模式，编辑器保存上抛 saveImage", async () => {
    const wrapper = mountModal({ images: [IMG] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();

    pressKey("Enter");
    await nextTick();

    const editor = wrapper.findComponent({ name: "ImageEditor" });
    expect(editor.exists()).toBe(true);
    editor.vm.$emit("save", { id: "i1", src: "data:image/png;base64,BBB", displayWidth: 2, displayHeight: 2 });
    await nextTick();
    expect(wrapper.emitted("saveImage")?.[0]).toEqual([{ id: "i1", src: "data:image/png;base64,BBB", displayWidth: 2, displayHeight: 2 }]);
    wrapper.unmount();
  });

  it("工具栏「编辑图片」按钮同样进入编辑模式", async () => {
    const wrapper = mountModal({ images: [IMG] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();

    await wrapper.get(".focus-now-preview-action").trigger("click");
    expect(wrapper.findComponent({ name: "ImageEditor" }).exists()).toBe(true);
    wrapper.unmount();
  });

  it("编辑态 Esc 退出编辑回预览，不关弹窗", async () => {
    const wrapper = mountModal({ images: [IMG] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();
    pressKey("Enter");
    await nextTick();

    pressKey("Escape");
    await nextTick();

    expect(wrapper.findComponent({ name: "ImageEditor" }).exists()).toBe(false);
    expect(wrapper.find(".focus-now-preview").exists()).toBe(true);
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("编辑器取消回到预览展示", async () => {
    const wrapper = mountModal({ images: [IMG] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();
    pressKey("Enter");
    await nextTick();

    wrapper.findComponent({ name: "ImageEditor" }).vm.$emit("cancel");
    await nextTick();
    expect(wrapper.findComponent({ name: "ImageEditor" }).exists()).toBe(false);
    expect(wrapper.find(".focus-now-preview-image").exists()).toBe(true);
    wrapper.unmount();
  });

  it("贴图条「取消预览」同样收起右侧浮层", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", src: "data:image/png;base64,AAA", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("closePreview");
    await nextTick();
    expect(wrapper.find(".focus-now-preview").exists()).toBe(false);
    wrapper.unmount();
  });

  it("show 撤下时重置预览态，重开弹窗不复活陈旧预览", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", src: "data:image/png;base64,AAA", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();
    expect(wrapper.find(".focus-now-preview").exists()).toBe(true);

    await wrapper.setProps({ show: false });
    await wrapper.setProps({ show: true });
    await nextTick();

    expect(wrapper.find(".focus-now-preview").exists()).toBe(false);
    wrapper.unmount();
  });

  it("预览中的图片被删后浮层收起（防悬空 id）", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", src: "data:image/png;base64,AAA", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await nextTick();

    await wrapper.setProps({ images: [] });
    expect(wrapper.find(".focus-now-preview").exists()).toBe(false);
    wrapper.unmount();
  });

  it("show 重开时重置段起点：隐藏期间的空闲间隔不计入", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(60_000); // 0:12 → 0:13
    await wrapper.setProps({ show: false });
    vi.advanceTimersByTime(120_000); // 隐藏期间空闲两分钟

    await wrapper.setProps({ show: true });

    // 显示回到 baseMs 起点（0:12），空闲的两分钟被丢弃；此后按分钟正常推进。
    expect(wrapper.find(".focus-now-timer").text()).toBe("0:12");
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("0:13");
    wrapper.unmount();
  });

  it("以 show=false 挂载时不启动计时，转 true 后从 baseMs 起步", async () => {
    const wrapper = mountModal({ show: false });
    vi.advanceTimersByTime(5_000);

    await wrapper.setProps({ show: true });

    expect(wrapper.find(".focus-now-timer").text()).toBe("0:12");
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("0:13");
    wrapper.unmount();
  });

  it("show 撤下时停掉 1s 计时 interval（隐藏期间不空转）", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const wrapper = mountModal();

    await wrapper.setProps({ show: false });

    expect(clearIntervalSpy).toHaveBeenCalled();
    wrapper.unmount();
    clearIntervalSpy.mockRestore();
  });
});
