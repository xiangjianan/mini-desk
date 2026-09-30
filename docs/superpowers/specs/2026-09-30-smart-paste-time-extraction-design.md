# 智能粘贴时间识别 — 设计文档

日期：2026-09-30
状态：已与用户确认（方案 A：服务端 LLM 提取；覆盖桌面智能粘贴 + 手机速记）

## 背景与目标

提醒事项的智能粘贴目前只做拆条：`/polish`（DeepSeek）返回 `{items: string[]}`，纯文本落地。
目标：拆条时识别文本中的时间（如「上午 10 点去咖啡厅」），生成文本为「去咖啡厅」的待办，
并把时间写入待办既有的 `notifyAt` 字段（epoch 毫秒）。`notifyAt` 已有完整 UI 与行为支持：
时间角标（`todo-deadline-label`）、紧急度配色、闹钟选择器、浏览器通知（`useTodoNotifications`）、
今日焦点排序——本次改动零新增 UI。

覆盖两条入口（共用服务端 `polish_capture`）：

1. 桌面端智能粘贴（提醒事项右键「智能粘贴」→ `/polish` 直连）
2. 手机速记（手机捕获页 POST → 服务端后台润色拆条入库 → 桌面拉取落地）

## 时间解析规则

| 场景 | 规则 | 出处 |
|---|---|---|
| 无时间 | 不设 `notifyAt` | 用户规则 |
| 时间段（9 点到 11 点） | 取起始时刻 | 用户规则 |
| 时间表达 | 从文本剥离，剥离后清理首尾标点与空白 | 用户示例 |
| 仅时刻无日期（上午 10 点） | 今天该时刻未过 → 今天；已过 → 明天同时刻 | 对齐既有预设 `nextAt`（deadlines.ts:71-76） |
| 仅日期无时刻（周五交报告） | 该日 09:00 | 对齐 `withDefaultNotifyTime`（非今日默认 9 点） |
| 明确的过去日期（昨天下午 3 点） | 原样保留，展示为已过期 | 忠实原意（与提示词「不虚构」一致） |

## 数据契约

### 请求（`/polish` 与手机捕获 POST 共用）

新增可选字段 `tzOffsetMinutes`：整数，UTC 以东为正（UTC+8 → 480），
取值范围 [-720, 840]。服务端用它把「当前时间」折算到用户时区后注入提示词，
解决服务器时区 ≠ 用户时区；缺省回落服务器本地时区。存在但非数字/超范围 → 400（与 `style` 同口径）。

前端取值：`-new Date().getTimezoneOffset()`（JS 的 getTimezoneOffset 返回 UTC 以西为正，需取负）。

### LLM 输出（kind=todo）

```json
{"items": [{"text": "去咖啡厅", "notifyAt": "2026-10-01T10:00:00+08:00"}]}
```

- `notifyAt` 为 ISO 8601 带时区偏移的字符串，无时间则整字段省略。
- 提示词注入当前日期时间（用户时区折算后）与星期，供「明早」「下周三」等相对表达解析。
- LLM 返回旧式纯字符串条目也接受（防提示词漂移），按无时间处理。
- 「仅时刻已过顺延明天」等解析规则由提示词约束，服务端仅做范围兜底校验；LLM 偶未按规则顺延时按其输出落地（最多显示为今日已过期，可接受）。

### `/polish` 响应

服务端把 ISO 解析为 epoch 毫秒：`{"items": [{"text": "去咖啡厅", "notifyAt": 1759312800000}, {"text": "…"}]}`。
客户端只需 `typeof === "number"` 校验。

### 服务端校验（`llm.py`）

- `text`：沿用现有清洗（空白折叠、截断 500 字、上限 20 条、丢弃空串）。
- `notifyAt`：`datetime.fromisoformat` 解析；失败或超出 `[now − 366 天, now + 730 天]` → **丢弃字段、保留条目**。
- 手机速记入库 payload：`{"kind","text","createdAt","notifyAt"?}`（`notifyAt` 为 epoch 毫秒）。

## 服务端改动（`server/`）

- `llm.py`
  - `SYSTEM_PROMPT` 的 todo 条目改为：拆条 + 识别时间并从文本剥离 + 时间段取起始 + 相对表达按注入的当前时间解析；输出对象条目；保留「不虚构、不添加输入里没有的信息」。
  - `polish_capture(kind, text, tz_offset_minutes=None)`：按偏移折算当前时间并注入用户内容。
  - `_extract_items`：兼容 string / `{text, notifyAt?}` 双形态，按上述规则校验，返回统一对象列表。
- `app.py`
  - `/polish`：读取并校验 `tzOffsetMinutes`；响应 items 透传结构化条目（ISO → epoch 毫秒）。
  - `store_plain_items`：把 `notifyAt` 写入手机速记行 payload。
- 部署：合并后跑 `server/deploy.sh`（既有约定：server 改动提交后必须部署）。

## 桌面端改动（`src/`）

- `polishClient.ts`
  - `PolishTodoItem = { text: string; notifyAt?: number }`；`PolishResult` 的 items 类型改为 `PolishTodoItem[]`。
  - `coercePolishResponse`：条目接受 string（→ `{text}`）与 object（`text` 必须非空 string；`notifyAt` 非有限正数即丢弃字段）。
  - 请求体携带 `tzOffsetMinutes`。
- `smartPaste.ts`：`SmartPasteOptions.insert: (items: PolishTodoItem[]) => void`（仅 todo 路径使用；note/quick 不变）。
- `TodoPanel.vue`：两处智能粘贴入口的 `createFromText` 事件改传结构化条目。
- `App.vue createTodosFromText`：接受 `string[] | PolishTodoItem[]`，落地时经 `isValidNotifyAt` 校验后写入 `notifyAt`；
  创建后调用 `scheduleNextTodoNotification()`（浏览器通知对新时间生效）。持久化沿用现有结构化保存路径。
- 完成气泡文案维持「已整理为 {count} 条提醒」，不加时间计数变量（时间角标已可见）。

## 手机端改动（`src/`）

- `MobileInboxCapture.vue`：POST 体增加 `tzOffsetMinutes`。
- `src/sync/crypto.ts`：明文 payload 类型加可选 `notifyAt?: number`。
- `src/sync/pull.ts`：`applyInboxItems` 解码可选 `notifyAt`（有限正数校验），拉取生成的待办带时间；旧数据无此字段不受影响。

## 兼容与发布

- 新 server + 旧桌面（SW 缓存未刷新）：旧 coercion 判 object items 非法 → `null` → 降级为原文粘贴，行为可接受、刷新后自愈。
- 新桌面 + 旧 server（未部署）：`tzOffsetMinutes` 被忽略，string items 被新 coercion 接受 → 功能正常（仅无时间识别）。
- 无硬性发布顺序；按惯例 server 提交后部署。

## 测试

后端（`cd server && ./.venv/bin/python -m pytest`）：

- `test_llm.py`：提示词含折算后当前时间；对象/字符串双形态条目；notifyAt 解析失败与超范围丢弃；时间剥离与截断共存。
- `test_polish_endpoint.py`：/polish 返回对象条目；`tzOffsetMinutes` 校验（缺省可、非法 400）。
- `test_polish_pipeline.py`：手机速记行 payload 携带 notifyAt；polish=False 路径不受影响。

前端（`npm test`）：

- `sync-polish-client.test.ts`：双形态 coercion、notifyAt 非法丢弃、请求体含 tzOffsetMinutes。
- `smart-paste.test.ts`：insert 收到结构化条目。
- `todo-panel.test.ts`：智能粘贴 emit 形态。
- `sync-pull.test.ts`：拉取待办落地 notifyAt。

## 非目标（YAGNI）

- 不新增时间解析的前端依赖（chrono-node 等）。
- 不改 note / quick 两种润色契约。
- 不为时间识别加确认 UI——识别结果直接落地，用户可通过既有闹钟按钮修正。
- 速记「AI 润色」关闭（polish=false）路径不做时间识别（原样存取）。
