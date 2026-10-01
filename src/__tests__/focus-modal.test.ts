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

  it("预览打开时 Esc 只关预览：截停事件、不 emit close、走 220ms 两段式淡出", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();
    expect(wrapper.findComponent(ImagePreview).exists()).toBe(true);
    // 双保险：预览期外层专注弹窗的 Esc 关闭被禁用。
    expect(wrapper.findComponent({ name: "NModal" }).attributes("close-on-esc")).toBe("false");

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    await nextTick();

    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted("close")).toBeUndefined();
    // 两段式（App closeImagePreview 同口径）：先落 closing 相位挂淡出，220ms 后才卸载。
    const fading = wrapper.findComponent(ImagePreview);
    expect(fading.exists()).toBe(true);
    expect(fading.props("closing")).toBe(true);
    expect(fading.props("activeId")).toBe("i1");
    vi.advanceTimersByTime(220);
    await nextTick();
    expect(wrapper.findComponent(ImagePreview).exists()).toBe(false);
    // 预览关掉后 Esc 双保险恢复。
    expect(wrapper.findComponent({ name: "NModal" }).attributes("close-on-esc")).toBe("true");
    wrapper.unmount();
  });

  it("编辑器 window 捕获层 stopImmediatePropagation 的 Esc 不触发弹窗侧关闭", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();

    // 模拟 ImagePreview 编辑器的 window 捕获处理器（捕获顺序 window → document，
    // 先于弹窗侧的 document 捕获监听执行）截停 Esc。
    const editorLikeStopper = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", editorLikeStopper, { capture: true });
    try {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await nextTick();
      vi.advanceTimersByTime(300);
      await nextTick();

      expect(wrapper.findComponent(ImagePreview).exists()).toBe(true);
      expect(wrapper.emitted("close")).toBeUndefined();
    } finally {
      window.removeEventListener("keydown", editorLikeStopper, { capture: true });
      wrapper.unmount();
    }
  });

  it("贴图条「取消预览」emit closePreview 走 220ms 两段式淡出", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();

    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("closePreview");
    await nextTick();

    const fading = wrapper.findComponent(ImagePreview);
    expect(fading.exists()).toBe(true);
    expect(fading.props("closing")).toBe(true);

    vi.advanceTimersByTime(220);
    await nextTick();
    expect(wrapper.findComponent(ImagePreview).exists()).toBe(false);
    wrapper.unmount();
  });

  it("ImagePreview 自身离场（emit close）后立即卸载，不再等淡出", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();

    wrapper.findComponent(ImagePreview).vm.$emit("close");
    await nextTick();

    expect(wrapper.findComponent(ImagePreview).exists()).toBe(false);
    wrapper.unmount();
  });

  it("show 撤下时重置预览态，重开弹窗不复活陈旧全屏预览", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();
    expect(wrapper.findComponent(ImagePreview).exists()).toBe(true);

    await wrapper.setProps({ show: false });
    await wrapper.setProps({ show: true });
    await flushPromises();

    expect(wrapper.findComponent(ImagePreview).exists()).toBe(false);
    wrapper.unmount();
  });

  it("show 重开时重置段起点：隐藏期间的空闲间隔不计入", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(60_000); // 12:34 → 13:34
    await wrapper.setProps({ show: false });
    vi.advanceTimersByTime(120_000); // 隐藏期间空闲两分钟

    await wrapper.setProps({ show: true });

    // 显示回到 baseMs 起点（12:34），空闲的两分钟被丢弃；此后每秒正常推进。
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:34");
    vi.advanceTimersByTime(1_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:35");
    wrapper.unmount();
  });

  it("以 show=false 挂载时不启动计时，转 true 后从 baseMs 起步", async () => {
    const wrapper = mountModal({ show: false });
    vi.advanceTimersByTime(5_000);

    await wrapper.setProps({ show: true });

    expect(wrapper.find(".focus-now-timer").text()).toBe("12:34");
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:36");
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

  it("预览打开时点遮罩不再穿透关闭整个弹窗", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    // 预览关闭时遮罩可点（正常形态不回归）。
    expect(wrapper.findComponent({ name: "NModal" }).attributes("mask-closable")).toBe("true");

    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("preview", "i1");
    await flushPromises();

    // 双保险一（与 close-on-esc 同款绑定）：预览期遮罩不可点。
    expect(wrapper.findComponent({ name: "NModal" }).attributes("mask-closable")).toBe("false");

    // 双保险二：即便 update:show(false) 漏进来（遮罩路径穿透到 NModal），
    // 也不 emit close——预览是顶层，此时收起弹窗等于把专注会话误暂停落盘。
    wrapper.findComponent({ name: "NModal" }).vm.$emit("update:show", false);
    await nextTick();
    expect(wrapper.emitted("close")).toBeUndefined();

    // 预览关掉后遮罩路径恢复常态：update:show(false) 正常视作关闭。
    wrapper.findComponent(ImagePreview).vm.$emit("close");
    await nextTick();
    wrapper.findComponent({ name: "NModal" }).vm.$emit("update:show", false);
    await nextTick();
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });
});
