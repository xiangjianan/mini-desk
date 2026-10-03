# 手机速记弹窗四步引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `WorkspaceInboxDialog.vue` 的两段说明文案换成「一、二、三、四」四步静态引导，并在引导中提供 App Store 下载链接（占位常量）与可点击的配对地址链接。

**Architecture:** 纯前端展示层改动：i18n 词条增删（zh/en 同步）→ 组件模板替换段落为 `<ol>` 步骤列表 → styles.css 增删规则；`src/sync/pairing.ts` 导出 `INBOX_APP_STORE_URL` 占位常量供组件与测试共用。无状态、无数据流变化。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、naive-ui（NModal 等，不动）、vitest + @vue/test-utils（既有桩惯例）、CSS custom properties。

**Spec:** `docs/superpowers/specs/2026-10-03-inbox-dialog-guided-steps-design.md`

**与 spec 的一处小偏差（更正确）：** 链接文案「下载」也是 UI 文案，走 i18n（新 key `inboxAppStoreLink`，en "Download"），不在模板硬编码中文。

**约定（来自 CLAUDE.md / 既有测试）：**
- 测试命令：`npm test -- src/__tests__/workspace-inbox-dialog.test.ts`（`npm test` = `vitest run` 全量，已知噪音：结尾恒有 `Errors 1 error`（app-render 的 IndexedDB stub 未处理拒绝）、app-render 手机速记用例全量跑偶发 flake——与本次改动无关，单跑即过）。
- 类型检查：`npx vue-tsc --noEmit`。
- 提交信息用 conventional commits，中文描述，结尾不加署名。

---

### Task 1: 四步引导内容（i18n + 模板 + CSS）

**Files:**
- Modify: `src/state/i18n.ts`（zh 块 510–511 行、en 块 905–906 行附近，删 2 key 增 8 key）
- Modify: `src/components/WorkspaceInboxDialog.vue:159-160`（两个 `<p>` → `<ol>`）
- Modify: `src/styles.css:7142-7143`（删 2 条规则，增 4 条）
- Test: `src/__tests__/workspace-inbox-dialog.test.ts`

- [ ] **Step 1: 改写既有用例并新增空态用例（先失败）**

把测试文件中的这个用例（约 193 行）：

```ts
  it("渲染介绍与同步频率提示（不再展示队列上限）", () => {
    const wrapper = mountDialog(INBOX);
    // inboxSyncHint 提示每 5 分钟自动同步一次。
    expect(wrapper.text()).toContain("每 5 分钟");
    expect(wrapper.text()).not.toContain("200 条");
  });
```

整体替换为：

```ts
  it("渲染四步引导：一至四标题齐全，每 5 分钟折入步骤四", () => {
    const wrapper = mountDialog(INBOX);
    const steps = wrapper.get('[data-testid="inbox-steps"]');
    expect(steps.text()).toContain("一、手机安装");
    expect(steps.text()).toContain("二、扫码配对");
    expect(steps.text()).toContain("三、手机速记");
    expect(steps.text()).toContain("四、自动同步");
    // 同步频率提示折入步骤四正文。
    expect(steps.text()).toContain("每 5 分钟");
    // 旧两段说明文案已被四步引导替代。
    expect(wrapper.text()).not.toContain("在手机上打开下面的地址");
  });

  it("未生成码的空态同样展示四步引导", () => {
    const wrapper = mountDialog(undefined);
    expect(wrapper.get('[data-testid="inbox-steps"]').text()).toContain("一、手机安装");
    expect(wrapper.find('[data-testid="inbox-generate"]').exists()).toBe(true);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/__tests__/workspace-inbox-dialog.test.ts`
Expected: FAIL —— 两个新用例报 `Unable to get element [data-testid="inbox-steps"]`；「渲染四步引导」原断言「每 5 分钟」此时仍由旧 hint 满足，但 `inbox-steps` 取不到即失败。

- [ ] **Step 3: 实现 i18n 词条**

`src/state/i18n.ts` zh 块，把这两行（`inboxDialogTitle` 之后）：

```ts
      inboxDialogIntro: "在手机上打开下面的地址（或扫码），输入的内容会发送到这个工作空间。",
      inboxSyncHint: "手机发送的内容每 5 分钟自动同步一次。",
```

替换为：

```ts
      inboxStep1Title: "一、手机安装",
      inboxStep1Body: "App Store 下载「Mini Desk」",
      inboxStep2Title: "二、扫码配对",
      inboxStep2Body: "用手机扫下方二维码，或打开配对地址",
      inboxStep3Title: "三、手机速记",
      inboxStep3Body: "在手机上输入内容，发送到提醒事项或便签",
      inboxStep4Title: "四、自动同步",
      inboxStep4Body: "手机内容每 5 分钟自动同步；顶栏「手动同步」可立即收取",
```

en 块，把对应两行：

```ts
      inboxDialogIntro: "Open the address below on your phone (or scan the code); whatever you type there lands in this workspace.",
      inboxSyncHint: "Items sent from your phone sync automatically every 5 minutes.",
```

替换为：

```ts
      inboxStep1Title: "1. Install",
      inboxStep1Body: "Download Mini Desk from the App Store",
      inboxStep2Title: "2. Pair by QR",
      inboxStep2Body: "Scan the QR code below with your phone, or open the pairing address",
      inboxStep3Title: "3. Capture on phone",
      inboxStep3Body: "Type on your phone and send to reminders or notes",
      inboxStep4Title: "4. Auto sync",
      inboxStep4Body: "Phone items sync every 5 minutes; use “Sync now” in the top bar to pull immediately",
```

- [ ] **Step 4: 实现模板步骤列表**

`src/components/WorkspaceInboxDialog.vue` 把 159–160 行的两个 `<p>`：

```html
    <p class="workspace-inbox-intro">{{ text.app.inboxDialogIntro }}</p>
    <p class="workspace-inbox-hint">{{ text.app.inboxSyncHint }}</p>
```

替换为（不用 v-for：链接只在步骤一，手写四条更直白）：

```html
    <ol class="workspace-inbox-steps" data-testid="inbox-steps">
      <li class="workspace-inbox-step">
        <span class="workspace-inbox-step-title">{{ text.app.inboxStep1Title }}</span>
        <span class="workspace-inbox-step-body">{{ text.app.inboxStep1Body }}</span>
      </li>
      <li class="workspace-inbox-step">
        <span class="workspace-inbox-step-title">{{ text.app.inboxStep2Title }}</span>
        <span class="workspace-inbox-step-body">{{ text.app.inboxStep2Body }}</span>
      </li>
      <li class="workspace-inbox-step">
        <span class="workspace-inbox-step-title">{{ text.app.inboxStep3Title }}</span>
        <span class="workspace-inbox-step-body">{{ text.app.inboxStep3Body }}</span>
      </li>
      <li class="workspace-inbox-step">
        <span class="workspace-inbox-step-title">{{ text.app.inboxStep4Title }}</span>
        <span class="workspace-inbox-step-body">{{ text.app.inboxStep4Body }}</span>
      </li>
    </ol>
```

- [ ] **Step 5: 实现 CSS**

`src/styles.css` 把 7142–7143 行两条规则：

```css
.workspace-inbox-intro { margin: 0 0 6px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.workspace-inbox-hint { margin: 0 0 10px; color: var(--muted); font-size: 11px; line-height: 1.6; opacity: 0.85; }
```

替换为：

```css
.workspace-inbox-steps { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 6px; }
.workspace-inbox-step { display: grid; gap: 2px; }
.workspace-inbox-step-title { font-size: 12px; font-weight: 600; line-height: 1.6; }
.workspace-inbox-step-body { color: var(--muted); font-size: 12px; line-height: 1.6; }
```

（底部间距沿用原 hint 的 `10px`；全部走既有变量，明暗主题自动适配。）

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- src/__tests__/workspace-inbox-dialog.test.ts`
Expected: PASS 全绿。

- [ ] **Step 7: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无输出（通过）。i18n 删 key 后若模板仍有残留引用会在这里暴露。

- [ ] **Step 8: 提交**

```bash
git add src/state/i18n.ts src/components/WorkspaceInboxDialog.vue src/styles.css src/__tests__/workspace-inbox-dialog.test.ts
git commit -m "feat: 手机速记弹窗四步引导替代两段说明文案"
```

---

### Task 2: App Store 链接与配对地址链接

**Files:**
- Modify: `src/sync/pairing.ts`（`buildInboxAddress` 之后导出占位常量）
- Modify: `src/state/i18n.ts`（zh/en 各增 1 key `inboxAppStoreLink`）
- Modify: `src/components/WorkspaceInboxDialog.vue`（import 常量；步骤一加 `<a>`；地址 `<span>` → `<a>`）
- Modify: `src/styles.css`（7172 行 `.workspace-inbox-address` 改链接形态 + 新增 step-link 规则）
- Test: `src/__tests__/workspace-inbox-dialog.test.ts`

- [ ] **Step 1: 写失败测试（新增 App Store 用例 + 改写地址用例）**

测试文件顶部 import 区加：

```ts
import { INBOX_APP_STORE_URL } from "../sync/pairing";
```

把既有用例（约 127 行）：

```ts
  it("已配对时展示码与含 #inbox= 的地址", () => {
    const wrapper = mountDialog(INBOX);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    expect(wrapper.find('[data-testid="inbox-address"]').text()).toContain("#inbox=AB2CDE4FGHJK");
  });
```

替换为：

```ts
  it("已配对时展示码与含 #inbox= 的可点击配对地址", () => {
    const wrapper = mountDialog(INBOX);
    expect(wrapper.find('[data-testid="inbox-code"]').text()).toBe("AB2CDE4FGHJK");
    const address = wrapper.get('[data-testid="inbox-address"]');
    expect(address.text()).toContain("#inbox=AB2CDE4FGHJK");
    expect(address.attributes("href")).toContain("#inbox=AB2CDE4FGHJK");
    expect(address.attributes("target")).toBe("_blank");
    expect(address.attributes("rel")).toContain("noopener");
  });
```

并在「渲染四步引导」用例之后新增：

```ts
  it("步骤一正文附 App Store 下载链接：href 取常量、新标签打开", () => {
    const wrapper = mountDialog(INBOX);
    const link = wrapper.get('[data-testid="inbox-app-store"]');
    expect(link.attributes("href")).toBe(INBOX_APP_STORE_URL);
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toContain("noopener");
    expect(link.text()).toBe("下载");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/__tests__/workspace-inbox-dialog.test.ts`
Expected: FAIL —— `inbox-app-store` 取不到；地址用例 `attributes("href")` 为 undefined（当前是 `<span>`）。

- [ ] **Step 3: 实现占位常量**

`src/sync/pairing.ts` 在 `buildInboxAddress` 函数之后加：

```ts
// TODO(占位链接): App 上架后替换为真实 App Store 地址（workspace-inbox-dialog 测试 import 本常量断言，改这里即可）。
export const INBOX_APP_STORE_URL = "https://apps.apple.com/app/mini-desk";
```

- [ ] **Step 4: 实现 i18n 链接文案**

`src/state/i18n.ts` zh 块 `inboxStep4Body` 之后加：

```ts
      inboxAppStoreLink: "下载",
```

en 块 `inboxStep4Body` 之后加：

```ts
      inboxAppStoreLink: "Download",
```

- [ ] **Step 5: 实现模板链接**

`src/components/WorkspaceInboxDialog.vue` import 行改为：

```ts
import { buildInboxAddress, generateInboxCode, INBOX_APP_STORE_URL, isValidInboxCode } from "../sync/pairing";
```

步骤一的 body（Task 1 写入的）：

```html
        <span class="workspace-inbox-step-body">{{ text.app.inboxStep1Body }}</span>
```

（仅第一条 `<li>` 内的）替换为：

```html
        <span class="workspace-inbox-step-body">
          {{ text.app.inboxStep1Body }}
          <a
            class="workspace-inbox-step-link"
            data-testid="inbox-app-store"
            :href="INBOX_APP_STORE_URL"
            target="_blank"
            rel="noopener noreferrer"
          >{{ text.app.inboxAppStoreLink }}</a>
        </span>
```

配对地址行：

```html
        <span class="workspace-inbox-address" data-testid="inbox-address">{{ address }}</span>
```

替换为：

```html
        <a
          class="workspace-inbox-address"
          data-testid="inbox-address"
          :href="address"
          target="_blank"
          rel="noopener noreferrer"
        >{{ address }}</a>
```

- [ ] **Step 6: 实现 CSS**

`src/styles.css` 7172 行：

```css
.workspace-inbox-address { font-size: 11px; color: var(--muted); word-break: break-all; user-select: all; }
```

替换为（去 `user-select: all`——点击选择文本会与链接跳转打架；着色主色、hover 下划线）：

```css
.workspace-inbox-address { font-size: 11px; color: var(--primary); word-break: break-all; }
.workspace-inbox-address:hover { text-decoration: underline; }
```

并在 `.workspace-inbox-step-body` 规则之后加：

```css
.workspace-inbox-step-link { color: var(--primary); text-decoration: none; }
.workspace-inbox-step-link:hover { text-decoration: underline; }
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm test -- src/__tests__/workspace-inbox-dialog.test.ts`
Expected: PASS 全绿。

- [ ] **Step 8: 全量验证**

Run: `npx vue-tsc --noEmit && npm test`
Expected: vue-tsc 无输出；全量测试通过（允许 CLAUDE.md 记录的既有噪音：结尾 `Errors 1 error`（app-render 的 IndexedDB stub）、app-render 手机速记用例偶发 flake——若仅这两类，复跑单用例确认即算通过）。

- [ ] **Step 9: 提交**

```bash
git add src/sync/pairing.ts src/state/i18n.ts src/components/WorkspaceInboxDialog.vue src/styles.css src/__tests__/workspace-inbox-dialog.test.ts
git commit -m "feat: 手机速记弹窗配对地址改链接并附 App Store 下载入口"
```

---

## 验收自查（对照 spec）

- [ ] 四步标题/正文与 spec 表格一致（zh），en 直译同构
- [ ] 未生成码 / 已配对两态都能看到四步引导
- [ ] App Store 链接 href = `INBOX_APP_STORE_URL` 占位常量，新标签 + noopener
- [ ] 配对地址为 `<a>`，href 含 `#inbox=<码>`，新标签 + noopener
- [ ] 旧 `inboxDialogIntro` / `inboxSyncHint` 词条与 `.workspace-inbox-intro` / `.workspace-inbox-hint` 规则已删干净（`grep -rn "inboxDialogIntro\|workspace-inbox-hint" src/` 无结果）
- [ ] 「每 5 分钟」仍在（步骤四）
- [ ] 明暗主题下步骤区配色正常（手动 `npm run dev` 切主题看一眼）
