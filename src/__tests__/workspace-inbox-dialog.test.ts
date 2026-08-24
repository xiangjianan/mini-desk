import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceInboxDialog from "../components/WorkspaceInboxDialog.vue";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData, WorkspaceInbox, WorkspaceSpace } from "../types";

const INBOX: WorkspaceInbox = { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "workspace", lastSeenAt: 42 };

// NModal teleports to <body>, which VTU's wrapper.find cannot traverse, so the
// repo convention (version-history / quick-buttons tests) stubs Naive wrappers.
const modalStub = {
  name: "NModal",
  props: ["show", "title"],
  template: '<section v-if="show" class="workspace-inbox-dialog"><h2>{{ title }}</h2><slot /></section>',
};

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

describe("WorkspaceInboxDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("无配对时显示生成按钮，点击生成合法码", async () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("生成配对码");
    await wrapper.find('[data-testid="inbox-generate"]').trigger("click");
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });

  it("已配对时展示码与含 #inbox= 的地址", () => {
    const wrapper = mountDialog(INBOX);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    expect(wrapper.find('[data-testid="inbox-address"]').text()).toContain("#inbox=AB2CDE4FGHJK");
  });

  it("渲染介绍与队列上限提示", () => {
    const wrapper = mountDialog(INBOX);
    // inboxQueueHint 含「200 条」。
    expect(wrapper.text()).toContain("200 条");
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

  it("轮换 confirm 拒绝时保持原码且不 emit", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = mountDialog(INBOX);
    await wrapper.find('[data-testid="inbox-rotate"]').trigger("click");
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("轮换确认后立即 emit 新码并保持弹窗打开，保存时新码紧随 close", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // 记录事件顺序以验证「update 后紧随 close」。
    const order: string[] = [];
    const wrapper = mountDialog(INBOX, undefined, {
      onUpdate: () => order.push("update"),
      onClose: () => order.push("close"),
    });
    await wrapper.find('[data-testid="inbox-rotate"]').trigger("click");
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
});
