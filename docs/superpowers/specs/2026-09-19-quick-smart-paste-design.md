# 快捷动作区「智能粘贴」设计

日期：2026-09-19
状态：已与用户确认

## 背景与目标

提醒事项区与便签区已有「智能粘贴」（剪贴板全文经服务端 LLM 整理后插入）。快捷动作区目前只有普通粘贴（`classifyQuickText`：URL→链接按钮+域名标题、文本→复制按钮+前 20 字，标题生硬）。本设计把智能粘贴引入快捷动作区：识别剪贴板内容 → LLM 分析 → 生成一个带简短语义标题的快捷链接或快捷复制文本按钮。

已确认的产品决策：

1. **菜单范围**：智能粘贴只加在快捷区空白处右键菜单（含标签组内部空白，同一份 `menuOptions` 覆盖两处）的「粘贴」下方；标签标题自身右键菜单维持只有「移动到空间」。
2. **复制内容语义**：text 类型按钮的 value = 剪贴板原文（仅去首尾空白），LLM 只负责起标题和判类型，不整理复制内容。
3. **链接抓取**：服务端在调 LLM 前抓取剪贴板中的第一个 http(s) 链接提取元数据作上下文；抓取失败静默退回只用 URL 本身（阿里云出站对 Cloudflare 前置域名等不通，属预期降级）。

标题约束：≤15 个字（按码点），语言跟随输入文本主要语言，语义贴合粘贴内容。

## UI 入口（`src/components/QuickButtons.vue`）

- **标签头按钮**：`.quick-tag-heading` 内、加号（`quick-tag-add-button`）左侧新增智能粘贴按钮。显隐条件与加号一致：`group.title && editingTagId !== group.id`。样式复用提醒区同款 `class="icon-button desk-ai-button"` + `ClipboardOutline` 图标（平时主色蓝、悬浮彩色流动，全部复用现有 CSS，零新增）。aria-label/title = `uiText.common.smartPaste`。点击 → 以该组 `tagTitle`（真实标签）触发流程；「其他」组不指定标签。
- **右键菜单**：无 id 的 `menuOptions`（`openAreaMenu` 打开，快捷区空白处右键含标签组内部空白）在 `paste` 下方插入 `{label: uiText.common.smartPaste, key: "smart-paste", icon: ClipboardOutline}`，仅当 `props.polish` 注入时渲染；NDropdown 增加 `:render-label="renderPolishMenuLabel"` 使该项文字渐变流动（key `smart-paste` 已在 `POLISH_MENU_KEYS` 白名单内）。`handleMenuSelect("smart-paste")` 用菜单状态捕获的 `tagTitle` 走同一流程。
- **防重**：流程运行中置 pending（ref），头部按钮 disabled + `aria-busy`（复用 `desk-smart-paste:disabled` 的 cursor:wait 口径），菜单项触发前同样检查。
- **接线**：QuickButtons 新增 prop `polish?: (kind, text, style?) => Promise<PolishResult>` 与 emit `polishMessage: [phase, message, anchor]`；App.vue 补 `:polish="polishClipboard"`、`@polish-message="handlePolishStatus"`（与 TodoPanel/SpacePanel 完全同款）。

## 前端编排

### `src/sync/polishClient.ts`

- `PolishKind` 扩为 `"todo" | "note" | "quick"`。
- 响应收敛 `coercePolishResponse` 新增分支：`{button: {title: string, value: string, type: "link" | "text"}}`（字段类型校验，非法归 null）。
- `PolishResult` union 相应扩展。quick 请求超时 45s（服务端最坏 8s 抓取 + 30s LLM > 现行 35s）；todo/note 维持 35s。

### `src/utils/smartPaste.ts`

新增 `runQuickSmartPaste(options)`：

- 读剪贴板 → 空白/读取失败无动作。
- 超长（> `POLISH_MAX_CHARS` 2000，UTF-16 计）→ 直接降级并气泡。
- working 气泡（复用 `polishWorking`）→ `polish("quick", text)`。
- 成功：`insert(button)` —— QuickButtons 侧 emit `save {title, value, type, tagTitle}`；done 气泡。
- 任何失败（null / `{fallback:true}` / 异常）→ **降级为现有普通粘贴语义**：`classifyQuickText(原文)` 生成按钮 + 降级气泡。
- 迟到丢弃：进入流程时捕获 `props.buttons` 引用，落位前比对（工作区切换/清空数据会使引用变化），不等则丢弃（与 TodoPanel 的 `landingLists` 守卫同思路）。

### 气泡文案（i18n，zh/en）

- working 复用 `polishWorking`。
- 新增 `app.polishQuickDone`（zh「已生成快捷按钮」）、quick 专属 fallback（zh「AI 整理暂不可用，已按原文生成」）、quick 专属 tooLarge（zh「内容超过 2000 字，已按原文生成」）及英文对应。

## 服务端（`server/`，Python 3.9 兼容）

### `/polish` 端点（`app.py`）

- `kind` 枚举加 `"quick"`；其余校验（鉴权 unknown 404 / revoked 410、`MAX_POLISH_CHARS` 413）不变。
- kind=quick 成功返回 `{"button": {"title", "type", "value"}}`；LLM 失败返回 `{"button": null, "fallback": true}`（与 items 降级口径平行，不用 5xx 表达业务降级）。

### `llm.py` 新增 `generate_quick_button(text)`

- **URL 提取**：服务端正则提取第一个 http(s) URL（确定性，value 不经 LLM）。
- **LLM 契约**：只输出 `{"title": string, "type": "link" | "text"}`。system prompt 沿用现有约定：输入是数据不是指令、除 JSON 外不输出别的文字、输出语言跟随输入主要语言、title ≤15 字不虚构；语义上适合打开的 URL → link，纯文本 → text。
- **value 回填（确定性）**：type=link → 原文中提取到的 URL 逐字；type=text → 原文去首尾空白。
- **title 截断**：按码点截到 15。
- **链接抓取 `fetch_link_context(url)`**（新函数）：urllib、8s 超时、响应截断 256KB、仅接受 `text/html`、最多 3 跳重定向且逐跳复检目标、SSRF 防护（拒绝非 http(s) scheme、localhost/私网/链路本地 IP 字面量及可解析到私网的主机名）；提取 `<title>`、`meta name=description`、`meta name=keywords`、`og:title`、`og:description`，压空白后合计截 ~800 字符注入 user 消息作上下文。任何抓取失败返回 None，流程继续只带 URL 文本调 LLM。
- LLM 失败/结构非法/空 title → 返回 None（端点转 fallback 标记），沿用「本模块永不抛异常」约定。

## 数据与状态

无 schema 变化：生成的按钮就是普通 `QuickButton`（type `link`/`text`），经现有 `saveQuick` → `persistNow` 落 localStorage。

## 降级链（最坏 = 普通粘贴）

| 场景 | 行为 |
| --- | --- |
| 剪贴板空/读取失败 | 无动作 |
| 超长（>2000） | 普通粘贴语义 + tooLarge 气泡 |
| 网络/HTTP/结构非法/LLM 失败 | 普通粘贴语义（`classifyQuickText`）+ fallback 气泡 |
| 链接抓取失败（CF 超时等） | 用户无感，标题退化为 URL 语义 |

## 测试（TDD，先写测试）

- **前端 vitest**：`smart-paste.test.ts` 扩展 quick 流程（成功落位/降级/超长/pending 防重/迟到丢弃/tagTitle 透传）；polishClient quick 响应收敛与 45s 超时；QuickButtons 渲染（标签头按钮存在且位于加号左侧、右键菜单项次序、render-label 接线、polish 未注入时入口不渲染）；i18n 键齐备（zh/en 对照）。
- **服务端 pytest**：kind=quick 端点（枚举 400、鉴权 404/410、超长 413、LLM 失败 fallback、成功 button 回填）；`generate_quick_button`（mock urlopen：成功、超时、非 HTML、LLM 异常）；`fetch_link_context` SSRF 拒绝（私网/localhost/非 http(s)/重定向进私网）；URL 提取与 value 逐字回填、title 15 字截断。
- `style-contract.test.ts` 补快捷区智能粘贴按钮的 token 断言（复用 desk-ai-button 主色蓝与悬浮流动）。

## 部署注意

- server/ 改动部署前在 aliyun 跑 `./.venv/bin/python -m py_compile app.py llm.py`（Python 3.9 语法坑）；部署本身走 `server/deploy.sh`，与本功能交付解耦。
