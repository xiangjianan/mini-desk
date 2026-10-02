# 手机速记手动同步按钮与设置菜单重排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提醒事项与记事本两面板标题栏各加一颗居中的手动同步按钮（仅当前工作区已配对时出现），点击立即拉取云端速记并按结果给出「收到 N 条 / 已是最新 / 同步失败」反馈；设置菜单按使用习惯重排。

**Architecture:** 三层小改：`pull.ts` 的结果对象加 `networkFailed` 全灭标记 → 两个面板组件加 props/emit 渲染绝对居中按钮（复用 `icon-button` 样式）→ App.vue 把 `inboxPullInFlight` 提为 ref、`pullInboxes` 返回结果枚举、新 wrapper 按结果弹气泡。菜单重排仅动 options 数组顺序。

**Tech Stack:** Vue 3 `<script setup>` + naive-ui、vitest + @vue/test-utils、CSS 在 `src/desk.css`。

**Spec:** `docs/superpowers/specs/2026-10-02-inbox-manual-sync-design.md`

**不在范围：** `server/` 无改动；自动拉取路径行为不变；changelog 由 `/release-mini-desk` 流程追加。

## File Structure

- Modify: `src/sync/pull.ts` — `InboxPullResult` 加 `networkFailed`，`pullAllInboxes` 区分未配对/拉取失败计数
- Modify: `src/components/TodoPanel.vue` — props/emit + 标题栏按钮
- Modify: `src/components/SpacePanel.vue` — 同上
- Modify: `src/desk.css` — 按钮绝对居中 + 旋转动画
- Modify: `src/state/i18n.ts` — 3 个新词条（`syncInbox` / `inboxUpToDate` / `inboxSyncFailed`，zh+en）
- Modify: `src/App.vue` — `inboxPullInFlight` → ref、`pullInboxes` 结果枚举、`requestManualInboxSync`、模板接线
- Modify: `src/components/SettingsMenu.vue` — options 重排
- Test: `src/__tests__/sync-pull.test.ts`、`src/__tests__/todo-panel.test.ts`、`src/__tests__/space-panel.test.ts`、`src/__tests__/app-render.test.ts`、`src/__tests__/settings-menu.test.ts`

---

### Task 1: pull.ts 新增 networkFailed 全灭标记

**Files:**
- Modify: `src/sync/pull.ts:20-25`（接口）、`:81-113`（pullAllInboxes）
- Modify: `src/__tests__/app-render.test.ts`（7 处 mock 补字段：行 38、9067、9094、9169、9221、9284、9336）
- Test: `src/__tests__/sync-pull.test.ts`

- [ ] **Step 1: Write the failing tests**

在 `src/__tests__/sync-pull.test.ts` 末尾新增 describe（该文件已 `vi.mock("../sync/inboxClient")` 得到 `fetchMock = vi.mocked(fetchInboxItems)`、`vi.mock("../sync/crypto")` 得到 `decodeMock`；若尚未导入 `defaultWorkspace` 则从 `../state/defaults` 补导入）：

```ts
function pairedSyncWorkspace(id: string): WorkspaceData {
  return {
    ...defaultWorkspace(id),
    inbox: { code: "AB2CDE4FGHJK", todoListId: "list-1", noteTarget: "space-1", lastSeenAt: 0 },
  };
}

describe("pullAllInboxes networkFailed", () => {
  it("全部已配对工作区拉取失败时为 true", async () => {
    fetchMock.mockResolvedValue(null);
    const result = await pullAllInboxes([pairedSyncWorkspace("a"), pairedSyncWorkspace("b")]);
    expect(result.networkFailed).toBe(true);
    expect(result.patches).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("部分失败为 false：成功侧确认无变更，失败侧轮询自愈", async () => {
    fetchMock.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    const result = await pullAllInboxes([pairedSyncWorkspace("a"), pairedSyncWorkspace("b")]);
    expect(result.networkFailed).toBe(false);
  });

  it("全部成功无变更为 false；未配对工作区不计入分母", async () => {
    fetchMock.mockResolvedValue([]);
    const result = await pullAllInboxes([pairedSyncWorkspace("a"), defaultWorkspace("b")]);
    expect(result.networkFailed).toBe(false);
  });
});
```

（若文件顶层已有 `afterEach(vi.clearAllMocks)` 之类的清理则沿用，不要重复注册。`WorkspaceData` 类型若未导入则从 `../types` 补。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/sync-pull.test.ts`
Expected: FAIL — 三个新用例在 `result.networkFailed` 上拿到 `undefined`。

- [ ] **Step 3: Implement**

`src/sync/pull.ts` 接口（约 20-25 行）加一个字段：

```ts
export interface InboxPullResult {
  patches: InboxPullPatch[];
  reports: InboxPullReport[];
  /** 任一工作区有补丁（含纯水位线前进）时为 true；调用方仅在此为 true 时重放并持久化。 */
  changed: boolean;
  /** 所有已配对工作区的拉取全部网络失败时 true（未配对不计入分母；部分失败为 false，轮询自愈）。 */
  networkFailed: boolean;
}
```

`pullAllInboxes`（约 81-113 行）：map 之前加分母，map 内 `!stored` 分支计数，返回值补字段：

```ts
export async function pullAllInboxes(workspaces: WorkspaceData[]): Promise<InboxPullResult> {
  // 单工作区内条目解码保持串行：每次解密是一次 600k 迭代的 PBKDF2（约 60-80ms），并行会放大 CPU 峰值。
  // 工作区之间互相独立，用 allSettled 并发互不拖累。
  const pairedCount = workspaces.filter((workspace) => workspace.inbox !== undefined).length;
  const fetchFailures: string[] = [];
  const results = await Promise.allSettled(
    workspaces.map(async (workspace): Promise<InboxPullPatch | null> => {
      const inbox = workspace.inbox;
      if (!inbox) return null;
      const stored = await fetchInboxItems(await inboxKeyHash(inbox.code));
      if (!stored) {
        fetchFailures.push(workspace.id);
        return null;
      }
      // ……其余逻辑原样保留……
```

末尾返回（约 112 行）：

```ts
  return { patches, reports, changed: patches.length > 0, networkFailed: pairedCount > 0 && fetchFailures.length === pairedCount };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/sync-pull.test.ts src/__tests__/sync-pull-integration.test.ts`
Expected: PASS（integration 用例是逐字段解构断言，加字段不受影响；若意外失败按其断言风格补 networkFailed 断言，不改既有断言语义）。

- [ ] **Step 5: 给 app-render 的 7 处 mock 补字段（类型一致性，vitest 本身不查类型、vue-tsc 查）**

`src/__tests__/app-render.test.ts` 中所有 `pullAllInboxes` mock 返回对象补 `networkFailed: false`——行 38（mock 工厂默认值）、行 9067（beforeEach 重置）、行 9094、9169、9221、9284、9336（各 `mockResolvedValueOnce` 字面量）。逐处在 `changed: ...` 同一对象内加一行 `networkFailed: false,`。

- [ ] **Step 6: Run affected suites**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: PASS（259+，含既有已知噪音 `Errors 1 error`；输码验证 flake 出现则重跑一次）。

- [ ] **Step 7: Commit**

```bash
git add src/sync/pull.ts src/__tests__/sync-pull.test.ts src/__tests__/app-render.test.ts
git commit -m "feat: 收件箱拉取结果新增 networkFailed 全灭标记"
```

---

### Task 2: 两面板标题栏手动同步按钮

**Files:**
- Modify: `src/components/TodoPanel.vue:64-109`（props/emits）、`1671-1677`（头部模板）
- Modify: `src/components/SpacePanel.vue:16-42`（props/emits）、`301-310`（头部模板）
- Modify: `src/desk.css:53-62`（panel-header 规则）+ 其后新增按钮规则
- Modify: `src/state/i18n.ts:530`（zh inboxReceived 后插一行）、`:922`（en 同）
- Test: `src/__tests__/todo-panel.test.ts`、`src/__tests__/space-panel.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/todo-panel.test.ts` 末尾新增（沿用文件既有的 `dropdownStub` 与 `DEFAULT_TITLES`；参照 1483 行附近的直挂 mount 风格）：

```ts
describe("手机速记手动同步按钮", () => {
  const mountWithSync = (extra: Record<string, unknown> = {}) =>
    mount(TodoPanel, {
      props: {
        todos: { morning: [], noon: [], evening: [] },
        titles: DEFAULT_TITLES,
        ...extra,
      },
      global: {
        stubs: {
          Button: true,
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

  it("默认（未配对）不渲染；已配对渲染并 emit syncInbox", async () => {
    const hidden = mountWithSync();
    expect(hidden.find('[data-testid="inbox-sync"]').exists()).toBe(false);
    hidden.unmount();

    const wrapper = mountWithSync({ inboxSyncEnabled: true });
    const button = wrapper.get('[data-testid="inbox-sync"]');
    expect(button.attributes("aria-label")).toBe("同步手机速记");
    await button.trigger("click");
    expect(wrapper.emitted("syncInbox")).toHaveLength(1);
    wrapper.unmount();
  });

  it("拉取中禁用并标 aria-busy", () => {
    const wrapper = mountWithSync({ inboxSyncEnabled: true, inboxSyncing: true });
    const button = wrapper.get('[data-testid="inbox-sync"]');
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.attributes("aria-busy")).toBe("true");
    wrapper.unmount();
  });
});
```

`src/__tests__/space-panel.test.ts` 末尾新增（沿用其 `dropdownStub`；文件已有 `ruleBodies(styles, selector)` 助手读 CSS）：

```ts
describe("手机速记手动同步按钮", () => {
  it("未配对不渲染；已配对渲染并 emit syncInbox", async () => {
    const spaces: WorkspaceSpace[] = [{ id: "s1", title: "便签", lines: [] }];
    const hidden = mount(SpacePanel, {
      props: { spaces, activeSpaceId: "s1" },
      global: { stubs: { Dropdown: dropdownStub, NDropdown: dropdownStub } },
    });
    expect(hidden.find('[data-testid="inbox-sync"]').exists()).toBe(false);
    hidden.unmount();

    const wrapper = mount(SpacePanel, {
      props: { spaces, activeSpaceId: "s1", inboxSyncEnabled: true },
      global: { stubs: { Dropdown: dropdownStub, NDropdown: dropdownStub } },
    });
    await wrapper.get('[data-testid="inbox-sync"]').trigger("click");
    expect(wrapper.emitted("syncInbox")).toHaveLength(1);
    wrapper.unmount();
  });

  it("desk.css 契约：按钮在标题栏几何居中", () => {
    const styles = readFileSync(resolve(__dirname, "../desk.css"), "utf8");
    const bodies = ruleBodies(styles, ".workbench-zone .panel-header .inbox-sync-button");
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.join("\n")).toContain("left: 50%");
    expect(bodies.join("\n")).toContain("translateX(-50%)");
  });
});
```

（若该文件尚未导入 `readFileSync`/`resolve`/`WorkspaceSpace` 则按文件既有 import 风格补。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/todo-panel.test.ts src/__tests__/space-panel.test.ts`
Expected: FAIL — 未配对用例里 `exists()` 为 true（组件还没加按钮？不会——按钮尚未实现，第一个断言方向是「不渲染」会通过，第二个用例在 `wrapper.get(...)` 处抛「找不到元素」而失败；CSS 契约用例 `bodies.length` 为 0 失败。总之新 describe 中至少渲染/CSS 用例失败即 RED。）

- [ ] **Step 3: Implement i18n key**

`src/state/i18n.ts` zh（530 行 `inboxReceived` 之后插一行）：

```ts
      syncInbox: "同步手机速记",
```

en（922 行 `inboxReceived` 之后插一行）：

```ts
      syncInbox: "Sync mobile notes",
```

- [ ] **Step 4: Implement TodoPanel**

`src/components/TodoPanel.vue`：

props（64-78 行）加两项（默认 false）：

```ts
  inboxSyncEnabled?: boolean;
  inboxSyncing?: boolean;
}>(), {
  notificationFlashKeys: () => [],
  language: "zh",
  moveTargets: () => [],
  inboxSyncEnabled: false,
  inboxSyncing: false,
});
```

emits（80-109 行）列表加一行：

```ts
  syncInbox: [];
```

`@vicons/ionicons5` 导入列表（文件头部）加 `SyncOutline`。

头部模板（1671-1677 行）`<h2>` 与 `header-actions` 之间插入：

```html
    <div class="panel-header desk-zone-heading">
      <h2 id="todo-title"><NIcon :component="CheckboxOutline" /><span>{{ uiText.desk.reminders }}</span></h2>
      <!-- 手机速记手动同步：当前工作区已配对才渲染；拉取中旋转禁用。绝对居中见 desk.css。 -->
      <button
        v-if="props.inboxSyncEnabled"
        type="button"
        class="icon-button inbox-sync-button"
        :class="{ 'is-syncing': props.inboxSyncing }"
        :disabled="props.inboxSyncing"
        :aria-busy="props.inboxSyncing ? 'true' : undefined"
        :aria-label="uiText.app.syncInbox"
        :title="uiText.app.syncInbox"
        data-testid="inbox-sync"
        @click.stop="emit('syncInbox')"
      >
        <NIcon :component="SyncOutline" />
      </button>
      <div class="header-actions">
```

（模板里若其他 props 以 `props.` 前缀访问则保持一致；`emit` 若经 `const emit = defineEmits` 则同上。）

- [ ] **Step 5: Implement SpacePanel**

`src/components/SpacePanel.vue`：同样加 `SyncOutline` 导入、props（16-26 行）`inboxSyncEnabled`/`inboxSyncing` 默认 false、emits（28-42 行）加 `syncInbox: [];`，头部模板（301-310 行）`<h2>` 之后插入同款按钮（去掉 `id`，aria 同）：

```html
    <div class="panel-header desk-zone-heading">
      <h2><NIcon :component="DocumentTextOutline" /><span>{{ uiText.desk.notes }}</span></h2>
      <!-- 手机速记手动同步：当前工作区已配对才渲染；拉取中旋转禁用。绝对居中见 desk.css。 -->
      <button
        v-if="props.inboxSyncEnabled"
        type="button"
        class="icon-button inbox-sync-button"
        :class="{ 'is-syncing': props.inboxSyncing }"
        :disabled="props.inboxSyncing"
        :aria-busy="props.inboxSyncing ? 'true' : undefined"
        :aria-label="uiText.app.syncInbox"
        :title="uiText.app.syncInbox"
        data-testid="inbox-sync"
        @click.stop="emit('syncInbox')"
      >
        <NIcon :component="SyncOutline" />
      </button>
      <div class="header-actions">
```

- [ ] **Step 6: Implement CSS**

`src/desk.css` 既有规则（53-62 行）`.workbench-zone .panel-header { ... }` 声明块内加一行 `position: relative;`，并在该规则后追加：

```css
/* 手机速记手动同步按钮：两栏标题栏几何居中（标题左/操作右）；拉取中图标旋转。 */
.workbench-zone .panel-header .inbox-sync-button {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.inbox-sync-button.is-syncing .n-icon {
  animation: inbox-sync-spin 0.8s linear infinite;
}

.inbox-sync-button:disabled {
  cursor: default;
  opacity: 0.6;
}

@keyframes inbox-sync-spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/todo-panel.test.ts src/__tests__/space-panel.test.ts src/__tests__/i18n.test.ts`
Expected: PASS 全绿（i18n 键 zh/en 对齐）。

- [ ] **Step 8: Commit**

```bash
git add src/components/TodoPanel.vue src/components/SpacePanel.vue src/desk.css src/state/i18n.ts src/__tests__/todo-panel.test.ts src/__tests__/space-panel.test.ts
git commit -m "feat: 提醒事项与记事本标题栏新增手动同步按钮"
```

---

### Task 3: App.vue 同步反馈管线与接线

**Files:**
- Modify: `src/App.vue:1100-1102`（in-flight 改 ref）、`1107-1146`（pullInboxes 返回枚举）、其后新增 `requestManualInboxSync`
- Modify: `src/App.vue:3957-3996`（TodoPanel 接线）、`3999-4022`（SpacePanel 接线）
- Modify: `src/state/i18n.ts:531/923`（Task 2 插入行之后，再加 2 键）
- Test: `src/__tests__/app-render.test.ts`（"App inbox pull wiring" describe 内新增用例）

- [ ] **Step 1: Write the failing tests**

`src/__tests__/app-render.test.ts` 的 `describe("App inbox pull wiring", ...)` 内（`seedPairedState` 与 beforeEach 之后）新增：

```ts
  it("shows both manual sync buttons only when the active workspace is paired", async () => {
    const unpaired = mountApp();
    await flushAsyncComponents();
    expect(unpaired.findAll('[data-testid="inbox-sync"]')).toHaveLength(0);
    unpaired.unmount();

    seedPairedState();
    const wrapper = mountApp();
    await flushAsyncComponents();
    expect(wrapper.findAll('[data-testid="inbox-sync"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it("manual sync pulls and toasts 已是最新 when nothing new arrives", async () => {
    seedPairedState();
    const wrapper = mountApp();
    try {
      await flushAsyncComponents();
      vi.mocked(pullAllInboxes).mockClear();
      await wrapper.findAll('[data-testid="inbox-sync"]')[0]!.trigger("click");
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);
      expect(wrapper.text()).toContain("已是最新");
      expect(wrapper.text()).not.toContain("收到");
    } finally {
      wrapper.unmount();
    }
  });

  it("manual sync toasts 同步失败 when every paired fetch fails", async () => {
    seedPairedState();
    vi.mocked(pullAllInboxes).mockImplementation(async () => ({ patches: [], reports: [], changed: false, networkFailed: true }));
    const wrapper = mountApp();
    try {
      await flushAsyncComponents();
      await wrapper.findAll('[data-testid="inbox-sync"]')[1]!.trigger("click");
      await flushAsyncComponents();
      expect(wrapper.text()).toContain("同步失败");
    } finally {
      wrapper.unmount();
    }
  });

  it("manual sync replays patches and toasts 收到 when new items arrive", async () => {
    seedPairedState();
    const wrapper = mountApp();
    try {
      await flushAsyncComponents();
      vi.mocked(pullAllInboxes).mockClear();
      vi.mocked(pullAllInboxes).mockResolvedValueOnce({
        patches: [
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            plains: [{ kind: "note", text: "手动同步的速记", createdAt: 999 }],
            lastSeenAt: 999,
          },
        ],
        reports: [{ workspaceId: DEFAULT_WORKSPACE_ID, imported: 1 }],
        changed: true,
        networkFailed: false,
      });
      await wrapper.findAll('[data-testid="inbox-sync"]')[0]!.trigger("click");
      await flushAsyncComponents();
      expect(wrapper.text()).toContain("收到");
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as {
        workspaces: { inbox?: { lastSeenAt: number }; spaces: { lines: { text: string }[] }[] }[];
      };
      expect(persisted.workspaces[0].spaces[0].lines.map((line) => line.text)).toContain("手动同步的速记");
      expect(persisted.workspaces[0].inbox?.lastSeenAt).toBe(999);
    } finally {
      wrapper.unmount();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "manual sync"`
Expected: FAIL — 按钮不存在（`findAll` 长度 0 / `[0]` 为 undefined 触发 TypeError）。

- [ ] **Step 3: Implement i18n keys**

`src/state/i18n.ts` zh（`syncInbox` 行后）：

```ts
      inboxUpToDate: "已是最新，暂无新内容",
      inboxSyncFailed: "同步失败，请检查网络后重试",
```

en：

```ts
      inboxUpToDate: "Up to date — nothing new",
      inboxSyncFailed: "Sync failed — check your connection",
```

- [ ] **Step 4: Implement the pipeline**

`src/App.vue` 1100-1102 行改 ref：

```ts
let inboxPullTimer: number | undefined;
let inboxLastPullAt = 0;
// 在途守卫（手动按钮的忙碌态也读它）：串行化并发快照，防止并发批次以新 ID 重复导入。
const inboxPullInFlight = ref(false);
```

（`ref` 已在文件导入。）`pullInboxes` 整函数改造（守卫返回值 + networkFailed 优先，其余逐行保留，仅三处早退改返回值、末尾加 return）：

```ts
type InboxSyncOutcome = "applied" | "uptodate" | "failed" | "skipped";

async function pullInboxes(): Promise<InboxSyncOutcome> {
  if (!appMounted || inboxPullInFlight.value || !hasInboxConfigured.value) return "skipped";
  inboxPullInFlight.value = true;
  inboxLastPullAt = Date.now();
  try {
    const { patches, reports, changed, networkFailed } = await pullAllInboxes(state.workspaces);
    if (!appMounted) return "skipped";
    if (networkFailed) return "failed";
    // 水位线单调门控：拉取在途期间，跨标签页广播采纳（applyExternalStoredState 整体覆盖）
    // 或同名导入覆盖都可能已把同批条目合入并推进水位线。补丁水位线未严格领先即说明本批
    // 已被应用过，重放会以新 ID 重复导入同文本——先按当前活对象过滤，只保留仍严格领先的补丁。
    const applicable = patches.filter((patch) => {
      const workspace = state.workspaces.find((item) => item.id === patch.workspaceId);
      return workspace?.inbox !== undefined && patch.lastSeenAt > workspace.inbox.lastSeenAt;
    });
    // 补丁全部失配（工作区已删/配对已清/水位线已被采纳或导入推进）：无落点或本批已应用过，
    // 直接返回，跳过空转的整组替换与持久化，也不弹「收到 N 条」。
    if (!changed || applicable.length === 0) return "uptodate";
    // 补丁重放：在 await 之后的同一同步块内对当前活对象合并，读-合-写之间零宏任务间隙，
    // 用户在途编辑（同对象字段替换，不换数组身份）无法插入，也就不会被旧快照覆盖。
    // 结构性变更天然安全：工作区已删则按 id 查无目标自然跳过；配对已清除则不在 applicable 中。
    state.workspaces = state.workspaces.map((workspace) => {
      const patch = applicable.find((candidate) => candidate.workspaceId === workspace.id);
      return patch ? applyInboxItems(workspace, patch.plains, patch.lastSeenAt) : workspace;
    });
    persistNow();
    for (const report of reports) {
      // 被门控跳过的补丁不提示：跨标签页场景条目实际由另一标签页应用，两边各弹一次会误导。
      if (!applicable.some((patch) => patch.workspaceId === report.workspaceId)) continue;
      const workspace = state.workspaces.find((item) => item.id === report.workspaceId);
      if (!workspace) continue;
      showBubbleText(
        uiText.value.app.inboxReceived.replace("{count}", () => String(report.imported)).replace("{title}", () => getWorkspaceBoardTitle(workspace)),
        undefined,
        { hideCompanionAfter: true },
      );
    }
    return "applied";
  } finally {
    inboxPullInFlight.value = false;
  }
}

/** 手动同步入口（两面板标题栏按钮）：自动路径忽略返回值，仅手动路径按结果补气泡。 */
async function requestManualInboxSync(): Promise<void> {
  const outcome = await pullInboxes();
  if (!appMounted) return;
  if (outcome === "uptodate") showBubbleText(uiText.value.app.inboxUpToDate, undefined, { hideCompanionAfter: true });
  else if (outcome === "failed") showBubbleText(uiText.value.app.inboxSyncFailed, undefined, { hideCompanionAfter: true });
}
```

（`handleWindowFocusInbox`、`startInboxPolling`、切空间 watch 均不改——`void pullInboxes()` 忽略返回值即维持自动路径静默。）

- [ ] **Step 5: Wire the template**

TodoPanel（约 3967 行 `:polish="polishClipboard"` 之后）加：

```html
          :inbox-sync-enabled="hasInboxConfigured"
          :inbox-syncing="inboxPullInFlight"
```

事件区（约 3995 行 `@polish-message` 后）加：

```html
          @sync-inbox="requestManualInboxSync"
```

SpacePanel（约 4007 行 `:polish` 后与 4020 行 `@polish-message` 后）同样三行。

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: PASS 全绿（既有用例不受影响；已知噪音按 CLAUDE.md 处理）。

- [ ] **Step 7: Commit**

```bash
git add src/App.vue src/state/i18n.ts src/__tests__/app-render.test.ts
git commit -m "feat: 手动同步反馈管线与两面板接线"
```

---

### Task 4: 设置菜单重排

**Files:**
- Modify: `src/components/SettingsMenu.vue:71-118`（options 顺序）
- Test: `src/__tests__/settings-menu.test.ts`（pairs-a-phone 用例的顺序断言）

- [ ] **Step 1: Write the failing test**

`src/__tests__/settings-menu.test.ts`「pairs a phone from the settings menu for the active workspace」用例中，把现有顺序断言（`indexOf("gif-theme") < indexOf("pair-inbox") < indexOf("suggest")` 两行及其注释）替换为整链单调断言：

```ts
    const keys = wrapper.findAll(".dropdown-option").map((option) => option.attributes("data-key"));
    // 一级项新序：手机速记 → 数据 → 语言 → GIF 主题 → 快捷键 → 提建议 → 关于（子项不参与，index 单调）。
    const order = ["pair-inbox", "data", "language", "gif-theme", "shortcut-help", "suggest", "about"].map((key) => keys.indexOf(key));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/settings-menu.test.ts`
Expected: FAIL — `order.every(index => index >= 0)` 不成立（pair-inbox 当前在 gif-theme 之后，顺序数组非单调）。

- [ ] **Step 3: Implement the reorder**

`src/components/SettingsMenu.vue` options 数组重排为：

```ts
const options = computed(() => [
  // 手机速记独立一级入口置顶：配套手动同步按钮已就位，提升为一等功能。
  { label: text.value.app.inboxPair, key: "pair-inbox", icon: renderIcon(PhonePortraitOutline) },
  {
    label: text.value.settings.data,
    key: "data",
    icon: renderIcon(ServerOutline),
    children: [
      { label: text.value.settings.createWorkspace, key: "create-workspace", icon: renderIcon(AddOutline) },
      { label: text.value.settings.import, key: "import", icon: renderIcon(CloudUploadOutline) },
      { label: text.value.settings.exportCurrentWorkspace, key: "export-workspace", icon: renderIcon(CloudDownloadOutline) },
      { label: text.value.settings.clearData, key: "clear-data", icon: renderIcon(TrashOutline, true) },
    ],
  },
  {
    label: text.value.settings.language,
    key: "language",
    icon: renderIcon(GlobeOutline),
    children: [
      {
        label: text.value.settings.chinese,
        key: "language:zh",
        icon: normalizeLanguage(props.language) === "zh" ? renderIcon(CheckmarkOutline) : undefined,
      },
      {
        label: text.value.settings.english,
        key: "language:en",
        icon: normalizeLanguage(props.language) === "en" ? renderIcon(CheckmarkOutline) : undefined,
      },
    ],
  },
  {
    label: text.value.settings.gifTheme,
    key: "gif-theme",
    icon: renderIcon(ImagesOutline),
    children: COMPANION_GIF_THEME_OPTIONS.map((option) => ({
      label: getCompanionGifThemeLabel(option.value),
      key: `gif-theme:${option.value}`,
      icon: option.value === props.companionGifTheme ? renderIcon(CheckmarkOutline) : undefined,
    })),
  },
  { label: text.value.settings.shortcutHelp, key: "shortcut-help", icon: renderIcon(KeyOutline) },
  { label: text.value.settings.suggest, key: "suggest", icon: renderIcon(CreateOutline) },
  ...(SUPPORT_AUTHOR_ENABLED
    ? [{ label: text.value.settings.support, key: "support", icon: renderIcon(HeartOutline) }]
    : []),
  { label: text.value.settings.about, key: "about", icon: renderIcon(InformationCircleOutline) },
  { type: "divider", key: "version-divider" },
```

（version 选项对象在 divider 后原样保留；仅移动既有对象，不改任何 label/key/icon；`handleSelect` 不动。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/settings-menu.test.ts`
Expected: PASS 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsMenu.vue src/__tests__/settings-menu.test.ts
git commit -m "feat: 设置菜单按使用习惯重排"
```

---

### Task 5: 全量回归

**Files:** 无新改动。

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: 全部通过。已知噪音（CLAUDE.md）：结尾恒有 `Errors 1 error`（IndexedDB stub 拒绝）；「输码验证 unknown/revoked」全量跑偶发 flake——重跑一次即过，不修。

- [ ] **Step 2: Type check and build**

Run: `npm run build`
Expected: vue-tsc --noEmit 与 vite build 成功。

- [ ] **Step 3: 手工冒烟（可选，dev 起服）**

Run: `npm run dev`
验证：未配对工作区两面板标题栏无同步按钮；配对后两颗居中按钮出现，点击弹「已是最新」或「收到 N 条」；设置菜单新序为 手机速记 → 数据 → 语言 → GIF 主题 → 快捷键 → 提建议 → 关于。
