# 快捷动作标签：颜色配置 → 点击频率热度色

Date: 2026-09-28
Status: Approved

## 背景与目标

快捷动作区的「标签管理」目前为每个标签提供 8 色调色板（`QUICK_TAG_COLORS`），
颜色持久化在 `QuickTag.color`，经 `buildVisibleQuickButtonGroups` 解析后以
`--tag-bg` + `.has-tag-color` 染组内按钮底色。该配置改为**自动的使用热度**：

- 移除标签管理器中的颜色选择，`QuickTag.color` 字段退役。
- 每次点击标签组内的快捷按钮，该标签计数 +1（`QuickTag.clicks`）。
- 按钮底色由计数数学折算：0 次 = 纯白（浅色主题的默认按钮底），100 次封顶
  达到最深色 `#3b82f6`（原调色板第一个默认蓝）。
- 梯度必须由数学计算得出（CSS `color-mix` 百分比），不得枚举颜色表。

## 需求口径（已与用户确认）

1. **计数动作**：仅统计组内快捷按钮的主点击（link 打开 / text 复制 /
   api 调用 / app 打开，`handleQuickButton` 入口）；右键菜单的
   「复制链接」「复制文本」不计入。
2. **深色主题**：渐变起点用主题变量 `var(--button)`（浅色 = `#ffffff` 纯白、
   深色 = 现有深色按钮底色），同一条公式适配两主题。
3. **标签管理器**：原色板位置显示「N 次」纯展示徽标，不可编辑。

## 颜色计算

纯函数（`src/state/quickButtons.ts`）：

```
quickTagUsagePercent(clicks) = clamp(min(clicks, 100), 0, 100)   // 0–100 整数
```

组件将百分比设为组节点内联变量 `--tag-usage`；CSS 单公式染色：

```css
.quick-tag-group.has-usage .quick-button {
  background: color-mix(in srgb, #3b82f6 var(--tag-usage), var(--button));
}
```

- 深色主题同规则（`--button` 自动切换基色），无需媒体查询或主题分支。
- hover/focus：`color-mix(in srgb, #3b82f6 calc(min(var(--tag-usage) + 12%, 100%)), var(--button))`，
  保留现有「悬停加深」手感。
- 文字颜色不翻转：最深 `#3b82f6` 上，浅色主题深字对比 ≈ 3.99:1、深色主题
  浅字 ≈ 3.67:1，全程可读，省去阈值翻转逻辑。
- 最深色常量落在 CSS 变量 `:root { --quick-usage-accent: #3b82f6 }`（同旧
  `QUICK_TAG_COLORS[0]`），取代整个调色板；JS 侧不需要重复常量。

## 数据模型

```ts
export interface QuickTag {
  id: string;
  title: string;
  collapsed?: boolean;
  clicks?: number;   // 使用计数；缺省 = 0。随工作区持久化/导出
  column?: number;
}
```

- `color` 字段删除；`QUICK_TAG_COLORS` / `getQuickTagColor` /
  `normalizeQuickTagColor` / `QUICK_TAG_DEFAULT_COLOR` 全部移除。
- `QuickButtonGroup.color` 由 `usagePercent?: number`（0–100）取代；
  仅真实标签组携带，「其他」（`__other`）与空态（`__empty`）组不带。

## 计数埋点

`App.vue` `handleQuickButton`：找到按钮后、四类型分支之前，若
`button.tagId` 指向存在的标签则 `clicks += 1`（建议封装为
`recordQuickTagClick(workspace, tagId)` 纯辅助函数，便于测试），
随后按现有口径 `persistNow()` 落盘（与待办勾选等结构性修改一致）。

不与撤销系统交互（undo 快照仅覆盖图片与文本管线，不涉及 quickTags）。

## UI 变更

- **标签管理器**（`QuickButtons.vue`）：移除 `.quick-tag-color-picker`
  整块与 `colorDraft`/`setTagColor` 逻辑；`saveTag` emit 不再携带 `color`；
  原位置渲染「N 次」徽标（i18n：zh「N 次」/ en「N clicks」）；N 为真实计数，
  超过 100 时照实显示（如「132 次」），仅颜色在 100 处封顶。
- **组节点**：`:class` 由 `has-tag-color` 换 `has-usage`（仅当
  `usagePercent > 0`），`:style` 设 `--tag-usage: <percent>%`。
- 右键菜单、拖拽分栏、折叠、内联重命名等其余交互不变。

## 迁移与边界

- `normalize.ts`：导入/加载归一化剥除 `color`（存量颜色静默消失，即需求
  本意）；`clicks` 校验为非负有限整数，非法丢弃（缺省 0）。
- 删除标签 → 计数随标签消失；重命名 → 计数保留（按 id 身份）；同名合并 →
  被并标签的计数消失、幸存标签保留自身计数；按钮移入移出标签组 → 计数归
  标签所有，不随按钮迁移。
- `tagId` 指向已删除标签的按钮：回落「其他」组，不计数、不染色。
- 序列化（`serialize.ts`）为整工作区透传，`clicks` 自动随行，无需改动。

## 测试计划（TDD）

- `quick-buttons.test.ts`：重写颜色用例为 usage 用例 ——
  `quickTagUsagePercent` 折算与 100 钳制；组构建产出 `usagePercent`；
  0 次无 `has-usage`；「其他」/空态组不带 usage；计数入组的数据流。
- `state.test.ts`：归一化剥 `color`、`clicks` 合法值保留 / 负数与非整数丢弃。
- `app-render.test.ts`：标签管理器无色板、有次数徽标；点击快捷按钮后
  对应标签计数 +1 并持久化。
- i18n 字典新增徽标文案（zh/en），移除 `tagColor`/`tagColorDefault`。

## 涉及文件

| 文件 | 变更 |
| --- | --- |
| `src/types.ts` | `QuickTag.color` → `clicks` |
| `src/state/quickButtons.ts` | 删调色板；增 `QUICK_TAG_USAGE_ACCENT`、`quickTagUsagePercent`、组 usage 字段、`recordQuickTagClick` |
| `src/components/QuickButtons.vue` | 删色板 UI 与草稿逻辑；组变量绑定；管理器徽标 |
| `src/App.vue` | `handleQuickButton` 计数；`saveQuickTag`/`resolveQuickTagId` 去 color |
| `src/state/storage/normalize.ts` | 剥 `color`、校验 `clicks` |
| `src/styles.css` | `.has-tag-color` 规则族 → `.has-usage` color-mix 公式族 |
| `src/state/i18n.ts` | 删 tagColor 文案；增徽标文案 |

更新日志不手改：`/release-mini-desk` 发版流程会在版本提交时按实际 diff
追加 changelog 条目（其 curation policy 见 `src/state/changelog.ts` 头注）。
