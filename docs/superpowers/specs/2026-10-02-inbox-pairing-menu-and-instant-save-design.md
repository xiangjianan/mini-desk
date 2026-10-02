# 「手机速记」菜单提级与生成即上云设计

日期：2026-10-02
状态：已与用户对齐，待实施

## 背景与目标

1. 「配对手机」藏在设置菜单的「数据」子菜单里，不够显眼；功能正式名称已演化为「手机速记」（弹窗标题、手机端文案均如此），菜单名却还是旧的「配对手机」。
2. 首次配对流程有坑：弹窗内点「生成配对码」只改本地草稿，必须再点「保存」才会落盘并向中继注册。用户生成后直接扫码，手机端 `/status` 校验拿到 404 `unknown_code`，配对失败。

## 决策记录（用户已确认）

| 决策点 | 结论 |
| --- | --- |
| 菜单改名 | 「配对手机」→「手机速记」 |
| 菜单位置 | 从「数据」子菜单提为设置一级菜单，紧随「数据」之后 |
| 改名范围 | 全部统一：设置菜单、工作区「⋯」菜单、手机端引导文案；changelog 历史条目不动 |
| 实现方式 | 方案 A：`generate()` 复刻 `rotate()` 的「立即 emit」模式 |
| 保存按钮 | 保留：后续调整「提醒清单/记事空间」落点仍由它确认 |

## 改动 1：设置菜单重构

```
现在                          改后
├ 数据                        ├ 数据
│ ├ 新建工作区                │ ├ 新建工作区
│ ├ 导入                      │ ├ 导入
│ ├ 导出当前工作区            │ ├ 导出当前工作区
│ ├ 配对手机                  │ └ 清空数据
│ └ 清空数据                  ├ 手机速记        ← 一级菜单，紧随数据
├ 语言                        ├ 语言
├ ...                         ├ ...
```

- `src/components/SettingsMenu.vue`：`pair-inbox` 选项从 `data.children` 移出，作为带 `PhonePortraitOutline` 图标的一级选项插入到 `data` 之后；`handleSelect` 分支不变。
- `src/state/i18n.ts` 词条（zh/en 同步改值，键不变）：
  - `inboxPair`：`配对手机` → `手机速记`；`Pair phone` → `Phone capture`（与 mobileFoot "phone quick capture"、弹窗标题 "Quick capture pairing" 同族）。
  - `mobilePairStep1`：`电脑端打开「配对手机」面板` → `电脑端打开「手机速记」面板`；英文 `Open “Pair phone” on the desktop` → `Open “Phone capture” on the desktop`。
- `inboxPair` 的另外两处消费方（工作区「⋯」菜单 `WorkspaceSwitcher.vue`、设置菜单）自动跟随改名，行为不变。

## 改动 2：生成配对码即保存上云

`src/components/WorkspaceInboxDialog.vue` 的 `generate()` 从只改本地草稿改为：

```ts
function generate(): void {
  code.value = generateInboxCode();
  // 生成即生效：立即落盘并向中继注册，弹窗保持打开供扫码/抄录（与 rotate 同口径）。
  emit("update", buildInbox());
}
```

链路（全部复用现有设施，无新增管线）：

- App.vue `handleInboxUpdate`：`persistNow()` 落盘 → 气泡「配对设置已保存」→ `registerInbox(code, true)` 向中继注册。
- 注册失败：既有警告气泡（「配对码注册失败，手机暂时无法配对，下次启动会自动重试」）+ 启动时幂等重注册自愈。
- 空态生成无旧码，`handleInboxUpdate` 的注销分支（`oldCode !== undefined && code !== oldCode`）天然不触发。
- 落点取当前下拉值（默认首个清单/首个空间），`lastSeenAt` 沿用 `0`。

语义变化（有意为之）：生成后点「取消」/关闭不再丢弃配对码——码已生效，扫码即可用；与「重置配对码」的立即生效语义一致。「保存」保留，用于后续确认落点下拉的修改。

## 测试

- `src/__tests__/settings-menu.test.ts`：「数据」组子项断言（create-workspace/import/export-workspace/clear-data 四项）原样保留；「pairs a phone」用例改为断言 `pair-inbox` 文本「手机速记」、无 `dropdown-child-option` 类（一级选项）、且位于 `data` 选项之后；注释同步。
- `src/__tests__/workspace-inbox-dialog.test.ts`：生成用例扩展为「点击生成即 emit update（合法 12 位码 + 默认落点 + lastSeenAt 0）且不 emit close（弹窗保持打开）」。
- `src/state/changelog.ts`：新增条目（zh/en），说明菜单提级改名与生成即注册。

## 不在范围

- 中继服务端（`server/`）无任何改动——注册协议原样，仅前端调用时机提前。
- 弹窗内其余交互（重置、清除、复制、二维码渲染）不变。
