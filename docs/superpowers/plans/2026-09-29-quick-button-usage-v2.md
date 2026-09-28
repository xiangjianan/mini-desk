# 快捷按钮使用热度染色 V2（按钮级 + 旧观感上限）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户验收反馈修订 V1——(1) 染色上限从 100% 纯蓝改为修改前「第一蓝」标签的实际成色（浅色 18% / 深色 24% 混入）；(2) 计数与染色从标签级下沉到按钮级（点谁染谁，含未分组），徽标改为组内计数总和。

**Architecture:** `clicks` 字段从 `QuickTag` 移到 `QuickButton`；纯函数更名 `quickButtonUsagePercent`；组构建不再带 usage 字段，组件在**按钮元素**上绑定 `.has-usage` + `--button-usage`；CSS 用 `calc(var(--button-usage) * 18%)`（深色 24%）单公式乘法折算；撤销快照剥除/回填字段换位到按钮。V1 已落地机制（持久化、迁移、撤销隔离）全部沿用。

**Tech Stack:** 同 V1（Vue 3 + TS + vitest）。spec 见 `2026-09-28-quick-tag-usage-color-design.md`「修订 V2」节。

**约定（全程适用）：** 同 V1 计划（中文 conventional 提交、无署名、已知测试噪音、按代码上下文定位）。

**基线：** V1 全部 9 个提交（b55e53b..c356d88），main 分支持续直提。

---

### Task V2-1: 状态层——clicks 移到按钮、纯函数与汇总辅助更名

**Files:**
- Modify: `src/types.ts`（`QuickTag.clicks` 删除；`QuickButton` 增 `clicks?: number`）
- Modify: `src/state/quickButtons.ts`
- Test: `src/__tests__/quick-buttons.test.ts`

步骤（TDD：先改测试看红，再实现看绿，提交）：

1. 测试更名与改写：
   - `quickTagUsagePercent` → `quickButtonUsagePercent`、`QUICK_TAG_USAGE_MAX_CLICKS` → `QUICK_USAGE_MAX_CLICKS`（断言表不变：undefined/0/1/50/100/132/-3/2.5/NaN/Infinity/"x"）。
   - `recordQuickTagClick` 用例换成 `recordQuickButtonClick(button)`：`clicks` 41→42、undefined→1。
   - 组构建用例：标签组**不再**带 `usagePercent`（`not.toHaveProperty`）；新增「组内按钮计数之和」用例：`sumQuickTagClicks(buttons, tagId)` 统计 `tagId` 匹配按钮的 clicks 之和（含 hidden：true 的按钮；无匹配按钮 = 0；orphan tagId 不计入）。
2. 实现：
   - `QuickTag` 删 `clicks`；`QuickButton` 在 `hidden: boolean` 前加 `clicks?: number`（注释：使用热度计数，点击 +1，驱动 0–100 染色）。
   - `QUICK_TAG_USAGE_MAX_CLICKS` → `QUICK_USAGE_MAX_CLICKS`；`quickTagUsagePercent` → `quickButtonUsagePercent`（逻辑不变）。
   - `recordQuickTagClick` 删除，新增：

```ts
/** 该快捷按钮使用计数 +1（按钮级：点谁计谁，未分组按钮同样计数）。 */
export function recordQuickButtonClick(button: QuickButton): void {
  button.clicks = (button.clicks ?? 0) + 1;
}
```

   - `QuickButtonGroup` 删 `usagePercent` 字段；`buildVisibleQuickButtonGroups` 组对象删该行。
   - 新增：

```ts
/** 标签管理器徽标：该标签下全部按钮（含隐藏）的使用计数之和。 */
export function sumQuickTagClicks(buttons: QuickButton[], tagId: string): number {
  return buttons.reduce((sum, button) => (button.tagId === tagId ? sum + (button.clicks ?? 0) : sum), 0);
}
```

3. `npx vitest run src/__tests__/quick-buttons.test.ts` 全绿后提交
   `refactor: 使用计数下沉到按钮级——clicks 字段迁移与纯函数更名`。
   注意：本任务**会**让 App.vue/normalize/undo 的旧引用编译报错——`npm run build` 要到 V2-2/V2-5 才恢复绿；为保每个提交可编译，把 App.vue、normalize.ts、useUndoHistory.ts、workspaceMoves 相关旧引用的同票最小修改（仅更名/换位，不改语义）并入本提交：
   - App.vue：`recordQuickTagClick(activeWorkspace.value.quickTags, button.tagId)` → `recordQuickButtonClick(button); persistNow();`（恒计数恒保存）；import 更名。
   - normalize.ts：`normalizeQuickTags` 删 clicks 行；`normalizeQuickButtons` 增同款校验（`Number.isInteger && > 0`，正整数保留、非法丢弃）。
   - serialize.ts：`omitQuickTagClicks` → `omitQuickButtonClicks`，剥除位置从 cloneQuickTags 换到按钮克隆处。
   - useUndoHistory.ts：`captureQuickTagClicks`/`restoreQuickTagClicks` → `captureQuickButtonClicks`/`restoreQuickButtonClicks`（按 workspaceId → buttonId → clicks），调用点同步。
   （对应测试随迁：state.test.ts 的 clicks 断言从 quickTags 挪到 quickButtons；app-render 点击计数断言读 `quickButtons[0].clicks`；undo-quick-tag-clicks.test.ts 更名字段。）

---

### Task V2-2: 组件——按钮级染色绑定与徽标总和

**Files:**
- Modify: `src/components/QuickButtons.vue`
- Test: `src/__tests__/quick-buttons.test.ts`

1. 测试改写：
   - 「按使用次数给标签组挂 has-usage 类与 --tag-usage 变量」改为按钮级：hot 标签组内 clicks 40 的按钮 `[data-id]` 带 `has-usage` 类与 `--button-usage: 40%`；同组 clicks 0 按钮、cold 组按钮均无；未分组（其他组）带 clicks 的按钮**也**染色。
   - 管理器徽标用例：`tags: [{ id: "tag-work", title: "工作" }]` + `buttons`（同标签两枚：clicks 7 与 hidden 的 clicks 15）→ 徽标「22 次」；en 挂「22 clicks」。
2. 实现：
   - 按钮模板（`<button class="quick-button" ...>`）：class 增 `'has-usage': quickButtonUsagePercent(button.clicks) > 0`；style 增同谓词的 `{ '--button-usage': `${quickButtonUsagePercent(button.clicks)}%` }`（一个局部小函数 `buttonUsage(button)` 返回百分比避免模板重复调用）。
   - 组节点 section 的 has-usage/--tag-usage 绑定删除。
   - 管理器徽标：`formatTagClicks(sumQuickTagClicks(props.buttons, tag.id))`。
   - import 更名同步。
3. 全绿后提交 `feat: 染色下沉到按钮级，管理器徽标改组内计数总和`。

---

### Task V2-3: CSS——旧观感上限公式

**Files:**
- Modify: `src/styles.css`
- Test: `src/__tests__/quick-buttons.test.ts`（source-contract）

1. 契约测试改写（先红）：

```ts
    expect(styles).toMatch(
      /\.quick-buttons \.quick-button\.has-usage\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--quick-usage-accent\) calc\(var\(--button-usage\) \* 18%\), var\(--button\)\)/s,
    );
    expect(styles).toMatch(/html\[data-theme="dark"\] \.quick-buttons \.quick-button\.has-usage\s*\{[^}]*\* 24%/s);
    expect(styles).toMatch(
      /\.quick-buttons \.quick-button\.has-usage:hover[^{]*\{[^}]*calc\(min\(var\(--button-usage\) \* 18% \+ 12%, 30%\)\)/s,
    );
    expect(styles).not.toContain("--tag-usage");
    expect(styles).not.toContain(".quick-tag-group.has-usage");
```

2. 实现：替换 `.quick-tag-group.has-usage` 规则族为：

```css
/* Usage-frequency tint (per button): each quick button darkens from the plain
   button color toward the accent blue as IT accumulates clicks (0–100 → mix
   0–18% light / 0–24% dark — matching the depth of the old first-blue tag
   tint). --button-usage is a 0–100 percentage set per button in
   QuickButtons.vue; one color-mix formula per theme, pure math. The
   .quick-buttons prefix keeps specificity above desk.css's transparent
   button base (0,2,1). */
.quick-buttons .quick-button.has-usage {
  background: color-mix(in srgb, var(--quick-usage-accent) calc(var(--button-usage) * 18%), var(--button));
}

html[data-theme="dark"] .quick-buttons .quick-button.has-usage {
  background: color-mix(in srgb, var(--quick-usage-accent) calc(var(--button-usage) * 24%), var(--button));
}

/* Hover deepens the SAME hue, capping at the old colored-tag hover depth
   (30% light / 38% dark). !important overrides the generic button-hover. */
.quick-buttons .quick-button.has-usage:hover,
.quick-buttons .quick-button.has-usage:focus-visible {
  background: color-mix(in srgb, var(--quick-usage-accent) calc(min(var(--button-usage) * 18% + 12%, 30%)), var(--button)) !important;
}

html[data-theme="dark"] .quick-buttons .quick-button.has-usage:hover,
html[data-theme="dark"] .quick-buttons .quick-button.has-usage:focus-visible {
  background: color-mix(in srgb, var(--quick-usage-accent) calc(min(var(--button-usage) * 24% + 14%, 38%)), var(--button)) !important;
}
```

3. 全绿 + `npm run build` 后提交 `feat: 热度染色上限对齐旧第一蓝观感——18%/24% 乘法梯度`。

---

### Task V2-4: 浏览器冒烟复验 + 撤销单测校准 + 最终评审

1. 复用 `$CLAUDE_JOB_DIR/tmp/verify_tag_heatmap.py` 改造：种子状态改为**按钮级** clicks（hot 组两枚：40 与 0；其他组一枚 clicks 100）；断言：
   - clicks 40 按钮浅色底 ≈ rgb(241,246,254)（7.2% 混入）；clicks 100 ≈ rgb(215,227,251)（18%）；hover clicks 100 ≈ 30% 混入 rgb(190,205,247)；全部不透明。
   - 同组 clicks 0 按钮无染色；其他组 clicks 100 按钮同样染色。
   - 深色主题：clicks 100 ≈ 24% 混入（基色 var(--button) 深色 ≈ rgb(61,61,63) → ≈ rgb(66,81,102)）；hover ≈ 38%。
   - 徽标显示组内总和。
2. `npm test` 全量 + `npm run build`。
3. 派最终评审（范围 V1 基线..V2 HEAD）复核两条修订口径与跨任务一致性。

### Self-Review 记录（V2）

- spec「修订 V2」节逐条 ↔ 任务映射：上限公式（V2-3）、按钮级计数（V2-1/2）、徽标总和（V2-2）、迁移丢弃标签级 clicks（V2-1 normalize）、撤销换位（V2-1 同票修改）。
- 每任务编译绿：V2-1 把所有旧引用同票迁移；V2-2/V2-3 绑定与样式成对切换。
- 撤销机制注意：`recordUndoCheckpoint` 去重与 mid-undo 守卫因快照剥除 buttons[].clicks 而对计数不敏感——机制不变，仅字段换位。
