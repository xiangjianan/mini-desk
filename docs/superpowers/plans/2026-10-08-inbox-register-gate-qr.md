# 配对码注册失败时不生成二维码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机速记配对弹窗的「生成/重置配对码」先在中继注册成功，才展示配对码与二维码并落盘；注册失败停留原状态（未配对态或旧码），内联提示可重试。

**Architecture:** 注册门禁移进 `WorkspaceInboxDialog.vue`（先例：`MobileInboxCapture.vue` 直接调 sync 客户端）：本地生码 → `inboxKeyHash` → `registerInboxKey` → 成功才 `code.value` 赋值 + `emit("update")`。App.vue `handleInboxUpdate` 里事后的二次注册删除（save 不改码、generate/rotate 已前置注册、启动路径仍幂等自愈）。

**Tech Stack:** Vue 3 `<script setup>` + TS、naive-ui（测试里 NButton 为真实现，可断言 `disabled`）、vitest（模块级 mock `../sync/inboxClient`）。

**Spec:** `docs/superpowers/specs/2026-10-08-inbox-register-gate-qr-design.md`

**背景速览（给零上下文执行者）：**
- 弹窗组件 `src/components/WorkspaceInboxDialog.vue`：`generate()`/`rotate()` 目前本地生码后立即 `emit("update", buildInbox())`，码+地址+二维码随 `hasCode` 变真立刻渲染。
- `src/App.vue` `handleInboxUpdate`（约 1014-1036 行）落盘并后台 `registerInbox(inbox.code, true)`；失败只弹气泡，二维码已经亮出。
- 中继客户端 `src/sync/inboxClient.ts` 的 `registerInboxKey(keyHash): Promise<boolean>` 失败一律返回 false 不抛错；`inboxKeyHash(code): Promise<string>`（SHA-256 hex64）在 `src/sync/crypto.ts`。
- 测试 `src/__tests__/app-render.test.ts` 已有 `describe("App inbox register wiring")`（约 9852 行起）：`beforeEach` 里 `vi.mocked(registerInboxKey).mockClear(); mockResolvedValue(true)`，且带 `seedPaired()` 与 `openInboxDialog(wrapper)` 助手。
- 测试的 NModal 桩（`src/__tests__/helpers/stubs.ts`）在 `show` 翻 false 时**同步** emit `after-leave`，弹窗随之同步卸载——卸载守卫测试无需等真实 200ms 过渡。

---

### Task 1: 生成路径注册门禁（测试先行）

**Files:**
- Test: `src/__tests__/app-render.test.ts`（`App inbox register wiring` describe 内）
- Modify: `src/components/WorkspaceInboxDialog.vue`
- Modify: `src/state/i18n.ts`（zh 约 536 行 / en 约 938 行，`inboxRegisterFailed` 相邻位置新增 key）
- Modify: `src/styles.css`（`.workspace-inbox-empty` 之后，约 7179 行）

- [ ] **Step 1: 写失败测试**

在 `describe("App inbox register wiring")` 内、`beforeEach` 之后新增助手与两条用例（该 describe 已 import `registerInboxKey`；`defaultState`/`STORAGE_KEY`/`mountApp`/`flushAsyncComponents`/`WorkspaceInboxDialog` 均已在文件顶部 import）：

```ts
  // 生成路径的未配对种子：默认工作区、无 inbox。
  function seedUnpaired(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState()));
  }

  it("生成配对码注册失败：停留未配对态不落盘，内联提示可重试", async () => {
    seedUnpaired();
    vi.mocked(registerInboxKey).mockResolvedValue(false);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-generate"]').trigger("click");
      await flushAsyncComponents();

      expect(registerInboxKey).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-testid="inbox-code"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="inbox-register-error"]').text()).toContain("配对码注册失败");
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(persisted.workspaces[0].inbox).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it("注册失败后重试成功：展示配对码并落盘", async () => {
    seedUnpaired();
    vi.mocked(registerInboxKey).mockResolvedValueOnce(false);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-generate"]').trigger("click");
      await flushAsyncComponents();
      expect(wrapper.find('[data-testid="inbox-register-error"]').exists()).toBe(true);

      await wrapper.get('[data-testid="inbox-generate"]').trigger("click");
      await flushAsyncComponents();

      expect(wrapper.find('[data-testid="inbox-code"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="inbox-register-error"]').exists()).toBe(false);
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(persisted.workspaces[0].inbox?.code).toMatch(/^[A-Z0-9]{12}$/);
    } finally {
      wrapper.unmount();
    }
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "生成配对码注册失败"`
Expected: FAIL——当前实现立即展示配对码，`[data-testid="inbox-register-error"]` 找不到（`get` 抛 unable to find）。

- [ ] **Step 3: 实现弹窗前置注册**

`src/components/WorkspaceInboxDialog.vue`——script 部分四改：

1）import 增加两个 sync 客户端（紧跟现有 `../sync/pairing` import 之后）：

```ts
import { inboxKeyHash } from "../sync/crypto";
import { registerInboxKey } from "../sync/inboxClient";
```

2）`const code = ref(...)` 之前的那段「编辑草稿」注释（38-41 行）整体替换，反映新口径：

```ts
// 编辑草稿以 props 里的既有配对为初值；保存/清除时一次性 emit，取消则原样丢弃。
// 轮换例外：confirm 已承诺「旧地址立即失效」，确认后立即 emit 生效，弹窗保持打开供抄录/扫码。
// 生成/轮换例外：先在中继注册新码、成功才赋码 + emit 落盘（未注册的码手机端扫码即
// unknown_code）；注册失败停留原状态（未配对态/旧码）并内联提示，重试即重新生码注册。
```

3）`const code = ref(...)` 声明后新增状态与守卫，并把 `onBeforeUnmount(clearCopyResetTimer)` 换成带卸载守卫的版本：

```ts
// 注册在途守卫：生成/重置按钮 loading/disabled，防重复触发。
const registering = ref(false);
// 注册失败内联提示：码未落地，重试即重新生码注册。
const registerError = ref(false);
// 卸载守卫：弹窗关闭后迟到的注册结果不再写码/emit（惯例同 App 的卸载守卫）。
let disposed = false;
```

```ts
onBeforeUnmount(() => {
  disposed = true;
  clearCopyResetTimer();
});
```

4）`generate()` 整体替换为异步版（`buildInbox()`/`rotate()`/其余不动，rotate 在 Task 2 改）：

```ts
async function generate(): Promise<void> {
  if (registering.value) return;
  registering.value = true;
  registerError.value = false;
  try {
    // 先注册后落码：未注册的码手机端扫码即 unknown_code，注册失败停留未配对态供重试。
    const nextCode = generateInboxCode();
    const registered = await registerInboxKey(await inboxKeyHash(nextCode));
    if (!registered) {
      registerError.value = true;
      return;
    }
    if (disposed) return;
    // 注册成功即生效：立即 emit 落盘，弹窗保持打开供抄录/扫码——与 rotate 同口径。
    code.value = nextCode;
    emit("update", buildInbox());
  } catch {
    // inboxKeyHash 在非安全上下文等场景会异常（registerInboxKey 自身不抛）：
    // 按注册失败处理，停留原状态可重试，避免未处理拒绝且无反馈。
    registerError.value = true;
  } finally {
    registering.value = false;
  }
}
```

（质量审查补充：catch 兜底为 Task 1 审查发现的计划缺口，随 Task 2 一并落地到 generate 与 rotate。）

template 两处：

空态生成按钮（187-189 行）加 loading/disabled：

```html
    <div v-if="!hasCode" class="workspace-inbox-empty">
      <NButton
        type="primary"
        data-testid="inbox-generate"
        :loading="registering"
        :disabled="registering"
        @click="generate"
      >{{ text.app.inboxGenerate }}</NButton>
    </div>
```

`<div class="workspace-inbox-footer">` 之前插入共享错误行（空态/有码态都可见）：

```html
    <p
      v-if="registerError"
      class="workspace-inbox-error"
      role="status"
      data-testid="inbox-register-error"
    >
      {{ text.app.inboxRegisterFailedRetry }}
    </p>
```

i18n（`src/state/i18n.ts`）——zh 侧 `inboxRegisterFailed` 行旁新增（先保留旧 key，Task 4 删）：

```ts
      inboxRegisterFailedRetry: "配对码注册失败，请检查网络后重试",
```

en 侧同位置：

```ts
      inboxRegisterFailedRetry: "Pairing-code registration failed — check your network and try again",
```

样式（`src/styles.css`，`.workspace-inbox-empty` 行后）：

```css
.workspace-inbox-error { margin: 4px 0 0; color: var(--destructive); font-size: 12px; text-align: center; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "注册失败"`
Expected: 两条用例 PASS。

- [ ] **Step 5: 跑既有配对相关用例防回归**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "inbox"`
Expected: 全部 PASS（保存/清除/重置/注册 wiring 均不受影响——重置走默认 mock true）。

- [ ] **Step 6: Commit**

```bash
git add src/components/WorkspaceInboxDialog.vue src/state/i18n.ts src/styles.css src/__tests__/app-render.test.ts
git commit -m "fix: 生成配对码先注册中继成功再展示，失败停留未配对态可重试"
```

---

### Task 2: 重置路径同口径（测试先行）

**Files:**
- Test: `src/__tests__/app-render.test.ts`（`App inbox register wiring` describe 内）
- Modify: `src/components/WorkspaceInboxDialog.vue`（`rotate()`，约 91-96 行）

- [ ] **Step 1: 写失败测试**

```ts
  it("重置注册失败：旧码保留、不注销旧码、不落新码", async () => {
    seedPaired();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(registerInboxKey).mockResolvedValue(false);
    vi.mocked(revokeInboxKey).mockClear();
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      const oldCode = wrapper.get('[data-testid="inbox-code"]').text();
      await wrapper.get('[data-testid="inbox-rotate"]').trigger("click");
      await flushAsyncComponents();

      expect(wrapper.get('[data-testid="inbox-code"]').text()).toBe(oldCode);
      expect(wrapper.get('[data-testid="inbox-register-error"]').text()).toContain("配对码注册失败");
      expect(revokeInboxKey).not.toHaveBeenCalled();
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(persisted.workspaces[0].inbox?.code).toBe("AB2CDE4FGHJK");
    } finally {
      wrapper.unmount();
    }
  });
```

（`revokeInboxKey` 已在测试文件顶部 import；`seedPaired()` 是本 describe 既有助手。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "重置注册失败"`
Expected: FAIL——当前 rotate 立即换码，`inbox-code` 文本已变（且旧码被注销）。

- [ ] **Step 3: 实现异步 rotate**

`rotate()` 整体替换：

```ts
async function rotate(): Promise<void> {
  if (registering.value || !window.confirm(text.value.app.inboxRotateConfirm)) return;
  registering.value = true;
  registerError.value = false;
  try {
    // 先注册新码成功再换码：失败则旧地址原样可用，不再出现
    // 「旧码已注销、新码没注册上」的断档；成功后 App 侧随之注销旧码。
    const nextCode = generateInboxCode();
    const registered = await registerInboxKey(await inboxKeyHash(nextCode));
    if (!registered) {
      registerError.value = true;
      return;
    }
    if (disposed) return;
    // 确认即兑现「旧地址立即失效」：立即 emit 新码，持久化不等「保存」；弹窗保持打开。
    code.value = nextCode;
    emit("update", buildInbox());
  } catch {
    // inboxKeyHash 在非安全上下文等场景会异常（registerInboxKey 自身不抛）：
    // 按注册失败处理，旧码原样保留，避免未处理拒绝且无反馈。
    registerError.value = true;
  } finally {
    registering.value = false;
  }
}
```

重置按钮（template 中 `data-testid="inbox-rotate"` 的原生 `<button>`）加 `:disabled="registering"`：

```html
          <button
            type="button"
            class="workspace-inbox-rotate"
            data-testid="inbox-rotate"
            :disabled="registering"
            @click="rotate"
          >
```

- [ ] **Step 4: 跑测试确认通过 + 防回归**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "重置"`
Expected: 新用例与既有「重置配对（新码≠旧码）同样注销旧码；保存未改码不注销」均 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/WorkspaceInboxDialog.vue src/__tests__/app-render.test.ts
git commit -m "fix: 重置配对码同样先注册成功再换码，注册失败保留旧地址"
```

---

### Task 3: 在途守卫与卸载守卫（测试先行）

**Files:**
- Test: `src/__tests__/app-render.test.ts`（`App inbox register wiring` describe 内）
- Modify: `src/components/WorkspaceInboxDialog.vue`（无新逻辑，仅验证 Task 1 已落的守卫；若断言不过再补实现）

- [ ] **Step 1: 写失败风险测试（守卫行为验证）**

```ts
  it("注册在途时生成按钮禁用且防重复触发", async () => {
    seedUnpaired();
    let resolveRegister!: (ok: boolean) => void;
    vi.mocked(registerInboxKey).mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveRegister = resolve; }),
    );
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-generate"]').trigger("click");
      await flushAsyncComponents();

      expect(registerInboxKey).toHaveBeenCalledTimes(1);
      // 在途：真 NButton 渲染的按钮带 disabled；再点一次也不应重复注册。
      expect((wrapper.get('[data-testid="inbox-generate"]').element as HTMLButtonElement).disabled).toBe(true);
      await wrapper.get('[data-testid="inbox-generate"]').trigger("click");
      await flushAsyncComponents();
      expect(registerInboxKey).toHaveBeenCalledTimes(1);

      resolveRegister(false);
      await flushAsyncComponents();
      expect((wrapper.get('[data-testid="inbox-generate"]').element as HTMLButtonElement).disabled).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("关闭弹窗后迟到的注册成功不落盘", async () => {
    seedUnpaired();
    let resolveRegister!: (ok: boolean) => void;
    vi.mocked(registerInboxKey).mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveRegister = resolve; }),
    );
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-generate"]').trigger("click");
      await wrapper.get('[data-testid="inbox-cancel"]').trigger("click");
      // 模态桩在 show 翻 false 时同步发 after-leave，弹窗随即卸载。
      await flushAsyncComponents();
      expect(wrapper.findComponent(WorkspaceInboxDialog).exists()).toBe(false);

      resolveRegister(true);
      await flushAsyncComponents();

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      expect(persisted.workspaces[0].inbox).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
```

- [ ] **Step 2: 跑测试**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "注册在途"`
Run: `npx vitest run src/__tests__/app-render.test.ts -t "迟到的注册成功"`
Expected: 两条 PASS（Task 1 的 `registering`/`disposed` 守卫已覆盖；若「迟到」用例失败，检查 `disposed` 是否确实在 `onBeforeUnmount` 里置位、成功分支是否 `if (disposed) return;` 在 `code.value` 赋值之前）。

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/app-render.test.ts
git commit -m "test: 配对码注册在途防重复与弹窗关闭后丢弃迟到结果的守卫用例"
```

---

### Task 4: App.vue 收缩与旧文案清理

**Files:**
- Modify: `src/App.vue`（`handleInboxUpdate` 约 1030-1036 行、`registerInbox` 约 1048-1062 行、启动调用约 629/632 行）
- Modify: `src/state/i18n.ts`（删 `inboxRegisterFailed` zh/en 两行）
- Test: `src/__tests__/app-render.test.ts`（改写 9894 行用例）
- Modify: `CLAUDE.md`（server 段注册制描述一句）

- [ ] **Step 1: 改写既有用例（先改测试）**

`App inbox register wiring` describe 里「配对弹窗保存后注册当前码；注册失败弹警告」（9894-9920 行）整体替换为：

```ts
  it("配对弹窗保存未改码：不再触发注册（生成/重置已在弹窗内前置注册）", async () => {
    seedPaired();
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      const callsAfterStartup = vi.mocked(registerInboxKey).mock.calls.length;

      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      expect(vi.mocked(registerInboxKey).mock.calls.length).toBe(callsAfterStartup);
    } finally {
      wrapper.unmount();
    }
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "不再触发注册"`
Expected: FAIL——当前 `handleInboxUpdate` 保存后仍调用一次 `registerInboxKey`（calls +1）。

- [ ] **Step 3: 实现收缩**

`handleInboxUpdate` 里删除末尾两处（注释 + 调用）：

```ts
  // 注册制：保存/轮换后当前码立即可配对（启动路径见 onMounted 的幂等注册）。
  if (inbox) registerInbox(inbox.code, true);
```

并在函数 docstring「配对弹窗更新/清除：…」末尾补一句：`生成/重置码由弹窗内前置注册成功后才 emit，此处无需再注册。`

`registerInbox` 整体替换（去 warn 参数与气泡分支）：

```ts
/** 注册配对码（启动路径幂等补注册，存量码自愈）：失败静默等下次启动；生成/重置路径已在弹窗内前置注册。 */
function registerInbox(code: string): void {
  inboxKeyHash(code)
    .then((hash) => registerInboxKey(hash))
    .catch(() => undefined);
}
```

两处启动调用去第二实参（约 629、632 行）：`registerInbox(workspace.inbox.code, false)` → `registerInbox(workspace.inbox.code)`；`registerInbox(state.polishCode, false)` → `registerInbox(state.polishCode)`。

i18n：删除 zh `inboxRegisterFailed: "配对码注册失败，手机暂时无法配对，下次启动会自动重试",` 与 en `inboxRegisterFailed: "Pairing-code registration failed; phones can't pair for now — it retries on next launch",` 两行（唯一消费方已随 warn 分支移除）。

CLAUDE.md：把「…pairing-code registration — `POST /inbox/<key_hash>/register` (desktop registers codes on startup and on save/rotate; …)」中的 `on startup and on save/rotate` 改为 `on startup, and from the pairing dialog before persisting a generated/rotated code (failed registration keeps the old/unpaired state instead of showing an unregistered QR)`。

- [ ] **Step 4: 跑测试确认通过 + describe 全绿**

Run: `npx vitest run src/__tests__/app-render.test.ts -t "inbox"`
Expected: 全部 PASS（含启动注册用例「启动时对所有已配对工作区的码各注册一次」）。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/state/i18n.ts CLAUDE.md src/__tests__/app-render.test.ts
git commit -m "refactor: 配对弹窗更新路径移除事后二次注册与注册失败气泡"
```

---

### Task 5: 更新记录与全量回归

**Files:**
- Modify: `src/state/changelog.ts`（顶部新增条目）

- [ ] **Step 1: 新增 changelog 条目**

`CHANGELOG` 数组顶部（`1.0.201` 条目之前）插入：

```ts
    {
      version: "1.0.202",
      date: "2026-10-08",
      notes: {
        zh: [
          "修复：配对码注册中继失败时不再展示配对码与二维码，改为内联提示重试；重置配对码同样先注册成功再换码，失败保留旧地址",
        ],
        en: [
          "Fix: pairing code and QR are no longer shown when relay registration fails — retry inline; resetting now registers the new code before swapping and keeps the old address on failure",
        ],
      },
    },
```

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 全绿。已知噪音（CLAUDE.md 记载）：结尾恒有 `Errors 1 error`（app-render 的 IndexedDB stub 未处理拒绝，可忽略）；`输码验证 unknown/revoked`、`preserves the capture draft…` 两条移动端用例在整跑下偶发抖动——单独重跑对应用例确认通过即可。

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: vue-tsc 无错误、vite 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/state/changelog.ts
git commit -m "docs: 更新记录新增 1.0.202 条目"
```
