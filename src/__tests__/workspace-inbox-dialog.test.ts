import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import WorkspaceInboxDialog from "../components/WorkspaceInboxDialog.vue";
import { INBOX_APP_STORE_URL } from "../sync/pairing";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData, WorkspaceInbox, WorkspaceSpace } from "../types";

// 生成/重置先注册中继成功才 emit（注册门禁）：组件级用例固定注册成功。
vi.mock("../sync/inboxClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sync/inboxClient")>()),
  registerInboxKey: vi.fn(async () => true),
}));

const INBOX: WorkspaceInbox = { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "workspace", lastSeenAt: 42 };

// NModal teleports to <body>, which VTU's wrapper.find cannot traverse, so the
// repo convention (version-history / quick-buttons tests) stubs Naive wrappers.
// 桩模拟真实 NModal 的两段式关闭：show 撤下（离场过渡开始）后发 after-leave
// （真实组件在 200ms 过渡结束时发；桩同步发，测试免等）。
const modalStub = defineComponent({
  name: "NModal",
  props: ["show", "title", "internalAppear"],
  emits: ["update:show", "after-leave"],
  template: '<section v-if="show" class="workspace-inbox-dialog"><h2>{{ title }}</h2><slot /></section>',
  watch: {
    show(value: boolean) {
      if (!value) this.$emit("after-leave");
    },
  },
});

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

const selectStub = {
  props: ["value", "options"],
  emits: ["update:value"],
  template: `
    <select
      v-bind="$attrs"
      :value="value"
      @change="$emit('update:value', $event.target.value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  `,
};

type DialogListeners = {
  onUpdate?: (inbox: WorkspaceInbox | null) => void;
  onClose?: () => void;
};

function mountDialog(inbox?: WorkspaceInbox, workspace: WorkspaceData = defaultWorkspace("a"), listeners: DialogListeners = {}) {
  return mount(WorkspaceInboxDialog, {
    props: {
      workspace: { ...workspace, ...(inbox ? { inbox } : {}) },
      language: "zh",
      onUpdate: listeners.onUpdate,
      onClose: listeners.onClose,
    },
    // naive-ui 组件 name 无 N 前缀（Modal/Select/Button），两种键名都注册以对齐
    // quick-buttons.test.ts 的惯例。
    global: {
      stubs: {
        Modal: modalStub,
        NModal: modalStub,
        Button: buttonStub,
        NButton: buttonStub,
        Select: selectStub,
        NSelect: selectStub,
      },
    },
  });
}

function updatePayloads(wrapper: ReturnType<typeof mountDialog>): WorkspaceInbox[] {
  return (wrapper.emitted("update") ?? []).map((args) => args[0] as WorkspaceInbox);
}

// 注册门禁为异步链（哈希→注册→emit）：SHA-256 摘要走 libuv 线程池、跨宏任务
// 才落地，固定轮次的冲刷在冷启动/高负载下可能抢跑；轮询等到 update emit 落地
// 再继续（真实时序里注册先于用户后续操作完成）。
async function waitForRegistrationEmit(wrapper: ReturnType<typeof mountDialog>): Promise<void> {
  await vi.waitFor(() => {
    expect(updatePayloads(wrapper).length).toBeGreaterThan(0);
  });
}

describe("WorkspaceInboxDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("无配对时点击生成：立即 emit update（合法码+默认落点）且弹窗保持打开", async () => {
    const order: string[] = [];
    const wrapper = mountDialog(undefined, defaultWorkspace("a"), {
      onUpdate: () => order.push("update"),
      onClose: () => order.push("close"),
    });
    expect(wrapper.text()).toContain("生成配对码");
    await wrapper.find('[data-testid="inbox-generate"]').trigger("click");
    await waitForRegistrationEmit(wrapper);
    const [payload] = updatePayloads(wrapper);
    expect(payload?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    // 落点为当前下拉默认值：首个提醒清单与首个空间。
    expect(payload?.todoListId).toBe(wrapper.props("workspace").todoLists[0]?.id);
    expect(payload?.noteTarget).toBe(wrapper.props("workspace").spaces[0]?.id);
    expect(payload?.lastSeenAt).toBe(0);
    // 弹窗保持打开供扫码/抄录，展示层同步为新码；生成按钮随 hasCode 翻转卸载（不可重复生成）。
    expect(order).toEqual(["update"]);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe(payload?.code);
    expect(wrapper.find('[data-testid="inbox-generate"]').exists()).toBe(false);
  });

  it("生成后点取消：仅 emit close，不回收已生效的配对", async () => {
    const wrapper = mountDialog(undefined);
    await wrapper.find('[data-testid="inbox-generate"]').trigger("click");
    // 真实时序里注册先于用户点取消完成：等 update 落地再点关闭。
    await waitForRegistrationEmit(wrapper);
    await wrapper.get('[data-testid="inbox-close"]').trigger("click");
    // 取消不 emit 补偿 update：生成的码已落盘注册，保持生效（与重置配对码同口径）。
    expect(updatePayloads(wrapper)).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("弹窗顶部标明当前配对的工作空间", () => {
    const workspace: WorkspaceData = {
      ...defaultWorkspace("a"),
      customTitles: { "board-title": "我的日常" },
    };
    const wrapper = mountDialog(INBOX, workspace);
    expect(wrapper.get('[data-testid="inbox-workspace"]').text()).toContain("配对空间");
    expect(wrapper.get(".workspace-inbox-workspace-name").text()).toBe("我的日常");
    wrapper.unmount();

    // 未自定义标题的工作空间回退默认看板标题。
    const fallback = mountDialog(INBOX);
    expect(fallback.get(".workspace-inbox-workspace-name").text()).toBe("Mini Desk");
    fallback.unmount();
  });

  it("已配对时展示码与含 #inbox= 的可点击配对地址", () => {
    const wrapper = mountDialog(INBOX);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    const address = wrapper.get('[data-testid="inbox-address"]');
    expect(address.text()).toContain("#inbox=AB2CDE4FGHJK");
    expect(address.attributes("href")).toContain("#inbox=AB2CDE4FGHJK");
    expect(address.attributes("target")).toBe("_blank");
    expect(address.attributes("rel")).toContain("noopener");
  });

  it("配对码旁的复制按钮：写入剪贴板并短暂反馈「已复制」", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });
    const wrapper = mountDialog(INBOX);

    try {
      expect(wrapper.get('[data-testid="inbox-copy"]').attributes("aria-label")).toBe("复制配对码");
      await wrapper.get('[data-testid="inbox-copy"]').trigger("click");
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.vm.$nextTick();

      expect(writeText).toHaveBeenCalledWith("AB2CDE4FGHJK");
      expect(wrapper.get('[data-testid="inbox-copy"]').attributes("aria-label")).toBe("已复制");
      // 无需 hover：成功反馈以气泡自动浮现在按钮下方。
      expect(wrapper.get('[data-testid="inbox-copy-hint"]').text()).toBe("已复制");
      expect(wrapper.get('[data-testid="inbox-copy-hint"]').attributes("role")).toBe("status");

      // 反馈短暂停留后自动还原。
      await vi.advanceTimersByTimeAsync(1800);
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-testid="inbox-copy"]').attributes("aria-label")).toBe("复制配对码");
      expect(wrapper.find('[data-testid="inbox-copy-hint"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      if (previousClipboard) Object.defineProperty(globalThis.navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(globalThis.navigator, "clipboard");
      vi.useRealTimers();
    }
  });

  it("复制失败：反馈「复制失败」后同样自动还原", async () => {
    vi.useFakeTimers();
    // writeText 拒绝且 jsdom 无 execCommand，两层复制路径均失败。
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const previousClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });
    const wrapper = mountDialog(INBOX);

    try {
      await wrapper.get('[data-testid="inbox-copy"]').trigger("click");
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="inbox-copy"]').attributes("aria-label")).toBe("复制失败");
      expect(wrapper.get('[data-testid="inbox-copy-hint"]').text()).toBe("复制失败");

      await vi.advanceTimersByTimeAsync(1800);
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-testid="inbox-copy"]').attributes("aria-label")).toBe("复制配对码");
      expect(wrapper.find('[data-testid="inbox-copy-hint"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      if (previousClipboard) Object.defineProperty(globalThis.navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(globalThis.navigator, "clipboard");
      vi.useRealTimers();
    }
  });

  it("渲染四步引导：一至四标题齐全，每 5 分钟折入步骤四", () => {
    const wrapper = mountDialog(INBOX);
    const steps = wrapper.get('[data-testid="inbox-steps"]');
    expect(steps.text()).toContain("一、手机安装");
    expect(steps.text()).toContain("二、扫码配对");
    expect(steps.text()).toContain("三、手机速记");
    expect(steps.text()).toContain("四、自动同步");
    // 同步频率提示折入步骤四正文。
    expect(steps.text()).toContain("每 5 分钟");
    // 旧两段说明文案已被四步引导替代。
    expect(wrapper.text()).not.toContain("在手机上打开下面的地址");
  });

  it("步骤一正文附 App Store 下载链接：href 取常量、新标签打开", () => {
    const wrapper = mountDialog(INBOX);
    const link = wrapper.get('[data-testid="inbox-app-store"]');
    expect(link.attributes("href")).toBe(INBOX_APP_STORE_URL);
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toContain("noopener");
    expect(link.text()).toBe("下载");
  });

  it("未生成码的空态同样展示四步引导", () => {
    const wrapper = mountDialog(undefined);
    expect(wrapper.get('[data-testid="inbox-steps"]').text()).toContain("一、手机安装");
    expect(wrapper.find('[data-testid="inbox-generate"]').exists()).toBe(true);
    // 空态同样能走完引导第一步：App Store 下载链接在场。
    expect(wrapper.find('[data-testid="inbox-app-store"]').exists()).toBe(true);
  });

  it("保存时 emit update 并保留水位线与落点", async () => {
    const wrapper = mountDialog(INBOX);
    await wrapper.find('[data-testid="inbox-save"]').trigger("click");
    const emitted = wrapper.emitted("update");
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toEqual(INBOX);
  });

  it("保存失效落点时回退到首个清单与首个空间", async () => {
    const workspace = defaultWorkspace("a");
    const wrapper = mountDialog({ ...INBOX, todoListId: "ghost-list", noteTarget: "ghost-space" }, workspace);
    await wrapper.find('[data-testid="inbox-save"]').trigger("click");
    const [payload] = updatePayloads(wrapper);
    expect(payload?.todoListId).toBe(workspace.todoLists[0]?.id);
    expect(payload?.noteTarget).toBe(workspace.spaces[0]?.id);
  });

  it("落点下拉选项来自工作区空间 Tab 的显示标题", () => {
    const spaces: WorkspaceSpace[] = [
      { id: "workspace", title: "📝 便签", lines: [] },
      { id: "storage", title: "工程文件", lines: [] },
      { id: "s3", title: "速记本", lines: [] },
    ];
    const workspace = { ...defaultWorkspace("a"), spaces };
    const wrapper = mountDialog({ ...INBOX, noteTarget: "s3" }, workspace);
    expect(wrapper.text()).toContain("工程文件");
    expect(wrapper.text()).toContain("速记本");
    // 选中第三空间的显示标题。
    expect((wrapper.get('[data-testid="inbox-note-target"]').element as HTMLSelectElement).value).toBe("s3");
  });

  it("重置 confirm 拒绝时保持原码且不 emit", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = mountDialog(INBOX);
    expect(wrapper.find('[data-testid="inbox-rotate"]').text()).toBe("重置配对码");
    await wrapper.find('[data-testid="inbox-rotate"]').trigger("click");
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("重置确认后立即 emit 新码并保持弹窗打开，保存时新码紧随 close", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // 记录事件顺序以验证「update 后紧随 close」。
    const order: string[] = [];
    const wrapper = mountDialog(INBOX, undefined, {
      onUpdate: () => order.push("update"),
      onClose: () => order.push("close"),
    });
    await wrapper.find('[data-testid="inbox-rotate"]').trigger("click");
    await waitForRegistrationEmit(wrapper);
    const [payload] = updatePayloads(wrapper);
    expect(payload?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(payload?.code).not.toBe(INBOX.code);
    expect(payload?.todoListId).toBe(INBOX.todoListId);
    expect(payload?.noteTarget).toBe(INBOX.noteTarget);
    expect(payload?.lastSeenAt).toBe(42);
    // 弹窗保持打开（无 close），展示层同步为新码供抄录/扫码。
    expect(order).toEqual(["update"]);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe(payload?.code);
    // 再次保存：携带新码 update，并紧随 close。
    await wrapper.find('[data-testid="inbox-save"]').trigger("click");
    const payloads = updatePayloads(wrapper);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]?.code).toBe(payload?.code);
    expect(order).toEqual(["update", "update", "close"]);
  });

  it("清除配对（confirm 通过）emit update(null) 并关闭弹窗", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountDialog(INBOX);
    await wrapper.find('[data-testid="inbox-clear"]').trigger("click");
    expect(wrapper.emitted("update")?.[0]?.[0]).toBeNull();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("confirm 拒绝时不清除配对", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = mountDialog(INBOX);
    await wrapper.find('[data-testid="inbox-clear"]').trigger("click");
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("挂载即播放入场动画：NModal 带 internal-appear", () => {
    const wrapper = mountDialog(INBOX);
    // naive 的 internalAppear 是模态服务同款机制：show=true 挂载时播放遮罩淡入 + 卡片缩放入场。
    expect(wrapper.findComponent({ name: "NModal" }).props("internalAppear")).toBe(true);
  });

  it("关闭两段式：先撤下 show，after-leave 后才 emit close 且只一次", async () => {
    const wrapper = mountDialog(INBOX);
    await wrapper.get('[data-testid="inbox-close"]').trigger("click");

    expect(wrapper.findComponent({ name: "NModal" }).props("show")).toBe(false);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("离场过渡未结束（无 after-leave）时不 emit close，等待动画收尾", async () => {
    // 不发 after-leave 的桩 = 离场过渡一直没播完。
    const quietModalStub = defineComponent({
      name: "NModal",
      props: ["show", "title"],
      template: '<section v-if="show" class="workspace-inbox-dialog"><h2>{{ title }}</h2><slot /></section>',
    });
    const wrapper = mount(WorkspaceInboxDialog, {
      props: { workspace: { ...defaultWorkspace("a"), inbox: INBOX }, language: "zh" },
      global: {
        stubs: {
          Modal: quietModalStub,
          NModal: quietModalStub,
          Button: buttonStub,
          NButton: buttonStub,
          Select: selectStub,
          NSelect: selectStub,
        },
      },
    });
    await wrapper.get('[data-testid="inbox-close"]').trigger("click");

    expect(wrapper.findComponent({ name: "NModal" }).props("show")).toBe(false);
    expect(wrapper.emitted("close")).toBeUndefined();
  });
});
