# 手机速记页微调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提醒事项占位词去掉例子；页脚「更换配对码」加 window.confirm 二次确认防误触。

**Architecture:** 纯前端小改：i18n 文案替换 + App.vue 新增 `confirmForgetMobileInboxCode` 包装函数；既有测试断言同步更新并新增 confirm 拒绝用例。spec：`docs/superpowers/specs/2026-08-26-mobile-capture-polish-design.md`。

**Tech Stack:** Vue 3 + TS + vitest。

---

### Task 1: 占位词简洁化

**Files:**
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/i18n.test.ts`、`src/__tests__/mobile-inbox-capture.test.ts`

- [ ] **Step 1: 更新断言（先红）**

`src/__tests__/i18n.test.ts`「手机速记占位词按类型区分且中英齐全」用例中：

```typescript
    expect(getUiText("zh").app.mobileInboxPlaceholderTodo).toBe("每行一条提醒");
```

```typescript
    expect(getUiText("en").app.mobileInboxPlaceholderTodo).toBe("One reminder per line");
```

（Note 两行断言不动。）

`src/__tests__/mobile-inbox-capture.test.ts` 两处 todo 占位词断言（首个渲染用例与 kind 切换用例）：

```typescript
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("每行一条提醒");
```

- [ ] **Step 2: 跑红**

Run: `npm test -- src/__tests__/i18n.test.ts src/__tests__/mobile-inbox-capture.test.ts`
Expected: 3 个断言 FAIL（旧文案）。

- [ ] **Step 3: 实现**

`src/state/i18n.ts`：zh `mobileInboxPlaceholderTodo: "每行一条提醒，如：周五前取快递",` → `mobileInboxPlaceholderTodo: "每行一条提醒",`；en `mobileInboxPlaceholderTodo: "One reminder per line, e.g. Pick up the package Friday",` → `mobileInboxPlaceholderTodo: "One reminder per line",`。

- [ ] **Step 4: 跑绿 + 提交**

```bash
npm test -- src/__tests__/i18n.test.ts src/__tests__/mobile-inbox-capture.test.ts
git add src/state/i18n.ts src/__tests__/i18n.test.ts src/__tests__/mobile-inbox-capture.test.ts
git commit -m "feat: 提醒事项占位词去掉例子保持简洁"
```

---

### Task 2: 更换配对码二次确认

**Files:**
- Modify: `src/App.vue`
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/app-render.test.ts`、`src/__tests__/i18n.test.ts`

- [ ] **Step 1: 更新/新增测试（先红）**

`src/__tests__/i18n.test.ts` 追加：

```typescript
  it("更换配对码确认文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxChangeCodeConfirm).toBe("更换后需要重新输入配对码，确定更换吗？");
    expect(getUiText("en").app.mobileInboxChangeCodeConfirm).toBe("You'll need to re-enter a pairing code after changing. Change anyway?");
  });
```

`src/__tests__/app-render.test.ts`：
1) 既有两处点击 `[data-testid="mobile-inbox-change-code"]` 的用例（"keeps the mobile companion hidden while paired and restores it after changing code" 与 "preserves the capture draft across a code change and re-pairing"）各补一行（在 mount 前）：

```typescript
    vi.spyOn(window, "confirm").mockReturnValue(true);
```

2) 新增用例（同 describe）：

```typescript
  it("更换配对码需二次确认：取消则留在速记页", async () => {
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();
      vi.spyOn(window, "confirm").mockReturnValue(false);

      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
    }
  });
```

- [ ] **Step 2: 跑红**

Run: `npm test -- src/__tests__/app-render.test.ts -t "mobile\|更换配对码\|capture draft"`
Expected: 新用例 FAIL（点击直接退回输码表单）；既有两用例 FAIL（未 mock confirm 时 jsdom confirm 返回 false → 流程中断）。

- [ ] **Step 3: 实现**

`src/state/i18n.ts`（两块都要，紧邻 `mobileInboxChangeCode`）：

```typescript
      mobileInboxChangeCodeConfirm: "更换后需要重新输入配对码，确定更换吗？",
```

```typescript
      mobileInboxChangeCodeConfirm: "You'll need to re-enter a pairing code after changing. Change anyway?",
```

`src/App.vue`：
1) `forgetMobileInboxCode` 的 doc 注释更新为（函数体不动）：

```typescript
/** 清码回到输码表单：清本地记忆与 URL 残留 fragment（replaceState 不触发 hashchange，也不留历史记录）并重置错误态。
 *  页脚入口经 confirmForgetMobileInboxCode 二次确认；失效提示的 change-code 事件直接调用（报错后的主动动作）。 */
```

2) 其后新增：

```typescript
/** 更换配对码（页脚入口）：二次确认防误触——确认前不动已配对状态。 */
function confirmForgetMobileInboxCode(): void {
  if (!window.confirm(uiText.value.app.mobileInboxChangeCodeConfirm)) return;
  forgetMobileInboxCode();
}
```

3) 模板页脚按钮：`@click="forgetMobileInboxCode"` → `@click="confirmForgetMobileInboxCode"`（`mobile-inbox-change-code` testid 保持）。

- [ ] **Step 4: 跑绿（全文件）+ 提交**

```bash
npm test -- src/__tests__/app-render.test.ts src/__tests__/i18n.test.ts
git add src/App.vue src/state/i18n.ts src/__tests__/app-render.test.ts src/__tests__/i18n.test.ts
git commit -m "feat: 更换配对码增加二次确认防误触"
```

---

### Task 3: 回归

- [ ] **Step 1: 全量 + 类型检查**

```bash
npm test            # 期望全绿
npx vue-tsc --noEmit
```

## Self-Review（已执行）

- Spec 覆盖：占位词（Task 1）、confirm + 文案 + 注释更新 + change-code 不确认（Task 2）、回归（Task 3）；changelog 按政策不新增条目。
- 类型/命名一致：`confirmForgetMobileInboxCode`、`mobileInboxChangeCodeConfirm` 全文一致。
- 无占位符。
