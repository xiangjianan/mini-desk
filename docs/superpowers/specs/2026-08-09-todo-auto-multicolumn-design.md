# 提醒事项多列自适应设计

- **日期**: 2026-08-09
- **状态**: 已批准(Draft → Approved)
- **作者**: brainstorming session
- **相关文件**: `src/styles.css`, `src/components/TodoPanel.vue`, `src/components/WorkbenchShell.vue`

## 背景

看板分四个可拖拽宽度的列(图片 / 便签+快捷动作 / 提醒事项 / 工作区)。提醒事项区域(`TodoPanel`)目前把所有提醒列表**纵向堆叠**在单列里(每个列表 `flex: 1 1 33.33%` 均分高度、各自内部滚动)。

当某个列表里的事项很多,单列很快被填满,用户必须滚动才能看完。现有的缓解手段是:用户手动把其它列拖到最窄(自动折叠成 44px 竖条 rail),把空间让给提醒事项列 —— 但"提醒事项从一列变成两列"这个效果,目前无法主动触发,且用户也不希望在页面上直接常驻两个提醒列表。

## 目标

- 当提醒事项列被拖宽到**超过阈值**时,自动把内部列表**横向重排为多列**,一列展示一个提醒列表,从而一屏可见更多提醒事项。
- 重排完全**由宽度驱动、自动发生**,无需用户点任何按钮、无需新增常驻 UI。

## 规则(用户确认)

列数按以下规则决定:

1. **按宽度伸缩**:提醒事项区域越宽,列数越多(1 → 2 → 3 …)。
2. **不超过列表数量**:列数永远 ≤ 当前提醒列表个数。
3. **单列表始终单列**:当只有 1 个提醒列表时,无论多宽都不拆分。

## 方案选型

| 方案 | 做法 | 结论 |
|---|---|---|
| **A. CSS 容器查询 + `auto-fit` 网格** | `.todo-panel` 设为容器,宽到阈值时把 `.todo-sections` 切成 `repeat(auto-fit, minmax(340px,1fr))` 网格 | ✅ **采用** |
| B. `ResizeObserver` + JS 列数 | 组件内测宽、算 `clamp(1, floor(w/340), listCount)`、套内联 grid | 不采用:用 JS 重做了 CSS 原生能力,还要管理 observer 生命周期 |
| C. 通过 slot 传宽度 prop | WorkbenchShell 已有 `columnWidths[2]`,但 slot 内容归 App.vue,跨边界传值最别扭 | 不采用:耦合最大、收益最小 |

**为何 A 能一行满足全部规则**:`grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))` 中的 `auto-fit` 会把列数**自动封顶在实际子元素(列表)个数**——只有 1 个列表就只产生 1 条轨道(不会被挤成半宽),2 个列表最多 2 列,N 个列表最多 N 列且每列至少 340px。规则 1/2/3 全部由这一声明自然满足。

## 详细设计

### 现状结构(核对)

- `.workbench-grid` 是 4 列 CSS 网格,列宽由 `WorkbenchShell.vue` 写成内联 `grid-template-columns`(像素值,存于 localStorage `mini-desk-workbench-widths`)。拖拽手柄实时改写这条内联样式。
- `.workbench-zone-tasks`(网格第 3 格)→ `.todo-panel`(`flex:1 1 auto; min-height:0; overflow:hidden`)。
- `.todo-panel` 下两个**兄弟**节点:`.today-focus-section`(今日重点,可选,通栏)+ `.todo-sections`(TransitionGroup,容纳 `v-for` 出来的 `.todo-section` 列表)。
- `.todo-sections { display:flex; flex-direction:column; height:100%; overflow:hidden }`;每个 `.todo-section` `flex:1 1 33.33%`,`.is-compact`→`flex:1 1 0`,`.is-collapsed`→`flex:0 0 34px`,内部 `.todo-list` 各自滚动。

### 改动点(全部在 `src/styles.css`)

```css
/* 1) 让提醒事项根节点成为容器查询的容器 */
.todo-panel {
  container-type: inline-size;
}

/* 2) 宽度 ≥ 680px(= 2 × 340)才进入多列模式;更窄时完全保持现状 */
@container (min-width: 680px) {
  .todo-sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    grid-auto-rows: minmax(0, 1fr);   /* 行均分高度,各列内部各自滚动 */
    column-gap: 10px;
    row-gap: 8px;
    align-content: start;
  }

  /* 网格项不沿用纵向 flex 的 33% basis */
  .todo-section {
    flex: 1 1 auto;
  }
}
```

### 关键数值

- **单列最小宽 `340px`**:单个提醒列表在 320–360px 区间阅读舒适。
- **进入阈值 `680px`** = `2 × 340`,严格对齐:切到网格的瞬间正好够 2 列,避免"切到网格却仍是 1 列"的中间态。
- **多列阈值阶梯**:680–1019px → 2 列;1020–1359px → 3 列;依此类推。所有阈值均被列表数量封顶。

### 度量与实时性

- 容器 = `.todo-panel`,其宽度 = 拖拽手柄分配给提醒事项列的实际像素宽。
- 拖动分隔条 → `.workbench-grid` 内联 `grid-template-columns` 变 → `.workbench-zone-tasks` 宽变 → `.todo-panel` 宽变 → 容器查询**实时重算**,拖拽过程中多列/单列平滑切换。

### 高度与滚动

- 多列模式下 `grid-auto-rows: minmax(0, 1fr)` 使每行均分 `.todo-sections` 的可用高度;每个列表单元格保留各自的内部滚动(与现状"无整体滚动、列表内部滚动"一致)。
- `.today-focus-section` 不在 `@container` 规则内 → 保持**通栏**,显示在多列网格上方。

### 边界情况

- **窄窗口(<1180px)**:`.workbench-grid` 已有 `@media (max-width:1180px)` 把看板压成 2×2、隐藏拖拽手柄。此时提醒事项列较窄,容器查询不触发,保持单列,互不冲突。
- **拖拽折叠提醒事项列(<100px → 44px rail)**:面板内容被 `.workbench-zone-collapsed > *:not(.workbench-zone-rail){display:none}` 隐藏,容器查询无关。
- **折叠的列表(`.is-collapsed`)在多列网格中**:仍隐藏内容、只留标题条;其网格单元格可能留白,属可接受的小瑕疵(v1 不专门处理)。
- **TransitionGroup 重排动画**(`todo-section-reorder`):FLIP 基于位置差,在网格下同样有效,实现时需验证无回归。

## 测试策略

本次为纯 CSS 布局改动,视觉正确性主要靠 `npm run dev` 人工拖拽验证(见下方验证清单)。可纳入自动化的部分:

- **样式契约测试**(新增,加入 `src/__tests__/style-contract.test.ts`):断言 `src/styles.css` 包含
  - `.todo-panel` 上的 `container-type: inline-size`;
  - `@container (min-width: 680px)` 块内的 `repeat(auto-fit, minmax(340px, 1fr))`。
  - 目的:防止后续误删这两条关键规则。
- **人工视觉验证清单**:
  - [ ] 1 个列表:任意拖宽都不拆分,始终单列满宽。
  - [ ] 2 个列表:拖到 ~680px 出现 2 列;拖回窄处恢复单列纵向。
  - [ ] 3 个列表:680px→2 列(第 3 个换行到第二行),~1020px→3 列。
  - [ ] 拖拽过程中单列↔多列平滑切换,无闪烁/跳动。
  - [ ] 今日重点始终通栏在最上方。
  - [ ] 多列下列表内部滚动、行间均分高度正常。
  - [ ] 窗口缩到 <1180px(2×2 模式)提醒事项保持单列、手柄消失。
  - [ ] 折叠某个列表 / 拖拽重排列表在多列下仍正常。

## 不在本次范围(YAGNI)

- 不引入手动"列数"开关或常驻 UI(用户明确不想要)。
- 不持久化列数到 state(列数纯由宽度派生,无需存储)。
- 不改动 `WorkbenchShell.vue` 的拖拽/折叠数学逻辑。
- 多列网格的列间分隔视觉(竖线/间距)在实现阶段微调,本设计先定 `column-gap:10px`。
