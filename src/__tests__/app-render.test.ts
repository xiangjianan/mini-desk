import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";
import CompanionBubble from "../components/CompanionBubble.vue";
import ImagePanel from "../components/ImagePanel.vue";
import ImagePreview from "../components/ImagePreview.vue";
import QuickButtons from "../components/QuickButtons.vue";
import SettingsMenu from "../components/SettingsMenu.vue";
import SpacePanel from "../components/SpacePanel.vue";
import TodoPanel from "../components/TodoPanel.vue";
import { defaultState, STORAGE_KEY } from "../state/defaults";
import { KAOMOJI_BY_MOOD } from "../state/messages";

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the preserved board regions and primary controls", async () => {
    const wrapper = mountApp();

    expect(wrapper.find('[aria-label="To Do List 看板"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("截图");
    expect(wrapper.text()).toContain("便签");
    expect(wrapper.text()).toContain("快捷链接");
    expect(wrapper.text()).toContain("早上");
    expect(wrapper.text()).toContain("中午");
    expect(wrapper.text()).toContain("晚上");
    expect(wrapper.text()).toContain("工作空间");
    expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["工作空间"]);
    expect(wrapper.find('[aria-label="切换主题"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="快捷链接菜单"]').exists()).toBe(true);
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
      customTitles: {
        "note-title": "我的便签",
      },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(SettingsMenu).vm.$emit("language", "en", wrapper.get(".settings-trigger").element as HTMLElement);
      await nextTick();

      expect(wrapper.text()).toContain("Screenshots");
      expect(wrapper.text()).toContain("我的便签");
      expect(wrapper.text()).toContain("Quick Links");
      expect(wrapper.text()).toContain("Morning");
      expect(wrapper.text()).toContain("Noon");
      expect(wrapper.text()).toContain("Evening");
      expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["Workspace"]);
      expect(wrapper.text()).not.toContain("快捷链接");
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
    expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["custom"]);
    expect(stored.todos.custom.at(-1)).toMatchObject({
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
      expect(wrapper.get(".mobile-handoff-title").text()).toBe("To Do List 看板");
      expect(wrapper.text()).toContain("建议在电脑浏览器打开，以获得完整体验");
      expect(wrapper.find(".mobile-drawer-trigger").exists()).toBe(false);
      expect(wrapper.find(".mobile-drawer-menu").exists()).toBe(false);
      expect(wrapper.find('[aria-label="To Do List 看板"]').exists()).toBe(false);
      expect(wrapper.findComponent(ImagePanel).exists()).toBe(false);
      expect(wrapper.findComponent(QuickButtons).exists()).toBe(false);
      expect(wrapper.findComponent(TodoPanel).exists()).toBe(false);
      expect(wrapper.findComponent(SpacePanel).exists()).toBe(false);
      expect(wrapper.findComponent(SettingsMenu).exists()).toBe(false);
      expect(wrapper.findComponent(ImagePreview).exists()).toBe(false);
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

  it("creates a todo from an empty section click", async () => {
    const wrapper = mountApp();

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.find('[data-testid="todo-input-morning"]').exists()).toBe(true);

    wrapper.unmount();
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

      expect(renderedTexts).toEqual(["任务 A", "任务 B"]);
      expect(stored.todos.morning.map((todo: { text: string; done: boolean }) => ({
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
      expect(stored.todoLists).toHaveLength(4);
      expect(stored.todoLists.at(-1).title).toBe("工作提醒");
      expect(stored.todos[stored.todoLists.at(-1).id]).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });

  it("starts editing a newly created reminder list title", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("createList", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      await nextTick();

      const newSection = wrapper.findAll(".todo-section").at(-1);
      const input = newSection?.find(".title-edit-input");

      expect(input?.exists()).toBe(true);
      expect((input?.element as HTMLInputElement | undefined)?.value).toBe("未命名列表");
      expect(document.activeElement).toBe(input?.element);
    } finally {
      wrapper.unmount();
    }
  });

  it("persists reminder list title updates", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
      todos: { work: [] },
      showCompletedTodos: { work: false },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("updateListTitle", "work", "  工作提醒  ");
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists.find((list: { id: string }) => list.id === "work").title).toBe("工作提醒");
    } finally {
      wrapper.unmount();
    }
  });

  it("persists reminder list collapsed and compact flags", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
      todos: { work: [] },
      showCompletedTodos: { work: false },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("toggleListCollapsed", "work", true);
      wrapper.getComponent(TodoPanel).vm.$emit("toggleListCompact", "work", true);
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists.find((list: { id: string }) => list.id === "work")).toMatchObject({
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
      todoLists: [
        { id: "work", title: "工作", collapsed: false, compact: false },
        { id: "home", title: "生活", collapsed: false, compact: false },
      ],
      todos: { work: [{ id: "a", text: "A", done: false }], home: [] },
      showCompletedTodos: { work: false, home: false },
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
      expect(stored.todoLists.some((list: { id: string }) => list.id === "work")).toBe(false);
      expect(stored.todos.work).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("confirms deletion of an empty reminder list before removing it", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [
        { id: "work", title: "工作", collapsed: false, compact: false },
        { id: "home", title: "生活", collapsed: false, compact: false },
      ],
      todos: { work: [], home: [] },
      showCompletedTodos: { work: false, home: false },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("deleteList", "work", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toMatch(/删除列表|提醒列表/);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").todoLists.map((list: { id: string }) => list.id)).toEqual(["work", "home"]);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await nextTick();

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").todoLists.map((list: { id: string }) => list.id)).toEqual(["home"]);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("blocks deleting the last reminder list", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
      todos: { work: [] },
      showCompletedTodos: { work: false },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("deleteList", "work", wrapper.get(".todo-panel").element as HTMLElement);
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["work"]);
      expect(stored.todos.work).toEqual([]);
      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("至少保留一个提醒列表");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("persists reminder list reorder", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [
        { id: "a", title: "A", collapsed: false, compact: false },
        { id: "b", title: "B", collapsed: false, compact: false },
      ],
      todos: { a: [], b: [] },
      showCompletedTodos: { a: false, b: false },
    }));
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="b"] .todo-list-drag-handle').trigger("dragstart");
      await wrapper.get('.todo-section[data-list-id="a"]').trigger("drop");

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["b", "a"]);
    } finally {
      wrapper.unmount();
    }
  });

  it("uses the same before-target ordering for adjacent and non-adjacent list reorders", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [
        { id: "a", title: "A", collapsed: false, compact: false },
        { id: "b", title: "B", collapsed: false, compact: false },
        { id: "c", title: "C", collapsed: false, compact: false },
      ],
      todos: { a: [], b: [], c: [] },
      showCompletedTodos: { a: false, b: false, c: false },
    }));
    const wrapper = mountApp();

    try {
      await wrapper.get('.todo-section[data-list-id="a"] .todo-list-drag-handle').trigger("dragstart");
      await wrapper.get('.todo-section[data-list-id="b"]').trigger("drop");

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["a", "b", "c"]);
    } finally {
      wrapper.unmount();
    }
  });

  it("focuses todos for imported list ids with selector characters", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [{ id: 'bad"]id', title: "特殊", collapsed: false, compact: false }],
      todos: { 'bad"]id': [] },
      showCompletedTodos: { 'bad"]id': false },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("create", 'bad"]id');
      await nextTick();
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todos['bad"]id']).toHaveLength(1);
      expect(stored.todos['bad"]id'][0]).toMatchObject({ text: "", done: false });
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
      todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
      todos: { custom: [{ id: "blank", text: "", done: false }] },
      showCompletedTodos: { custom: false },
    }));
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("create", "morning");
      await nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["custom"]);
      expect(stored.todos).toEqual({
        custom: [{ id: "blank", text: "", done: false }],
      });
      expect(stored.showCompletedTodos).toEqual({ custom: false });
    } finally {
      wrapper.unmount();
    }
  });

  it("ignores stale drop update and move events without orphan todo records", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultState(),
      todoLists: [
        { id: "home", title: "生活", collapsed: false, compact: false },
        { id: "work", title: "工作", collapsed: false, compact: false },
      ],
      todos: {
        home: [{ id: "home-a", text: "Home", done: false }],
        work: [],
      },
      showCompletedTodos: { home: false, work: false },
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
      expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["home"]);
      expect(stored.todos.home).toEqual([
        expect.objectContaining({ id: "home-a", text: "Home", done: false }),
      ]);
      expect(stored.showCompletedTodos).toEqual({ home: false });
      expect(stored.todos.work).toBeUndefined();
      expect(stored.todos.morning).toBeUndefined();
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("点一下开始写便签");

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

  it("shows only the GIF when focusing a non-empty editor", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        noteLines: [{ text: "已有内容", indent: 0 }],
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.get("textarea").trigger("focus");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows compact save status dots around text edits", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("已保存");

      const textarea = wrapper.get("textarea");
      await textarea.trigger("dblclick");
      await textarea.setValue("临时记录");

      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("dirty");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("有未保存内容");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saving");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("保存中");

      await vi.advanceTimersByTimeAsync(120);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="save-status"]').attributes("data-state")).toBe("saved");
      expect(wrapper.get('[data-testid="save-status"]').attributes("aria-label")).toBe("已保存");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a color legend tip when clicking the save status dot", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      await wrapper.get('[data-testid="save-status"]').trigger("click");
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      const message = wrapper.get('[data-testid="companion-confirm"]').text();
      expect(message).toContain("绿色");
      expect(message).toContain("已保存");
      expect(message).toContain("红色");
      expect(message).toContain("未保存");
      expect(message).toContain("橙色");
      expect(message).toContain("保存中");
      expect(KAOMOJI_BY_MOOD.calm.some((kaomoji) => message.endsWith(kaomoji))).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("creates reminder lists with completed reminders visible by default", async () => {
    const wrapper = mountApp();

    try {
      wrapper.getComponent(TodoPanel).vm.$emit("createList", undefined, "新列表");
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const listId = stored.todoLists.at(-1).id;
      expect(stored.showCompletedTodos[listId]).toBe(true);
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

      expect(wrapper.find(".board").exists()).toBe(true);
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

    await wrapper.get('[aria-label="切换主题"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    wrapper.unmount();
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
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").todos.morning[0]).toMatchObject({
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
      expect(notificationSpy).toHaveBeenCalledWith("☀️ 早上", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
        icon: expect.stringMatching(/^https?:\/\/.*kun.*\.jpg/),
      });
    } finally {
      wrapper.unmount();
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
      expect(notificationSpy).toHaveBeenCalledWith("☀️ 早上", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
        icon: expect.stringMatching(/^https?:\/\/.*kun.*\.jpg/),
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
      expect(notificationSpy).toHaveBeenCalledWith("☀️ 早上", {
        body: "喝水",
        tag: `todo-1:${notifyAt}`,
        icon: expect.stringMatching(/^https?:\/\/.*kun.*\.jpg/),
      });
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

      expect(notificationSpy).toHaveBeenCalledWith("☀️ 早上", {
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
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").todos.morning[0]).not.toHaveProperty("notifyAt");
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
      wrapper.getComponent(ImagePreview).vm.$emit("delete", "img-1", preview.element as HTMLElement);
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

  it("confirms workspace deletion with semantic labels and no undo", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        spaces: [
          { id: "workspace", title: "工作空间", lines: [] },
          { id: "project", title: "项目", lines: [{ text: "项目资料", indent: 0 }] },
        ],
        activeSpaceId: "project",
      }),
    );
    const wrapper = mountApp();

    try {
      const spacePanel = wrapper.getComponent(SpacePanel);
      vi.spyOn(spacePanel.element, "getBoundingClientRect").mockReturnValue({
        x: 720,
        y: 0,
        width: 360,
        height: 720,
        top: 0,
        left: 720,
        right: 1080,
        bottom: 720,
        toJSON: () => ({}),
      });

      spacePanel.vm.$emit("delete", "project");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除空间");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["工作空间"]);
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/空间已删除/);
      expect(wrapper.find('[data-testid="companion-action"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("clears pending workspace name editing after SpacePanel edit completion", async () => {
    const wrapper = mountApp();

    try {
      let spacePanel = wrapper.getComponent(SpacePanel);
      spacePanel.vm.$emit("create");
      await wrapper.vm.$nextTick();

      spacePanel = wrapper.getComponent(SpacePanel);
      const editSpaceId = spacePanel.props("editSpaceId");
      expect(editSpaceId).toBeTruthy();

      spacePanel.vm.$emit("editDone", editSpaceId);
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(SpacePanel).props("editSpaceId")).toBeNull();
    } finally {
      wrapper.unmount();
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

  it("hides the quick-copy GIF together with the companion bubble timeout", async () => {
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

      await vi.advanceTimersByTimeAsync(3000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').classes()).not.toContain("is-popover-fading");
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(260);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("switches image preview with vertical and horizontal arrow keys", async () => {
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
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("2");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".preview-thumb.is-active .image-index").text()).toBe("2");

    wrapper.unmount();
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

      expect(wrapper.find(".image-preview").exists()).toBe(true);
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
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

  it("copies the current image when Enter is pressed immediately after preview opens", async () => {
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
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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

    await wrapper.get(".note-link-panel").trigger("drop", {
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

      imagePanel.vm.$emit("paste");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/没有|图片|剪贴板/);

      await vi.advanceTimersByTimeAsync(3000);
      imagePanel.vm.$emit("paste");
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
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const images = wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>;
      expect(images).toHaveLength(2);
      expect(images[0].id).toBe("existing");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
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
      settings.vm.$emit("export", settings.element as HTMLElement);
      await wrapper.vm.$nextTick();

      expect(createObjectURL).toHaveBeenCalled();
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导出|备份|文件|准备/);

      await vi.advanceTimersByTimeAsync(3000);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({ workspaceLines: ["导入内容"] })], "todo.json", {
        type: "application/json",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/覆盖|导入|当前数据/);
      expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(true);
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("覆盖导入");
      expect(wrapper.get('[data-testid="companion-yes"]').classes()).toContain("is-danger");
      expect(wrapper.text()).not.toContain("导入内容");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/导入|同步|生效|就位|更新/);
      const workspaceTextarea = wrapper.findAll("textarea")[1].element as HTMLTextAreaElement;
      expect(workspaceTextarea.value).toContain("导入内容");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("accepts imports that only change the companion GIF theme", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();

    try {
      const settings = wrapper.getComponent(SettingsMenu);
      settings.vm.$emit("import", settings.element as HTMLElement);
      const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
      const file = new File([JSON.stringify({ companionGifTheme: "none" })], "todo.json", {
        type: "application/json",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await wrapper.get('input[type="file"]').trigger("change");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/覆盖|导入|当前数据/);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(SettingsMenu).props("companionGifTheme")).toBe("none");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("none");
    } finally {
      wrapper.unmount();
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
          todoLists: [{ id: "solo", title: "单独列表", collapsed: false, compact: false }],
          showCompletedTodos: { solo: true },
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/覆盖|导入|当前数据/);

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(stored.todoLists).toEqual([
        { id: "solo", title: "单独列表", collapsed: false, compact: false },
      ]);
      expect(stored.todos.solo).toEqual([]);
      expect(stored.showCompletedTodos.solo).toBe(true);
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
      const file = new File([JSON.stringify({ workspaceLines: ["切换中导入"] })], "todo.json", {
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

      expect(wrapper.find(".board").exists()).toBe(true);
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

      expect(wrapper.find(".board").exists()).toBe(true);
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("To Do List 看板");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("云霞 · 产品");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("佳男 · 开发");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("Codex · 协作支持");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("👤 产品经理 — 云霞");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("牛马：Codex");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("xiangjianan / todolist");
      expect(wrapper.get('[data-testid="companion-link"]').attributes("href")).toBe("https://github.com/xiangjianan/todolist");
      expect(wrapper.get('[data-testid="companion-link"]').attributes("target")).toBe("_blank");
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("To Do List 看板");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toContain("给老婆做的 todolist 看板");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("xiangjianan / todolist");

      await vi.advanceTimersByTimeAsync(9799);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
      expect(wrapper.find(".companion-popover-shell").classes()).not.toContain("is-popover-fading");

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".companion-popover-shell").classes()).toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').classes()).not.toContain("is-popover-fading");
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("To Do List 看板");
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

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("To Do List 看板");
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
      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("To Do List 看板");
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
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
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
      wrapper.getComponent(ImagePanel).vm.$emit("paste", wrapper.get(".image-panel").element as HTMLElement);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(execCommand).toHaveBeenCalledWith("paste");
      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as Array<{ id: string }>)).toHaveLength(1);
      });
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
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
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
      wrapper.getComponent(ImagePanel).vm.$emit("paste");
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

  it("shows a companion bubble when link opening is blocked", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickButtons: [{ id: "link-1", title: "站点", value: "example.com", type: "link" }],
      }),
    );
    vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountApp();

    try {
      await wrapper.get(".quick-button").trigger("click");
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/链接打开失败|检查链接/);
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

  it("fades area click and focus guidance GIFs after ten seconds", async () => {
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
      await vi.advanceTimersByTimeAsync(9_999);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);

      const workspace = wrapper.findAll(".text-panel")[1];
      vi.spyOn(workspace.element, "getBoundingClientRect").mockReturnValue({
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
      await workspace.get("textarea").trigger("focus");
      await vi.advanceTimersByTimeAsync(9_999);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".focus-companion.is-visible").exists()).toBe(false);
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
        noteLines: [{ text: "已有便签", indent: 0 }],
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

      await wrapper.get(".note-panel textarea").trigger("focus");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows Tips for empty clicked areas and only the GIF for non-empty clicked areas", async () => {
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

      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);
      expect(wrapper.get('[data-testid="companion-bubble"]').attributes("style")).toContain("100vw - 428px");
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(260);
      await wrapper.vm.$nextTick();

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
        { key: "quickButtons", component: QuickButtons, pattern: /快捷|按钮|复制|链接/ },
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
    const wrapper = mountApp();

    try {
      const quick = wrapper.getComponent(QuickButtons);
      quick.vm.$emit("guide", "quickButtons", quick.element as HTMLElement);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();
      const firstTips = wrapper.get('[data-testid="companion-confirm"]').text();

      await wrapper.get(".note-panel textarea").trigger("focus");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="companion-confirm"]').text()).not.toBe(firstTips);

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

  it("anchors the companion near the focused todo section and workspace area", async () => {
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

    const workspace = wrapper.findAll(".text-panel")[1];
    vi.spyOn(workspace.element, "getBoundingClientRect").mockReturnValue({
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
    await workspace.get("textarea").trigger("focus");

    const workspaceStyle = wrapper.get('[data-testid="companion-bubble"]').attributes("style");
    expect(workspaceStyle).toContain("right: calc(10px + 100vw - 1080px)");
    expect(workspaceStyle).toContain("bottom: calc(10px + 100vh - 900px)");

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

      const workspace = wrapper.findAll(".text-panel")[1];
      vi.spyOn(workspace.element, "getBoundingClientRect").mockReturnValue({
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
      await workspace.get("textarea").trigger("focus");

      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="companion-bubble"]').attributes("style")).toContain("100vw - 1080px");
      expect(wrapper.find(".focus-companion.is-visible img").exists()).toBe(true);

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

  it("moves app version status into the settings menu and marks stale versions", async () => {
    localStorage.setItem("todo-board-app-version", "0.9.0");
    const wrapper = mountApp();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const settings = wrapper.getComponent(SettingsMenu);
    expect(wrapper.find('[data-testid="app-version"]').exists()).toBe(false);
    expect(settings.props("appVersion")).toMatch(/^\d+\.\d+\.\d+/);
    expect(settings.props("updateAvailable")).toBe(true);
    expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBe("true");

    wrapper.unmount();
  });

  it("hides the settings update dot after ten seconds without clearing update status", async () => {
    vi.useFakeTimers();
    localStorage.setItem("todo-board-app-version", "0.9.0");
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
      expect(wrapper.get('[aria-label="设置"]').attributes("data-update-available")).toBeUndefined();
      expect(wrapper.getComponent(SettingsMenu).props("updateAvailable")).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("opens the GitHub issue creation page from the settings suggestion action", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountApp();

    const settings = wrapper.getComponent(SettingsMenu);
    settings.vm.$emit("suggest", settings.element as HTMLElement);
    await wrapper.vm.$nextTick();

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/xiangjianan/todolist/issues/new",
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
      expect(stored.customCompanionGif.light).toMatch(/^data:image\/gif/);
      expect(stored.customCompanionGif.dark).toMatch(/^data:image\/gif/);
      expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("custom");
      expect(wrapper.getComponent(CompanionBubble).props("customGifLightSrc")).toMatch(/^data:image\/gif/);
      expect(wrapper.getComponent(CompanionBubble).props("customGifDarkSrc")).toMatch(/^data:image\/gif/);
    } finally {
      wrapper.unmount();
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
});
