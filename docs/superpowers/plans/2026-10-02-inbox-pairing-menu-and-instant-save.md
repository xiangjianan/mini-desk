# 「手机速记」菜单提级与生成即上云 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把设置菜单里的「配对手机」改名为「手机速记」并提为一级菜单（紧随「数据」）；配对弹窗内点「生成配对码」立即落盘并向中继注册，扫码即刻可配对。

**Architecture:** 纯前端三处小改：`SettingsMenu.vue` 的 options 数组把 `pair-inbox` 从 `data.children` 移出为一级选项；`i18n.ts` 改 4 个词条值（zh/en × inboxPair/mobilePairStep1）；`WorkspaceInboxDialog.vue` 的 `generate()` 复刻 `rotate()` 的立即 `emit("update", buildInbox())` 模式，App.vue 现成的 `handleInboxUpdate` 负责落盘 + 中继注册（含失败气泡与启动自愈）。

**Tech Stack:** Vue 3 `<script setup>` + naive-ui NDropdown、vitest + @vue/test-utils。

**Spec:** `docs/superpowers/specs/2026-10-02-inbox-pairing-menu-and-instant-save-design.md`

**不在范围：** `server/` 无改动（注册协议原样，只是前端调用时机提前）；changelog 条目由 `/release-mini-desk` 发布流程按实际 diff 追加，本计划不含 changelog 任务。

## File Structure

- Modify: `src/components/SettingsMenu.vue` — options 数组：`pair-inbox` 提为一级选项
- Modify: `src/state/i18n.ts` — 4 个词条值（两语言 × `inboxPair`/`mobilePairStep1`）
- Modify: `src/components/WorkspaceInboxDialog.vue` — `generate()` 立即 emit + 草稿语义注释更新
- Test: `src/__tests__/settings-menu.test.ts` — 「pairs a phone」用例改为一级断言
- Test: `src/__tests__/workspace-inbox-dialog.test.ts` — 生成用例改为「立即 emit + 不关闭」

---

### Task 1: 设置菜单提级改名（含 i18n 统一）

**Files:**
- Modify: `src/components/SettingsMenu.vue:71-100`（options 数组）
- Modify: `src/state/i18n.ts:499,507`（zh）`:892,899`（en）
- Test: `src/__tests__/settings-menu.test.ts:129-155`

- [ ] **Step 1: Write the failing test**

把 `src/__tests__/settings-menu.test.ts` 中「pairs a phone from the settings menu for the active workspace」用例（约 129-155 行）整体替换为：

```ts
  it("pairs a phone from the settings menu for the active workspace", async () => {
    const wrapper = mount(SettingsMenu, {
      props: {
        appVersion: "1.0.38",
        updateAvailable: false,
        companionGifTheme: "hermes",
        language: "zh",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
          NBadge: { template: "<span><slot /></span>" },
          NButton: { template: "<button><slot /></button>" },
          NIcon: { template: "<span />" },
        },
      },
    });

    // Promoted to a top-level entry renamed 手机速记, directly below the 数据 group
    // (dropdownStub renders parents before children, so the head order pins the position).
    expect(wrapper.find('[data-key="pair-inbox"]').text()).toBe("手机速记");
    expect(wrapper.find('[data-key="pair-inbox"]').classes()).not.toContain("dropdown-child-option");
    const keys = wrapper.findAll(".dropdown-option").map((option) => option.attributes("data-key"));
    expect(keys.slice(0, 6)).toEqual(["data", "create-workspace", "import", "export-workspace", "clear-data", "pair-inbox"]);

    await wrapper.find('[data-key="pair-inbox"]').trigger("click");

    expect(wrapper.emitted("pairInbox")?.[0]).toEqual([expect.any(HTMLElement)]);
  });
```

（同文件的「groups data actions」与「keeps icons」用例不涉及 pair-inbox，无需改动。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/settings-menu.test.ts`
Expected: FAIL —「pairs a phone」用例第一处断言 `text()` 期望 `"手机速记"`、实际收到 `"配对手机"`；后续类名与顺序断言同样不满足（当前仍是 `dropdown-child-option` 子项）。

- [ ] **Step 3: Implement the menu promotion**

`src/components/SettingsMenu.vue` options 数组：把 `pair-inbox` 从 `data` 的 `children` 里移出，插到 `data` 选项对象之后、`language` 之前：

```ts
const options = computed(() => [
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
  // 手机速记独立一级入口：紧跟「数据」。配对弹窗承担生成/注册全流程，不再折进数据子菜单。
  { label: text.value.app.inboxPair, key: "pair-inbox", icon: renderIcon(PhonePortraitOutline) },
  {
    label: text.value.settings.language,
    key: "language",
    icon: renderIcon(GlobeOutline),
    children: [
```

（`children` 后续各项及 `handleSelect` 均不动。）

- [ ] **Step 4: Implement the i18n renames**

`src/state/i18n.ts`，只改值不改键：

zh（约 499、507 行）：
```ts
      mobilePairStep1: "电脑端打开「手机速记」面板",
      inboxPair: "手机速记",
```

en（约 892、899 行）：
```ts
      mobilePairStep1: "Open “Phone capture” on the desktop",
      inboxPair: "Phone capture",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/settings-menu.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 6: Run sibling suites that consume these词条**

Run: `npx vitest run src/__tests__/workspace-switcher.test.ts src/__tests__/i18n.test.ts src/__tests__/app-render.test.ts`
Expected: PASS。已知噪音：app-render 结束报 `Errors 1 error`（IndexedDB stub 未处理拒绝，历史遗留），以及「输码验证 unknown/revoked」偶发 flake——重跑一次即过，不用修。

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsMenu.vue src/state/i18n.ts src/__tests__/settings-menu.test.ts
git commit -m "feat: 设置菜单「配对手机」提级为一级「手机速记」入口并统一改名"
```

---

### Task 2: 生成配对码即保存上云

**Files:**
- Modify: `src/components/WorkspaceInboxDialog.vue:38-39`（草稿语义注释）、`:69-71`（generate）
- Test: `src/__tests__/workspace-inbox-dialog.test.ts:81-86`

- [ ] **Step 1: Write the failing test**

把 `src/__tests__/workspace-inbox-dialog.test.ts` 中「无配对时显示生成按钮，点击生成合法码」用例（约 81-86 行）整体替换为：

```ts
  it("无配对时点击生成：立即 emit update（合法码+默认落点）且弹窗保持打开", async () => {
    const order: string[] = [];
    const wrapper = mountDialog(undefined, defaultWorkspace("a"), {
      onUpdate: () => order.push("update"),
      onClose: () => order.push("close"),
    });
    expect(wrapper.text()).toContain("生成配对码");
    await wrapper.find('[data-testid="inbox-generate"]').trigger("click");
    // 生成即上云：立即 emit（App 侧 handleInboxUpdate 落盘并注册中继）。
    const [payload] = updatePayloads(wrapper);
    expect(payload?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    // 落点为当前下拉默认值：首个提醒清单与首个空间。
    expect(payload?.todoListId).toBe(wrapper.props("workspace").todoLists[0]?.id);
    expect(payload?.noteTarget).toBe(wrapper.props("workspace").spaces[0]?.id);
    expect(payload?.lastSeenAt).toBe(0);
    // 弹窗保持打开供扫码/抄录，展示层同步为新码。
    expect(order).toEqual(["update"]);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe(payload?.code);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/workspace-inbox-dialog.test.ts`
Expected: FAIL — `updatePayloads(wrapper)` 为空（`emitted("update")` undefined，`payload` undefined），断言 `payload?.code` 匹配失败。

- [ ] **Step 3: Implement generate() immediate emit**

`src/components/WorkspaceInboxDialog.vue`，`generate()`（约 69-71 行）改为：

```ts
function generate(): void {
  code.value = generateInboxCode();
  // 生成即生效：立即 emit 落盘并向中继注册（否则扫码 /status 校验 404 配不上），
  // 弹窗保持打开供抄录/扫码——与 rotate 同口径。
  emit("update", buildInbox());
}
```

同时更新上方草稿语义注释（约 38-39 行），把生成列为第二个立即生效例外：

```ts
// 编辑草稿以 props 里的既有配对为初值；保存/清除时一次性 emit，取消则原样丢弃。
// 轮换例外：confirm 已承诺「旧地址立即失效」，确认后立即 emit 生效，弹窗保持打开供抄录/扫码。
// 生成例外：新码一旦展示就要可被扫码配对，立即 emit 生效（落点用当前下拉值）。
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/workspace-inbox-dialog.test.ts`
Expected: PASS（全部用例，含重置/清除/关闭两段式等既有用例）。

- [ ] **Step 5: Commit**

```bash
git add src/components/WorkspaceInboxDialog.vue src/__tests__/workspace-inbox-dialog.test.ts
git commit -m "feat: 生成配对码即保存并注册云端，扫码立即可配对"
```

---

### Task 3: 全量回归

**Files:** 无新改动。

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: 全部通过。已知噪音（CLAUDE.md 记录）：结尾恒有 `Errors 1 error`（app-render 的 IndexedDB stub 拒绝），「输码验证 unknown/revoked」全量跑偶发 flake——重跑一次即过，不修。

- [ ] **Step 2: Type check**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 与 vite build 成功（i18n 值改动无类型影响）。

- [ ] **Step 3: 手工冒烟（可选，dev 起服）**

Run: `npm run dev`
验证三点：设置菜单出现一级「手机速记」且紧跟「数据」；打开弹窗点「生成配对码」后立即出现「配对设置已保存」气泡且弹窗不关；工作区「⋯」菜单入口也显示「手机速记」。
