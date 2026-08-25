# 手机速记记住配对码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机端在 localStorage 记住最近配对码，裸访问（主屏图标/微信丢 fragment）时自动进入速记表单，页脚显示当前码并支持一键更换。

**Architecture:** `src/sync/pairing.ts` 新增三个可注入 storage 的记忆函数与一个分组展示函数；`App.vue` 手机壳初始化时以 `fragment ?? 记忆码` 回退，并用一个 `watch` 统一实现"移动壳内任何来源的有效码都顺手记住"；速记页脚（App.vue 壳层，不进表单组件）显示分组码 +「更换配对码」。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Vitest（@vue/test-utils）+ jsdom。无新依赖、无服务端改动。

**Spec:** `docs/superpowers/specs/2026-08-25-mobile-inbox-remember-pairing-design.md`

**约定:** 本仓库直接在 `main` 上开发（不建 worktree）。测试命令：单文件 `npx vitest run <file>`，全量 `npm test`。

---

### Task 1: pairing.ts 记忆存取 + 分组展示助手

**Files:**
- Modify: `src/sync/pairing.ts`（在 `buildInboxAddress` 之后追加）
- Test: `src/__tests__/sync-pairing.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/sync-pairing.test.ts` 顶部 import 中追加四个函数（保持字母序）：

```ts
import {
  buildInboxAddress,
  clearRememberedInboxCode,
  formatInboxCode,
  generateInboxCode,
  importedPayloadHasInbox,
  isValidInboxCode,
  loadRememberedInboxCode,
  normalizeInboxCode,
  parseInboxFragment,
  saveRememberedInboxCode,
} from "../sync/pairing";
```

文件末尾追加：

```ts
/** 与全局 localStorage 隔离的内存 Storage，避免单测间状态串扰。 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  };
}

describe("手机壳配对码记忆", () => {
  it("save→load 往返一致；clear 后 load 返回 null", () => {
    const storage = createMemoryStorage();

    saveRememberedInboxCode("AB2CDE4FGHJK", storage);
    expect(loadRememberedInboxCode(storage)).toBe("AB2CDE4FGHJK");

    clearRememberedInboxCode(storage);
    expect(loadRememberedInboxCode(storage)).toBeNull();
  });

  it("重复保存以后写的码优先（最后使用的配对优先）", () => {
    const storage = createMemoryStorage();

    saveRememberedInboxCode("AB2CDE4FGHJK", storage);
    saveRememberedInboxCode("ZZZ0ZZZ0ZZZ0", storage);

    expect(loadRememberedInboxCode(storage)).toBe("ZZZ0ZZZ0ZZZ0");
  });

  it("损坏/非法/缺失的存储值返回 null，落回输码表单自愈", () => {
    const storage = createMemoryStorage();

    storage.setItem("mini-desk-inbox-code", "corrupted");
    expect(loadRememberedInboxCode(storage)).toBeNull();

    storage.setItem("mini-desk-inbox-code", "ab2cde4fghjk");
    expect(loadRememberedInboxCode(storage)).toBeNull();

    storage.removeItem("mini-desk-inbox-code");
    expect(loadRememberedInboxCode(storage)).toBeNull();
  });
});

describe("formatInboxCode", () => {
  it("12 位码按 4 位分组展示", () => {
    expect(formatInboxCode("AB2CDE4FGHJK")).toBe("AB2C DE4F GHJK");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/sync-pairing.test.ts`
Expected: FAIL，报 `clearRememberedInboxCode` / `formatInboxCode` / `loadRememberedInboxCode` / `saveRememberedInboxCode` 不存在于 `../sync/pairing` 导出。

- [ ] **Step 3: 最小实现**

在 `src/sync/pairing.ts` 的 `buildInboxAddress` 函数之后追加：

```ts
const REMEMBERED_INBOX_CODE_KEY = "mini-desk-inbox-code";

/** 手机壳本地记忆最近配对码：主屏图标（start_url=/）与微信重开都会丢 fragment，裸访问时用它自动配对。
 *  码即密钥，明文存 localStorage 与桌面端 state 存码一致（威胁模型见设计文档）。 */
export function loadRememberedInboxCode(storage: Storage = localStorage): string | null {
  const stored = storage.getItem(REMEMBERED_INBOX_CODE_KEY);
  return stored !== null && isValidInboxCode(stored) ? stored : null;
}

export function saveRememberedInboxCode(code: string, storage: Storage = localStorage): void {
  storage.setItem(REMEMBERED_INBOX_CODE_KEY, code);
}

export function clearRememberedInboxCode(storage: Storage = localStorage): void {
  storage.removeItem(REMEMBERED_INBOX_CODE_KEY);
}

/** 12 位码按 4 位分组展示（速记页脚与桌面配对面板人工比对用）。 */
export function formatInboxCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/sync-pairing.test.ts`
Expected: PASS（原有用例 + 新增 4 条全过）。

- [ ] **Step 5: Commit**

```bash
git add src/sync/pairing.ts src/__tests__/sync-pairing.test.ts
git commit -m "feat: 配对码本地记忆与分组展示助手"
```

---

### Task 2: App.vue 自动配对接线（fragment 优先 + 移动壳内顺手记住）

**Files:**
- Modify: `src/App.vue:62`（import）、`src/App.vue:280-283`（初始化 + watch）
- Test: `src/__tests__/app-render.test.ts`（在 "renders the mobile capture form directly…" 用例之后插入）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/app-render.test.ts` 中，紧跟 `renders the mobile capture form directly when the URL carries a valid inbox fragment` 这个用例（约 436-455 行）之后插入：

```ts
  it("auto-pairs from the remembered code on a bare mobile visit", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "";
    localStorage.setItem("mini-desk-inbox-code", "AB2CDE4FGHJK");
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
    localStorage.setItem("mini-desk-inbox-code", "AB2CDE4FGHJK");
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(localStorage.getItem("mini-desk-inbox-code")).toBe("ZZZ0ZZZ0ZZZ0");
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
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(localStorage.getItem("mini-desk-inbox-code")).toBe("AB2CDE4FGHJK");
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
      expect(localStorage.getItem("mini-desk-inbox-code")).toBeNull();
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: FAIL — `auto-pairs…`（裸访问仍显示输码表单）、`prefers…` 与 `remembers…`（localStorage 断言为 null）；`does not write…` 可能已过（现状本来就不写），以其他三条失败为准。

- [ ] **Step 3: 最小实现**

`src/App.vue:62` 的 import 追加两个函数：

```ts
import {
  importedPayloadHasInbox,
  isValidInboxCode,
  loadRememberedInboxCode,
  normalizeInboxCode,
  parseInboxFragment,
  saveRememberedInboxCode,
} from "./sync/pairing";
```

`src/App.vue:280-283` 的初始化改为（fragment 优先，记忆码兜底），并在三个 ref 之后插入统一保存的 watch：

```ts
// URL 带 #inbox=<12位码> 时优先；否则回退手机壳本地记忆（主屏图标/微信入口丢 fragment 的场景）。
const mobileInboxCode = ref<string | null>(parseInboxFragment(window.location.hash) ?? loadRememberedInboxCode());
const mobileInboxDraftCode = ref("");
const mobileInboxCodeError = ref(false);
// 手机壳内任何来源（初始 URL 解析/hashchange/手动输码）的有效码都顺手记住，裸访问下次自动配对；
// 桌面端不写（不产生手机记忆副作用）。immediate 覆盖初始 fragment 场景，重复写入幂等。
watch(
  [mobileInboxCode, isMobileBlocked],
  ([code, blocked]) => {
    if (blocked && code) saveRememberedInboxCode(code);
  },
  { immediate: true },
);
```

注意：`watch` 已在 `App.vue:2` 从 vue 导入；`isMobileBlocked`（`App.vue:278`）定义在此段之前，顺序满足。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: PASS（含既有 `normalizes a grouped lowercase code…` 用例回归——它现在会额外写 localStorage，但 beforeEach 已 `localStorage.clear()`，无影响）。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: 手机速记裸访问自动配对记忆码"
```

---

### Task 3: 速记页脚配对码展示 + 一键更换

**Files:**
- Modify: `src/state/i18n.ts:567` 后（zh）、`:941` 后（en）
- Modify: `src/App.vue`：import（追加 2 个函数）、`confirmMobileInboxCode` 之后（新增 handler）、模板 `:3290` 之后（页脚）
- Modify: `src/styles.css`（`.mobile-inbox-status[data-status="error"]` 块之后、`/* 引导页底部的手动输码区 */` 注释之前）
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 写失败测试**

在 Task 2 插入的用例之后继续追加：

```ts
  it("shows the paired code in the footer and switches pairing via the change button", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      expect(wrapper.get('[data-testid="mobile-inbox-paired-code"]').text()).toBe("已配对：AB2C DE4F GHJK");

      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="mobile-inbox-text"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
      expect(localStorage.getItem("mini-desk-inbox-code")).toBeNull();
      expect(window.location.hash).toBe("");
    } finally {
      wrapper?.unmount();
      window.location.hash = "";
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: FAIL — 找不到 `[data-testid="mobile-inbox-paired-code"]`。

- [ ] **Step 3: 最小实现**

① `src/state/i18n.ts` zh 区（`mobileInboxSent` 之后）追加：

```ts
      mobileInboxPairedAs: "已配对：{code}",
      mobileInboxChangeCode: "更换配对码",
```

en 区（`mobileInboxSent` 之后）追加：

```ts
      mobileInboxPairedAs: "Paired: {code}",
      mobileInboxChangeCode: "Change pairing code",
```

② `src/App.vue:62` 的 pairing import 追加 `clearRememberedInboxCode` 与 `formatInboxCode`（保持字母序）：

```ts
import {
  clearRememberedInboxCode,
  formatInboxCode,
  importedPayloadHasInbox,
  isValidInboxCode,
  loadRememberedInboxCode,
  normalizeInboxCode,
  parseInboxFragment,
  saveRememberedInboxCode,
} from "./sync/pairing";
```

③ `src/App.vue` 在 `confirmMobileInboxCode()` 函数之后新增：

```ts
/** 更换配对码：清本地记忆与 URL 残留 fragment（replaceState 不触发 hashchange，也不留历史记录），回到输码表单。
 *  不弹确认——没有可破坏的数据，码随时可从桌面配对面板重新获得。 */
function forgetMobileInboxCode(): void {
  clearRememberedInboxCode();
  mobileInboxCode.value = null;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}
```

④ `src/App.vue` 模板：在 `<MobileInboxCapture v-if="mobileInboxCode" … />`（`:3290`）之后插入页脚：

```vue
        <div v-if="mobileInboxCode" class="mobile-inbox-paired">
          <p class="mobile-inbox-paired-code" data-testid="mobile-inbox-paired-code">
            {{ uiText.app.mobileInboxPairedAs.replace("{code}", () => formatInboxCode(mobileInboxCode)) }}
          </p>
          <button
            type="button"
            class="mobile-inbox-paired-change"
            data-testid="mobile-inbox-change-code"
            @click="forgetMobileInboxCode"
          >
            {{ uiText.app.mobileInboxChangeCode }}
          </button>
        </div>
```

⑤ `src/styles.css` 在 `.mobile-inbox-status[data-status="error"] { … }` 块之后、`/* 引导页底部的手动输码区 */` 注释之前插入：

```css
/* 速记页脚：当前配对码（人工比对）与更换入口 */
.mobile-inbox-paired {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.mobile-inbox-paired-code {
  margin: 0;
  color: var(--muted);
  font-size: var(--app-font-size);
  letter-spacing: 0.04em;
}

button.mobile-inbox-paired-change {
  padding: 0;
  border: none;
  background: none;
  color: var(--muted);
  font-size: var(--app-font-size);
  text-decoration: underline;
  cursor: pointer;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/state/i18n.ts src/styles.css src/__tests__/app-render.test.ts
git commit -m "feat: 速记页脚显示配对码并支持一键更换"
```

---

### Task 4: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 55+ 测试文件全过（含新增用例），0 失败。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 构建成功（chunk 体积警告为既有噪音）。

- [ ] **Step 3: 手动验证（可选，发布前真机）**

按 spec「手动验证」清单：主屏图标杀掉重开直接进表单；微信内输码一次后退出重进直接进表单；桌面轮换后手机页脚码与桌面不一致 → 点「更换配对码」输新码恢复。验证 Service Worker 行为需 `npm run preview`。

（无代码变更，无需 commit。）
