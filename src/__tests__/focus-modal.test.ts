import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodoFocusModal from "../components/TodoFocusModal.vue";
import ImagePreview from "../components/ImagePreview.vue";

// NModal teleports to <body>（VTU 的 find 无法穿透），按 app-render 等文件的
// 惯例 mock naive-ui 模块换轻量桩；TextPanel/ImagePanel 用默认桩保留 props
// 声明，供 findComponent(...).props(...) 断言接线。
// ImagePreview 不 stub：defineAsyncComponent 的包装组件会按 setupState 变量名被
// 换成无 props 声明的桩（断言不了接线）——放真组件异步加载后用组件对象查询。
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
    global: { stubs: { TextPanel: true, ImagePanel: true } },
  });
}

describe("TodoFocusModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("渲染任务标题与初始累计计时（12:34）", () => {
    const wrapper = mountModal();
    expect(wrapper.text()).toContain("写周报");
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:34");
  });

  it("每秒推进计时显示", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:36");
  });

  it("baseMs 提升（App checkpoint）后显示接续不跳变", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(60_000);
    await wrapper.setProps({ baseMs: 754_000 + 60_000 });
    vi.advanceTimersByTime(1_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("13:35"); // 754s + 60s + 1s
  });

  it("关闭按钮 emit close（App 负责合并增量）", async () => {
    const wrapper = mountModal();
    await wrapper.get(".focus-now-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("NModal update:show(false)（Esc/遮罩关闭）同样 emit close", async () => {
    const wrapper = mountModal();
    wrapper.findComponent({ name: "NModal" }).vm.$emit("update:show", false);
    await nextTick();
    expect(wrapper.emitted("close")).toHaveLength(1);
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

  it("向 ImagePanel/ImagePreview 传 canEdit=false 抑制编辑入口", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    expect(wrapper.findComponent({ name: "ImagePanel" }).props("canEdit")).toBe(false);
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();
    expect(wrapper.findComponent(ImagePreview).props("canEdit")).toBe(false);
  });
});
