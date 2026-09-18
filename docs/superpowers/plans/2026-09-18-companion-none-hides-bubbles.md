# 伴宠「不显示」时静音普通消息气泡 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GIF 主题为 `none` 时，普通消息气泡（toast）不再弹出，仅二次确认弹框与 `force` 强制气泡（手机发送反馈）保留。

**Architecture:** 全部普通提示的唯一状态机入口是 `src/composables/useCompanionBubble.ts` 的 `showBubbleText`；在入口加一行主题拦截（`force` 豁免）。二次确认走独立的 `requestConfirmation`，零改动。配套新增 composable 级单测锁定契约。

**Tech Stack:** Vue 3 组合式 API（纯 TS composable，无组件改动）、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-18-companion-none-hides-bubbles-design.md`

---

### Task 1: `showBubbleText` 的 none 主题拦截（TDD）

**Files:**
- Create: `src/__tests__/companion-none-theme.test.ts`
- Modify: `src/composables/useCompanionBubble.ts`（`showBubbleText` 入口，约 125-126 行；`BubbleOptions.force` 的 JSDoc，约 28-29 行）

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/companion-none-theme.test.ts`（装配模式复用 `companion-position.test.ts` 的 `createDeps`）：

```ts
import { describe, expect, it, vi } from "vitest";
import { useCompanionBubble } from "../composables/useCompanionBubble";
import type { CompanionBubbleDeps } from "../composables/useCompanionBubble";

function createDeps(companionGifTheme: "none" | "cat"): CompanionBubbleDeps {
  return {
    state: { language: "zh", companionGifTheme } as CompanionBubbleDeps["state"],
    setActiveGuideKey: vi.fn(),
    confirmLabels: () => ({ yes: "是", no: "否" }),
    isBoardBlocked: () => false,
    isMobileLayout: () => false,
  };
}

describe("companion none theme gating", () => {
  it("none 主题时普通气泡不显示", () => {
    const { showBubbleText, bubbleVisible, bubbleMessage, companionFocused } = useCompanionBubble(createDeps("none"));
    showBubbleText("已保存", undefined);
    expect(bubbleVisible.value).toBe(false);
    expect(bubbleMessage.value).toBe("");
    expect(companionFocused.value).toBe(false);
  });

  it("none 主题时二次确认弹框照常弹出", () => {
    const { requestConfirmation, bubbleVisible, pendingConfirm } = useCompanionBubble(createDeps("none"));
    requestConfirmation("confirmDeleteTodo", undefined, vi.fn());
    expect(pendingConfirm.value).not.toBeNull();
    expect(bubbleVisible.value).toBe(true);
  });

  it("none 主题时 force 气泡仍显示（手机发送反馈）", () => {
    const { showBubbleText, bubbleVisible, bubbleMessage } = useCompanionBubble(createDeps("none"));
    showBubbleText("已发送 1 条", undefined, { force: true });
    expect(bubbleVisible.value).toBe(true);
    expect(bubbleMessage.value).toBe("已发送 1 条");
  });

  it("非 none 主题普通气泡不受影响（回归）", () => {
    const { showBubbleText, bubbleVisible, bubbleMessage } = useCompanionBubble(createDeps("cat"));
    showBubbleText("已保存", undefined);
    expect(bubbleVisible.value).toBe(true);
    expect(bubbleMessage.value).toBe("已保存");
  });
});
```

- [ ] **Step 2: 跑测试确认按预期失败**

Run: `npx vitest run src/__tests__/companion-none-theme.test.ts`
Expected: **1 failed / 3 passed** —「none 主题时普通气泡不显示」失败（`bubbleVisible` 实际为 `true`）；其余三条在实现前就应通过（确认框与回归路径未动、force 现有语义即可满足）。

- [ ] **Step 3: 最小实现**

`src/composables/useCompanionBubble.ts` 的 `showBubbleText` 开头，在 `isBoardBlocked` 拦截后加一行：

```ts
  function showBubbleText(message: string, anchor?: HTMLElement, options: BubbleOptions = {}, duration = 3000): void {
    if (deps.isBoardBlocked() && !options.force) return;
    // 「不显示」安静模式：普通提示气泡随 GIF 一并静音（二次确认走 requestConfirmation，不受影响）。
    if (deps.state.companionGifTheme === "none" && !options.force) return;
    window.clearTimeout(bubbleTimer.value);
```

同步更新 `BubbleOptions.force` 的 JSDoc（约 28-29 行）：

```ts
  /** 绕过 isBoardBlocked 与「不显示」主题的普通气泡静音强制显示：手机速记壳的发送成功反馈复用伴宠气泡。 */
  force?: boolean;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/companion-none-theme.test.ts`
Expected: **4 passed**。

- [ ] **Step 5: 提交**

```bash
git add src/composables/useCompanionBubble.ts src/__tests__/companion-none-theme.test.ts
git commit -m "feat: 伴宠主题「不显示」时静音普通消息气泡，仅保留二次确认弹框"
```

---

### Task 2: 全量回归验证

**Files:** 无新改动（只验证）。

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿。已知噪音（CLAUDE.md 记录）：结束时恒有 `Errors 1 error`（app-render.test.ts 的 IndexedDB stub 未处理 rejection），`输码验证 unknown/revoked` 用例偶发抖动——重跑一次即可，与本改动无关。

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无输出（零错误）。

---

## Self-Review

- **Spec 覆盖**：拦截规则（Task 1 Step 3）✓；force 语义升级含 JSDoc（Step 3）✓；四条测试用例与 spec 测试计划一一对应（Step 1）✓；边界 1/2/3/4/5 均为「不改动即正确」的现状声明，无需任务 ✓；影响面未越界（不动 CompanionBubble.vue / requestConfirmation / 调用点）✓。
- **占位符**：无 TBD/TODO/「适当处理」类表述，所有代码完整给出 ✓。
- **类型一致性**：`createDeps(companionGifTheme)` 与 `CompanionBubbleDeps` 现有形状一致（state 为 cast 传入，与 companion-position.test.ts 同法）；`bubbleVisible`/`bubbleMessage`/`companionFocused`/`pendingConfirm` 均为 composable 已导出的 ref ✓。
