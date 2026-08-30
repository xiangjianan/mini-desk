# 智能粘贴设计

## 背景与目标

手机速记的服务端 DeepSeek 润色已上线（`server/llm.py` `polish_capture`：todo 拆条 / note 编号提炼）。本设计把同一能力带到桌面端：在提醒事项区与便签区右键菜单的「粘贴」下方新增「智能粘贴」，把剪贴板里的杂乱文本交给服务端处理，结果直接插入目标区域。

### 已确认的关键决策（用户拍板）

| 决策点 | 结论 |
| --- | --- |
| 入口形态 | 两区域右键菜单「粘贴」下方新增「智能粘贴」菜单项（✦ 图标） |
| 结果呈现 | **直接插入**，不预览确认；可撤销、可手改 |
| 处理粒度 | 剪贴板**全文一次调用**（不按行预拆，LLM 拿全文上下文拆得更准） |
| 处理类型 | 由粘贴区域决定：提醒区 → kind=todo 拆条；便签区 → kind=note 排版润色 |
| 处理中/结果提示 | 走 **GIF 消息气泡**（`useCompanionBubble.showBubbleText`），不新做面板内指示 |
| 失败兜底 | **退化为普通粘贴**（原文照插）+ 气泡提示；最坏情况等于普通粘贴 |
| 鉴权 | 复用配对码注册制；未配对时静默生成**全局唯一** polish 专用码（见下） |

## 交互流程

1. **入口**：`TextPanel`（便签/备忘/工作区行编辑器）右键菜单与 `TodoPanel`（提醒事项列表节头/面板）右键菜单，在「粘贴」项下方加「智能粘贴」。剪贴板无文本时与「粘贴」一同禁用。
2. **处理中**：点击 → `readClipboardText()` 读全文 → 气泡显示「✦ 整理中…」（长时长，锚定目标面板；`getCompanionPosition` 的 `.text-panel` / `.todo-section` 锚点选择器已覆盖两区域）。DeepSeek 通常 2-5s，服务端硬超时 30s。
3. **成功**：气泡内容替换为结果提示（「已整理为 N 条提醒」/「已排版为 N 行」），短时长自动消失；结果直接插入：
   - **提醒区**：每条 → 新建未完成待办，落到右键所在列表（沿用 `pasteTodosFromClipboard` 的落位语义；面板空白处右键用其默认 period）。
   - **便签区**：编号文本按行插入光标位置（沿用 `pasteTextFromClipboard` 语义；无焦点则追加面板末尾）。
4. **失败**（网络错误/超时/LLM 失败/超长）：按普通粘贴插入原文 + 气泡「AI 整理暂不可用，已粘贴原文」。原文超过 2000 字符时不调用服务端，直接走限长提示 + 原文粘贴。
5. **可撤销**：插入走结构性修改路径（立即保存 + undo 快照），Ctrl+Z 可整体回退。

## 服务端（relay）

新增同步端点 `POST /polish/<key_hash>`，请求体 `{"kind": "todo"|"note", "text": "..."}`：

- **鉴权**：key_hash 必须已注册——unknown → 404 `unknown_code`、revoked → 410（与 inbox 完全同语义）。不开放匿名调用，防止 DeepSeek 额度被白嫖。
- **结构校验**：kind ∉ todo/note 或 text 非空校验不过 → 400；text > 2000 字符 → 413 `too_large`。
- **处理**：直接调 `polish_capture(kind, text)`（30s 超时、永不抛出、条数 ≤20、每条 ≤500 字，均为 llm.py 既有约束）。
- **响应**：
  - 润色成功 → `200 {"items": ["...", ...]}`
  - LLM 失败 → `200 {"items": null, "fallback": true}`（请求本身成功，前端走原文粘贴；不用 5xx 表达业务降级）
- **无状态**：不碰 `inbox_items` 表、无队列、无幂等要求；CORS 走现有 `ALLOWED_ORIGINS` 白名单回显（桌面与手机页同域，零改动）。

## 前端结构

- **`src/sync/polishClient.ts`（新增）**：`polishClipboardText(kind, text): Promise<PolishResult>`，`PolishResult = { items: string[] } | { fallback: true } | null`（null = 网络/HTTP 层失败）。内部完成 keyHash 计算与 POST。
- **polish 专用配对码**：
  - `state` 顶层新增可选字段 `polishCode`（全局唯一，不按工作区区分——鉴权只要求「已注册」）。
  - 工作区是否配过 inbox 与智能粘贴互不影响：统一用 `polishCode`，首次使用时生成（12 位 Crockford base32，同现有码格式）→ `registerInboxKey` 注册 → 存入 state。
  - 清空数据时与配对码一起 revoke（复用现有注销通道）；轮换/删除工作区不涉及（码不属于任何工作区）。
- **面板接线**：落位逻辑留在面板内部（period/list/textarea 上下文都在那）；气泡经事件上浮给 App.vue 的 `showBubbleText`（与快捷按钮消息同一通道，具体 prop/emit 形态在计划阶段定）。
- **i18n**：菜单文案（智能粘贴 / Smart paste）与三条气泡文案（整理中 / 已整理 / 降级提示）zh+en 双语。

## 测试

- **服务端 pytest**：注册校验（404/410）、结构校验 400、限长 413、kind 分支（mock `polish_capture`）、fallback 标记、CORS 头 presence。
- **前端 vitest**：`polishClient` 单测（mock fetch：成功/fallback/网络失败）；两面板菜单项渲染与禁用态；todo 拆条落位、note 排版落位（光标/末尾两路径）；失败退化原文粘贴；气泡触发；i18n 文案。

## 明确不做（v1）

- 快捷键入口、预览确认流、富文本/图片剪贴板、板上已有内容的右键整理。
- 每工作区独立 polish 码（全局一个足够）。
- `/polish` 限流（配对码注册制已是闸门；与 `/register` 同信任水平）。

## 部署

- 无数据库迁移、无新依赖；服务端 `deploy.sh` 照常，前端随下次常规发布。
