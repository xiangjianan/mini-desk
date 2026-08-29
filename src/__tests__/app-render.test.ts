import { nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";
import CompanionBubble from "../components/CompanionBubble.vue";
import ImagePanel from "../components/ImagePanel.vue";
import QuickButtons from "../components/QuickButtons.vue";
import SettingsMenu from "../components/SettingsMenu.vue";
import SpacePanel from "../components/SpacePanel.vue";
import TodoPanel from "../components/TodoPanel.vue";
import WorkspaceInboxDialog from "../components/WorkspaceInboxDialog.vue";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.vue";
import { DEFAULT_SPACE_ID, DEFAULT_WORKSPACE_ID, defaultState, defaultWorkspace, STORAGE_KEY } from "../state/defaults";
import { hydrateStoredImages, storeImagePayload } from "../state/images";
import { getGuideMessages } from "../state/i18n";
import * as imageState from "../state/images";
import { KAOMOJI_BY_MOOD } from "../state/messages";
import { INBOX_FOCUS_THROTTLE_MS } from "../sync/config";
import { checkInboxKeyStatus, registerInboxKey, revokeInboxKey } from "../sync/inboxClient";
import { REMEMBERED_INBOX_CODE_KEY } from "../sync/pairing";
import { pullAllInboxes } from "../sync/pull";
import type { InboxPullResult } from "../sync/pull";
import { FALLBACK_APP_VERSION } from "../state/version";

vi.mock("naive-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("naive-ui")>();
  return {
    ...actual,
    NDropdown: {
      name: "NDropdown",
      template: "<div><slot /></div>",
    },
    NPopover: {
      name: "NPopover",
      props: ["show"],
      template: "<div v-bind=\"$attrs\"><slot name=\"trigger\" /><div v-if=\"show\" class=\"n-popover\"><slot /></div></div>",
    },
    NTooltip: {
      name: "NTooltip",
      template: "<span><slot name=\"trigger\" /><slot /></span>",
    },
    NModal: {
      name: "NModal",
      props: ["show", "title"],
      template: "<section v-if=\"show\" class=\"n-modal\"><h2>{{ title }}</h2><slot /></section>",
    },
  };
});

// 收件箱拉取是纯函数模块（无 import 副作用），且 pullAllInboxes 只有收件箱接线调用：
// 文件级 mock 对其它用例零影响。applyInboxItems 保留真实现——补丁重放路径必须走真实合并；
// 默认实现按契约返回空补丁 + changed:false，等价于「拉取无变更」，未显式设值的用例行为与真实模块一致。
vi.mock("../sync/pull", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sync/pull")>()),
  pullAllInboxes: vi.fn(async (): Promise<InboxPullResult> => ({ patches: [], reports: [], changed: false })),
}));

// App 只消费 revokeInboxKey/registerInboxKey/checkInboxKeyStatus；其余保留真实现（经 mocked 的 pull.ts 隔离）。
vi.mock("../sync/inboxClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sync/inboxClient")>()),
  revokeInboxKey: vi.fn(async () => true),
  registerInboxKey: vi.fn(async () => true),
  checkInboxKeyStatus: vi.fn(async () => "active"),
}));

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
        {{ option.label }}
      </button>
    </div>
  `,
};

const popoverStub = {
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
};

const persistentPopoverStub = {
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div class="n-popover" :data-show="String(show)"><slot /></div></div>',
};

const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
};

const modalStub = {
  props: ["show", "title"],
  template: '<section v-if="show" class="n-modal"><h2>{{ title }}</h2><slot /></section>',
};

function mountApp() {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        NDropdown: dropdownStub,
        NPopover: popoverStub,
        NTooltip: tooltipStub,
        NModal: modalStub,
      },
    },
  });
}

function mountAppWithPersistentPopover() {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        NDropdown: dropdownStub,
        NPopover: persistentPopoverStub,
        NTooltip: tooltipStub,
        NModal: modalStub,
      },
    },
  });
}

async function flushAsyncComponents() {
  await flushPromises();
  await vi.dynamicImportSettled();
  await nextTick();
}

// The workspace row's overflow menu (NPopover under the shared stub) opens once
// its controlled `:show` flips, after which the menu items render inline in the
// component subtree and are reachable via wrapper.get.
async function openWorkspaceMenu(wrapper: ReturnType<typeof mountApp>, id = DEFAULT_WORKSPACE_ID): Promise<void> {
  await wrapper.get(`[data-testid="workspace-menu-${id}"]`).trigger("click");
  await nextTick();
}

function getImagePreview(wrapper: ReturnType<typeof mountApp>) {
  return wrapper.getComponent({ name: "ImagePreview" });
}

function installMemoryImageDb(): () => void {
  const originalIndexedDb = window.indexedDB;
  const records = new Map<string, { id: string; src?: string }>();
  const createRequest = <T,>(result: T, settled: () => void): IDBRequest<T> => {
    const request = { result, error: null, onsuccess: null, onerror: null } as unknown as IDBRequest<T>;
    queueMicrotask(() => {
      request.onsuccess?.(new Event("success"));
      settled();
    });
    return request;
  };
  const indexedDb = {
    open: vi.fn(() => {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: vi.fn(),
        transaction: vi.fn(() => {
          let pending = 0;
          let completed = false;
          const transaction = {
            objectStore: () => store,
            oncomplete: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
            error: null,
          };
          const finish = () => queueMicrotask(() => {
            if (!completed && pending === 0) {
              completed = true;
              transaction.oncomplete?.(new Event("complete"));
            }
          });
          const settle = () => {
            pending -= 1;
            finish();
          };
          const request = <T,>(result: T) => {
            pending += 1;
            return createRequest(result, settle);
          };
          const store = {
            get: (id: string) => request(records.get(id)),
            put: (record: { id: string; src?: string }) => {
              records.set(record.id, { ...record });
              return request(record.id);
            },
            delete: (id: string) => {
              records.delete(id);
              return request(undefined);
            },
            clear: () => {
              records.clear();
              return request(undefined);
            },
          };
          finish();
          return transaction;
        }),
        close: vi.fn(),
      };
      const request = {
        result: db,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request;
    }),
  };
  vi.stubGlobal("indexedDB", indexedDb);
  return () => {
    if (originalIndexedDb) vi.stubGlobal("indexedDB", originalIndexedDb);
    else Reflect.deleteProperty(window, "indexedDB");
  };
}

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    matches,
    media: "(max-width: 900px)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.delete(listener);
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn((event: MediaQueryListEvent) => {
      listeners.forEach((listener) => listener(event));
      return true;
    }),
  } as unknown as MediaQueryList;

  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mediaQueryList));
  return mediaQueryList;
}

/** 按查询串区分的 matchMedia 桩：断点查询恒为桌面，`(prefers-color-scheme: dark)` 可用 setMatches 模拟系统切换。 */
function stubSystemThemeMatchMedia(systemDark: boolean) {
  const desktop = stubMatchMedia(false);
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const scheme = {
    matches: systemDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.delete(listener);
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn((event: MediaQueryListEvent) => {
      listeners.forEach((listener) => listener(event));
      return true;
    }),
    setMatches(value: boolean) {
      scheme.matches = value;
      listeners.forEach((listener) => listener({ matches: value, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent));
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => (query.includes("prefers-color-scheme") ? scheme : desktop)),
  );
  return scheme as unknown as MediaQueryList & { setMatches: (value: boolean) => void };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function buildStoredImages(count: number) {
  return Array.from({ length: count }, (_item, index) => ({
    id: `img-${index + 1}`,
    src: `data:image/png;base64,${index + 1}`,
    createdAt: index + 1,
  }));
}

function buildTodos(count: number) {
  return Array.from({ length: count }, (_item, index) => ({
    id: `todo-${index + 1}`,
    text: `事项 ${index + 1}`,
    done: false,
  }));
}

function buildCompletedTodos(count: number) {
  return Array.from({ length: count }, (_item, index) => ({
    id: `done-todo-${index + 1}`,
    text: `已完成事项 ${index + 1}`,
    done: true,
  }));
}

function buildQuickButtons(count: number, tagId = "tag-heavy") {
  return Array.from({ length: count }, (_item, index) => ({
    id: `quick-${index + 1}`,
    title: `快捷 ${index + 1}`,
    value: `内容 ${index + 1}`,
    type: "text" as const,
    tagId,
    hidden: false,
  }));
}

function nextPatchVersion(version: string): string {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the preserved board regions and primary controls", async () => {
    const wrapper = mountApp();

    expect(wrapper.find('[aria-label="应用导航"]').exists()).toBe(false);
    expect(wrapper.find(".workbench-rail").exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-command-bar"]').text()).toContain("Mini Desk");
    expect(wrapper.find('[data-testid="workbench-command-bar"]').text()).not.toContain("搜索或执行命令");
    expect(wrapper.find('[data-testid="workbench-command-bar"]').text()).not.toContain("⌘K");
    expect(wrapper.get(".workbench-zone-assets").attributes("aria-label")).toBe("🎨 图片");
    expect(wrapper.get(".workbench-zone-notes").attributes("aria-label")).toBe("⚡ 快捷动作");
    expect(wrapper.get(".workbench-zone-tasks").attributes("aria-label")).toBe("✅ 提醒事项");
    expect(wrapper.get(".workbench-zone-workspace").attributes("aria-label")).toBe("📝 便签");
    expect(wrapper.find('[aria-label="Mini Desk"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("🎨 图片");
    expect(wrapper.text()).toContain("快捷动作");
    expect(wrapper.text()).toContain("✅ 提醒事项");
    expect(wrapper.text()).toContain("📝 便签");
    expect(wrapper.find(".tool-panel").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "ImagePreview" }).exists()).toBe(false);
    expect(wrapper.find(".workbench-zone-notes > .quick-block").exists()).toBe(true);
    expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["📝 便签"]);
    expect(wrapper.find('[data-testid="workbench-theme"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="快捷动作菜单"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="设置"]').exists()).toBe(true);
    expect(wrapper.find(".image-empty").exists()).toBe(false);
    expect(wrapper.find(".empty-hint").exists()).toBe(false);
    expect(wrapper.find(".todo-empty-hint").text()).toBe("");
    expect(wrapper.findAll("textarea").every((textarea) => !textarea.attributes("placeholder"))).toBe(true);

    wrapper.unmount();
  });

  it("switches default public titles to English while preserving custom titles", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        customTitles: {
          "quick-title": "我的快捷",
        },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("language", "en", wrapper.get(".settings-trigger").element as HTMLElement);
      await nextTick();

      expect(wrapper.text()).toContain("Images");
      expect(wrapper.text()).toContain("我的快捷");
      expect(wrapper.text()).toContain("Reminders");
      expect(wrapper.text()).not.toContain("💻 Work");
      expect(wrapper.text()).not.toContain("📚 Study");
      expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["📝 Sticky"]);
      expect(wrapper.find(".tool-panel").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("快捷动作");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").language).toBe("en");
    } finally {
      wrapper.unmount();
    }
  });

  it("renders persisted dynamic todo lists without forcing legacy periods", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
        todos: { custom: [{ id: "c", text: "C", done: false }] },
        showCompletedTodos: { custom: false },
      }),
    );

    const wrapper = mountApp();

    expect(wrapper.find('[data-testid="todo-list-morning"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="todo-input-custom"]').exists()).toBe(true);

    await wrapper.get('[data-testid="todo-list-custom"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('[data-testid="todo-input-custom"]')).toHaveLength(2);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const workspace = stored.workspaces[0];
    expect(workspace.todoLists.map((list: { id: string }) => list.id)).toEqual(["custom"]);
    expect(workspace.todos.custom.at(-1)).toMatchObject({
      text: "",
      done: false,
    });

    wrapper.unmount();
  });

  it("renders a mobile handoff page instead of board regions on mobile", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find(".mobile-handoff").exists()).toBe(true);
      expect(wrapper.get(".mobile-handoff-title").text()).toBe("Mini Desk");
      expect(wrapper.text()).toContain("建议在电脑浏览器打开，以获得完整体验");
      expect(wrapper.find(".mobile-drawer-trigger").exists()).toBe(false);
      expect(wrapper.find(".mobile-drawer-menu").exists()).toBe(false);
      expect(wrapper.find('[aria-label="Mini Desk"]').exists()).toBe(false);
      expect(wrapper.findComponent(ImagePanel).exists()).toBe(false);
      expect(wrapper.findComponent(QuickButtons).exists()).toBe(false);
      expect(wrapper.findComponent(TodoPanel).exists()).toBe(false);
      expect(wrapper.findComponent(SpacePanel).exists()).toBe(false);
      expect(wrapper.findComponent(SettingsMenu).exists()).toBe(false);
      expect(wrapper.findComponent({ name: "ImagePreview" }).exists()).toBe(false);
      expect(wrapper.findAll("textarea")).toHaveLength(0);
      expect(wrapper.find('[aria-label="切换主题"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("建议在电脑浏览器打开");
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("keeps the mobile handoff companion visible after the desktop bubble timeout", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await vi.advanceTimersByTimeAsync(10500);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("建议在电脑浏览器打开");
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("renders the mobile capture form directly when the URL carries a valid inbox fragment", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find(".mobile-handoff").exists()).toBe(true);
      expect(wrapper.get(".mobile-inbox-heading").text()).toBe("手机速记");
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
      // 已配对进入速记态：右下角「建议在浏览器打开」伙伴气泡整体隐藏。
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("keeps the mobile companion hidden while paired and restores it after changing code", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await vi.advanceTimersByTimeAsync(10500);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

      // 点「更换配对码」：回到输码表单，伙伴气泡恢复、草稿保留。
      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("AB2CDE4FGHJK");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      // 输码配对现为异步（哈希+联网验证）：nextTick 不再覆盖完整链路，需整链冲净。
      await flushAsyncComponents();
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("更换配对码需二次确认：取消则留在速记页", async () => {
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();
      vi.spyOn(window, "confirm").mockReturnValue(false);

      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("preserves the capture draft across a code change and re-pairing", async () => {
    stubMatchMedia(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await wrapper.get('[data-testid="mobile-inbox-text"]').setValue("换码前的想法");
      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();
      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("AB2CDE4FGHJK");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      // 输码配对现为异步（哈希+联网验证）：nextTick 不再覆盖完整链路，需整链冲净。
      await flushAsyncComponents();

      const textarea = wrapper.get('[data-testid="mobile-inbox-text"]').element as HTMLTextAreaElement;
      expect(textarea.value).toBe("换码前的想法");
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("auto-pairs from the remembered code on a bare mobile visit", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "";
    localStorage.setItem(REMEMBERED_INBOX_CODE_KEY, "AB2CDE4FGHJK");
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("prefers the URL fragment over the remembered code and overwrites the memory", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=ZZZ0ZZZ0ZZZ0";
    localStorage.setItem(REMEMBERED_INBOX_CODE_KEY, "AB2CDE4FGHJK");
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBe("ZZZ0ZZZ0ZZZ0");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("remembers a manually confirmed code", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("ab2c de4f ghjk");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      // 输码配对现为异步（哈希+联网验证）：nextTick 不再覆盖完整链路，需整链冲净。
      await flushAsyncComponents();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBe("AB2CDE4FGHJK");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not write the remembered code when a desktop viewport visits with a fragment", async () => {
    vi.useFakeTimers();
    stubMatchMedia(false);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find(".mobile-handoff").exists()).toBe(false);
      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBeNull();
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows the paired code in the footer and switches pairing via the change button", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.get('[data-testid="mobile-inbox-paired-code"]').text()).toBe("已配对：AB2C DE4F GHJK");

      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBeNull();
      expect(window.location.hash).toBe("");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("copies the pairing code on tap and shows a copy-success toast", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await wrapper.get('[data-testid="mobile-inbox-paired-code"]').trigger("click");
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.vm.$nextTick();

      expect(writeText).toHaveBeenCalledWith("AB2C DE4F GHJK");
      expect(wrapper.get('[data-testid="mobile-inbox-copy-toast"]').text()).toBe("复制成功");

      // 提示短暂停留后自动消失。
      await vi.advanceTimersByTimeAsync(1800);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="mobile-inbox-copy-toast"]').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      if (previousClipboard) Object.defineProperty(globalThis.navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(globalThis.navigator, "clipboard");
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("persists a code that arrives via hashchange mid-session", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();
      await flushPromises();
      window.location.hash = "#inbox=ZZZ0ZZZ0ZZZ0";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBe("ZZZ0ZZZ0ZZZ0");
      expect(wrapper.get('[data-testid="mobile-inbox-paired-code"]').text()).toBe("已配对：ZZZ0 ZZZ0 ZZZ0");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("writes the remembered code only after the viewport flips to mobile", async () => {
    vi.useFakeTimers();
    const mediaQueryList = stubMatchMedia(false);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBeNull();

      mediaQueryList.dispatchEvent({ matches: true, media: "(max-width: 900px)" } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      expect(localStorage.getItem(REMEMBERED_INBOX_CODE_KEY)).toBe("AB2CDE4FGHJK");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows the manual code entry and an inline error with aria linkage for an invalid code", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-error"]').exists()).toBe(false);

      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("abc");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="mobile-inbox-code-error"]').text()).toBe("配对码格式不对，请检查后重试");
      expect(wrapper.get('[data-testid="mobile-inbox-code-error"]').attributes("id")).toBe("mobile-inbox-code-error");
      expect(wrapper.get('[data-testid="mobile-inbox-code-input"]').attributes("aria-invalid")).toBe("true");
      expect(wrapper.get('[data-testid="mobile-inbox-code-input"]').attributes("aria-describedby")).toBe("mobile-inbox-code-error");
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("normalizes a grouped lowercase code into the capture form and writes back the fragment", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("ab2c de4f ghjk");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      // 输码配对现为异步（哈希+联网验证）：nextTick 不再覆盖完整链路，需整链冲净。
      await flushAsyncComponents();

      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
      expect(wrapper.get(".mobile-inbox-heading").text()).toBe("手机速记");
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(window.location.hash).toContain("#inbox=AB2CDE4FGHJK");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  function mountMobileCodeEntry(): ReturnType<typeof mountApp> {
    stubMatchMedia(true);
    window.location.hash = "";
    return mountApp();
  }

  async function submitCode(wrapper: ReturnType<typeof mountApp>, code: string): Promise<void> {
    await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue(code);
    await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
    await flushAsyncComponents();
  }

  it("输码验证 active：配对成功进入速记页", async () => {
    const wrapper = mountMobileCodeEntry();

    try {
      vi.mocked(checkInboxKeyStatus).mockClear();
      await submitCode(wrapper, "AB2CDE4FGHJK");

      expect(checkInboxKeyStatus).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("输码验证 unknown/revoked：留在输码表单并给出对应提示", async () => {
    const wrapper = mountMobileCodeEntry();

    try {
      vi.mocked(checkInboxKeyStatus).mockResolvedValueOnce("unknown");
      await submitCode(wrapper, "AB2CDE4FGHJK");
      expect(wrapper.get('[data-testid="mobile-inbox-code-error"]').text()).toBe("配对码不存在，请到桌面端获取");
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);

      vi.mocked(checkInboxKeyStatus).mockResolvedValueOnce("revoked");
      await submitCode(wrapper, "AB2CDE4FGHJK");
      expect(wrapper.get('[data-testid="mobile-inbox-code-error"]').text()).toBe("配对码已失效，请到桌面端获取新配对码");
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("输码验证网络失败 fail-open：直接配对", async () => {
    const wrapper = mountMobileCodeEntry();

    try {
      vi.mocked(checkInboxKeyStatus).mockResolvedValueOnce(null);
      await submitCode(wrapper, "AB2CDE4FGHJK");
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("fragment 自动配对不触发验证请求", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      vi.mocked(checkInboxKeyStatus).mockClear();
      wrapper = mountApp();
      await vi.advanceTimersByTimeAsync(300);
      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(checkInboxKeyStatus).not.toHaveBeenCalled();
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("creates a todo from an empty section click", async () => {
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("cancels an empty reminder creation when clicking the same blank list space again", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);

      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await vi.advanceTimersByTimeAsync(300);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(false);
      expect(wrapper.find('.todo-section[data-list-id="morning"]').classes()).not.toContain("is-focused");
      expect(document.activeElement).toBe(document.body);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("cancels the pending blank reminder from same-list blank space even after the input lost focus", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="morning"] .todo-list-shell').trigger("click");
      await wrapper.vm.$nextTick();

      const input = wrapper.get('[data-testid="todo-input-morning"]').element as HTMLInputElement;
      input.blur();
      await wrapper.vm.$nextTick();

      await wrapper.get('.todo-section[data-list-id="morning"] .todo-list-shell').trigger("click");
      await vi.advanceTimersByTimeAsync(300);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(false);
      expect(wrapper.find('.todo-section[data-list-id="morning"]').classes()).not.toContain("is-focused");
      expect(document.activeElement).toBe(document.body);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("undoes the latest board-level change with global Ctrl+Z", async () => {
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      await flushPromises();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(false);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].todos.morning).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not swallow a user change made while undo hydration is pending", async () => {
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await wrapper.vm.$nextTick();
      const deferred = createDeferred<Awaited<ReturnType<typeof hydrateStoredImages>>>();
      vi.spyOn(imageState, "hydrateStoredImages").mockImplementationOnce(() => deferred.promise);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      wrapper.getComponent(SpacePanel).vm.$emit("create");
      await wrapper.vm.$nextTick();
      deferred.resolve([]);
      await flushPromises();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);
      expect(wrapper.getComponent(SpacePanel).props("spaces")).toHaveLength(2);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      await flushPromises();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);
      expect(wrapper.getComponent(SpacePanel).props("spaces")).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });

  it("creates and persists todos from TodoPanel external text events", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("createFromText", "morning", ["任务 A", "任务 B"]);
      await wrapper.vm.$nextTick();

      const renderedTexts = wrapper
        .findAll('[data-testid="todo-input-morning"]')
        .map((input) => (input.element as HTMLInputElement).value);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];

      expect(renderedTexts).toEqual(["任务 A", "任务 B"]);
      expect(workspace.todos.morning.map((todo: { text: string; done: boolean }) => ({
        text: todo.text,
        done: todo.done,
      }))).toEqual([
        { text: "任务 A", done: false },
        { text: "任务 B", done: false },
      ]);
    } finally {
      wrapper.unmount();
    }
  });

  it("creates a configurable reminder list with the submitted title and persists it", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit(
        "createList",
        wrapper.get(".todo-panel").element as HTMLElement,
        "工作提醒",
      );
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists).toHaveLength(2);
      expect(workspace.todoLists.at(-1).title).toBe("工作提醒");
      expect(workspace.todos[workspace.todoLists.at(-1).id]).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not create a reminder list until the create-list dialog submits a title", async () => {
    const wrapper = mountApp();

    try {
      const beforeCount = wrapper.findAll(".todo-section").length;
      wrapper.getComponent(TodoPanel).vm.$emit("createList", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      await nextTick();

      const after = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(wrapper.findAll(".todo-section")).toHaveLength(beforeCount);
      expect(after.todoLists ?? []).toHaveLength(0);
      expect(wrapper.find(".title-edit-input").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("hydrates only the active workspace's images at startup and frees them on switch", async () => {
    const restoreImageDb = installMemoryImageDb();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [
        {
          ...defaultWorkspace(),
          id: "ws-active",
          title: "活跃",
          images: [{ id: "img-active", src: "data:image/png;base64,ACTIVE" }],
        },
        {
          ...defaultWorkspace(),
          id: "ws-idle",
          title: "闲置",
          images: [{ id: "img-idle", src: "data:image/png;base64,IDLE" }],
        },
      ],
      activeWorkspaceId: "ws-active",
    }));
    const wrapper = mountApp();

    try {
      await flushPromises();

      // Reach state through the component instance's setup bindings.
      const app = wrapper.vm as unknown as {
        state: { workspaces: Array<{ id: string; images: Array<{ id: string; src?: string }> }> };
      };
      const byId = (id: string) => app.state.workspaces.find((workspace) => workspace.id === id);
      expect(byId("ws-active")?.images[0].src).toBe("data:image/png;base64,ACTIVE");
      expect(byId("ws-idle")?.images[0].src).toBeUndefined();

      wrapper.getComponent(WorkspaceSwitcher).vm.$emit("switch", "ws-idle");
      await flushPromises();

      expect(byId("ws-active")?.images[0].src).toBeUndefined();
      expect(byId("ws-idle")?.images[0].src).toBe("data:image/png;base64,IDLE");
    } finally {
      wrapper.unmount();
      restoreImageDb();
    }
  });

  it("persists reminder list title updates", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
        todos: { work: [] },
        showCompletedTodos: { work: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("updateListTitle", "work", "  工作提醒  ");
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.find((list: { id: string }) => list.id === "work").title).toBe("工作提醒");
    } finally {
      wrapper.unmount();
    }
  });

  it("persists reminder list collapsed and compact flags", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
        todos: { work: [] },
        showCompletedTodos: { work: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("toggleListCollapsed", "work", true);
      wrapper.getComponent(TodoPanel).vm.$emit("toggleListCompact", "work", true);
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.find((list: { id: string }) => list.id === "work")).toMatchObject({
        collapsed: true,
        compact: true,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("confirms deletion of a non-empty reminder list and removes its reminders", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [
          { id: "work", title: "工作", collapsed: false, compact: false },
          { id: "home", title: "生活", collapsed: false, compact: false },
        ],
        todos: { work: [{ id: "a", text: "A", done: false }], home: [] },
        showCompletedTodos: { work: false, home: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="work"] .todo-section-menu-button').trigger("click");
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除列表")?.trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toMatch(/删除列表|提醒事项/);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.some((list: { id: string }) => list.id === "work")).toBe(false);
      expect(workspace.todos.work).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms deletion of an empty reminder list before removing it", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [
          { id: "work", title: "工作", collapsed: false, compact: false },
          { id: "home", title: "生活", collapsed: false, compact: false },
        ],
        todos: { work: [], home: [] },
        showCompletedTodos: { work: false, home: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("deleteList", "work", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toMatch(/删除列表|提醒列表/);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].todoLists.map((list: { id: string }) => list.id)).toEqual(["work", "home"]);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await nextTick();

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].todoLists.map((list: { id: string }) => list.id)).toEqual(["home"]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("blocks deleting the last reminder list", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
        todos: { work: [] },
        showCompletedTodos: { work: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("deleteList", "work", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.map((list: { id: string }) => list.id)).toEqual(["work"]);
      expect(workspace.todos.work).toEqual([]);
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("至少保留一个提醒事项列表");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("persists reminder list reorder", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [
          { id: "a", title: "A", collapsed: false, compact: false },
          { id: "b", title: "B", collapsed: false, compact: false },
        ],
        todos: { a: [], b: [] },
        showCompletedTodos: { a: false, b: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="b"] .todo-list-drag-handle').trigger("dragstart");
      await wrapper.get('.todo-section[data-list-id="a"]').trigger("drop");

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.map((list: { id: string }) => list.id)).toEqual(["b", "a"]);
    } finally {
      wrapper.unmount();
    }
  });

  it("uses the same before-target ordering for adjacent and non-adjacent list reorders", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [
          { id: "a", title: "A", collapsed: false, compact: false },
          { id: "b", title: "B", collapsed: false, compact: false },
          { id: "c", title: "C", collapsed: false, compact: false },
        ],
        todos: { a: [], b: [], c: [] },
        showCompletedTodos: { a: false, b: false, c: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="a"] .todo-list-drag-handle').trigger("dragstart");
      await wrapper.get('.todo-section[data-list-id="b"]').trigger("drop");

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.map((list: { id: string }) => list.id)).toEqual(["a", "b", "c"]);
    } finally {
      wrapper.unmount();
    }
  });

  it("focuses todos for imported list ids with selector characters", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [{ id: 'bad"]id', title: "特殊", collapsed: false, compact: false }],
        todos: { 'bad"]id': [] },
        showCompletedTodos: { 'bad"]id': false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("create", 'bad"]id');
      await nextTick();
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todos['bad"]id']).toHaveLength(1);
      expect(workspace.todos['bad"]id'][0]).toMatchObject({ text: "", done: false });
      expect(
        wrapper
          .findAll("input.todo-input")
          .some((input) => (input.element as HTMLInputElement).dataset.testid === 'todo-input-bad"]id'),
      ).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("ignores stale create events without restoring deleted default lists", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
        todos: { custom: [{ id: "blank", text: "", done: false }] },
        showCompletedTodos: { custom: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("create", "morning");
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.map((list: { id: string }) => list.id)).toEqual(["custom"]);
      expect(workspace.todos).toEqual({
        custom: [{ id: "blank", text: "", done: false }],
      });
      expect(workspace.showCompletedTodos).toEqual({ custom: false });
    } finally {
      wrapper.unmount();
    }
  });

  it("ignores stale drop update and move events without orphan todo records", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace(),
        todoLists: [
          { id: "home", title: "生活", collapsed: false, compact: false },
          { id: "work", title: "工作", collapsed: false, compact: false },
        ],
        todos: {
          home: [{ id: "home-a", text: "Home", done: false }],
          work: [],
        },
        showCompletedTodos: { home: false, work: false },
      }],
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("deleteList", "work", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      wrapper.getComponent(CompanionBubble).vm.$emit("yes");
      await nextTick();

      wrapper.getComponent(TodoPanel).vm.$emit("createFromText", "work", ["stale drop"]);
      wrapper.getComponent(TodoPanel).vm.$emit("update", "work", "missing", "stale update");
      wrapper.getComponent(TodoPanel).vm.$emit("toggleCompletedVisibility", "work", true);
      wrapper.getComponent(TodoPanel).vm.$emit("move", { period: "home", id: "home-a" }, "morning");
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.todoLists.map((list: { id: string }) => list.id)).toEqual(["home"]);
      expect(workspace.todos.home).toEqual([
        expect.objectContaining({ id: "home-a", text: "Home", done: false }),
      ]);
      expect(workspace.showCompletedTodos).toEqual({ home: false });
      expect(workspace.todos.work).toBeUndefined();
      expect(workspace.todos.morning).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps at most one blank todo when blank list space is clicked repeatedly", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "done-1", text: "已完成事项", done: true }],
        },
      }),
    );
    const wrapper = mountApp();
    const list = wrapper.get('[data-testid="todo-list-morning"]');

    await list.trigger("click");
    await wrapper.vm.$nextTick();
    await list.trigger("click");
    await wrapper.vm.$nextTick();
    await list.trigger("click");
    await wrapper.vm.$nextTick();

    const blankInputs = wrapper
      .findAll('[data-testid="todo-input-morning"]')
      .filter((input) => (input.element as HTMLInputElement).value === "");
    expect(blankInputs).toHaveLength(1);

    wrapper.unmount();
  });

  it("adds blank-space reminders below open reminders and above the completed divider", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        showCompletedTodos: { morning: true },
        todos: {
          morning: [
            { id: "done-1", text: "已完成事项", done: true },
            { id: "open-1", text: "未完成事项", done: false },
          ],
        },
      }),
    );
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
    await wrapper.vm.$nextTick();

    const renderedTexts = wrapper
      .findAll('[data-testid="todo-input-morning"]')
      .map((input) => (input.element as HTMLInputElement).value);
    expect(renderedTexts).toEqual(["未完成事项", "", "已完成事项"]);
    expect(wrapper.find(".todo-completed-divider").exists()).toBe(true);

    wrapper.unmount();
  });

  it("adds Enter-created reminders directly below the edited reminder and above completed items", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        showCompletedTodos: { morning: true },
        todos: {
          morning: [
            { id: "done-1", text: "已完成事项", done: true },
            { id: "open-1", text: "未完成事项", done: false },
          ],
        },
      }),
    );
    const wrapper = mountApp();
    const inputWrapper = wrapper.get('[data-testid="todo-input-morning"]');
    const input = inputWrapper.element as HTMLInputElement;

    await inputWrapper.trigger("click");
    input.setSelectionRange(input.value.length, input.value.length);
    await inputWrapper.trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();

    const renderedTexts = wrapper
      .findAll('[data-testid="todo-input-morning"]')
      .map((item) => (item.element as HTMLInputElement).value);
    expect(renderedTexts).toEqual(["未完成事项", "", "已完成事项"]);

    wrapper.unmount();
  });

  it("keeps a single blank todo across all reminder sections", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        showCompletedTodos: { morning: false, noon: false, evening: false },
        todos: {
          morning: [{ id: "done-1", text: "早上完成项", done: true }],
          noon: [{ id: "done-2", text: "中午完成项", done: true }],
          evening: [{ id: "done-3", text: "晚上完成项", done: true }],
        },
      }),
    );
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="todo-list-noon"]').trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="todo-list-evening"]').trigger("click");
    await wrapper.vm.$nextTick();

    const blankInputs = wrapper
      .findAll("input.todo-input")
      .filter((input) => (input.element as HTMLInputElement).value === "");
    expect(blankInputs).toHaveLength(1);
    expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="todo-input-noon"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="todo-input-evening"]').exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.get('[data-testid="todo-input-evening"]').element);

    wrapper.unmount();
  });

  it("shows an empty editor Tips bubble on focus and the save bubble on Ctrl+S", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      await wrapper.get("textarea").trigger("focus");

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/工作空间|空间标签|缩进|步骤/);

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
        }),
      );
      await wrapper.vm.$nextTick();

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".n-popover").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/保存|收好|记下|归档|备份|存好|存档|更新|继续/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("rotates the area tips each time the companion GIF is clicked during a normal bubble", async () => {
    vi.useFakeTimers();
    // 指南气泡的文案是从数组里随机挑的：固定随机数，让首个气泡可断言。
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      // 聚焦空文本编辑器 → 「工作空间」区域的普通指南气泡 + GIF。
      await wrapper.get("textarea").trigger("focus");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/工作空间|空间标签|缩进|步骤/);

      // GIF 点击的 Tips 与右键菜单「Tips」共用 GUIDE_MESSAGES 文案池。
      const workspaceTips = getGuideMessages("zh").workspace;
      expect(workspaceTips.length).toBeGreaterThan(1);

      await wrapper.get('[data-testid="companion-gif"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      const firstTipBubble = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(firstTipBubble.startsWith(workspaceTips[0])).toBe(true);
      // 与右键菜单的 Tips 项一致：句尾附带颜文字。
      expect(firstTipBubble.length).toBeGreaterThan(workspaceTips[0].length);

      await wrapper.get('[data-testid="companion-gif"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      const secondTipBubble = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(secondTipBubble.startsWith(workspaceTips[1])).toBe(true);
      expect(secondTipBubble.length).toBeGreaterThan(workspaceTips[1].length);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps rotating the anchored toast's own area tips on repeated GIF clicks", async () => {
    vi.useFakeTimers();
    // 快捷文本复制气泡带 quick-block 锚点但没有 guideKey：区域只能靠锚点解析。
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [{ id: "text-1", title: "片段", value: "复制内容", type: "text" }],
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/文本|文字|复制|剪贴板|粘贴/);

      // 快捷区气泡按锚点解析到 quickButtons 指南键，文案与右键「Tips」同池。
      const quickTips = getGuideMessages("zh").quickButtons;
      expect(quickTips.length).toBeGreaterThan(1);

      await wrapper.get('[data-testid="companion-gif"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      const firstTipBubble = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(firstTipBubble.startsWith(quickTips[0])).toBe(true);
      // 与右键菜单的 Tips 项一致：句尾附带颜文字。
      expect(firstTipBubble.length).toBeGreaterThan(quickTips[0].length);

      // 第二次点击仍在原区域逐条轮换，而不是锚点被清空后退回「工作台」。
      await wrapper.get('[data-testid="companion-gif"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      const secondTipBubble = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(secondTipBubble.startsWith(quickTips[1])).toBe(true);
      expect(secondTipBubble.length).toBeGreaterThan(quickTips[1].length);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not show the GIF when focusing a non-empty editor without a bubble", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        spaces: [{ id: "workspace", title: "工作空间", lines: [{ text: "已有内容", indent: 0 }] }],
        activeSpaceId: "workspace",
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get("textarea").trigger("focus");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows workspace density status dots instead of text save state", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");

      const textarea = wrapper.get("textarea");
      await textarea.trigger("dblclick");
      await textarea.setValue("临时记录");

      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");

      await vi.advanceTimersByTimeAsync(120);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows an airy workspace density tip when clicking the status lamp", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="save-status"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.getComponent(CompanionBubble).props("message") as string;
      expect(message).toContain("今日桌面");
      expect(message).toContain("轻盈");
      expect(KAOMOJI_BY_MOOD.calm.some((kaomoji) => message.endsWith(kaomoji))).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a full workspace density status when any area is over the limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: buildStoredImages(31),
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saving");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：略满");

      await wrapper.get('[data-testid="save-status"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.getComponent(CompanionBubble).props("message") as string;
      expect(message).toContain("桌面");
      expect(message).toContain("图片");
      expect(message).toContain("31");
      expect(KAOMOJI_BY_MOOD.warning.some((kaomoji) => message.endsWith(kaomoji))).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps todo density airy when a list only exceeds the limit with completed reminders", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todoLists: [{ id: "done-heavy", title: "已完成", collapsed: false, compact: false }],
        todos: { "done-heavy": buildCompletedTodos(21) },
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");
    } finally {
      wrapper.unmount();
    }
  });

  it("shows a heated workspace density status when todos, quick actions, and images are all over the limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: buildStoredImages(31),
        quickTags: [{ id: "tag-heavy", title: "工作" }],
        quickButtons: buildQuickButtons(51),
        todoLists: [{ id: "heavy", title: "任务", collapsed: false, compact: false }],
        todos: { heavy: buildTodos(21) },
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("dirty");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：过热");

      await wrapper.get('[data-testid="save-status"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.getComponent(CompanionBubble).props("message") as string;
      expect(message).toContain("今日桌面");
      expect(message).toContain("过热");
      expect(message).toContain("提醒事项 21");
      expect(message).toContain("快捷动作 51");
      expect(message).toContain("图片 31");
      expect(KAOMOJI_BY_MOOD.warning.some((kaomoji) => message.endsWith(kaomoji))).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("suggests grouping when untagged quick actions pile up beyond the limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: buildQuickButtons(51, undefined),
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saving");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：略满");

      await wrapper.get('[data-testid="save-status"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.getComponent(CompanionBubble).props("message") as string;
      expect(message).toContain("分组");
      expect(KAOMOJI_BY_MOOD.warning.some((kaomoji) => message.endsWith(kaomoji))).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("suggests grouping when reminders pile up beyond the limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todoLists: [{ id: "heavy", title: "任务", collapsed: false, compact: false }],
        todos: { heavy: buildTodos(21) },
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saving");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：略满");

      await wrapper.get('[data-testid="save-status"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.getComponent(CompanionBubble).props("message") as string;
      expect(message).toMatch(/清单|分组/);
      expect(KAOMOJI_BY_MOOD.warning.some((kaomoji) => message.endsWith(kaomoji))).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps quick action density airy at exactly fifty untagged buttons", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: buildQuickButtons(50, undefined),
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");
    } finally {
      wrapper.unmount();
    }
  });

  it("flags image density full once the list passes thirty items", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: buildStoredImages(31),
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saving");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：略满");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps image density airy at exactly thirty items", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: buildStoredImages(30),
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("今日桌面：轻盈");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the companion bubble on screen when the reminder list is taller than the viewport", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const viewportHeight = window.innerHeight;
    const tallBottom = viewportHeight + 4000;
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("todo-section")) {
        return { top: 0, left: 0, right: 320, bottom: tallBottom, width: 320, height: tallBottom, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      return { top: 0, left: 0, right: 320, bottom: 300, width: 320, height: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todoLists: [{ id: "heavy", title: "任务", collapsed: false, compact: false }],
        todos: { heavy: buildTodos(3) },
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get(".todo-item").trigger("contextmenu");
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const position = wrapper.getComponent(CompanionBubble).props("position") as { bottom?: string } | undefined;
      expect(position?.bottom).toBeTruthy();
      expect(position?.bottom).toContain(`${viewportHeight}`);
      expect(position?.bottom).not.toContain(`${tallBottom}`);
    } finally {
      rectSpy.mockRestore();
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("force-resets and re-shows the guide bubble when Tips is clicked again after switching areas", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todoLists: [{ id: "heavy", title: "任务", collapsed: false, compact: false }],
        todos: { heavy: buildTodos(3) },
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get(".todo-item").trigger("contextmenu");
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");
      await flushPromises();
      await wrapper.vm.$nextTick();
      const clearSignalAfterFirst = wrapper.getComponent(CompanionBubble).props("clearSignal") as number;

      // Switching away blurs the todo panel, which clears activeGuideKey but leaves the bubble timer running.
      wrapper.findComponent(TodoPanel).vm.$emit("blur");
      await wrapper.vm.$nextTick();

      await wrapper.get(".todo-item").trigger("contextmenu");
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");
      await flushPromises();
      await wrapper.vm.$nextTick();

      const companion = wrapper.getComponent(CompanionBubble);
      expect(companion.props("clearSignal")).toBe(clearSignalAfterFirst + 1);
      expect(companion.props("message")).toBeTruthy();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors the todo Tips bubble to the list section corner, not the last item", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const viewportHeight = window.innerHeight;
    const sectionBottom = Math.floor(viewportHeight * 0.6);
    const listBottom = Math.floor(viewportHeight * 0.4);
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("todo-section")) {
        return { top: 0, left: 0, right: 320, bottom: sectionBottom, width: 320, height: sectionBottom, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      if (this.classList.contains("todo-list")) {
        return { top: 0, left: 0, right: 320, bottom: listBottom, width: 320, height: listBottom, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      return { top: 0, left: 0, right: 320, bottom: 300, width: 320, height: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todoLists: [{ id: "heavy", title: "任务", collapsed: false, compact: false }],
        todos: { heavy: buildTodos(3) },
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get(".todo-item").trigger("contextmenu");
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");
      await flushPromises();
      await wrapper.vm.$nextTick();

      const position = wrapper.getComponent(CompanionBubble).props("position") as { bottom?: string } | undefined;
      expect(position?.bottom).toContain(`${sectionBottom}`);
      expect(position?.bottom).not.toContain(`${listBottom}`);
    } finally {
      rectSpy.mockRestore();
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("creates reminder lists with completed reminders hidden by default", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("createList", undefined, "新列表");
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      const listId = workspace.todoLists.at(-1).id;
      expect(workspace.showCompletedTodos[listId]).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not run board shortcuts or paste handling while mobile is blocked", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      const pasteEvent = new Event("paste", { cancelable: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          items: [
            {
              type: "image/png",
              getAsFile: vi.fn(() => new File(["image"], "mobile.png", { type: "image/png" })),
            },
          ],
        },
      });
      document.dispatchEvent(pasteEvent);
      expect(pasteEvent.defaultPrevented).toBe(false);

      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="save-status"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("保存中");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("建议在电脑浏览器打开");
      expect(wrapper.findComponent(ImagePanel).exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not finish an in-flight image paste after entering mobile handoff", async () => {
    vi.useFakeTimers();
    const mediaQuery = stubMatchMedia(false);
    const readers: Array<{
      result: string | ArrayBuffer | null;
      onload: (() => void) | null;
      onerror: (() => void) | null;
    }> = [];
    class DelayedFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        readers.push(this);
      }
    }
    vi.stubGlobal("FileReader", DelayedFileReader);
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();
      await wrapper.vm.$nextTick();
      await Promise.resolve();
      await Promise.resolve();
      const pasteEvent = new Event("paste", { cancelable: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          items: [
            {
              type: "image/png",
              getAsFile: vi.fn(() => new File(["late"], "late.png", { type: "image/png" })),
            },
          ],
        },
      });

      document.dispatchEvent(pasteEvent);
      expect(pasteEvent.defaultPrevented).toBe(true);
      expect(readers).toHaveLength(1);

      mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      readers[0].result = "data:image/png;base64,bGF0ZQ==";
      readers[0].onload?.();
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".image-card").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("removes a stored image payload when mobile handoff starts before image state is updated", async () => {
    const mediaQuery = stubMatchMedia(false);
    const putRequests: Array<{
      record: { id: string; src?: string };
      request: { result?: unknown; error?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
    }> = [];
    const deletedIds: string[] = [];
    const fakeStore = {
      put: vi.fn((record: { id: string; src?: string }) => {
        const request: { result: string; error: null; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
          result: record.id,
          error: null,
          onsuccess: null,
          onerror: null,
        };
        putRequests.push({ record, request });
        return request;
      }),
      delete: vi.fn((id: string) => {
        deletedIds.push(id);
        const request: { result: undefined; error: null; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }),
    };
    const fakeDb = {
      objectStoreNames: { contains: vi.fn(() => true) },
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => fakeStore),
        onerror: undefined,
        error: null,
      })),
      close: vi.fn(),
    };
    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        const request: {
          result: typeof fakeDb;
          error: null;
          onsuccess: (() => void) | null;
          onerror: (() => void) | null;
          onupgradeneeded: (() => void) | null;
        } = { result: fakeDb, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }),
    });
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        this.result = "data:image/png;base64,c3RvcmVk";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();
      await wrapper.vm.$nextTick();
      await Promise.resolve();
      await Promise.resolve();
      wrapper
        .getComponent(ImagePanel)
        .vm.$emit("dropFiles", [new File(["stored"], "stored.png", { type: "image/png" })], wrapper.get(".image-panel").element as HTMLElement);
      await vi.waitFor(() => {
        expect(putRequests).toHaveLength(1);
      });

      putRequests[0].request.onsuccess?.();
      mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent);
      await vi.waitFor(() => {
        expect(deletedIds).toEqual([putRequests[0].record.id]);
      });

      mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".image-card").exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("clears pending autosave before mobile handoff can show stale companion state", async () => {
    vi.useFakeTimers();
    const mediaQuery = stubMatchMedia(false);
    const wrapper = mountApp();

    try {
      const textarea = wrapper.get("textarea");
      await textarea.trigger("dblclick");
      await textarea.setValue("移动端切换前的草稿");
      await wrapper.vm.$nextTick();

      mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".mobile-handoff").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(3200);
      await wrapper.vm.$nextTick();

      mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".workbench-shell").exists()).toBe(true);
      expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toContain("移动端切换前的草稿");
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not show the companion GIF after toggling the theme", async () => {
    const wrapper = mountApp();

    await wrapper.get("textarea").trigger("focus");
    expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

    await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    wrapper.unmount();
  });

  it("主题手动切换固化为明/暗两态，不再轮换出跟随系统", async () => {
    const wrapper = mountApp();

    try {
      // 默认 auto + jsdom 无 matchMedia（systemDark=false）：实际渲染浅色，按钮提示切深色。
      expect(wrapper.get('[data-testid="workbench-theme"]').attributes("aria-label")).toBe("切换到深色");

      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(wrapper.get('[data-testid="workbench-theme"]').attributes("aria-label")).toBe("切换到浅色");

      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    } finally {
      wrapper.unmount();
    }
  });

  it("系统再次切换明暗时重新交还跟随，手动选择只保留到那一刻", async () => {
    // 手动深色 + 系统浅色：加载时的初次同步不算「系统切换」，手动选择保持不变。
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "dark" }));
    const previousMatchMedia = window.matchMedia;
    const scheme = stubSystemThemeMatchMedia(false);
    const wrapper = mountApp();

    try {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("dark");

      // 系统切到深色：偏好交还跟随（auto），渲染随系统变深。
      scheme.setMatches(true);
      await wrapper.vm.$nextTick();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("auto");
      expect(document.documentElement.dataset.theme).toBe("dark");

      // 系统再切回浅色：仍是跟随模式，页面跟着变浅。
      scheme.setMatches(false);
      await wrapper.vm.$nextTick();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("auto");
      expect(document.documentElement.dataset.theme).toBe("light");
    } finally {
      wrapper.unmount();
      // 本测试的 matchMedia 桩按查询串路由，泄漏会污染后续测试：恢复到测试前的取值。
      vi.stubGlobal("matchMedia", previousMatchMedia);
    }
  });

  it("跟随系统中手动切换立即生效，直到系统再次切换才交还", async () => {
    const previousMatchMedia = window.matchMedia;
    const scheme = stubSystemThemeMatchMedia(false);
    const wrapper = mountApp();

    try {
      expect(document.documentElement.dataset.theme).toBe("light");

      // 手动切深色：脱离跟随，即使系统偏好仍是浅色。
      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");

      // 系统随后切到深色：那一刻起重新跟随（渲染仍为深色，但偏好回到 auto）。
      scheme.setMatches(true);
      await wrapper.vm.$nextTick();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").theme).toBe("auto");
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      wrapper.unmount();
      vi.stubGlobal("matchMedia", previousMatchMedia);
    }
  });

  it("confirms clearing completed todos with the companion bubble", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "done-1", text: "已完成事项", done: true }],
        },
      }),
    );
    const confirmSpy = vi.spyOn(window, "confirm");
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit(
        "clearCompleted",
        "morning",
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-yes"]').text()).toBe("清理");
      expect(wrapper.find('[data-testid="companion-no"]').text()).toBe("取消");
      expect(wrapper.getComponent(TodoPanel).props("todos").morning).toEqual([
        expect.objectContaining({ id: "done-1", done: true }),
      ]);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/已清理完成项/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
      expect(wrapper.getComponent(TodoPanel).props("todos").morning).toEqual([]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms todo deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "待删除提醒", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const todoSection = wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("remove", "morning", "todo-1", todoSection);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");
      expect(wrapper.get('[data-testid="companion-yes"]').classes()).toContain("is-danger");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll("input.todo-input").some((input) => (input.element as HTMLInputElement).value === "待删除提醒")).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/提醒已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("writes notification time from TodoPanel notify events", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", 1779721200000, anchor);
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({
        notifyAt: 1779721200000,
      });
      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).not.toHaveProperty("deadlineAt");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].todos.morning[0]).toMatchObject({
        notifyAt: 1779721200000,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("requests web notification permission and sends due reminder notifications", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const notificationSpy = vi.fn();
    class NotificationStub {
      static permission: NotificationPermission = "default";
      static requestPermission = vi.fn(async () => {
        NotificationStub.permission = "granted";
        return "granted" as NotificationPermission;
      });

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 30).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(NotificationStub.requestPermission).toHaveBeenCalledTimes(1);
      expect(notificationSpy).toHaveBeenCalledTimes(1);
      expect(notificationSpy).toHaveBeenCalledWith("【✅ 提醒事项】", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
        icon: expect.stringMatching(/^https?:\/\/.*(?:mini-desk-cat\.png|kun|yunxia)/),
      });
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("keeps the browser tab title in sync with the workspace title via the rename dialog", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ workspaces: [{ ...defaultWorkspace(), customTitles: { "board-title": "我的桌面" } }] }),
    );
    const previousTitle = document.title;
    const wrapper = mountApp();

    try {
      await nextTick();
      expect(document.title).toBe("我的桌面");
      // The WorkspaceSwitcher trigger fills the title slot; the fallback must NOT render.
      expect(wrapper.find(".workbench-title-fallback").exists()).toBe(false);
      expect(wrapper.get('[data-testid="workspace-trigger"]').text()).toContain("我的桌面");

      // Open the switcher and rename the active ("default") workspace via the dialog.
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get('[data-testid="workspace-rename-default"]').trigger("click");
      await nextTick();
      expect(wrapper.find(".n-modal").exists()).toBe(true);
      await wrapper.get(".n-modal input").setValue("工作台");
      await wrapper.get(".n-modal .n-button--primary-type").trigger("click");
      await nextTick();

      expect(document.title).toBe("工作台");
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].customTitles["board-title"]).toBe("工作台");
    } finally {
      wrapper.unmount();
      document.title = previousTitle;
    }
  });

  it("pre-fills the rename dialog title with the displayed name but leaves slogan blank when unset", async () => {
    // A workspace with no custom title falls back to DEFAULT_BOARD_TITLE, and one
    // with no slogan must keep the optional slogan input empty. Seed an explicit
    // empty-customTitles workspace (the shipped default now carries a slogan).
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ workspaces: [{ ...defaultWorkspace(), customTitles: {} }] }),
    );
    const wrapper = mountApp();

    try {
      await nextTick();
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get('[data-testid="workspace-rename-default"]').trigger("click");
      await nextTick();

      const inputs = wrapper.findAll(".n-modal input");
      expect((inputs[0].element as HTMLInputElement).value).toBe("Mini Desk");
      expect((inputs[1].element as HTMLInputElement).value).toBe("");
    } finally {
      wrapper.unmount();
    }
  });

  it("pre-fills the rename dialog with an explicit workspace slogan when set", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workspaces: [
          { ...defaultWorkspace(), customTitles: { "board-title": "我的桌面", "board-slogan": "加油干" } },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await nextTick();
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get('[data-testid="workspace-rename-default"]').trigger("click");
      await nextTick();

      const inputs = wrapper.findAll(".n-modal input");
      expect((inputs[0].element as HTMLInputElement).value).toBe("我的桌面");
      expect((inputs[1].element as HTMLInputElement).value).toBe("加油干");
    } finally {
      wrapper.unmount();
    }
  });

  it("ships the default workspace with the default slogan on first open", async () => {
    // A brand-new user (no persisted state) gets the default workspace, which now
    // carries the default slogan "Do less, do it well." in its customTitles.
    localStorage.removeItem(STORAGE_KEY);
    const wrapper = mountApp();

    try {
      await nextTick();
      expect(wrapper.get(".workbench-slogan").text()).toBe("Do less, do it well.");
    } finally {
      wrapper.unmount();
    }
  });

  it("hides the header slogan when the active workspace has no slogan set", async () => {
    // A workspace without a slogan must not surface anything in the header, even
    // though the shipped default workspace carries the default tagline.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ workspaces: [{ ...defaultWorkspace(), customTitles: {} }] }),
    );
    const wrapper = mountApp();

    try {
      await nextTick();
      expect(wrapper.find(".workbench-slogan").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("shows the header slogan when the active workspace has one set", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workspaces: [
          { ...defaultWorkspace(), customTitles: { "board-title": "我的桌面", "board-slogan": "加油干" } },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await nextTick();
      expect(wrapper.get(".workbench-slogan").text()).toBe("加油干");
    } finally {
      wrapper.unmount();
    }
  });

  it("creates a new workspace from the unified create dialog", async () => {
    const previousTitle = document.title;
    const wrapper = mountApp();

    try {
      // Open the switcher and request a new workspace via the shared dialog.
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await wrapper.get('[data-testid="workspace-create-button"]').trigger("click");
      await nextTick();
      expect(wrapper.find(".n-modal").exists()).toBe(true);
      await wrapper.get(".n-modal input").setValue("新桌面");
      await wrapper.get(".n-modal .n-button--primary-type").trigger("click");
      await nextTick();

      expect(document.title).toBe("新桌面");
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      // The default state ships a single workspace; creating adds a second.
      expect(stored.workspaces).toHaveLength(2);
      expect(stored.workspaces.at(-1).customTitles["board-title"]).toBe("新桌面");
      expect(stored.activeWorkspaceId).toBe(stored.workspaces.at(-1).id);
    } finally {
      wrapper.unmount();
      document.title = previousTitle;
    }
  });

  it("flashes the browser title after a due reminder notification until the tab is visible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState")
      ?? Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const notificationSpy = vi.fn();
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 1).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await vi.advanceTimersByTimeAsync(1000);

      expect(notificationSpy).toHaveBeenCalledTimes(1);
      expect(document.title).toContain("新提醒");

      await vi.advanceTimersByTimeAsync(749);
      expect(document.title).toContain("新提醒");

      await vi.advanceTimersByTimeAsync(1);
      expect(document.title).toBe("Mini Desk");

      await vi.advanceTimersByTimeAsync(749);
      expect(document.title).toBe("Mini Desk");

      await vi.advanceTimersByTimeAsync(1);
      expect(document.title).toContain("新提醒");

      window.dispatchEvent(new Event("focus"));
      expect(document.title).toBe("Mini Desk");

      await vi.advanceTimersByTimeAsync(1200);
      expect(document.title).toBe("Mini Desk");

      const secondNotifyAt = new Date(2026, 4, 25, 8, 0, 3).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", secondNotifyAt);
      await vi.advanceTimersByTimeAsync(2000);
      expect(document.title).toContain("新提醒");

      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(document.title).toBe("Mini Desk");

      await vi.advanceTimersByTimeAsync(1200);
      expect(document.title).toBe("Mini Desk");
    } finally {
      wrapper.unmount();
      document.title = "Mini Desk";
      if (originalVisibilityDescriptor) Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("uses the English notification document title when the language is English", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState")
      ?? Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language: "en",
        todos: {
          morning: [{ id: "todo-1", text: "Drink water", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 1).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await vi.advanceTimersByTimeAsync(1000);

      expect(document.title).toContain("New reminder");
      expect(document.title).not.toContain("新提醒");
    } finally {
      wrapper.unmount();
      document.title = "Mini Desk";
      if (originalVisibilityDescriptor) Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("highlights the reminder row briefly when the user returns after a due notification", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState")
      ?? Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const notificationSpy = vi.fn();
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 1).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await vi.advanceTimersByTimeAsync(1000);
      await wrapper.vm.$nextTick();

      expect(notificationSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.get('.todo-item[data-todo-id="todo-1"]').classes()).not.toContain("is-notify-flashing");

      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.todo-item[data-todo-id="todo-1"]').classes()).toContain("is-notify-flashing");

      await vi.advanceTimersByTimeAsync(2399);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.todo-item[data-todo-id="todo-1"]').classes()).toContain("is-notify-flashing");

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.todo-item[data-todo-id="todo-1"]').classes()).not.toContain("is-notify-flashing");
    } finally {
      wrapper.unmount();
      if (originalVisibilityDescriptor) Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("sends future reminder notifications at the exact due time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const notificationSpy = vi.fn();
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 10).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(notificationSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(notificationSpy).toHaveBeenCalledTimes(1);
      expect(notificationSpy).toHaveBeenCalledWith("【✅ 提醒事项】", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
        icon: expect.stringMatching(/^https?:\/\/.*(?:mini-desk-cat\.png|kun|yunxia)/),
      });
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("retries due reminder notifications when the browser constructor fails once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const notificationSpy = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let constructorCalls = 0;
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        constructorCalls += 1;
        if (constructorCalls === 1) throw new Error("notification unavailable");
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 10).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(constructorCalls).toBe(1);
      expect(notificationSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith("Failed to show reminder notification", expect.any(Error));

      await vi.advanceTimersByTimeAsync(20_000);
      expect(constructorCalls).toBe(2);
      expect(notificationSpy).toHaveBeenCalledTimes(1);
      expect(notificationSpy).toHaveBeenCalledWith("【✅ 提醒事项】", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
        icon: expect.stringMatching(/^https?:\/\/.*(?:mini-desk-cat\.png|kun|yunxia)/),
      });
    } finally {
      wrapper.unmount();
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("跨空间到期提醒：非激活空间到期时弹出切换气泡，点击否视为忽略", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const notificationSpy = vi.fn();
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();
      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);

    const overdue = new Date(2026, 4, 25, 7, 0, 0).getTime();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        activeWorkspaceId: "ws-b",
        workspaces: [
          {
            ...defaultWorkspace("ws-a"),
            customTitles: { ...defaultWorkspace("ws-a").customTitles, "board-title": "空间一" },
            todoLists: [{ id: "morning", title: "", collapsed: false, compact: false }],
            todos: { morning: [{ id: "todo-1", text: "空间一的提醒", done: false, notifyAt: overdue }] },
            showCompletedTodos: { morning: false },
          },
          {
            ...defaultWorkspace("ws-b"),
            customTitles: { ...defaultWorkspace("ws-b").customTitles, "board-title": "空间二" },
          },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      // Active workspace is 空间二; the overdue reminder lives in 空间一 → cross-workspace prompt.
      const confirm = wrapper.get('[data-testid="companion-confirm"]');
      expect(confirm.text()).toContain("空间一");
      expect(confirm.text()).toContain("空间一的提醒");
      // Native notifications are NOT fired for the non-active workspace before switching.
      expect(notificationSpy).not.toHaveBeenCalled();

      await wrapper.get('[data-testid="companion-no"]').trigger("click");
      await nextTick();

      // "No" = ignore: stay in 空间二, still no native notification.
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").activeWorkspaceId).toBe("ws-b");
      expect(notificationSpy).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("omits the reminder notification GIF when the companion GIF theme is none", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 8, 0, 0));
    const notificationSpy = vi.fn();
    class NotificationStub {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", NotificationStub);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        companionGifTheme: "none",
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const notifyAt = new Date(2026, 4, 25, 8, 0, 30).getTime();
      wrapper.getComponent(TodoPanel).vm.$emit("notify", "morning", "todo-1", notifyAt);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(notificationSpy).toHaveBeenCalledWith("【✅ 提醒事项】", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
      });
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("stars a todo without setting notification time or showing a confirmation bubble", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("star", {
        period: "morning",
        id: "todo-1",
        starred: true,
        anchor,
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({
        starred: true,
      });
      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).not.toHaveProperty("notifyAt");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].todos.morning[0]).not.toHaveProperty("notifyAt");
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("anchors the clear notification feedback to the todo section instead of the todo row", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "喝水", done: false, notifyAt: new Date(2026, 4, 25, 9).getTime() }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".todo-item").element, "getBoundingClientRect").mockReturnValue({
        x: 400,
        y: 40,
        width: 200,
        height: 24,
        top: 40,
        left: 400,
        right: 600,
        bottom: 64,
        toJSON: () => ({}),
      });
      vi.spyOn(wrapper.get('.todo-section[data-period="morning"]').element, "getBoundingClientRect").mockReturnValue({
        x: 384,
        y: 0,
        width: 255,
        height: 240,
        top: 0,
        left: 384,
        right: 639,
        bottom: 240,
        toJSON: () => ({}),
      });

      wrapper.getComponent(TodoPanel).vm.$emit(
        "notify",
        "morning",
        "todo-1",
        undefined,
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("right: calc(10px + 100vw - 639px)");
      expect(style).toContain("bottom: calc(10px + 100vh - 240px)");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("已取消通知时间");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("un-stars immediately and keeps notification time", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false, starred: true, notifyAt: 0 }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("star", {
        period: "morning",
        id: "todo-1",
        starred: false,
        anchor,
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({ starred: false });
      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({ notifyAt: 0 });
      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).not.toHaveProperty("deadlineAt");
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not show a confirmation when canceling a star", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false, starred: true }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("star", {
        period: "morning",
        id: "todo-1",
        starred: false,
        anchor,
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({ starred: false });
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("confirms image deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      imagePanel.vm.$emit("delete", "img-1", imagePanel.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(0);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("continues previewing the next image after deleting the active preview image", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await storeImagePayload({
        id: "img-1",
        src: "data:image/png;base64,b25l",
        createdAt: 1,
        displayWidth: 120,
        displayHeight: 80,
      });
      wrapper.getComponent(ImagePanel).vm.$emit("preview", "img-1");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();

      expect(getImagePreview(wrapper).props("activeId")).toBe("img-1");

      getImagePreview(wrapper).vm.$emit("delete", "img-1", wrapper.get(".image-preview").element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(getImagePreview(wrapper).props("activeId")).toBe("img-2");
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>).map((image) => image.id)).toEqual(["img-2", "img-3"]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("copies the previewed image through the global Cmd/Ctrl+C shortcut even when the preview surface is not focused", async () => {
    installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,b25l", createdAt: 1, displayWidth: 120, displayHeight: 80 }],
      }),
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob | Promise<Blob>>) {}
      },
    );
    Object.assign(navigator, { clipboard: { write } });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("preview", "img-1");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();
      expect(getImagePreview(wrapper).props("activeId")).toBe("img-1");

      // Event dispatched on window (focus is not on the preview surface),
      // so only the global keydown handler can service Cmd+C.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true, cancelable: true }));

      await vi.waitFor(() => {
        expect(write).toHaveBeenCalledTimes(1);
      });
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it("reopens preview image editing with Enter after saving instead of copying the image", async () => {
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,b25l", createdAt: 1, displayWidth: 120, displayHeight: 80 }],
      }),
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob | Promise<Blob>>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("preview", "img-1");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();

      getImagePreview(wrapper).vm.$emit("saveEdit", {
        id: "img-1",
        src: "data:image/png;base64,dHdv",
        displayWidth: 120,
        displayHeight: 80,
      });
      await vi.waitFor(() => {
        const image = (wrapper.getComponent(ImagePanel).props("images") as Array<{
          id: string;
          payloadId?: string;
          displayWidth?: number;
          displayHeight?: number;
        }>)[0];
        expect(image).toMatchObject({
          id: "img-1",
          payloadId: expect.any(String),
          displayWidth: 120,
          displayHeight: 80,
        });
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.images[0].payloadId).toEqual(expect.any(String));
      await expect(hydrateStoredImages(workspace.images)).resolves.toEqual([
        expect.objectContaining({ id: "img-1", src: "data:image/png;base64,dHdv" }),
      ]);

      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      await wrapper.vm.$nextTick();
      await Promise.resolve();

      expect(event.defaultPrevented).toBe(true);
      expect(getImagePreview(wrapper).props("editId")).toBe("img-1");
      expect(write).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
      vi.unstubAllGlobals();
    }
  });

  it("hydrates the previous image payload when undoing an edit", async () => {
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-edit-undo", src: "data:image/png;base64,b2xk", createdAt: 1, displayWidth: 120, displayHeight: 80 }],
      }),
    );
    const wrapper = mountApp();

    try {
      await storeImagePayload({ id: "img-edit-undo", src: "data:image/png;base64,b2xk", createdAt: 1 });
      wrapper.getComponent(ImagePanel).vm.$emit("preview", "img-edit-undo");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();
      getImagePreview(wrapper).vm.$emit("saveEdit", {
        id: "img-edit-undo",
        src: "data:image/png;base64,bmV3",
        displayWidth: 200,
        displayHeight: 140,
      });
      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ payloadId?: string }>)[0].payloadId).toEqual(expect.any(String));
      });

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      await flushPromises();
      await wrapper.vm.$nextTick();

      const image = (wrapper.getComponent(ImagePanel).props("images") as Array<{
        id: string;
        payloadId?: string;
        src?: string;
        displayWidth?: number;
        displayHeight?: number;
      }>)[0];
      expect(image).toMatchObject({
        id: "img-edit-undo",
        src: "data:image/png;base64,b2xk",
        displayWidth: 120,
        displayHeight: 80,
      });
      expect(image).not.toHaveProperty("payloadId");
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
    }
  });

  it("anchors image deletion feedback to the screenshot panel after deleting an image card", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      vi.spyOn(imagePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      imagePanel.vm.$emit("delete", "img-1", wrapper.get(".image-card").element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 260px");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps repeated image deletion confirmations inside the left screen edge while the previous bubble fades", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 2 },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      vi.spyOn(imagePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      imagePanel.vm.$emit("delete", "img-1", wrapper.findAll(".image-card")[0].element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(3200);
      await wrapper.vm.$nextTick();

      imagePanel.vm.$emit("delete", "img-2", wrapper.findAll(".image-card")[0].element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 260px");
      expect(style).not.toContain("100vw - 128px");
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors image deletion feedback to the screenshot list after deleting from preview", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      vi.spyOn(imagePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      imagePanel.vm.$emit("preview", "img-1");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();

      const preview = wrapper.get(".image-preview");
      vi.spyOn(preview.element, "getBoundingClientRect").mockReturnValue({
        x: 128,
        y: 0,
        width: 896,
        height: 720,
        top: 0,
        left: 128,
        right: 1024,
        bottom: 720,
        toJSON: () => ({}),
      });
      getImagePreview(wrapper).vm.$emit("delete", "img-1", preview.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 260px");
      expect(style).not.toContain("100vw - 1024px");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms quick button deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [{ id: "quick-1", title: "片段", value: "复制内容", type: "text" }],
      }),
    );
    const wrapper = mountApp();

    try {
      const quickButtons = wrapper.getComponent(QuickButtons);
      quickButtons.vm.$emit("delete", "quick-1", quickButtons.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect((wrapper.getComponent(QuickButtons).props("buttons") as Array<{ id: string }>)).toHaveLength(0);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/快捷按钮已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when clearing an empty completed todo list", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit(
        "clearCompleted",
        "morning",
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/没有|暂无|不用清理|无需清理|为空/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("opens link quick buttons and copies text quick buttons through the companion bubble", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "link-1", title: "站点", value: "example.com", type: "link" },
          { id: "text-1", title: "片段", value: "复制内容", type: "text" },
        ],
      }),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();
    try {
      const buttons = wrapper.findAll(".quick-button");

      await buttons[0].trigger("click");

      expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");

      // 链接打开成功也要有气泡反馈（与文本复制/应用启动一致），不能静默返回。
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/打开|标签页|新窗口/);

      // 等链接气泡过期退场（3000ms 展示 + 260ms 内容保留），恢复下方「点击后未出内容」的断言条件。
      await vi.advanceTimersByTimeAsync(3600);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await buttons[1].trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("复制内容");
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/文本|文字|复制|剪贴板|粘贴/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("creates quick action tags from save payloads and persists tag references", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(QuickButtons).vm.$emit("save", {
        title: "接口",
        value: "api.example.test",
        type: "link",
        tagTitle: "工作",
      });
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.quickTags).toEqual([{ id: expect.any(String), title: "工作", color: expect.any(String) }]);
      expect(workspace.quickButtons[0]).toMatchObject({
        title: "接口",
        tagId: workspace.quickTags[0].id,
      });

      wrapper.getComponent(QuickButtons).vm.$emit("save", {
        title: "文案",
        value: "复制内容",
        type: "text",
        tagTitle: "工作",
      });
      await wrapper.vm.$nextTick();

      const nextStored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const nextWorkspace = nextStored.workspaces[0];
      expect(nextWorkspace.quickTags).toHaveLength(1);
      expect(nextWorkspace.quickButtons[1]).toMatchObject({ tagId: nextWorkspace.quickTags[0].id });
    } finally {
      wrapper.unmount();
    }
  });

  it("persists quick action tag order when tag headings are reordered", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [
            { id: "tag-a", title: "标签 A" },
            { id: "tag-b", title: "标签 B" },
          ],
          quickButtons: [
            { id: "a", title: "A", value: "a", type: "text", hidden: false, tagId: "tag-a" },
            { id: "b", title: "B", value: "b", type: "text", hidden: false, tagId: "tag-b" },
          ],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      wrapper.getComponent(QuickButtons).vm.$emit("reorderTag", "tag-a", "tag-b");
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.quickTags.map((tag: { id: string }) => tag.id)).toEqual(["tag-b", "tag-a"]);
    } finally {
      wrapper.unmount();
    }
  });

  it("persists quick action tag collapse state", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [{ id: "tag-a", title: "标签 A" }],
          quickButtons: [{ id: "a", title: "A", value: "a", type: "text", hidden: false, tagId: "tag-a" }],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      wrapper.getComponent(QuickButtons).vm.$emit("toggleTagCollapsed", "tag-a");
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.quickTags).toEqual([{ id: "tag-a", title: "标签 A", color: expect.any(String), collapsed: true }]);
    } finally {
      wrapper.unmount();
    }
  });

  it("persists the Other quick-action group collapse state", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickButtons: [{ id: "other", title: "未分类", value: "a", type: "text", hidden: false }],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      wrapper.getComponent(QuickButtons).vm.$emit("toggleTagCollapsed", "__other");
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.quickOtherCollapsed).toBe(true);
      expect(wrapper.getComponent(QuickButtons).props("otherCollapsed")).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("persists quick action tag changes when a quick button is moved to another tag", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [
            { id: "tag-a", title: "标签 A" },
            { id: "tag-b", title: "标签 B" },
          ],
          quickButtons: [
            { id: "a", title: "A", value: "a", type: "text", hidden: false, tagId: "tag-a" },
            { id: "b", title: "B", value: "b", type: "text", hidden: false, tagId: "tag-b" },
          ],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      wrapper.getComponent(QuickButtons).vm.$emit("moveToTag", "a", "tag-b");
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.quickButtons.find((button: { id: string }) => button.id === "a")).toMatchObject({ tagId: "tag-b" });
    } finally {
      wrapper.unmount();
    }
  });

  it("persists quick action tag removal when a quick button is moved to the untagged area", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [{ id: "tag-a", title: "标签 A" }],
          quickButtons: [
            { id: "a", title: "A", value: "a", type: "text", hidden: false, tagId: "tag-a" },
            { id: "other", title: "未分类", value: "other", type: "text", hidden: false },
          ],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      wrapper.getComponent(QuickButtons).vm.$emit("moveToTag", "a", undefined);
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.quickButtons.find((button: { id: string }) => button.id === "a")).not.toHaveProperty("tagId");
    } finally {
      wrapper.unmount();
    }
  });

  it("persists quick action tag management and clears quick buttons when a tag is deleted", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [
            { id: "tag-a", title: "标签 A" },
            { id: "tag-b", title: "标签 B" },
          ],
          quickButtons: [
            { id: "a", title: "A", value: "a", type: "text", hidden: false, tagId: "tag-a" },
            { id: "b", title: "B", value: "b", type: "text", hidden: false, tagId: "tag-b" },
          ],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      const quickButtons = wrapper.getComponent(QuickButtons);
      quickButtons.vm.$emit("saveTag", { id: "tag-a", title: "标签 A+" });
      await wrapper.vm.$nextTick();

      let stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].quickTags.find((tag: { id: string }) => tag.id === "tag-a")).toMatchObject({ title: "标签 A+" });

      quickButtons.vm.$emit("saveTag", { title: "资料" });
      await wrapper.vm.$nextTick();

      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].quickTags.map((tag: { title: string }) => tag.title)).toContain("资料");

      const updatedQuickButtons = wrapper.getComponent(QuickButtons);
      updatedQuickButtons.vm.$emit("deleteTag", "tag-a", updatedQuickButtons.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].quickTags.map((tag: { id: string }) => tag.id)).not.toContain("tag-a");
      expect(stored.workspaces[0].quickButtons.find((button: { id: string }) => button.id === "a")).not.toHaveProperty("tagId");
      expect(stored.workspaces[0].quickButtons.find((button: { id: string }) => button.id === "b")).toMatchObject({ tagId: "tag-b" });
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("preserves newlines when copying text quick buttons", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "text-1", title: "多行片段", value: "第一行\n第二行", type: "text" },
        ],
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    await wrapper.get(".quick-button").trigger("click");
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("第一行\n第二行");
    wrapper.unmount();
  });

  it("calls API quick buttons and reports invocation plus response status in the companion bubble", async () => {
    vi.useFakeTimers();
    const apiResult = createDeferred<{ status: number; text: () => Promise<string> }>();
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => apiResult.promise);
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          {
            id: "api-1",
            title: "创建用户",
            value: "api.example.test/users",
            type: "api",
            apiMethod: "POST",
            apiHeaders: [
              { key: "Authorization", value: "Bearer test" },
              { key: "X-Trace-Id", value: "abc" },
            ],
            apiBodyType: "json",
            apiBody: '{"name":"Kun"}',
          },
        ],
      }),
    );
    const wrapper = mountApp();
    try {
      await wrapper.get(".quick-button").trigger("click");
      await wrapper.vm.$nextTick();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.example.test/users",
        expect.objectContaining({
          method: "POST",
          body: '{"name":"Kun"}',
        }),
      );
      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      expect((requestInit.headers as Headers).get("Authorization")).toBe("Bearer test");
      expect((requestInit.headers as Headers).get("X-Trace-Id")).toBe("abc");
      expect((requestInit.headers as Headers).get("Content-Type")).toBe("application/json");

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("已发起调用");

      apiResult.resolve({ status: 201, text: vi.fn().mockResolvedValue('{"ok":true,"id":7}') });
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(message).toContain("201");
      expect(message).toMatch(/调用成功|正常响应/);
      expect(message).toMatch(/✅|\(＾▽＾\)/);
      expect(message).toContain('响应体：{"ok":true,"id":7}');
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("hides the quick-copy GIF two seconds after the companion bubble disappears", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "text-1", title: "片段", value: "复制内容", type: "text" },
        ],
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("已复制");
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("复制内容");

      await vi.advanceTimersByTimeAsync(4000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').classes()).not.toContain("is-popover-fading");
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(260);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(1740);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("switches image preview with vertical, horizontal, and WASD keys", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
        ],
      }),
    );
    const wrapper = mountApp();

    await wrapper.get(".image-card").trigger("click");
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("2");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("2");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("2");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "D" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("2");

    wrapper.unmount();
  });

  it("closes image preview from the shared image list close event", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);

      imagePanel.vm.$emit("preview", "img-2");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();
      expect(wrapper.find(".image-preview").exists()).toBe(true);
      expect(wrapper.get(".image-panel .image-card.is-active .image-index").text()).toBe("2");

      imagePanel.vm.$emit("closePreview");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".image-panel .image-card.is-active").exists()).toBe(false);
      expect(wrapper.find(".image-preview").exists()).toBe(true);
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");

      await vi.advanceTimersByTimeAsync(220);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".image-preview").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("reorders images from the image panel drag reorder event", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
      }),
    );
    const wrapper = mountApp();
    const imagePanel = wrapper.getComponent(ImagePanel);

    imagePanel.vm.$emit("reorder", "img-2", "img-1");
    await wrapper.vm.$nextTick();

    expect(imagePanel.props("images").map((image: { id: string }) => image.id)).toEqual(["img-2", "img-1", "img-3"]);

    imagePanel.vm.$emit("reorder", "img-2", "img-3");
    await wrapper.vm.$nextTick();

    expect(imagePanel.props("images").map((image: { id: string }) => image.id)).toEqual(["img-1", "img-3", "img-2"]);

    wrapper.unmount();
  });

  it("moves an image to the bottom from the image panel context menu event", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
      }),
    );
    const wrapper = mountApp();
    const imagePanel = wrapper.getComponent(ImagePanel);

    imagePanel.vm.$emit("moveToBottom", "img-1");
    await wrapper.vm.$nextTick();

    expect(imagePanel.props("images").map((image: { id: string }) => image.id)).toEqual(["img-2", "img-3", "img-1"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].images.map((image: { id: string }) => image.id)).toEqual(["img-2", "img-3", "img-1"]);

    wrapper.unmount();
  });

  it("hides the current companion GIF when opening image preview", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get("textarea").trigger("focus");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await wrapper.get(".image-card").trigger("click");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();

      expect(wrapper.find(".image-preview").exists()).toBe(true);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not warn when previewing the tenth image", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: buildStoredImages(10),
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get(".image-card").trigger("click");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();

      expect(wrapper.find(".image-preview").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("shows a declutter bubble when previewing images after the list passes thirty items", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: buildStoredImages(31),
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get(".image-card").trigger("click");
      await wrapper.vm.$nextTick();
      await flushAsyncComponents();

      expect(wrapper.find(".image-preview").exists()).toBe(true);
      const companion = wrapper.getComponent(CompanionBubble);
      expect(companion.props("visible")).toBe(true);
      expect(companion.props("message")).toContain("桌面有点热，降温下");
      expect(companion.props("message")).toContain(KAOMOJI_BY_MOOD.warning[0]);
    } finally {
      wrapper.unmount();
    }
  });

  it("shows image copy success through the companion bubble", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "https://example.test/image.png",
            createdAt: 1,
          },
        ],
      }),
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/png" })) }));
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(write).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片|剪贴板|粘贴|复制/);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("writes data-url images to the clipboard without waiting on async fetch work", async () => {
    const clipboardItems: Array<Record<string, Blob | Promise<Blob>>> = [];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "data:image/png;base64,iVBORw0KGgo=",
            createdAt: 1,
          },
        ],
      }),
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(items: Record<string, Blob | Promise<Blob>>) {
          clipboardItems.push(items);
        }
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();

    wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");

    expect(fetch).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.keys(clipboardItems[0])).toEqual(["image/png"]);

    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("converts non-png data-url images to png before writing the image clipboard", async () => {
    const clipboardItems: Array<Record<string, Blob | Promise<Blob>>> = [];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ar//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ISf/2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
            createdAt: 1,
          },
        ],
      }),
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(items: Record<string, Blob | Promise<Blob>>) {
          clipboardItems.push(items);
        }
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();

    wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");

    expect(fetch).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.keys(clipboardItems[0])).toEqual(["image/png"]);
    expect(clipboardItems[0]["image/png"]).toBeInstanceOf(Promise);

    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("does not copy image data as text when binary clipboard copy is rejected", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "data:image/png;base64,iVBORw0KGgo=",
            createdAt: 1,
          },
        ],
      }),
    );
    const write = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/png" })) }));
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
        writeText,
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(write).toHaveBeenCalledTimes(1);
      expect(writeText).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片复制失败|复制图片|剪贴板写入失败|图片没有复制|请再复制/);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not complete an in-flight image copy after entering mobile handoff", async () => {
    vi.useFakeTimers();
    const mediaQuery = stubMatchMedia(false);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "https://example.test/image.png",
            createdAt: 1,
          },
        ],
      }),
    );
    const fetchResult = createDeferred<{ blob: () => Promise<Blob> }>();
    const blob = vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/png" }));
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn(() => fetchResult.promise));
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");
      expect(fetch).toHaveBeenCalledWith("https://example.test/image.png");

      mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      fetchResult.resolve({ blob });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(blob).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();

      mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not copy image data through text clipboard APIs", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "data:image/png;base64,iVBORw0KGgo=",
            createdAt: 1,
          },
        ],
      }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      wrapper.getComponent(ImagePanel).vm.$emit("copy", "img-1");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(writeText).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片复制失败|复制图片|剪贴板写入失败|图片没有复制|请再复制/);
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("edits the current preview image with Enter and copies it with 5", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          {
            id: "img-1",
            src: "data:image/png;base64,iVBORw0KGgo=",
            createdAt: 1,
          },
        ],
      }),
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/png" })) }));
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();

    await wrapper.get(".image-card").trigger("click");
    await flushAsyncComponents();
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    window.dispatchEvent(enterEvent);
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(getImagePreview(wrapper).props("editId")).toBe("img-1");
    expect(write).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("adds dropped image files and copies the last added image", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/png" })) }));
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();
    const first = new File(["first"], "first.png", { type: "image/png" });
    const ignored = new File(["note"], "note.txt", { type: "text/plain" });
    const last = new File(["last"], "last.png", { type: "image/png" });

    wrapper.getComponent(ImagePanel).vm.$emit("dropFiles", [first, ignored, last], wrapper.get(".image-panel").element as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    await vi.waitFor(() => {
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(2);
    });
    expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("adds image files dropped anywhere on the board", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/png" })) }));
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(_items: Record<string, Blob>) {}
      },
    );
    Object.assign(navigator, {
      clipboard: {
        write,
      },
    });
    const wrapper = mountApp();
    const file = new File(["board"], "board.png", { type: "image/png" });

    await wrapper.get(".workbench-zone-notes").trigger("drop", {
      dataTransfer: {
        files: [file],
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    await vi.waitFor(() => {
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(1);
    });
    expect(write).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("shows missing clipboard images and added images through the companion bubble", async () => {
    vi.useFakeTimers();
    const imageBlob = new Blob(["img"], { type: "image/png" });
    const getType = vi.fn().mockResolvedValue(imageBlob);
    Object.assign(navigator, {
      clipboard: {
        read: vi
          .fn()
          .mockResolvedValueOnce([{ types: ["text/plain"], getType: vi.fn() }])
          .mockResolvedValueOnce([{ types: ["image/png"], getType }]),
      },
    });
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);

      imagePanel.vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/没有|图片|剪贴板/);
      expect(imagePanel.props("pasteFeedback")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(3000);
      imagePanel.vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(getType).toHaveBeenCalledWith("image/png");
      expect(wrapper.find(".image-card").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片|截图|列表|添加|收进|保存|这张图/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("appends pasted images to the end of the image list", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "existing", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>;
      expect(images).toHaveLength(2);
      expect(images[0].id).toBe("existing");
      expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toEqual({ id: images[1].id, token: 1 });
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("inserts pasted images before and after the requested targets", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "first", src: "data:image/png;base64,first", createdAt: 1 },
          { id: "second", src: "data:image/png;base64,second", createdAt: 2 },
        ],
      }),
    );
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();
    const imagePanel = wrapper.getComponent(ImagePanel);
    const anchor = wrapper.get(".image-panel").element as HTMLElement;

    imagePanel.vm.$emit("paste", { placement: "before", targetId: "second", anchor });
    await vi.waitFor(() => {
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(3);
    });
    const afterBefore = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>;
    expect(afterBefore[0].id).toBe("first");
    expect(afterBefore[2].id).toBe("second");
    const beforeId = afterBefore[1].id;
    expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toEqual({ id: beforeId, token: 1 });

    imagePanel.vm.$emit("paste", { placement: "after", targetId: "second", anchor });
    await vi.waitFor(() => {
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(4);
    });
    const afterAfter = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>;
    expect(afterAfter.map((image) => image.id)).toEqual(["first", beforeId, "second", expect.any(String)]);
    expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toEqual({ id: afterAfter[3].id, token: 2 });

    wrapper.unmount();
  });

  it("replaces pasted image data without changing list identity or display metadata", async () => {
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [
          { id: "first", src: "data:image/png;base64,first", createdAt: 1 },
          {
            id: "target",
            src: "data:image/png;base64,old",
            createdAt: 42,
            displayWidth: 320,
            displayHeight: 180,
          },
          { id: "last", src: "data:image/png;base64,last", createdAt: 3 },
        ],
      }),
    );
    const imageBlob = new Blob(["replacement"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();
    const anchor = wrapper.get(".image-panel").element as HTMLElement;

    try {
      await storeImagePayload({
        id: "target",
        src: "data:image/png;base64,old",
        createdAt: 42,
        displayWidth: 320,
        displayHeight: 180,
      });
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "replace", targetId: "target", anchor });
      await vi.waitFor(() => {
      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string; src?: string }>;
      expect(images.find((image) => image.id === "target")?.src).not.toBe("data:image/png;base64,old");
      });

      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{
      id: string;
      payloadId?: string;
      src?: string;
      createdAt: number;
      displayWidth?: number;
      displayHeight?: number;
    }>;
      expect(images.map((image) => image.id)).toEqual(["first", "target", "last"]);
      expect(images[1]).toMatchObject({
      id: "target",
      payloadId: expect.any(String),
      createdAt: 42,
      displayWidth: 320,
      displayHeight: 180,
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].images.map((image: { id: string }) => image.id)).toEqual(["first", "target", "last"]);
      expect(stored.workspaces[0].images[1]).toMatchObject({
      id: "target",
      payloadId: images[1].payloadId,
      createdAt: 42,
      displayWidth: 320,
      displayHeight: 180,
      });
      expect(stored.workspaces[0].images[1].src).toBeUndefined();
      await expect(hydrateStoredImages(stored.workspaces[0].images)).resolves.toEqual([
      expect.objectContaining({ id: "first" }),
      expect.objectContaining({
        id: "target",
        payloadId: images[1].payloadId,
        src: expect.not.stringMatching(/base64,old$/),
        createdAt: 42,
        displayWidth: 320,
        displayHeight: 180,
      }),
      expect.objectContaining({ id: "last" }),
      ]);
      expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toEqual({ id: "target", token: 1 });

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{
          id: string;
          payloadId?: string;
          src?: string;
          displayWidth?: number;
          displayHeight?: number;
        }>)[1]).toMatchObject({
          id: "target",
          src: "data:image/png;base64,old",
          displayWidth: 320,
          displayHeight: 180,
        });
      });
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ payloadId?: string }>)[1]).not.toHaveProperty("payloadId");
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
    }
  });

  it("does not revive an image deleted by another tab during replacement", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        images: [{ id: "target", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["losing replacement"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{
          types: ["image/png"],
          getType: vi.fn(async () => {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
                workspaces: [{ ...defaultWorkspace(), images: [{ id: "other", src: "data:image/png;base64,other", createdAt: 2 }] }],
              }),
            );
            return imageBlob;
          }),
        }]),
      },
    });
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "replace", targetId: "target", anchor });

      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>).map((image) => image.id)).toEqual(["other"]);
      });
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].images.map((image: { id: string }) => image.id)).toEqual(["other"]);
      expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the winning payload when another tab replaces the same image first", async () => {
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        images: [{ id: "target", payloadId: "target-v1", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["losing replacement"], { type: "image/png" });
    const getType = vi.fn(async () => {
      await storeImagePayload({
        id: "target",
        payloadId: "winning-v2",
        src: "data:image/png;base64,winning",
        createdAt: 1,
      });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
          workspaces: [{ ...defaultWorkspace(), images: [{ id: "target", payloadId: "winning-v2", createdAt: 1 }] }],
        }),
      );
      return imageBlob;
    });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{
          types: ["image/png"],
          getType,
        }]),
      },
    });
    const wrapper = mountApp();

    try {
      await flushPromises();
      await wrapper.vm.$nextTick();
      const deferredHydration = createDeferred<Awaited<ReturnType<typeof hydrateStoredImages>>>();
      const hydrateSpy = vi.spyOn(imageState, "hydrateStoredImages").mockImplementationOnce(() => deferredHydration.promise);
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "replace", targetId: "target", anchor });

      await vi.waitFor(() => expect(getType).toHaveBeenCalled());
      await vi.waitFor(() => expect(hydrateSpy).toHaveBeenCalled());
      await storeImagePayload({
        id: "target",
        payloadId: "winning-v3",
        src: "data:image/png;base64,winning-three",
        createdAt: 1,
      });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sync: { revision: 3, updatedAt: 30, clientId: "tab-c" },
          workspaces: [{ ...defaultWorkspace(), images: [{ id: "target", payloadId: "winning-v3", createdAt: 1 }] }],
        }),
      );
      deferredHydration.resolve([{ id: "target", payloadId: "winning-v2", src: "data:image/png;base64,winning", createdAt: 1 }]);

      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string; payloadId?: string; src?: string }>)[0]).toMatchObject({
          id: "target",
          payloadId: "winning-v3",
          src: "data:image/png;base64,winning-three",
        });
      });
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].images[0].payloadId).toBe("winning-v3");
      expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toBeUndefined();

      const newerState = JSON.stringify({
        sync: { revision: 4, updatedAt: 40, clientId: "tab-d" },
        workspaces: [{ ...defaultWorkspace(), images: [{ id: "newer", src: "data:image/png;base64,newer", createdAt: 3 }] }],
      });
      localStorage.setItem(STORAGE_KEY, newerState);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: newerState }));
      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>).map((image) => image.id)).toEqual(["newer"]);
      });
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
    }
  });

  it("preserves pending workspace text when an image replacement conflicts", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "old", indent: 0 }] }],
        activeSpaceId: "workspace",
        images: [{ id: "target", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["losing"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{
          types: ["image/png"],
          getType: vi.fn(async () => {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
                language: "en",
                workspaces: [{
                  ...defaultWorkspace(),
                  spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "remote", indent: 0 }] }],
                  activeSpaceId: "workspace",
                  images: [],
                }],
              }),
            );
            return imageBlob;
          }),
        }]),
      },
    });
    const wrapper = mountApp();

    try {
      await flushPromises();
      await wrapper.vm.$nextTick();
      wrapper.getComponent(SpacePanel).vm.$emit("update", "workspace", [{ text: "local draft", indent: 0 }]);
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "replace", targetId: "target", anchor });

      await vi.waitFor(() => {
        expect(wrapper.getComponent(ImagePanel).props("title")).toBe("🎨 Images");
      });
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<unknown>)).toHaveLength(1);
      expect((wrapper.getComponent(SpacePanel).props("spaces") as Array<{ lines: Array<{ text: string }> }>)[0].lines[0].text).toBe("local draft");

      wrapper.getComponent(SpacePanel).vm.$emit("blur");
      await vi.waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        expect(stored.sync.revision).toBe(3);
        expect(stored.workspaces[0].spaces[0].lines[0].text).toBe("local draft");
        expect(stored.language).toBe("en");
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const newer = JSON.stringify({
        sync: { revision: 4, updatedAt: 40, clientId: "tab-c" },
        workspaces: [{
          ...defaultWorkspace(),
          spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "newer remote", indent: 0 }] }],
          activeSpaceId: "workspace",
          images: [{ id: "remote-image", createdAt: 3 }],
        }],
      });
      localStorage.setItem(STORAGE_KEY, newer);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: newer }));
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.waitFor(() => {
        expect((wrapper.getComponent(SpacePanel).props("spaces") as Array<{ lines: Array<{ text: string }> }>)[0].lines[0].text).toBe("newer remote");
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<unknown>)).toHaveLength(1);
      });
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    { name: "starts during hydration", editBeforePaste: false, timerExpiresWhilePending: false },
    { name: "conflicts when its timer expires during hydration", editBeforePaste: true, timerExpiresWhilePending: true },
  ])("retries a text edit that $name", async ({ editBeforePaste, timerExpiresWhilePending }) => {
    if (timerExpiresWhilePending) vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "old", indent: 0 }] }],
        activeSpaceId: "workspace",
        images: [{ id: "target", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["losing"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{
          types: ["image/png"],
          getType: vi.fn(async () => {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
                spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "remote", indent: 0 }] }],
                activeSpaceId: "workspace",
                images: [],
              }),
            );
            return imageBlob;
          }),
        }]),
      },
    });
    const wrapper = mountApp();

    try {
      await flushPromises();
      const deferredHydration = createDeferred<Awaited<ReturnType<typeof hydrateStoredImages>>>();
      const hydrateSpy = vi.spyOn(imageState, "hydrateStoredImages").mockImplementationOnce(() => deferredHydration.promise);
      if (editBeforePaste) {
        wrapper.getComponent(SpacePanel).vm.$emit("update", "workspace", [{ text: "generation draft", indent: 0 }]);
      }
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "replace", targetId: "target", anchor });
      await vi.waitFor(() => expect(hydrateSpy).toHaveBeenCalled());
      if (!editBeforePaste) {
        wrapper.getComponent(SpacePanel).vm.$emit("update", "workspace", [{ text: "generation draft", indent: 0 }]);
      }
      if (timerExpiresWhilePending) await vi.advanceTimersByTimeAsync(3000);
      deferredHydration.resolve([]);

      await vi.waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        expect(stored.sync.revision).toBe(3);
        expect(stored.workspaces[0].spaces[0].lines[0].text).toBe("generation draft");
      });
      expect((wrapper.getComponent(SpacePanel).props("spaces") as Array<{ lines: Array<{ text: string }> }>)[0].lines[0].text).toBe("generation draft");
    } finally {
      wrapper.unmount();
      if (timerExpiresWhilePending) vi.useRealTimers();
    }
  });

  it("keeps an edit made during a text persistence attempt dirty", async () => {
    const wrapper = mountApp();

    try {
      await flushPromises();
      const spacePanel = wrapper.getComponent(SpacePanel);
      spacePanel.vm.$emit("update", "workspace", [{ text: "first draft", indent: 0 }]);
      const originalSetItem = Storage.prototype.setItem;
      let injectedEdit = false;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
        if (key === STORAGE_KEY && !injectedEdit) {
          injectedEdit = true;
          spacePanel.vm.$emit("update", "workspace", [{ text: "second draft", indent: 0 }]);
        }
        return originalSetItem.call(this, key, value);
      });

      spacePanel.vm.$emit("blur");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].spaces[0].lines[0].text).toBe("first draft");

      spacePanel.vm.$emit("blur");
      await vi.waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        expect(stored.workspaces[0].spaces[0].lines[0].text).toBe("second draft");
        expect(stored.sync.revision).toBe(2);
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("debounces todo text edits instead of persisting every keystroke", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      const todoPanel = wrapper.getComponent(TodoPanel);
      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await nextTick();
      const todoId = wrapper.getComponent(TodoPanel).props("todos").morning[0].id;

      todoPanel.vm.$emit("update", "morning", todoId, "草");
      todoPanel.vm.$emit("update", "morning", todoId, "草稿");
      todoPanel.vm.$emit("update", "morning", todoId, "草稿文");
      await nextTick();

      // In-memory state reflects every keystroke, but nothing hit storage yet.
      expect(todoPanel.props("todos").morning[0].text).toBe("草稿文");
      const storedMidDebounce = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(storedMidDebounce.workspaces[0].todos.morning[0].text).toBe("");

      await vi.advanceTimersByTimeAsync(1000);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].todos.morning[0].text).toBe("草稿文");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("flushes a pending todo edit on blur and superseding structural save", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await nextTick();
      const todoPanel = wrapper.getComponent(TodoPanel);
      const todoId = todoPanel.props("todos").morning[0].id;

      todoPanel.vm.$emit("update", "morning", todoId, "失焦前");
      await nextTick();
      todoPanel.vm.$emit("blur");
      await flushPromises();
      await nextTick();

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").workspaces[0].todos.morning[0].text).toBe("失焦前");

      // A structural change (adding another todo) mid-debounce must carry the
      // pending text edit along with it.
      todoPanel.vm.$emit("update", "morning", todoId, "结构保存前");
      await nextTick();
      todoPanel.vm.$emit("createFromText", "morning", ["结构变化"]);
      await vi.advanceTimersByTimeAsync(0);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const morning = stored.workspaces[0].todos.morning;
      expect(morning.find((todo: { id: string }) => todo.id === todoId).text).toBe("结构保存前");
      expect(morning.some((todo: { text: string }) => todo.text === "结构变化")).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not retry an ordinary cross-tab text conflict forever", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "old", indent: 0 }] }],
        activeSpaceId: "workspace",
      }),
    );
    const wrapper = mountApp();

    try {
      await flushPromises();
      wrapper.getComponent(SpacePanel).vm.$emit("update", "workspace", [{ text: "local draft", indent: 0 }]);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
          spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "remote", indent: 0 }] }],
          activeSpaceId: "workspace",
        }),
      );
      const originalGetItem = Storage.prototype.getItem;
      const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
        return originalGetItem.call(this, key);
      });

      await vi.advanceTimersByTimeAsync(3000);
      const attemptsAfterConflict = getItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEY).length;
      expect(attemptsAfterConflict).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(9000);
      expect(getItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(attemptsAfterConflict);
      expect((wrapper.getComponent(SpacePanel).props("spaces") as Array<{ lines: Array<{ text: string }> }>)[0].lines[0].text).toBe("local draft");
      expect(JSON.parse(originalGetItem.call(localStorage, STORAGE_KEY) || "{}").sync.revision).toBe(2);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("restores a deleted image payload through global undo", async () => {
    vi.useFakeTimers();
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-undo", src: "data:image/png;base64,undo", createdAt: 7, displayWidth: 90, displayHeight: 60 }],
      }),
    );
    const wrapper = mountApp();

    try {
      await storeImagePayload({ id: "img-undo", src: "data:image/png;base64,undo", createdAt: 7 });
      const panel = wrapper.getComponent(ImagePanel);
      panel.vm.$emit("delete", "img-undo", panel.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect((panel.props("images") as Array<{ id: string }>)).toHaveLength(0);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      await flushPromises();
      await wrapper.vm.$nextTick();
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string; src?: string }>)[0]).toMatchObject({
        id: "img-undo",
        src: "data:image/png;base64,undo",
      });
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
      vi.useRealTimers();
    }
  });

  it("reclaims the IndexedDB payload after the delete grace window", async () => {
    vi.useFakeTimers();
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-del", src: "data:image/png;base64,del", createdAt: 7 }],
      }),
    );
    const deleteSpy = vi.spyOn(imageState, "deleteStoredImage").mockResolvedValue(undefined);
    const wrapper = mountApp();

    try {
      await storeImagePayload({ id: "img-del", src: "data:image/png;base64,del", createdAt: 7 });
      const panel = wrapper.getComponent(ImagePanel);
      panel.vm.$emit("delete", "img-del", panel.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect((panel.props("images") as Array<{ id: string }>)).toHaveLength(0);

      // Within the grace window the payload is still retained for undo.
      await vi.advanceTimersByTimeAsync(4000);
      expect(deleteSpy).not.toHaveBeenCalled();

      // Once the grace window elapses without an undo, the payload is reclaimed.
      await vi.advanceTimersByTimeAsync(1500);
      expect(deleteSpy).toHaveBeenCalledWith("img-del");
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
      vi.useRealTimers();
    }
  });

  it("keeps the IndexedDB payload when the delete is undone within the grace window", async () => {
    vi.useFakeTimers();
    const restoreIndexedDb = installMemoryImageDb();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-del", src: "data:image/png;base64,del", createdAt: 7 }],
      }),
    );
    const deleteSpy = vi.spyOn(imageState, "deleteStoredImage").mockResolvedValue(undefined);
    const wrapper = mountApp();

    try {
      await storeImagePayload({ id: "img-del", src: "data:image/png;base64,del", createdAt: 7 });
      const panel = wrapper.getComponent(ImagePanel);
      panel.vm.$emit("delete", "img-del", panel.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect((panel.props("images") as Array<{ id: string }>)).toHaveLength(0);

      // Undo restores the image well within the grace window.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
      await flushPromises();
      await wrapper.vm.$nextTick();
      expect((panel.props("images") as Array<{ id: string; src?: string }>)[0]).toMatchObject({
        id: "img-del",
        src: "data:image/png;base64,del",
      });

      // Past the grace window the payload is still kept because the image came back.
      await vi.advanceTimersByTimeAsync(6000);
      expect(deleteSpy).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      restoreIndexedDb();
      vi.useRealTimers();
    }
  });

  it("stores pasted screenshot display size using the device pixel ratio", async () => {
    vi.useFakeTimers();
    const originalDevicePixelRatio = window.devicePixelRatio;
    const originalImage = window.Image;
    const originalFileReader = window.FileReader;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    class SizedImage {
      naturalWidth = 200;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        this.result = "data:image/png;base64,c3RvcmVk";
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", SizedImage);
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{ displayWidth?: number; displayHeight?: number }>;
      expect(images[0]).toMatchObject({ displayWidth: 100, displayHeight: 50 });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].images[0]).toMatchObject({ displayWidth: 100, displayHeight: 50 });
      expect(stored.workspaces[0].images[0].src).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
      vi.stubGlobal("Image", originalImage);
      vi.stubGlobal("FileReader", originalFileReader);
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: originalDevicePixelRatio });
    }
  });

  it("merges pasted images with newer storage from another tab", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        noteLines: [{ text: "old note", indent: 0 }],
        images: [{ id: "existing", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
          noteLines: [{ text: "new note", indent: 0 }],
          images: [{ id: "other-tab", src: "data:image/png;base64,other", createdAt: 2 }],
        }),
      );

      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.sync.revision).toBe(3);
      expect(stored.workspaces[0].noteLines).toEqual([{ text: "new note", indent: 0 }]);
      expect(stored.workspaces[0].images.map((image: { id: string }) => image.id)).toContain("other-tab");
      expect(stored.workspaces[0].images).toHaveLength(3);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("preserves relative paste placement while merging newer storage from another tab", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sync: { revision: 1, updatedAt: 10, clientId: "tab-a" },
        noteLines: [{ text: "old note", indent: 0 }],
        images: [{ id: "target", src: "data:image/png;base64,target", createdAt: 1 }],
      }),
    );
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sync: { revision: 2, updatedAt: 20, clientId: "tab-b" },
          noteLines: [{ text: "new note", indent: 0 }],
          images: [
            { id: "other-tab", src: "data:image/png;base64,other", createdAt: 2 },
            { id: "target", src: "data:image/png;base64,target", createdAt: 1 },
            { id: "tail", src: "data:image/png;base64,tail", createdAt: 3 },
          ],
        }),
      );
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "before", targetId: "target", anchor });

      await vi.waitFor(() => {
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").sync.revision).toBe(3);
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces[0].noteLines).toEqual([{ text: "new note", indent: 0 }]);
      expect(stored.workspaces[0].images.map((image: { id: string }) => image.id)).toEqual([
        "other-tab",
        expect.not.stringMatching(/^(other-tab|target|tail)$/),
        "target",
        "tail",
      ]);
    } finally {
      wrapper.unmount();
    }
  });

  it("shows import and export success through the companion bubble", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:todo-board");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("exportWorkspace", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(createObjectURL).toHaveBeenCalled();
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导出|备份|文件|准备/);

      await vi.advanceTimersByTimeAsync(3000);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({
        miniDeskWorkspaceExport: true,
        version: 1,
        workspace: { workspaceLines: ["导入内容"] },
      })], "todo.json", {
        type: "application/json",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导入|空间|新增/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(true);
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("覆盖");
      expect(wrapper.get('[data-testid="companion-secondary"]').text()).toBe("新增");
      expect(wrapper.text()).not.toContain("导入内容");

      await wrapper.get('[data-testid="companion-secondary"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导入|同步|生效|就位|更新/);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces).toHaveLength(2);
      expect(stored.workspaces[1].workspaceLines).toEqual([{ text: "导入内容", indent: 0 }]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("offers add-new with an auto-numbered title when importing a same-name workspace", async () => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:todo-board"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace("existing"),
        customTitles: { "board-title": "我的桌面" },
        workspaceLines: [{ text: "原有内容", indent: 0 }],
      }],
    }));
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({
        miniDeskWorkspaceExport: true,
        version: 1,
        workspace: { customTitles: { "board-title": "我的桌面" }, workspaceLines: [{ text: "导入内容", indent: 0 }] },
      })], "todo.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      // Conflict prompt: overwrite / add-new / cancel, with the colliding name surfaced.
      // The bubble text is picked at random from several variants — the regex
      // must match every one of them (该空间名称已存在 has neither 同名 nor 冲突).
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/同名|冲突|已存在/);
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("覆盖");
      expect(wrapper.get('[data-testid="companion-secondary"]').text()).toBe("新增");
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("我的桌面");

      // Add-new: duplicate name is auto-suffixed so no two workspaces share a name.
      await wrapper.get('[data-testid="companion-secondary"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces).toHaveLength(2);
      expect(stored.workspaces.map((workspace: { customTitles: Record<string, string> }) => workspace.customTitles?.["board-title"]))
        .toEqual(["我的桌面", "我的桌面 2"]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("overwrites the existing workspace in place when importing a same-name workspace", async () => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:todo-board"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{
        ...defaultWorkspace("existing"),
        customTitles: { "board-title": "我的桌面" },
        workspaceLines: [{ text: "原有内容", indent: 0 }],
      }],
    }));
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({
        miniDeskWorkspaceExport: true,
        version: 1,
        workspace: { customTitles: { "board-title": "我的桌面" }, workspaceLines: [{ text: "导入内容", indent: 0 }] },
      })], "todo.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("覆盖");

      // Overwrite replaces the existing workspace's content, keeping its id (count unchanged).
      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces).toHaveLength(1);
      expect(stored.workspaces[0].id).toBe("existing");
      expect(stored.workspaces[0].workspaceLines).toEqual([{ text: "导入内容", indent: 0 }]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("treats default-named (unnamed) workspaces as their displayed title on import conflict", async () => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:todo-board"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    // Existing workspace is unnamed → displayed as the default "Mini Desk".
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      workspaces: [{ ...defaultWorkspace("existing"), workspaceLines: [{ text: "原有内容", indent: 0 }] }],
    }));
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      // Imported workspace is also unnamed → same displayed title "Mini Desk".
      const file = new File([JSON.stringify({
        miniDeskWorkspaceExport: true,
        version: 1,
        workspace: { workspaceLines: [{ text: "导入内容", indent: 0 }] },
      })], "todo.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      // The default-name collision still triggers the overwrite/add-new prompt.
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("覆盖");
      expect(wrapper.get('[data-testid="companion-secondary"]').text()).toBe("新增");

      await wrapper.get('[data-testid="companion-secondary"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const resolveTitle = (workspace: { customTitles?: Record<string, string> }) => workspace.customTitles?.["board-title"]?.trim() || "Mini Desk";
      // Add-new auto-numbers so no two workspaces share the displayed name.
      expect(stored.workspaces.map(resolveTitle)).toEqual(["Mini Desk", "Mini Desk 2"]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("exports through a generated browser download without requesting file-system access", async () => {
    vi.useFakeTimers();
    const showSaveFilePicker = vi.fn();
    const showDirectoryPicker = vi.fn();
    let exportedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return "blob:todo-board";
    });
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(window, "showSaveFilePicker", { value: showSaveFilePicker, configurable: true });
    Object.defineProperty(window, "showDirectoryPicker", { value: showDirectoryPicker, configurable: true });
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("exportWorkspace", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(showSaveFilePicker).not.toHaveBeenCalled();
      expect(showDirectoryPicker).not.toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(anchorClick).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:todo-board");
      expect((anchorClick.mock.instances[0] as HTMLAnchorElement).download).toMatch(/^mini-desk-.+-\d{4}-\d{2}-\d{2}\.json$/);

      expect(exportedBlob).toBeInstanceOf(Blob);
      if (!exportedBlob) throw new Error("Expected export blob");
      const exported = await exportedBlob.text();
      expect(JSON.parse(exported)).toMatchObject({ miniDeskWorkspaceExport: true, version: 1 });
      expect(JSON.parse(exported).workspace).toBeTruthy();

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导出|备份|文件|准备/);
    } finally {
      delete (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
      delete (window as typeof window & { showDirectoryPicker?: unknown }).showDirectoryPicker;
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("clears all board data from the settings data menu after confirmation", async () => {
    vi.useFakeTimers();
    const deleteDatabase = vi.fn(() => {
      const request: { onsuccess: (() => void) | null; onerror: (() => void) | null; onblocked: (() => void) | null } = {
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      theme: "dark",
      workspaces: [{
        ...defaultWorkspace(),
        workspaceLines: [{ text: "待清空", indent: 0 }],
        quickButtons: [{ id: "q", title: "按钮", value: "文本", type: "text", hidden: false }],
        todos: {
          morning: [{ id: "t", text: "提醒", done: false }],
          noon: [],
          evening: [],
        },
      }],
    }));
    localStorage.setItem("unrelated-key", "keep-me");
    const wrapper = mountApp();
    vi.stubGlobal("indexedDB", { deleteDatabase });

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("clearData", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toMatch(/清空|当前数据|不可恢复/);
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("清空数据");
      expect(wrapper.get('[data-testid="companion-yes"]').classes()).toContain("is-danger");
      // the destructive-action hint (all workspaces cleared, back up first) is shown
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toMatch(/所有空间都会被清空/);

      const gridBefore = wrapper.find(".workbench-grid").element;

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      // localStorage fully wiped — every key, not just the app key
      expect(localStorage.length).toBe(0);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem("unrelated-key")).toBeNull();
      // entire IndexedDB image database deleted (current + legacy)
      expect(deleteDatabase).toHaveBeenCalledWith("mini-desk-images-v1");
      expect(deleteDatabase).toHaveBeenCalledWith("todo-board-images-v1");
      // in-memory board reset to defaults
      expect(wrapper.text()).not.toContain("待清空");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/清空|已重置|数据|初始/);
      // the workbench shell remounts so its entrance animation replays
      const gridAfter = wrapper.find(".workbench-grid").element;
      expect(gridAfter).not.toBe(gridBefore);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("accepts imports that only configure reminder lists", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([
        JSON.stringify({
          miniDeskWorkspaceExport: true,
          version: 1,
          workspace: {
            todoLists: [{ id: "solo", title: "单独列表", collapsed: false, compact: false }],
            showCompletedTodos: { solo: true },
          },
        }),
      ], "todo-lists.json", {
        type: "application/json",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导入|空间|新增/);
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("覆盖");
      expect(wrapper.get('[data-testid="companion-secondary"]').text()).toBe("新增");

      await wrapper.get('[data-testid="companion-secondary"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces).toHaveLength(2);
      const workspace = stored.workspaces[1];
      expect(workspace.todoLists).toEqual([
        { id: "solo", title: "单独列表", collapsed: false, compact: false, column: 0 },
      ]);
      expect(workspace.todos.solo).toEqual([]);
      expect(workspace.showCompletedTodos.solo).toBe(true);
      expect(wrapper.find('.todo-section[data-list-id="solo"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("resets the import file input before opening the picker", async () => {
    const wrapper = mountApp();

    const settings = wrapper.getComponent(SettingsMenu);
    const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
    Object.defineProperty(input, "value", {
      value: "C:\\fakepath\\todo.json",
      writable: true,
      configurable: true,
    });
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    settings.vm.$emit("import", settings.element as HTMLElement);
    await wrapper.vm.$nextTick();

    expect(input.value).toBe("");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("cancels pending import confirmation and clears companion state when entering mobile", async () => {
    vi.useFakeTimers();
    const mediaQuery = stubMatchMedia(false);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      settings.vm.$emit("import", settings.element as HTMLElement);
      const file = new File([JSON.stringify({
        miniDeskWorkspaceExport: true,
        version: 1,
        workspace: { workspaceLines: ["切换中导入"] },
      })], "todo.json", {
        type: "application/json",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      Object.defineProperty(input, "value", {
        value: "C:\\fakepath\\todo.json",
        writable: true,
        configurable: true,
      });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(true);

      mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      expect(input.value).toBe("");
      expect(wrapper.find(".mobile-handoff").exists()).toBe(true);

      mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".workbench-shell").exists()).toBe(true);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("切换中导入");
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not create a stale import confirmation when file text resolves after mobile handoff", async () => {
    vi.useFakeTimers();
    const mediaQuery = stubMatchMedia(false);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const fileText = createDeferred<string>();
      const file = new File([""], "delayed.json", {
        type: "application/json",
      });
      Object.defineProperty(file, "text", {
        value: vi.fn(() => fileText.promise),
        configurable: true,
      });
      settings.vm.$emit("import", settings.element as HTMLElement);
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      Object.defineProperty(input, "value", {
        value: "C:\\fakepath\\delayed.json",
        writable: true,
        configurable: true,
      });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();

      mediaQuery.dispatchEvent({ matches: true } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();

      fileText.resolve(JSON.stringify({ workspaceLines: ["延迟导入"] }));
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(input.value).toBe("");
      expect(wrapper.find(".mobile-handoff").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("建议在电脑浏览器打开");
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(false);

      mediaQuery.dispatchEvent({ matches: false } as MediaQueryListEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".workbench-shell").exists()).toBe(true);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("延迟导入");
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows about information in the companion bubble instead of a modal", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("about", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".n-modal").exists()).toBe(false);
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("Mini Desk (100% AI BUILT)");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("把截图、提醒事项、快捷动作和便签缝合得恰到好处");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("所有操作均在本地浏览器完成，绝不上传您的任何数据。");
      const repoLink = wrapper.get('[data-testid="companion-link"]');
      expect(repoLink.text()).toBe("xiangjianan / mini-desk");
      expect(wrapper.find('[data-testid="companion-signature"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("100% 由 AI 开发");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("云霞 · 产品");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("佳男 · 开发");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("Codex · 协作支持");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("👤 产品经理 — 云霞");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("牛马：Codex");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("xiangjianan / mini-desk");
      expect(wrapper.get('[data-testid="companion-link"]').attributes("href")).toBe("https://github.com/xiangjianan/mini-desk");
      expect(wrapper.get('[data-testid="companion-link"]').attributes("target")).toBe("_blank");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows the localized English about copy with memo wording", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      language: "en",
    }));
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("about", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const aboutText = wrapper.find('[data-testid="companion-confirm"]').text();
      expect(aboutText).toContain("Mini Desk (100% AI BUILT)");
      expect(aboutText).toContain("screenshots, reminders, quick actions, and sticky notes");
      expect(aboutText).toContain("Everything happens in your local browser. None of your data is ever uploaded.");
      expect(aboutText).not.toContain("100% developed by AI");
      expect(wrapper.find('[data-testid="companion-signature"]').exists()).toBe(false);
      expect(aboutText).not.toContain("workspaces");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps about bubble text and shell fading together when no anchor is supplied", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("about");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("Mini Desk");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("xiangjianan / mini-desk");

      await vi.advanceTimersByTimeAsync(9799);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.find(".companion-popover-shell").classes()).not.toContain("is-popover-fading");

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').classes()).not.toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("Mini Desk");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("pauses an auto-dismiss message bubble while the pointer is hovering it", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("about");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-confirm"]').trigger("mouseenter");
      await vi.advanceTimersByTimeAsync(10000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("Mini Desk");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
      expect(wrapper.find(".companion-popover-shell").classes()).not.toContain("is-popover-fading");

      await wrapper.get('[data-testid="companion-confirm"]').trigger("mouseleave");
      await vi.advanceTimersByTimeAsync(9999);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("pauses an auto-dismiss message bubble while the pointer is hovering the GIF", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("about");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="companion-bubble"]').trigger("mouseenter");
      await vi.advanceTimersByTimeAsync(12000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("Mini Desk");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
      expect(wrapper.find(".companion-popover-shell").classes()).not.toContain("is-popover-fading");

      await wrapper.get('[data-testid="companion-bubble"]').trigger("mouseleave");
      await vi.advanceTimersByTimeAsync(9999);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble for invalid JSON imports", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File(["{"], "broken.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/文件格式不正确|检查文件/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble for invalid board backup data", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({ unknown: true })], "wrong.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/数据内容不适用|备份/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when clipboard image permission is denied", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const originalExecCommand = document.execCommand;
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => false),
      configurable: true,
    });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/剪贴板权限受限|检查剪贴板权限/);
    } finally {
      if (originalExecCommand) {
        Object.defineProperty(document, "execCommand", {
          value: originalExecCommand,
          configurable: true,
        });
      } else {
        Reflect.deleteProperty(document, "execCommand");
      }
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("falls back to the browser paste command when clipboard image reading is denied", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "existing", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const originalExecCommand = document.execCommand;
    const image = new File(["img"], "clip.png", { type: "image/png" });
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => image,
          },
        ],
      },
    });
    const execCommand = vi.fn(() => {
      document.dispatchEvent(pasteEvent);
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const wrapper = mountApp();

    try {
      await wrapper.vm.$nextTick();
      await Promise.resolve();
      await Promise.resolve();
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "before", targetId: "existing", anchor });
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(execCommand).toHaveBeenCalledWith("paste");
      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(2);
      });
      expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)[1].id).toBe("existing");
    } finally {
      if (originalExecCommand) {
        Object.defineProperty(document, "execCommand", {
          value: originalExecCommand,
          configurable: true,
        });
      } else {
        Reflect.deleteProperty(document, "execCommand");
      }
      wrapper.unmount();
    }
  });

  it("clears an unconsumed browser paste request before the next ordinary paste", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "target", src: "data:image/png;base64,old", createdAt: 1 }],
      }),
    );
    const originalExecCommand = document.execCommand;
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".image-panel").element as HTMLElement;
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "replace", targetId: "target", anchor });
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const ordinaryPaste = new Event("paste", { bubbles: true, cancelable: true });
      const image = new File(["ordinary"], "ordinary.png", { type: "image/png" });
      Object.defineProperty(ordinaryPaste, "clipboardData", {
        value: {
          items: [{ type: "image/png", getAsFile: () => image }],
        },
      });
      document.dispatchEvent(ordinaryPaste);

      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(2);
      });
      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>;
      expect(images[0].id).toBe("target");
      expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toEqual({ id: images[1].id, token: 1 });
    } finally {
      if (originalExecCommand) {
        Object.defineProperty(document, "execCommand", {
          value: originalExecCommand,
          configurable: true,
        });
      } else {
        Reflect.deleteProperty(document, "execCommand");
      }
      wrapper.unmount();
    }
  });

  it("shows a companion bubble when image reading fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const originalFileReader = window.FileReader;
    class FailingFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      error = new DOMException("read failed", "NotReadableError");
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片读取失败|重新粘贴/);
      expect(wrapper.find(".image-card").exists()).toBe(false);
    } finally {
      vi.stubGlobal("FileReader", originalFileReader);
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a companion bubble when image storage fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const originalIndexedDB = window.indexedDB;
    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        throw new Error("store failed");
      }),
    });
    const imageBlob = new Blob(["img"], { type: "image/png" });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([{ types: ["image/png"], getType: vi.fn().mockResolvedValue(imageBlob) }]),
      },
    });
    const wrapper = mountApp();

    try {
      wrapper.getComponent(ImagePanel).vm.$emit("paste", { placement: "append" });
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/图片保存失败|重试/);
      expect(wrapper.find(".image-card").exists()).toBe(false);
      expect(wrapper.getComponent(ImagePanel).props("pasteFeedback")).toBeUndefined();
    } finally {
      if (originalIndexedDB) {
        vi.stubGlobal("indexedDB", originalIndexedDB);
      } else {
        Reflect.deleteProperty(window, "indexedDB");
      }
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("still signals an opened link when window.open returns null (noopener spec behavior)", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [{ id: "link-1", title: "站点", value: "example.com", type: "link" }],
      }),
    );
    // noopener 下 window.open 成功也返回 null（规范行为），返回值不是失败信号。
    vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/打开|标签页|新窗口/);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toMatch(/失败|检查链接/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("reanchors the companion to the todo section when clearing completed todos after quick copy", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [
          { id: "text-1", title: "片段", value: "复制内容", type: "text" },
        ],
        todos: {
          morning: [{ id: "done-1", text: "已完成事项", done: true }],
        },
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".quick-block").element, "getBoundingClientRect").mockReturnValue({
        x: 128,
        y: 360,
        width: 255,
        height: 360,
        top: 360,
        left: 128,
        right: 383,
        bottom: 720,
        toJSON: () => ({}),
      });
      vi.spyOn(wrapper.get('.todo-section[data-period="morning"]').element, "getBoundingClientRect").mockReturnValue({
        x: 384,
        y: 0,
        width: 255,
        height: 240,
        top: 0,
        left: 384,
        right: 639,
        bottom: 240,
        toJSON: () => ({}),
      });

      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(3000);
      await wrapper.vm.$nextTick();

      wrapper.getComponent(TodoPanel).vm.$emit(
        "clearCompleted",
        "morning",
        wrapper.get('.todo-section[data-period="morning"]').element as HTMLElement,
      );
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 639px");
      expect(style).toContain("100vh - 240px");
      expect(style).not.toContain("100vw - 383px");

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/清理|完成项|不可恢复/);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors completion feedback to the checked todo section when the section was not focused", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "open-1", text: "待完成事项", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const todoSection = wrapper.get('.todo-section[data-period="morning"]');
      vi.spyOn(todoSection.element, "getBoundingClientRect").mockReturnValue({
        x: 384,
        y: 0,
        width: 255,
        height: 240,
        top: 0,
        left: 384,
        right: 639,
        bottom: 240,
        toJSON: () => ({}),
      });
      wrapper.getComponent(TodoPanel).vm.$emit("complete", "morning", "open-1", true, todoSection.element as HTMLElement);
      await wrapper.vm.$nextTick();

      const style = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
      expect(style).toContain("100vw - 639px");
      expect(style).toContain("100vh - 240px");

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text().trim().length).toBeGreaterThan(0);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not show GIF when focusing on areas without a message bubble", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        images: [{ id: "img-1", src: "data:image/png;base64,a", createdAt: 1 }],
        spaces: [{ id: "workspace", title: "工作空间", lines: [{ text: "已有内容", indent: 0 }] }],
        activeSpaceId: "workspace",
      }),
    );
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".image-panel").element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      await wrapper.get(".image-panel .panel-header").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(false);

      const textPanel = wrapper.get(".text-panel");
      vi.spyOn(textPanel.element, "getBoundingClientRect").mockReturnValue({
        x: 720,
        y: 0,
        width: 360,
        height: 900,
        top: 0,
        left: 720,
        right: 1080,
        bottom: 900,
        toJSON: () => ({}),
      });
      await textPanel.get("textarea").trigger("focus");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows explicit context-menu guide bubbles immediately even when random hints are skipped", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const wrapper = mountApp();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      vi.spyOn(imagePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      imagePanel.vm.$emit("guide", "images", imagePanel.element as HTMLElement, true);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/截图区|图片|Ctrl\+V|方向键|右键|删除|预览|Esc/);

      await vi.advanceTimersByTimeAsync(3900);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').classes()).not.toContain("is-popover-fading");

      await vi.advanceTimersByTimeAsync(260);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not flash a stale Tips bubble when focusing a non-empty area", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        spaces: [{ id: "workspace", title: "工作空间", lines: [{ text: "已有内容", indent: 0 }] }],
        activeSpaceId: "workspace",
      }),
    );
    const wrapper = mountAppWithPersistentPopover();

    try {
      const imagePanel = wrapper.getComponent(ImagePanel);
      imagePanel.vm.$emit("guide", "images", imagePanel.element as HTMLElement, true);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/截图区|图片|Ctrl\+V|方向键|右键|删除|预览|Esc/);

      wrapper.getComponent(SpacePanel).vm.$emit("focus", "workspace", wrapper.get(".text-panel").element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows Tips for empty clicked areas and no GIF for non-empty clicked areas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      vi.spyOn(wrapper.get(".image-panel").element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 128,
        height: 720,
        top: 0,
        left: 0,
        right: 128,
        bottom: 720,
        toJSON: () => ({}),
      });

      await wrapper.get(".image-panel .panel-header").trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("Ctrl+V 粘贴截图");

      wrapper.getComponent(QuickButtons).vm.$emit("save", {
        title: "文档",
        value: "https://example.com",
        type: "link",
      });
      await wrapper.vm.$nextTick();
      vi.spyOn(wrapper.get(".quick-block").element, "getBoundingClientRect").mockReturnValue({
        x: 128,
        y: 0,
        width: 300,
        height: 360,
        top: 0,
        left: 128,
        right: 428,
        bottom: 360,
        toJSON: () => ({}),
      });
      await wrapper.get(".quick-block").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps the current blank-area Tips for quick links, images, and todos while repeated clicks happen before expiry", async () => {
    vi.useFakeTimers();
    try {
      const scenarios = [
        { key: "quickButtons", component: QuickButtons, pattern: /快捷|按钮|复制|动作/ },
        { key: "images", component: ImagePanel, pattern: /截图区|图片|Ctrl\+V|方向键|右键|删除|预览|Esc/ },
        { key: "todos", component: TodoPanel, pattern: /提醒|事项|完成|星标|右键|拖动|已完成/ },
      ] as const;

      for (const scenario of scenarios) {
        const randomSpy = vi.spyOn(Math, "random");
        randomSpy
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(0.8)
          .mockReturnValueOnce(0.8);
        const wrapper = mountApp();

        try {
          const component = wrapper.getComponent(scenario.component);
          vi.spyOn(component.element, "getBoundingClientRect").mockReturnValue({
            x: 128,
            y: 0,
            width: 300,
            height: 360,
            top: 0,
            left: 128,
            right: 428,
            bottom: 360,
            toJSON: () => ({}),
          });

          component.vm.$emit("guide", scenario.key, component.element as HTMLElement);
          await wrapper.vm.$nextTick();
          await vi.advanceTimersByTimeAsync(200);
          await wrapper.vm.$nextTick();
          const firstTips = wrapper.get('[data-testid="companion-confirm"]').text();
          expect(firstTips).toMatch(scenario.pattern);

          component.vm.$emit("guide", scenario.key, component.element as HTMLElement);
          await wrapper.vm.$nextTick();
          await vi.advanceTimersByTimeAsync(200);
          await wrapper.vm.$nextTick();

          expect(wrapper.get('[data-testid="companion-confirm"]').text()).toBe(firstTips);

          await vi.advanceTimersByTimeAsync(4860);
          await wrapper.vm.$nextTick();
          expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

          component.vm.$emit("guide", scenario.key, component.element as HTMLElement);
          await wrapper.vm.$nextTick();
          await vi.advanceTimersByTimeAsync(200);
          await wrapper.vm.$nextTick();

          expect(wrapper.get('[data-testid="companion-confirm"]').text()).not.toBe(firstTips);
        } finally {
          wrapper.unmount();
          randomSpy.mockRestore();
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows quick-link blank-area Tips to refresh after switching focus to another area", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.4);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        spaces: [{ id: "workspace", title: "工作空间", lines: [{ text: "已有内容", indent: 0 }] }],
        activeSpaceId: "workspace",
      }),
    );
    const wrapper = mountApp();

    try {
      const quick = wrapper.getComponent(QuickButtons);
      quick.vm.$emit("guide", "quickButtons", quick.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      const firstTips = wrapper.get('[data-testid="companion-confirm"]').text();

      wrapper.getComponent(SpacePanel).vm.$emit("focus", "workspace", wrapper.get(".text-panel").element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      quick.vm.$emit("guide", "quickButtons", quick.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).not.toBe(firstTips);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a declutter companion bubble and GIF when focusing a reminder list with at least twenty items", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          todos: {
            morning: Array.from({ length: 20 }, (_, index) => ({
              id: `todo-${index}`,
              text: `提醒 ${index + 1}`,
              done: false,
            })),
            noon: [],
            evening: [],
          },
        }],
      }),
    );
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="todo-input-morning"]').trigger("focus");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const text = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(text).toContain("数量有点多，适当做减法");
      expect(text).toContain("(・_・;)");
    } finally {
      wrapper.unmount();
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the declutter message bubble visible when blank-space creation focuses the new reminder", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          todos: {
            morning: Array.from({ length: 20 }, (_, index) => ({
              id: `todo-${index}`,
              text: `提醒 ${index + 1}`,
              done: false,
            })),
            noon: [],
            evening: [],
          },
        }],
      }),
    );
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="morning"] .todo-list-shell').trigger("click");
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll('[data-testid="todo-input-morning"]')).toHaveLength(21);
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const text = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(text).toContain("数量有点多，适当做减法");
    } finally {
      wrapper.unmount();
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("shows a declutter companion bubble and GIF when a quick-action tag has more than fifty visible buttons", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [{ id: "tag-work", title: "工作" }],
          quickButtons: Array.from({ length: 51 }, (_, index) => ({
            id: `quick-${index}`,
            title: `按钮 ${index + 1}`,
            value: `https://example.com/${index}`,
            type: "link",
            hidden: false,
            tagId: "tag-work",
          })),
        }],
      }),
    );
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-block").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const text = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(text).toContain("快捷动作");
      expect(text).not.toContain("提醒");
      expect(text).toContain("(・_・;)");
    } finally {
      wrapper.unmount();
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not show quick-action declutter when visible buttons are split under the per-tag limit", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [{
          ...defaultWorkspace(),
          quickTags: [
            { id: "tag-a", title: "标签 A" },
            { id: "tag-b", title: "标签 B" },
          ],
          quickButtons: [
            ...Array.from({ length: 26 }, (_, index) => ({
              id: `a-${index}`,
              title: `A ${index + 1}`,
              value: `https://example.com/a/${index}`,
              type: "link",
              hidden: false,
              tagId: "tag-a",
            })),
            ...Array.from({ length: 26 }, (_, index) => ({
              id: `b-${index}`,
              title: `B ${index + 1}`,
              value: `https://example.com/b/${index}`,
              type: "link",
              hidden: false,
              tagId: "tag-b",
            })),
          ],
        }],
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-block").trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("anchors the companion near the focused todo section", async () => {
    const wrapper = mountApp();
    const todoList = wrapper.get('[data-testid="todo-list-morning"]');

    vi.spyOn(todoList.element, "getBoundingClientRect").mockReturnValue({
      x: 440,
      y: 34,
      width: 270,
      height: 260,
      top: 34,
      left: 440,
      right: 710,
      bottom: 294,
      toJSON: () => ({}),
    });
    await todoList.trigger("click");
    await wrapper.vm.$nextTick();
    const todoSection = wrapper.get('.todo-section[data-period="morning"]');
    vi.spyOn(todoSection.element, "getBoundingClientRect").mockReturnValue({
      x: 440,
      y: 34,
      width: 300,
      height: 360,
      top: 34,
      left: 440,
      right: 740,
      bottom: 394,
      toJSON: () => ({}),
    });
    await wrapper.get('[data-testid="todo-input-morning"]').trigger("focus");

    const todoStyle = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
    expect(todoStyle).toContain("right: calc(10px + 100vw - 740px)");
    expect(todoStyle).toContain("bottom: calc(10px + 100vh - 394px)");

    wrapper.unmount();
  });

  it("hides the current bubble when focus switches, moves the GIF, and clears focus on Escape", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        spaces: [{ id: "workspace", title: "工作空间", lines: [{ text: "已有内容", indent: 0 }] }],
        activeSpaceId: "workspace",
      }),
    );
    const wrapper = mountApp();
    try {
      const firstPanel = wrapper.find(".text-panel");
      vi.spyOn(firstPanel.element, "getBoundingClientRect").mockReturnValue({
        x: 120,
        y: 0,
        width: 300,
        height: 420,
        top: 0,
        left: 120,
        right: 420,
        bottom: 420,
        toJSON: () => ({}),
      });
      await firstPanel.get("textarea").trigger("focus");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);

      const workspacePanel = wrapper.get(".text-panel");
      vi.spyOn(workspacePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 720,
        y: 0,
        width: 360,
        height: 900,
        top: 0,
        left: 720,
        right: 1080,
        bottom: 900,
        toJSON: () => ({}),
      });
      wrapper.getComponent(SpacePanel).vm.$emit("focus", "workspace", workspacePanel.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="companion-bubble"]').attributes("style")).toContain("100vw - 1080px");
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(260);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("records the current app version without showing a stale local marker as an update", async () => {
    localStorage.setItem("todo-board-app-version", "0.9.0");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`<meta name="app-version" content="${FALLBACK_APP_VERSION}">`),
    }));
    const wrapper = mountApp();

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      const settings = wrapper.getComponent(SettingsMenu);
      expect(wrapper.find('[data-testid="app-version"]').exists()).toBe(false);
      expect(settings.props("appVersion")).toMatch(/^\d+\.\d+\.\d+/);
      expect(settings.props("updateAvailable")).toBe(false);
      expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBeUndefined();
      expect(localStorage.getItem("mini-desk-app-version")).toBe(settings.props("appVersion"));
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("detects a newer deployed version without refreshing the current page", async () => {
    vi.useFakeTimers();
    const deployedVersion = nextPatchVersion(FALLBACK_APP_VERSION);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`<meta name="app-version" content="${deployedVersion}">`),
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountApp();

    try {
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.vm.$nextTick();

      const settings = wrapper.getComponent(SettingsMenu);
      expect(settings.props("appVersion")).toBe(deployedVersion);
      expect(settings.props("updateAvailable")).toBe(true);
      expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBe("true");
      expect(localStorage.getItem("mini-desk-app-version")).not.toBe(deployedVersion);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("does not check for deployed versions when the window regains focus or the page becomes visible", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`<meta name="app-version" content="${FALLBACK_APP_VERSION}">`),
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountApp();

    try {
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.vm.$nextTick();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await wrapper.vm.$nextTick();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("keeps the settings update dot visible while a newer deployed version is available", async () => {
    vi.useFakeTimers();
    const deployedVersion = nextPatchVersion(FALLBACK_APP_VERSION);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`<meta name="app-version" content="${deployedVersion}">`),
    }));
    const wrapper = mountApp();

    try {
      await vi.advanceTimersByTimeAsync(0);
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(SettingsMenu).props("updateAvailable")).toBe(true);
      expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBe("true");

      await vi.advanceTimersByTimeAsync(9_999);
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBe("true");

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBe("true");
      expect(wrapper.getComponent(SettingsMenu).props("updateAvailable")).toBe(true);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("opens an email draft to the author from the settings suggestion action", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountApp();

    const settings = wrapper.getComponent(SettingsMenu);
    settings.vm.$emit("suggest", settings.element as HTMLElement);
    await wrapper.vm.$nextTick();

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^mailto:xiang9872@gmail\.com\?subject=.+&body=.+/),
      "_blank",
      "noopener,noreferrer",
    );

    wrapper.unmount();
  });

  it("persists companion GIF theme selections from settings", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("gifTheme", "none", wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(SettingsMenu).props("companionGifTheme")).toBe("none");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("none");
      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("none");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the selected companion GIF theme when toggling light and dark mode", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("gifTheme", "ikun", wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(SettingsMenu).props("companionGifTheme")).toBe("ikun");
      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("ikun");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("ikun");

      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(SettingsMenu).props("companionGifTheme")).toBe("ikun");
      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("ikun");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("ikun");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the rendered selected companion GIF asset when toggling light and dark mode", async () => {
    vi.useFakeTimers();
    // 从明确的浅色起始态切换，验证「浅→深」GIF 资产切换不受默认 auto 模式影响。
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "light" }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("gifTheme", "ikun", wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(wrapper.get(".focus-companion.is-visible img").attributes("src")).toContain("kun");

      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();

      await wrapper.get(".image-panel").trigger("click");
      await wrapper.vm.$nextTick();

      const darkSrc = wrapper.get(".focus-companion.is-visible img").attributes("src");
      expect(darkSrc).toContain("kun-dark");
      expect(darkSrc).not.toContain("yunxia");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("persists custom companion GIF uploads from settings", async () => {
    const wrapper = mountApp();
    const light = new File(["light"], "light.gif", { type: "image/gif" });
    const dark = new File(["dark"], "dark.gif", { type: "image/gif" });

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("customGif", { light, dark }, wrapper.getComponent(SettingsMenu).element as HTMLElement);

      await vi.waitFor(() => {
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("custom");
      });
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.companionGifTheme).toBe("custom");
      expect(stored.customCompanionGif).toEqual({});
      expect(stored.customCompanionGifStored).toEqual({ light: true, dark: true });
      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("custom");
      expect(wrapper.getComponent(CompanionBubble).props("customGifLightSrc")).toMatch(/^data:image\/gif/);
      expect(wrapper.getComponent(CompanionBubble).props("customGifDarkSrc")).toMatch(/^data:image\/gif/);
    } finally {
      wrapper.unmount();
    }
  });

  it("stores only the selected custom companion GIF mode", async () => {
    const originalFileReader = window.FileReader;
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        this.result = "data:image/gif;base64,light";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const wrapper = mountApp();
    const light = new File(["light"], "light.gif", { type: "image/gif" });

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("customGif", { light }, wrapper.getComponent(SettingsMenu).element as HTMLElement);

      await vi.waitFor(() => {
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("custom");
      });
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.customCompanionGifStored).toEqual({ light: true });
      expect(wrapper.getComponent(CompanionBubble).props("customGifLightSrc")).toBe("data:image/gif;base64,light");
      expect(wrapper.getComponent(CompanionBubble).props("customGifDarkSrc")).toBeUndefined();

      await wrapper.get('[data-testid="workbench-theme"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("custom");
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.stubGlobal("FileReader", originalFileReader);
    }
  });

  it("preserves an existing custom companion GIF mode when updating the other mode", async () => {
    const originalFileReader = window.FileReader;
    class NamedFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(file: File): void {
        this.result = `data:image/gif;base64,${file.name.replace(".gif", "")}`;
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", NamedFileReader);
    const wrapper = mountApp();
    const light = new File(["light"], "light.gif", { type: "image/gif" });
    const dark = new File(["dark"], "dark.gif", { type: "image/gif" });

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("customGif", { light }, wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await vi.waitFor(() => {
        expect(wrapper.getComponent(CompanionBubble).props("customGifLightSrc")).toBe("data:image/gif;base64,light");
      });

      wrapper.getComponent(SettingsMenu).vm.$emit("customGif", { dark }, wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await vi.waitFor(() => {
        expect(wrapper.getComponent(CompanionBubble).props("customGifDarkSrc")).toBe("data:image/gif;base64,dark");
      });
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.customCompanionGifStored).toEqual({ light: true, dark: true });
      expect(wrapper.getComponent(CompanionBubble).props("customGifLightSrc")).toBe("data:image/gif;base64,light");
      expect(wrapper.getComponent(CompanionBubble).props("customGifDarkSrc")).toBe("data:image/gif;base64,dark");
    } finally {
      wrapper.unmount();
      vi.stubGlobal("FileReader", originalFileReader);
    }
  });

  it("loads persisted custom companion GIF sources after refresh", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        companionGifTheme: "custom",
        customCompanionGif: {
          light: "data:image/gif;base64,light",
          dark: "data:image/gif;base64,dark",
        },
      }),
    );
    const wrapper = mountApp();

    try {
      expect(wrapper.getComponent(SettingsMenu).props("companionGifTheme")).toBe("custom");
      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("custom");
      expect(wrapper.getComponent(CompanionBubble).props("customGifLightSrc")).toBe("data:image/gif;base64,light");
      expect(wrapper.getComponent(CompanionBubble).props("customGifDarkSrc")).toBe("data:image/gif;base64,dark");
    } finally {
      wrapper.unmount();
    }
  });

  it("shows custom GIF tips when clicking a blank reminders area after switching back to custom", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        companionGifTheme: "ikun",
        customCompanionGif: {
          light: "data:image/gif;base64,light",
          dark: "data:image/gif;base64,dark",
        },
      }),
    );
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("gifTheme", "hermes", wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await wrapper.vm.$nextTick();
      wrapper.getComponent(SettingsMenu).vm.$emit("gifTheme", "custom", wrapper.getComponent(SettingsMenu).element as HTMLElement);
      await wrapper.vm.$nextTick();

      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await wrapper.vm.$nextTick();

      const img = wrapper.get(".focus-companion.is-visible img");
      expect(img.attributes("src")).toBe("data:image/gif;base64,light");
      const input = wrapper.get('[data-testid="todo-input-morning"]');
      expect(document.activeElement).toBe(input.element);
      expect(wrapper.get(".todo-item").classes()).toContain("is-editing");

      await vi.advanceTimersByTimeAsync(260);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).not.toHaveLength(0);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows guide bubble content without a GIF when GIF theme is none", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ companionGifTheme: "none" }));
    const wrapper = mountApp();

    try {
      await wrapper.get(".image-panel").trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion img").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("clears workspace pairing from the inbox dialog and persists immediately", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "workspace", lastSeenAt: 7 },
          },
        ],
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
      // 配对弹窗按需异步加载（qrcode 不进主包）：先等动态 import 落定再断言与交互。
      await flushAsyncComponents();
      expect(wrapper.findComponent(WorkspaceInboxDialog).exists()).toBe(true);

      await wrapper.get('[data-testid="inbox-clear"]').trigger("click");

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(persisted.workspaces[0].inbox).toBeUndefined();
      expect(wrapper.findComponent(WorkspaceInboxDialog).exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});

describe("App inbox pull wiring", () => {
  function seedPairedState(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  beforeEach(() => {
    // vi.restoreAllMocks() 不重置 vi.fn() 的实现，逐用例显式回到安全默认值，
    // 避免上一个用例的 mockResolvedValueOnce 泄漏到后续用例。
    vi.mocked(pullAllInboxes).mockReset();
    vi.mocked(pullAllInboxes).mockImplementation(async () => ({ patches: [], reports: [], changed: false }));
  });

  it("pulls inboxes exactly once on startup when a workspace is paired", async () => {
    seedPairedState();
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
    }
  });

  it("replays patches onto live workspaces, persists, and toasts when a pull imports items", async () => {
    vi.useFakeTimers();
    seedPairedState();
    vi.mocked(pullAllInboxes).mockResolvedValueOnce({
      patches: [
        {
          workspaceId: DEFAULT_WORKSPACE_ID,
          plains: [{ kind: "note", text: "来自手机的速记", createdAt: 999 }],
          lastSeenAt: 999,
        },
      ],
      reports: [{ workspaceId: DEFAULT_WORKSPACE_ID, imported: 1 }],
      changed: true,
    });
    const wrapper = mountApp();

    try {
      await vi.advanceTimersByTimeAsync(300);
      await wrapper.vm.$nextTick();

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as {
        workspaces: { inbox?: { lastSeenAt: number }; spaces: { lines: { text: string }[] }[] }[];
      };
      expect(persisted.workspaces[0].spaces[0].lines.map((line) => line.text)).toContain("来自手机的速记");
      expect(persisted.workspaces[0].inbox?.lastSeenAt).toBe(999);
      expect(wrapper.text()).toContain("收到");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("leaves localStorage sync fields and UI untouched when a pull reports no changes", async () => {
    seedPairedState();
    const wrapper = mountApp();

    try {
      // 挂载初始快照：启动拉取尚未完成，此处落盘内容即 changed:false 契约下的负向基线。
      const initial = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as { sync?: { revision?: number; updatedAt?: number } };
      await flushAsyncComponents();

      expect(pullAllInboxes).toHaveBeenCalledTimes(1);
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as { sync?: { revision?: number; updatedAt?: number } };
      expect(persisted.sync?.revision).toBe(initial.sync?.revision);
      expect(persisted.sync?.updatedAt).toBe(initial.sync?.updatedAt);
      expect(wrapper.text()).not.toContain("收到");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps in-flight field-level edits when the pull resolves (merge reads the live object)", async () => {
    seedPairedState();
    let resolvePull!: (result: InboxPullResult) => void;
    vi.mocked(pullAllInboxes).mockImplementationOnce(
      () => new Promise<InboxPullResult>((resolve) => {
        resolvePull = resolve;
      }),
    );
    const wrapper = mountApp();

    try {
      // 启动拉取挂起在 deferred 上：模拟多工作区配对时 B 仍在串行 PBKDF2 解密的秒级窗口。
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      // 在途期间对待办做字段级编辑：同一工作区对象上替换 todos 字段（数组身份不变，
      // 旧实现的快照身份守卫拦不住，基于旧字段快照的合并会把它覆盖丢失）。
      const app = wrapper.vm as unknown as {
        state: { workspaces: Array<{ id: string; todos: Record<string, Array<{ id: string; text: string; done: boolean }>> }> };
      };
      const live = app.state.workspaces.find((workspace) => workspace.id === DEFAULT_WORKSPACE_ID);
      expect(live).toBeTruthy();
      live!.todos = {
        ...live!.todos,
        morning: [...live!.todos.morning, { id: "user-edit", text: "在途用户编辑", done: false }],
      };

      resolvePull({
        patches: [
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            plains: [{ kind: "todo", text: "来自手机的速记", createdAt: 999 }],
            lastSeenAt: 999,
          },
        ],
        reports: [{ workspaceId: DEFAULT_WORKSPACE_ID, imported: 1 }],
        changed: true,
      });
      await flushAsyncComponents();

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as {
        workspaces: { inbox?: { lastSeenAt: number }; todos: Record<string, Array<{ text: string }>> }[];
      };
      const texts = persisted.workspaces[0].todos.morning.map((todo) => todo.text);
      expect(texts).toContain("在途用户编辑"); // 用户在途编辑未被合并覆盖
      expect(texts).toContain("来自手机的速记"); // 导入条目与编辑内容同存
      expect(persisted.workspaces[0].inbox?.lastSeenAt).toBe(999);
    } finally {
      wrapper.unmount();
    }
  });

  it("skips the patch when the watermark already advanced mid-pull (cross-tab adoption)", async () => {
    seedPairedState();
    let resolvePull!: (result: InboxPullResult) => void;
    vi.mocked(pullAllInboxes).mockImplementationOnce(
      () => new Promise<InboxPullResult>((resolve) => {
        resolvePull = resolve;
      }),
    );
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      // 在途期间模拟跨标签页采纳：另一标签页先完成拉取并广播，本标签页整体采纳其状态——
      // 同批条目已入库且水位线推到本批最大值（与在途补丁的 lastSeenAt 相等）。
      const app = wrapper.vm as unknown as {
        state: { workspaces: Array<{ id: string; inbox?: { lastSeenAt: number }; todos: Record<string, Array<{ id: string; text: string; done: boolean }>> }> };
      };
      const live = app.state.workspaces.find((workspace) => workspace.id === DEFAULT_WORKSPACE_ID);
      expect(live?.inbox).toBeTruthy();
      live!.inbox!.lastSeenAt = 999;
      live!.todos = {
        ...live!.todos,
        morning: [...live!.todos.morning, { id: "adopted", text: "来自手机的速记", done: false }],
      };

      resolvePull({
        patches: [
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            plains: [{ kind: "todo", text: "来自手机的速记", createdAt: 999 }],
            lastSeenAt: 999,
          },
        ],
        reports: [{ workspaceId: DEFAULT_WORKSPACE_ID, imported: 1 }],
        changed: true,
      });
      await flushAsyncComponents();

      // 断言活状态：重放门控只决定是否合入活对象；采纳内容的落盘由采纳方自己负责。
      const after = app.state.workspaces.find((workspace) => workspace.id === DEFAULT_WORKSPACE_ID);
      const texts = after!.todos.morning.map((todo) => todo.text);
      // 补丁水位线未严格领先（== 采纳值）：不重放，同文本不会以新 ID 出现第二份。
      expect(texts.filter((text) => text === "来自手机的速记")).toHaveLength(1);
      expect(after!.inbox?.lastSeenAt).toBe(999); // 水位线不被回拨
      expect(wrapper.text()).not.toContain("收到"); // 被跳过的补丁不弹「收到 N 条」
    } finally {
      wrapper.unmount();
    }
  });

  it("skips the patch for a workspace deleted mid-pull without resurrecting it", async () => {
    vi.useFakeTimers();
    // 两个工作区：删除守卫要求至少保留一个，删除配对的 default 后只剩 backup。
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
          { ...defaultWorkspace("backup"), customTitles: { "board-title": "备用桌面" } },
        ],
      }),
    );
    let resolvePull!: (result: InboxPullResult) => void;
    vi.mocked(pullAllInboxes).mockImplementationOnce(
      () => new Promise<InboxPullResult>((resolve) => {
        resolvePull = resolve;
      }),
    );
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      // 在途期间删除配对工作区：state.workspaces 整组替换且不再含 default。
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get(`[data-testid="workspace-delete-${DEFAULT_WORKSPACE_ID}"]`).trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();
      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await nextTick();

      // 过期补丁仍指向已删除的 default 并携带条目：按 id 查无目标应自然跳过。
      resolvePull({
        patches: [
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            plains: [{ kind: "note", text: "来自手机的速记", createdAt: 999 }],
            lastSeenAt: 999,
          },
        ],
        reports: [{ workspaceId: DEFAULT_WORKSPACE_ID, imported: 1 }],
        changed: true,
      });
      await flushAsyncComponents();

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as {
        workspaces: { id: string; spaces: { lines: { text: string }[] }[] }[];
      };
      // 不复活：删除结果保持，条目不导入，过程无报错。
      expect(persisted.workspaces).toHaveLength(1);
      expect(persisted.workspaces[0].id).toBe("backup");
      const allLineTexts = persisted.workspaces.flatMap((workspace) =>
        workspace.spaces.flatMap((space) => space.lines.map((line) => line.text)),
      );
      expect(allLineTexts).not.toContain("来自手机的速记");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("no-ops the patch when pairing is cleared mid-pull", async () => {
    seedPairedState();
    let resolvePull!: (result: InboxPullResult) => void;
    vi.mocked(pullAllInboxes).mockImplementationOnce(
      () => new Promise<InboxPullResult>((resolve) => {
        resolvePull = resolve;
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      // 在途期间从配对弹窗清除配对：工作区对象被替换且不再含 inbox 字段。
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
      await flushAsyncComponents();
      await wrapper.get('[data-testid="inbox-clear"]').trigger("click");
      await nextTick();

      resolvePull({
        patches: [
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            plains: [{ kind: "todo", text: "来自手机的速记", createdAt: 999 }],
            lastSeenAt: 999,
          },
        ],
        reports: [{ workspaceId: DEFAULT_WORKSPACE_ID, imported: 1 }],
        changed: true,
      });
      await flushAsyncComponents();

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as {
        workspaces: { inbox?: { lastSeenAt: number }; todos: Record<string, Array<{ text: string }>> }[];
      };
      // applyInboxItems 顶部 !inbox 守卫空转：配对保持清除、条目不导入、无报错。
      expect(persisted.workspaces[0].inbox).toBeUndefined();
      expect(persisted.workspaces[0].todos.morning.map((todo) => todo.text)).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });

  it("throttles focus-triggered pulls and pulls again once the window passes", async () => {
    vi.useFakeTimers();
    seedPairedState();
    const wrapper = mountApp();

    try {
      await vi.advanceTimersByTimeAsync(20);
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(20);
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(INBOX_FOCUS_THROTTLE_MS + 1);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(20);
      expect(pullAllInboxes).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("never pulls when no workspace is paired", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState()));
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await flushAsyncComponents();
      expect(pullAllInboxes).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  function seedMixedState(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          defaultWorkspace(),
          {
            ...defaultWorkspace("b"),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  it("pulls immediately when switching to a paired workspace and stops on unpaired", async () => {
    seedMixedState();
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      // 启动停在未配对空间：零请求（既有行为）。
      expect(pullAllInboxes).not.toHaveBeenCalled();

      const app = wrapper.vm as unknown as { state: { activeWorkspaceId: string } };
      app.state.activeWorkspaceId = "b";
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      app.state.activeWorkspaceId = DEFAULT_WORKSPACE_ID;
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
    }
  });

  it("pulls on every switch between two paired workspaces", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        activeWorkspaceId: "a",
        workspaces: [
          { ...defaultWorkspace("a"), inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 } },
          { ...defaultWorkspace("b"), inbox: { code: "ZZ9YXW8VTSRQ", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 } },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1); // 启动拉取

      const app = wrapper.vm as unknown as { state: { activeWorkspaceId: string } };
      app.state.activeWorkspaceId = "b";
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(2);

      app.state.activeWorkspaceId = "a";
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(3);
    } finally {
      wrapper.unmount();
    }
  });
});

describe("App inbox revoke wiring", () => {
  function seedPaired(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  beforeEach(() => {
    vi.mocked(revokeInboxKey).mockClear();
    vi.mocked(revokeInboxKey).mockResolvedValue(true);
  });

  async function openInboxDialog(wrapper: ReturnType<typeof mountApp>): Promise<void> {
    await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
    await openWorkspaceMenu(wrapper);
    await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
    await flushAsyncComponents();
  }

  // 配对落点是第二个空间：删除「落点」与删除「其它空间」两种路径的共用种子。
  function seedPairedWithNoteTarget(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            spaces: [
              { id: DEFAULT_SPACE_ID, title: "便签", lines: [] },
              { id: "target", title: "落点", lines: [] },
            ],
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "target", lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  // default 配对、backup 干净：删除配对区与删除干净区两种路径的共用种子。
  function seedPairedWorkspaces(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
          { ...defaultWorkspace("backup") },
        ],
      }),
    );
  }

  it("清除配对后对旧码 keyHash 发送注销且不弹失败警告", async () => {
    seedPaired();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-clear"]').trigger("click");
      await flushAsyncComponents();

      expect(revokeInboxKey).toHaveBeenCalledTimes(1);
      const [keyHash] = vi.mocked(revokeInboxKey).mock.calls[0];
      expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(wrapper.text()).not.toContain("云端清理失败");
    } finally {
      wrapper.unmount();
    }
  });

  it("重置配对（新码≠旧码）同样注销旧码；保存未改码不注销", async () => {
    seedPaired();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-rotate"]').trigger("click");
      await flushAsyncComponents();
      expect(revokeInboxKey).toHaveBeenCalledTimes(1);

      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      expect(revokeInboxKey).toHaveBeenCalledTimes(1); // 新码原样保存：不再注销
    } finally {
      wrapper.unmount();
    }
  });

  it("注销失败时气泡警告云端清理失败", async () => {
    seedPaired();
    vi.useFakeTimers();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(revokeInboxKey).mockResolvedValue(false);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-clear"]').trigger("click");
      await flushAsyncComponents();
      // 气泡文案有 200ms 入场延迟（POPOVER_DELAY_MS）：推进假时钟越过它再断言 DOM 文本。
      await vi.advanceTimersByTimeAsync(300);
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain("云端清理失败，数据将在 30 天保留期内自动过期");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("删除配对便签落点的空间时清空配对并注销旧码", async () => {
    seedPairedWithNoteTarget();
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SpacePanel).vm.$emit("delete", "target");
      await nextTick();
      // Enter 直达逻辑确认态（不等 200ms 气泡入场动画，同 handleConfirmKeydown 契约）。
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      await nextTick();
      await flushAsyncComponents();
      expect(event.defaultPrevented).toBe(true);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.spaces.map((space: { id: string }) => space.id)).toEqual([DEFAULT_SPACE_ID]);
      expect(workspace.inbox).toBeUndefined();
      expect(revokeInboxKey).toHaveBeenCalledTimes(1);
      const [keyHash] = vi.mocked(revokeInboxKey).mock.calls[0];
      expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      wrapper.unmount();
    }
  });

  it("删除非落点空间时保留配对且不注销", async () => {
    seedPairedWithNoteTarget();
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SpacePanel).vm.$emit("delete", DEFAULT_SPACE_ID);
      await nextTick();
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      await nextTick();
      await flushAsyncComponents();
      expect(event.defaultPrevented).toBe(true);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const workspace = stored.workspaces[0];
      expect(workspace.spaces.map((space: { id: string }) => space.id)).toEqual(["target"]);
      expect(workspace.inbox).toEqual({ code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "target", lastSeenAt: 7 });
      expect(revokeInboxKey).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it("删除配对工作区时注销其配对码", async () => {
    seedPairedWorkspaces();
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper);
      await wrapper.get(`[data-testid="workspace-delete-${DEFAULT_WORKSPACE_ID}"]`).trigger("click");
      await nextTick();
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      await nextTick();
      await flushAsyncComponents();
      expect(event.defaultPrevented).toBe(true);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual(["backup"]);
      expect(revokeInboxKey).toHaveBeenCalledTimes(1);
      const [keyHash] = vi.mocked(revokeInboxKey).mock.calls[0];
      expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      wrapper.unmount();
    }
  });

  it("删除未配对工作区时不注销", async () => {
    seedPairedWorkspaces();
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await openWorkspaceMenu(wrapper, "backup");
      await wrapper.get('[data-testid="workspace-delete-backup"]').trigger("click");
      await nextTick();
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      await nextTick();
      await flushAsyncComponents();
      expect(event.defaultPrevented).toBe(true);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual([DEFAULT_WORKSPACE_ID]);
      expect(stored.workspaces[0].inbox).toEqual({ code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 });
      expect(revokeInboxKey).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it("清空数据时注销所有工作区的配对码", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          { ...defaultWorkspace(), inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 } },
          { ...defaultWorkspace("backup"), inbox: { code: "ZZ9YXW8VTSRQ", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 } },
        ],
      }),
    );
    const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", { deleteDatabase });
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("clearData", settings.element as HTMLElement);
      await nextTick();
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      await nextTick();
      await flushAsyncComponents();
      expect(event.defaultPrevented).toBe(true);

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(revokeInboxKey).toHaveBeenCalledTimes(2);
      for (const [keyHash] of vi.mocked(revokeInboxKey).mock.calls) {
        expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
      }
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });
});

describe("App inbox register wiring", () => {
  function seedPaired(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  beforeEach(() => {
    vi.mocked(registerInboxKey).mockClear();
    vi.mocked(registerInboxKey).mockResolvedValue(true);
  });

  async function openInboxDialog(wrapper: ReturnType<typeof mountApp>): Promise<void> {
    await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
    await openWorkspaceMenu(wrapper);
    await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
    await flushAsyncComponents();
  }

  it("启动时对所有已配对工作区的码各注册一次（存量迁移路径）", async () => {
    seedPaired();
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(registerInboxKey).toHaveBeenCalledTimes(1);
      const [keyHash] = vi.mocked(registerInboxKey).mock.calls[0];
      expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      wrapper.unmount();
    }
  });

  it("配对弹窗保存后注册当前码；注册失败弹警告", async () => {
    seedPaired();
    // 气泡文案有 200ms 入场延迟（POPOVER_DELAY_MS）：假时钟须在首条气泡出现前装好，推进 300ms 越过延迟再断言 DOM 文本。
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await flushAsyncComponents();
      const callsAfterStartup = vi.mocked(registerInboxKey).mock.calls.length;

      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      expect(vi.mocked(registerInboxKey).mock.calls.length).toBe(callsAfterStartup + 1);

      vi.mocked(registerInboxKey).mockResolvedValueOnce(false);
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      await vi.advanceTimersByTimeAsync(300);
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain("配对码注册失败，手机暂时无法配对，下次启动会自动重试");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
});
