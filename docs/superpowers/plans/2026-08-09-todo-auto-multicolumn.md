# 提醒事项多列自适应 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提醒事项列宽超过 680px 时,自动把纵向堆叠的提醒列表重排为多列(列数随宽度伸缩、被列表数量封顶、单列表始终单列)。

**Architecture:** 纯 CSS 改动。给 `.todo-panel` 加 `container-type: inline-size` 让它成为容器查询容器;在 `@container (min-width: 680px)` 内把 `.todo-sections` 从 `display:flex; flex-direction:column` 切成 `display:grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))`。`auto-fit` 天然把列数封顶在列表数量,无需任何 JS、无新增状态、无 prop 传递。拖拽分隔条时容器宽度实时变化,容器查询实时重算。用 `style-contract.test.ts` 守护这两条关键 CSS 规则不被误删。

**Tech Stack:** Vue 3 + TypeScript + Vite;vitest;原生 CSS 容器查询(`container-type` / `@container`)。

**关联 spec:** `docs/superpowers/specs/2026-08-09-todo-auto-multicolumn-design.md`

**执行分支:** 当前 `main` 分支(本项目一直直接在 main 上提交)。

---

## 文件结构

| 文件 | 责任 | 改动 |
|---|---|---|
| `src/styles.css` | 全局样式 | 新增 `.todo-panel { container-type: inline-size }` 独立规则 + 一个 `@container (min-width: 680px) { .todo-sections { …grid… } }` 块 |
| `src/__tests__/style-contract.test.ts` | 样式契约测试 | 新增一个 `it()`,断言上述两条关键 CSS 规则存在 |

无需新建文件、无需改任何 `.vue`、无需改 state / storage / types。

---

## 关键背景(给无上下文的执行者)

- 看板是 4 列 CSS 网格 `.workbench-grid`,列宽由 `WorkbenchShell.vue` 写成**内联** `grid-template-columns`(像素值),拖拽手柄实时改写。第 3 格是提醒事项区。
- DOM 链路:`.workbench-zone-tasks` → `.todo-panel`(根节点,`flex:1 1 auto; min-height:0; overflow:hidden`)→ 两个兄弟:`.today-focus-section`(今日重点,可选)+ `.todo-sections`(TransitionGroup,`v-for` 出每个 `.todo-section` 列表)。
- 现状:`.todo-sections { display:flex; flex-direction:column; height:100%; overflow:hidden }`(纵向堆叠);每个 `.todo-section { flex:1 1 33.33%; …; overflow:hidden }`,内部 `.todo-list` 各自滚动。
- `.todo-panel` 目前**没有独立规则**,只在若干**分组**规则里出现(如 `.todo-panel, .todo-section, .today-focus-section { … }`)。
- 测试文件 `style-contract.test.ts` 的 `ruleBodies(styles, selector)` 用正则 `/([^{}]+)\{([^{}]*)\}/g` 提取**非嵌套**规则体,按逗号拆分选择器。因此:
  - `expectSelectorBody(styles, ".todo-panel", "container-type: inline-size")` 能匹配**独立**的 `.todo-panel` 规则(我们的新规则)。
  - `@container { … }` 是嵌套结构,`ruleBodies` 无法按选择器匹配它 → 用 `expect(styles).toContain(...)` 原始字符串断言。

---

## Task 1: 用 TDD 加样式契约测试 + CSS 实现

**Files:**
- Modify: `src/__tests__/style-contract.test.ts`(在 `describe("workbench style contract", …)` 末尾、`});` 闭合前插入新 `it()`)
- Modify: `src/styles.css`(在 `.todo-sections { … }` 规则块之后插入新规则)

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/style-contract.test.ts` 中,定位最后一个 `it()`(`"keeps the calculator expression input aligned with other tool fields"`,以 `});` 结尾,当前在第 426 行),在它之后、`describe` 的闭合 `});`(当前第 427 行)之前,插入下面这个新 `it()`:

```ts
  it("auto-splits reminder lists into multiple columns above a width threshold", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    // 容器查询容器:提醒事项根节点
    expectSelectorBody(styles, ".todo-panel", "container-type: inline-size");
    // 多列阈值 + auto-fit 网格(列数随宽度伸缩,并被列表数量自动封顶)
    expect(styles).toContain("@container (min-width: 680px)");
    expect(styles).toContain("grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))");
  });
```

- [ ] **Step 2: 运行测试,确认失败(RED)**

Run: `npx vitest run src/__tests__/style-contract.test.ts`
Expected: 该新增 `it()` **FAIL**(三条断言都不成立:此时 `.todo-panel` 无 `container-type`、无 `@container`、无 `auto-fit`)。其余既有 `it()` 仍 PASS。

- [ ] **Step 3: 写最小实现(CSS)**

在 `src/styles.css` 中,定位这段唯一的规则(当前在 2280–2286 行):

```css
.todo-sections {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
```

在它**之后**(在 `.today-focus-section {` 规则之前)插入:

```css
/* 提醒事项多列自适应:容器查询 + auto-fit 网格。
   宽度 ≥ 680px(= 2 × 340)进入多列;auto-fit 把列数自动封顶在列表数量,
   故单列表始终单列、多列表随宽度伸缩。窄于阈值时上面的 flex column 规则继续生效。 */
.todo-panel {
  container-type: inline-size;
}

@container (min-width: 680px) {
  .todo-sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 8px;
  }
}
```

说明:
- `container-type: inline-size` 只在内联(宽度)轴施加尺寸包含,块(高度)轴不受影响 —— `.todo-panel` 仍照常由 `flex:1 1 auto; min-height:0` 撑满高度。
- 进入网格后,每个 `.todo-section` 自身仍是 `display:flex; flex-direction:column`(内部标题 + 列表 shell),其 `flex:1 1 33.33%` 在网格项里被忽略(无害);`grid-auto-rows: minmax(0,1fr)` 让每行均分高度、各列表内部继续各自滚动,与现状体验一致。
- `.today-focus-section` 不在 `@container` 块内,保持通栏。

- [ ] **Step 4: 运行测试,确认通过(GREEN)**

Run: `npx vitest run src/__tests__/style-contract.test.ts`
Expected: 新增 `it()` **PASS**,全部用例 PASS。

- [ ] **Step 5: 跑完整测试套件,确认无回归**

Run: `npm test`
Expected: 全部 PASS(无既有样式契约断言因新规则而破坏)。

- [ ] **Step 6: 跑构建,确认无样式/类型问题**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 7: 提交**

```bash
git add src/styles.css src/__tests__/style-contract.test.ts
git commit -m "feat: 提醒事项列宽超过阈值自动分多列

基于 CSS 容器查询 + auto-fit 网格:提醒事项区域宽到 680px 起,
纵向堆叠的列表自动重排为多列(列数随宽度伸缩、被列表数量封顶、
单列表始终单列)。零 JS、零新增状态。"
```

---

## Task 2: 人工视觉验证(npm run dev)

**Files:** 无(纯验证;如发现需要微调 `column-gap`/`row-gap` 等视觉细节,回到 Task 1 的 CSS 微调并 amend 或追加提交)

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`(在本地浏览器打开应用)

- [ ] **Step 2: 按 spec 的验证清单逐项确认**

- [ ] 只有 1 个提醒列表:把提醒事项列任意拖宽(先把图片列、快捷动作列拖到最窄折叠,腾出空间),**始终单列满宽**,不被挤成半宽。
- [ ] 2 个提醒列表:提醒事项列拖到约 680px 出现 2 列;拖回窄处恢复单列纵向。
- [ ] 3 个提醒列表:约 680px → 2 列(第 3 个换行到第二行左列);约 1020px → 3 列。
- [ ] 拖拽过程中单列 ↔ 多列在 680px 边界切换,无闪烁/跳动(`display:flex→grid` 是离散切换,属预期)。
- [ ] 今日重点始终**通栏**在最上方,不进多列网格。
- [ ] 多列下:每个列表内部滚动正常、同行列表等高、行间均分高度。
- [ ] 把窗口缩到 < 1180px(看板进入 2×2、手柄消失):提醒事项保持单列,功能正常。
- [ ] 折叠某个列表 / 拖拽重排列表:在多列下仍正常(折叠列表的网格单元格可能留白,属可接受瑕疵)。

- [ ] **Step 3: 若有视觉微调,改 `column-gap`/`row-gap`(或阈值)后重跑 `npm test`,再追加提交**

```bash
git add src/styles.css
git commit -m "style: 微调提醒事项多列间距/阈值"
```

(若无需微调,本步骤跳过。)

---

## Self-Review(计划作者自查,已执行)

- **Spec 覆盖**:spec 的"详细设计 / CSS 改动"→ Task 1 Step 3;"测试策略"→ Task 1 Step 1 + Task 2;"边界情况"→ Task 2 验证清单。规则 1/2/3 由 `auto-fit` 一行满足,已在 Step 3 注释说明。✅
- **占位符扫描**:无 TBD/TODO;每个代码步骤都给了完整可粘贴代码与精确插入位置。✅
- **类型/命名一致性**:测试里断言的字符串(`container-type: inline-size`、`@container (min-width: 680px)`、`grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))`)与 Step 3 写入的 CSS **逐字符一致**;阈值 680 = 2 × 340 自洽。✅
