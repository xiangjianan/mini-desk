# 智能粘贴（Smart Paste）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在提醒事项区与便签区右键菜单的「粘贴」下方新增「智能粘贴」：剪贴板全文一次发给自建中继的 DeepSeek 润色（提醒区拆条 / 便签区排版），结果直接插入，任何失败退化为普通粘贴。

**Architecture:** 服务端在 relay 新增无状态同步端点 `POST /polish/<key_hash>`（鉴权复用 pairing_keys 注册制，直接调 `llm.polish_capture`，LLM 失败以 `200 {items:null,fallback:true}` 降级）。前端新增 `src/sync/polishClient.ts`（网络层）与 `src/utils/smartPaste.ts`（读剪贴板→限长→气泡→请求→落位/降级 的编排器）；两面板（TextPanel/TodoPanel）接菜单项并把气泡经 `polishMessage` 事件上浮给 App.vue 的 `showBubbleText`；配对码为全局可选字段 `state.polishCode`，首次使用生成并注册，清空数据时注销。

**Tech Stack:** Flask + pymysql（服务端，Python 3.9 兼容）；Vue 3 + TS + vitest/jsdom（前端）；pytest（服务端测试，需本地 MySQL 127.0.0.1:3306 root 免密）。

**设计文档:** `docs/superpowers/specs/2026-08-30-smart-paste-design.md`（已获用户批准）

**执行完成后的部署提示（不在本计划任务内）:** 服务端部署走 `server/deploy.sh`，且按既有教训 **rsync 后、restart 前必须在服务器上跑 `ssh aliyun "cd /opt/minidesk-inbox && ./.venv/bin/python -m py_compile app.py llm.py"`**（服务器 venv 是 Python 3.9）。前端随下次常规发布。

---

## File Structure

```
server/
  app.py                                  # 修改：+ MAX_POLISH_CHARS、/polish 路由、模块 docstring 一句
  tests/test_polish_endpoint.py            # 新增：端点契约测试
src/
  sync/
    config.ts                              # 修改：+ POLISH_FETCH_TIMEOUT_MS
    polishClient.ts                        # 新增：网络层 polishClipboardText + POLISH_MAX_CHARS
  utils/
    smartPaste.ts                          # 新增：runSmartPaste 编排器 + smartPasteMessages 文案组装
  state/
    types.ts                               # 修改：BoardState + polishCode?
    storage/serialize.ts                   # 修改：getSerializableState 带出 polishCode
    storage/normalize.ts                   # 修改：+ normalizePolishCode，shared 收敛导入码
    i18n.ts                                # 修改：zh/en 各 +6 条文案
  components/
    TextPanel.vue                          # 修改：菜单项 + 落位 + polishMessage 上浮
    SpacePanel.vue                         # 修改：polish prop / polishMessage 透传
    TodoPanel.vue                          # 修改：节头菜单项 + createFromText 落位 + 上浮
  App.vue                                  # 修改：polishClipboard + handlePolishStatus + clearData 注销 + 启动自愈
src/__tests__/
  sync-polish-client.test.ts               # 新增
  polish-code-state.test.ts                # 新增
  smart-paste.test.ts                      # 新增
  i18n.test.ts                             # 修改：+1 用例
  text-panel.test.ts                       # 修改：+4 用例
  space-panel.test.ts                      # 修改：+1 用例
  todo-panel.test.ts                       # 修改：+3 用例
CLAUDE.md                                  # 修改：relay 端点清单 + 智能粘贴一段
```

任务依赖：Task 1–5 相互独立可并行领取（但按序执行即可）；Task 6–8 依赖 Task 2/4/5；Task 9 依赖 6–8；Task 10 收尾。

---

### Task 1: 服务端 `/polish` 端点

**Files:**
- Modify: `server/app.py`
- Test: `server/tests/test_polish_endpoint.py`（新增）

- [ ] **Step 1: 写失败测试**

新建 `server/tests/test_polish_endpoint.py`：

```python
"""智能粘贴端点：注册制鉴权 + 结构校验 + kind 分支 + LLM 降级标记 + CORS。"""

import pytest

import llm as llm_module

ORIGIN = "https://todolist.pages.dev"
KEY = "a" * 64


@pytest.fixture(autouse=True)
def _registered(client):
    client.post(f"/inbox/{KEY}/register", headers={"Origin": ORIGIN})


@pytest.fixture
def polish(monkeypatch):
    """可控润色桩：默认两条结果；改 result 控制成败，calls 记录调用。"""
    stub = lambda: None  # noqa: E731
    stub.result = ["明天买牛奶", "交电费"]
    stub.calls = []

    def fake(kind, text):
        stub.calls.append((kind, text))
        return stub.result

    monkeypatch.setattr(llm_module, "polish_capture", fake)
    return stub


def post_polish(client, kind, text, key=KEY):
    return client.post(f"/polish/{key}", json={"kind": kind, "text": text}, headers={"Origin": ORIGIN})


class TestSuccess:
    def test_todo_kind_returns_items_and_passes_text(self, client, polish):
        response = post_polish(client, "todo", "买牛奶、交电费")

        assert response.status_code == 200
        assert response.get_json() == {"items": ["明天买牛奶", "交电费"]}
        assert polish.calls == [("todo", "买牛奶、交电费")]

    def test_note_kind_branch(self, client, polish):
        polish.result = ["1、要点A"]
        response = post_polish(client, "note", "一段想法")
        assert response.get_json() == {"items": ["1、要点A"]}
        assert polish.calls == [("note", "一段想法")]


class TestFallback:
    def test_llm_failure_returns_fallback_marker(self, client, polish):
        polish.result = None
        response = post_polish(client, "todo", "原文")
        assert response.status_code == 200
        assert response.get_json() == {"items": None, "fallback": True}

    def test_empty_llm_result_also_falls_back(self, client, polish):
        polish.result = []
        response = post_polish(client, "todo", "原文")
        assert response.get_json() == {"items": None, "fallback": True}


class TestAuth:
    def test_unknown_code_404_without_llm(self, client, polish):
        response = post_polish(client, "todo", "x", key="c" * 64)
        assert response.status_code == 404
        assert response.get_json() == {"error": "unknown_code"}
        assert polish.calls == []

    def test_revoked_code_410_without_llm(self, client, polish):
        client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN})
        response = post_polish(client, "todo", "x")
        assert response.status_code == 410
        assert response.get_json() == {"error": "revoked"}
        assert polish.calls == []


class TestValidation:
    def test_invalid_kind_400(self, client, polish):
        for kind in ["memo", 1, None]:
            response = client.post(f"/polish/{KEY}", json={"kind": kind, "text": "x"}, headers={"Origin": ORIGIN})
            assert response.status_code == 400
        assert polish.calls == []

    def test_blank_or_non_string_text_400(self, client, polish):
        for text in ["", "   ", 42, None]:
            response = client.post(f"/polish/{KEY}", json={"kind": "todo", "text": text}, headers={"Origin": ORIGIN})
            assert response.status_code == 400
        assert polish.calls == []

    def test_non_dict_body_400(self, client, polish):
        response = client.post(f"/polish/{KEY}", data="junk", content_type="text/plain", headers={"Origin": ORIGIN})
        assert response.status_code == 400
        assert polish.calls == []

    def test_over_2000_chars_413(self, client, polish):
        response = post_polish(client, "todo", "长" * 2001)
        assert response.status_code == 413
        assert response.get_json() == {"error": "too_large"}
        assert polish.calls == []

    def test_exactly_2000_chars_accepted(self, client, polish):
        polish.result = ["ok"]
        response = post_polish(client, "todo", "长" * 2000)
        assert response.status_code == 200


class TestCors:
    def test_whitelisted_origin_echoed(self, client, polish):
        response = post_polish(client, "todo", "x")
        assert response.headers["Access-Control-Allow-Origin"] == ORIGIN
        assert "POST" in response.headers["Access-Control-Allow-Methods"]

    def test_options_preflight_204(self, client):
        response = client.options(f"/polish/{KEY}", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"})
        assert response.status_code == 204
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && ./.venv/bin/python -m pytest tests/test_polish_endpoint.py -v
```

Expected: FAIL（404 not_found——`/polish` 路由尚不存在）。

- [ ] **Step 3: 实现端点**

`server/app.py` 三处修改：

(a) 常量区（`MAX_ID_LENGTH = 64` 之后）加：

```python
MAX_POLISH_CHARS = 2000
```

(b) 模块 docstring 末尾（`自建服务器无次数限制：只做输入校验，不做限流/配额。`之后）加一行：

```python
智能粘贴：POST /polish/<key_hash> 同步调 LLM 整理剪贴板文本（无状态不入库，鉴权同注册制）。
```

(c) `create_app()` 内、`inbox_status` 路由函数之后加：

```python
    @app.route("/polish/<key_hash>", methods=["POST", "OPTIONS"])
    def polish_text(key_hash: str):
        """智能粘贴：同步调 LLM 整理剪贴板文本，无状态、不入库。
        鉴权同 inbox（unknown 404 / revoked 410）；LLM 失败以 200 + fallback 标记降级，不用 5xx 表达业务降级。"""
        if request.method == "OPTIONS":
            return Response(status=204)
        if not is_valid_key_hash(key_hash):
            return error_response(404, "not_found")
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error_response(400, "bad_request")
        kind = body.get("kind")
        text = body.get("text")
        if kind not in ("todo", "note") or not isinstance(text, str) or not text.strip():
            return error_response(400, "bad_request")
        if len(text) > MAX_POLISH_CHARS:
            return error_response(413, "too_large")
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute("SELECT revoked_at FROM pairing_keys WHERE key_hash = %s", (key_hash,))
            key_row = cursor.fetchone()
        if key_row is None:
            return error_response(404, "unknown_code")
        if key_row["revoked_at"] is not None:
            return error_response(410, "revoked")
        try:
            items = llm.polish_capture(kind, text)
        except Exception:
            items = None  # polish_capture 自身不应抛出，双保险与 store_plain_items 同口径。
        if not items:
            return jsonify({"items": None, "fallback": True})
        return jsonify({"items": items})
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && ./.venv/bin/python -m pytest tests/test_polish_endpoint.py -v
```

Expected: PASS（全部用例）。再跑全量确认无回归：`./.venv/bin/python -m pytest`。

- [ ] **Step 5: Commit**

```bash
git add server/app.py server/tests/test_polish_endpoint.py
git commit -m "feat: 服务端新增 /polish 智能粘贴端点（注册制鉴权 + LLM 降级标记）"
```

---

### Task 2: 前端网络层 `polishClient.ts`

**Files:**
- Modify: `src/sync/config.ts`
- Create: `src/sync/polishClient.ts`
- Test: `src/__tests__/sync-polish-client.test.ts`（新增）

- [ ] **Step 1: 写失败测试**

新建 `src/__tests__/sync-polish-client.test.ts`：

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { POLISH_MAX_CHARS, polishClipboardText } from "../sync/polishClient";

const CODE = "AB2CDE4FGHJK";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("polishClient", () => {
  it("成功返回 items，请求打到 /polish/:keyHash 且带 kind/text body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: ["任务 A", "任务 B"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await polishClipboardText("todo", "杂乱文本", CODE)).toEqual({ items: ["任务 A", "任务 B"] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/polish/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "todo", text: "杂乱文本" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("note kind 原样透传", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: ["1、要点"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await polishClipboardText("note", "文本", CODE)).toEqual({ items: ["1、要点"] });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ kind: "note", text: "文本" });
  });

  it("LLM 降级标记映射为 fallback:true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: null, fallback: true }), { status: 200 })));
    expect(await polishClipboardText("note", "文本", CODE)).toEqual({ fallback: true });
  });

  it("非 2xx / 网络错误 / 结构非法 / 空条目一律返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 410 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: "nope" }), { status: 200 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
    expect(await polishClipboardText("todo", "文本", CODE)).toBeNull();
  });

  it("限长常量与服务端 MAX_POLISH_CHARS 对齐", () => {
    expect(POLISH_MAX_CHARS).toBe(2000);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/sync-polish-client.test.ts
```

Expected: FAIL（模块 `../sync/polishClient` 不存在）。

- [ ] **Step 3: 实现**

(a) `src/sync/config.ts` 末尾加：

```typescript
/** 智能粘贴单次请求超时：服务端 LLM 硬超时 30s，客户端必须更长，避免中途 abort 把将成的结果误判为失败。 */
export const POLISH_FETCH_TIMEOUT_MS = 35_000;
```

(b) 新建 `src/sync/polishClient.ts`：

```typescript
import { inboxKeyHash } from "./crypto";
import { INBOX_WORKER_URL, POLISH_FETCH_TIMEOUT_MS } from "./config";

export type PolishKind = "todo" | "note";

/** 成功：整理后的条目（服务端保证非空）；降级：LLM 失败（200 + fallback 标记）；null：网络/HTTP/结构非法。 */
export type PolishResult = { items: string[] } | { fallback: true } | null;

/** 与服务端 MAX_POLISH_CHARS 对齐：超长不请求，直接走原文粘贴。 */
export const POLISH_MAX_CHARS = 2000;

function polishUrl(keyHash: string): string {
  return `${INBOX_WORKER_URL.replace(/\/+$/, "")}/polish/${keyHash}`;
}

/** 响应收敛：{items:[...]} / {items:null,fallback:true} 之外的形状一律按失败（null）处理。 */
function coercePolishResponse(data: unknown): PolishResult {
  if (typeof data !== "object" || data === null) return null;
  const typed = data as { items?: unknown; fallback?: unknown };
  if (typed.fallback === true && typed.items === null) return { fallback: true };
  if (Array.isArray(typed.items) && typed.items.length > 0 && typed.items.every((item) => typeof item === "string")) {
    return { items: typed.items };
  }
  return null;
}

/** 智能粘贴请求：任何失败返回 null 不抛异常——调用方一律走「原文粘贴」兜底。 */
export async function polishClipboardText(kind: PolishKind, text: string, code: string): Promise<PolishResult> {
  try {
    const keyHash = await inboxKeyHash(code);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLISH_FETCH_TIMEOUT_MS);
    const response = await fetch(polishUrl(keyHash), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return null;
    return coercePolishResponse(await response.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/sync-polish-client.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync/config.ts src/sync/polishClient.ts src/__tests__/sync-polish-client.test.ts
git commit -m "feat: 前端 polishClient 智能粘贴网络层"
```

---

### Task 3: `state.polishCode` 字段贯通

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/storage/serialize.ts`
- Modify: `src/state/storage/normalize.ts`
- Test: `src/__tests__/polish-code-state.test.ts`（新增）

- [ ] **Step 1: 写失败测试**

新建 `src/__tests__/polish-code-state.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import { defaultState } from "../state/defaults";
import { getSerializableState, normalizeImportedState } from "../state/storage";

describe("state.polishCode", () => {
  it("序列化保留合法码、缺失时省略字段", () => {
    expect(getSerializableState({ ...defaultState(), polishCode: "AB2CDE4FGHJK" }).polishCode).toBe("AB2CDE4FGHJK");
    expect(getSerializableState(defaultState()).polishCode).toBeUndefined();
  });

  it("导入归一化：合法码保留，非法值丢弃", () => {
    const base = defaultState();
    expect(normalizeImportedState({ ...base, polishCode: "AB2CDE4FGHJK" }).polishCode).toBe("AB2CDE4FGHJK");
    expect(normalizeImportedState({ ...base, polishCode: "short" }).polishCode).toBeUndefined();
    expect(normalizeImportedState({ ...base, polishCode: 42 }).polishCode).toBeUndefined();
    expect(normalizeImportedState({ ...base }).polishCode).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/polish-code-state.test.ts
```

Expected: FAIL（TS 报 `polishCode` 不在 `BoardState` 上，或运行时 undefined）。

- [ ] **Step 3: 实现**

(a) `src/types.ts` `BoardState` 中 `customCompanionGifStored` 之后加：

```typescript
  /** 智能粘贴专用配对码（全局唯一，12 位 Crockford base32）：首次智能粘贴时生成并注册到中继。 */
  polishCode?: string;
```

(b) `src/state/storage/serialize.ts` `getSerializableState` 中 `customCompanionGifStored:` 一行之后加（保持显式列字段的注释约定）：

```typescript
    ...(state.polishCode ? { polishCode: state.polishCode } : {}),
```

(c) `src/state/storage/normalize.ts`：

`normalizeImportedState` 里 `const shared = {` 之前加一行、`shared` 对象末尾（`customCompanionGifStored: ...` 之后）加条件展开：

```typescript
  const polishCode = normalizePolishCode(typed.polishCode);
  const shared = {
    sync: normalizeSyncState(typed.sync),
    language,
    theme: normalizeThemeMode(typed.theme),
    companionGifTheme: normalizeCompanionGifTheme(typed.companionGifTheme),
    customCompanionGif: normalizeCustomCompanionGif(typed.customCompanionGif),
    customCompanionGifStored: normalizeCustomCompanionGifStored(typed.customCompanionGifStored, typed.customCompanionGif),
    ...(polishCode ? { polishCode } : {}),
  };
```

并在文件中 `normalizeWorkspaceInbox` 函数之后加归一化函数（`INBOX_CODE_PATTERN` 该文件已 import）：

```typescript
/** 智能粘贴配对码：合法 12 位码原样保留，其余（含空串/异型）丢弃——下次使用时重新生成。 */
export function normalizePolishCode(value: unknown): string | undefined {
  return typeof value === "string" && INBOX_CODE_PATTERN.test(value) ? value : undefined;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/polish-code-state.test.ts src/__tests__/state.test.ts src/__tests__/import-samples.test.ts
```

Expected: PASS（含既有归一化/导入样本无回归）。

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/state/storage/serialize.ts src/state/storage/normalize.ts src/__tests__/polish-code-state.test.ts
git commit -m "feat: state 新增全局 polishCode 配对码字段"
```

---

### Task 4: 智能粘贴编排器 `smartPaste.ts`

**Files:**
- Create: `src/utils/smartPaste.ts`
- Test: `src/__tests__/smart-paste.test.ts`（新增）

- [ ] **Step 1: 写失败测试**

新建 `src/__tests__/smart-paste.test.ts`：

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSmartPaste, smartPasteMessages } from "../utils/smartPaste";
import type { PolishResult } from "../sync/polishClient";

const MESSAGES = smartPasteMessages(
  {
    app: {
      polishWorking: "整理中",
      polishTodoDone: "已整理为 {count} 条提醒",
      polishNoteDone: "已排版为 {count} 行",
      polishFallback: "暂不可用",
      polishTooLarge: "过长",
    },
  },
  "todo",
);

function setup(clipboard: string | undefined, result: PolishResult) {
  const notify = vi.fn();
  const insert = vi.fn();
  Object.assign(navigator, { clipboard: { readText: vi.fn(async () => clipboard) } });
  return {
    notify,
    insert,
    run: () =>
      runSmartPaste({
        kind: "todo",
        polish: vi.fn(async () => result),
        messages: MESSAGES,
        insert,
        fallbackTexts: (raw) => raw.split("\n"),
        anchor: undefined,
        notify,
      }),
  };
}

afterEach(() => {
  Object.assign(navigator, { clipboard: undefined });
});

describe("runSmartPaste", () => {
  it("剪贴板为空/不可读时静默返回", async () => {
    for (const clipboard of [undefined, "", "   "]) {
      const { notify, insert, run } = setup(clipboard, { items: ["A"] });
      await run();
      expect(notify).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it("成功：先 working 后 done，插入整理条目并带条数文案", async () => {
    const { notify, insert, run } = setup("买牛奶、交电费", { items: ["买牛奶", "交电费"] });
    await run();

    expect(insert).toHaveBeenCalledWith(["买牛奶", "交电费"]);
    expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "done"]);
    expect(notify.mock.calls[1][1]).toBe("已整理为 2 条提醒");
  });

  it("降级：LLM 失败与网络失败都插入原文拆分并提示", async () => {
    for (const result of [{ fallback: true } as PolishResult, null]) {
      const { notify, insert, run } = setup("行A\n行B", result);
      await run();

      expect(insert).toHaveBeenCalledWith(["行A", "行B"]);
      expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "fallback"]);
      expect(notify.mock.calls[1][1]).toBe("暂不可用");
    }
  });

  it("超长：不调服务端，直接原文落位 + 限长提示", async () => {
    const { notify, insert, run } = setup("长".repeat(2001), { items: ["不该出现"] });
    await run();

    expect(insert).toHaveBeenCalledWith(["长".repeat(2001)]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toEqual(["fallback", "过长", undefined]);
  });
});

describe("smartPasteMessages", () => {
  it("按 kind 选择 done 模板并替换 {count}", () => {
    const todo = smartPasteMessages(
      { app: { polishWorking: "w", polishTodoDone: "{count} 条提醒", polishNoteDone: "{count} 行", polishFallback: "f", polishTooLarge: "t" } },
      "todo",
    );
    const note = smartPasteMessages(
      { app: { polishWorking: "w", polishTodoDone: "{count} 条提醒", polishNoteDone: "{count} 行", polishFallback: "f", polishTooLarge: "t" } },
      "note",
    );
    expect(todo.done(3)).toBe("3 条提醒");
    expect(note.done(5)).toBe("5 行");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/smart-paste.test.ts
```

Expected: FAIL（模块 `../utils/smartPaste` 不存在）。

- [ ] **Step 3: 实现**

新建 `src/utils/smartPaste.ts`：

```typescript
import { readClipboardText } from "./clipboard";
import { POLISH_MAX_CHARS, type PolishKind, type PolishResult } from "../sync/polishClient";

/** 气泡阶段：working=整理中（长驻，等结果替换），done=成功，fallback=降级为原文粘贴。 */
export type SmartPastePhase = "working" | "done" | "fallback";

export interface SmartPasteMessages {
  working: string;
  done: (count: number) => string;
  fallback: string;
  tooLarge: string;
}

export interface SmartPasteOptions {
  kind: PolishKind;
  /** 宿主注入的润色调用（内部完成配对码管理）；未注入时面板不渲染智能粘贴入口。 */
  polish: (kind: PolishKind, text: string) => Promise<PolishResult>;
  messages: SmartPasteMessages;
  /** 结果落位：成功=整理后的条目；失败/超长=原文的兜底拆分。 */
  insert: (texts: string[]) => void;
  /** 失败兜底时的原文拆分（便签=[原文整体]，提醒=按行拆条）。 */
  fallbackTexts: (raw: string) => string[];
  /** 气泡锚点：进入流程时解析一次，贯穿 working→done/fallback。 */
  anchor?: HTMLElement;
  notify: (phase: SmartPastePhase, message: string, anchor: HTMLElement | undefined) => void;
}

/** 智能粘贴编排：读剪贴板 → 限长预检 → 气泡「整理中」→ 服务端整理 → 落位/降级。
 *  最坏情况等于普通粘贴：任何失败都插入原文并提示。 */
export async function runSmartPaste(options: SmartPasteOptions): Promise<void> {
  const clipboardText = await readClipboardText();
  if (typeof clipboardText !== "string" || !clipboardText.trim()) return;
  const { anchor, notify, messages } = options;
  if (clipboardText.length > POLISH_MAX_CHARS) {
    options.insert(options.fallbackTexts(clipboardText));
    notify("fallback", messages.tooLarge, anchor);
    return;
  }
  notify("working", messages.working, anchor);
  const result = await options.polish(options.kind, clipboardText);
  if (result !== null && "items" in result && result.items.length > 0) {
    options.insert(result.items);
    notify("done", messages.done(result.items.length), anchor);
    return;
  }
  options.insert(options.fallbackTexts(clipboardText));
  notify("fallback", messages.fallback, anchor);
}

/** 从 uiText 组装两区域各自的文案（done 模板按 kind 区分，{count} 占位替换）。 */
export function smartPasteMessages(
  ui: { app: { polishWorking: string; polishTodoDone: string; polishNoteDone: string; polishFallback: string; polishTooLarge: string } },
  kind: PolishKind,
): SmartPasteMessages {
  const template = kind === "todo" ? ui.app.polishTodoDone : ui.app.polishNoteDone;
  return {
    working: ui.app.polishWorking,
    done: (count) => template.replace("{count}", () => String(count)),
    fallback: ui.app.polishFallback,
    tooLarge: ui.app.polishTooLarge,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/smart-paste.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/smartPaste.ts src/__tests__/smart-paste.test.ts
git commit -m "feat: 智能粘贴编排器 runSmartPaste"
```

---

### Task 5: i18n 文案（zh + en）

**Files:**
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/i18n.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/i18n.test.ts` 顶部 import 中补 `UI_TEXT`（与既有 import 合并到同一个 `from "../state/i18n"`），然后在 `describe("localized public copy", ...)` 内追加用例：

```typescript
  it("智能粘贴文案中英齐全", () => {
    expect(UI_TEXT.zh.common.smartPaste).toBe("智能粘贴");
    expect(UI_TEXT.en.common.smartPaste).toBe("Smart paste");
    for (const locale of [UI_TEXT.zh, UI_TEXT.en]) {
      expect(locale.app.polishWorking).toContain("✦");
      expect(locale.app.polishTodoDone).toContain("{count}");
      expect(locale.app.polishNoteDone).toContain("{count}");
      expect(locale.app.polishFallback).toBeTruthy();
      expect(locale.app.polishTooLarge).toBeTruthy();
    }
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/i18n.test.ts
```

Expected: FAIL（`smartPaste` 等键不存在）。

- [ ] **Step 3: 实现**

`src/state/i18n.ts` 四处插入（zh/en 各两处）：

(a) zh `common`（`paste: "粘贴",` 之后）：

```typescript
      smartPaste: "智能粘贴",
```

(b) zh `app`（`inboxImportNotice:` 一行之后）：

```typescript
      polishWorking: "✦ 整理中…",
      polishTodoDone: "已整理为 {count} 条提醒",
      polishNoteDone: "已排版为 {count} 行",
      polishFallback: "AI 整理暂不可用，已粘贴原文",
      polishTooLarge: "内容超过 2000 字，已直接粘贴原文",
```

(c) en `common`（`paste: "Paste",` 之后）：

```typescript
      smartPaste: "Smart paste",
```

(d) en `app`（`inboxImportNotice:` 一行之后）：

```typescript
      polishWorking: "✦ Organizing…",
      polishTodoDone: "Organized into {count} reminders",
      polishNoteDone: "Formatted into {count} lines",
      polishFallback: "AI polish is unavailable — pasted the original text",
      polishTooLarge: "Over 2,000 characters — pasted the original text",
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/i18n.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/state/i18n.ts src/__tests__/i18n.test.ts
git commit -m "feat: 智能粘贴中英文案"
```

---

### Task 6: TextPanel 集成（便签区）

**Files:**
- Modify: `src/components/TextPanel.vue`
- Test: `src/__tests__/text-panel.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/text-panel.test.ts`：

(a) import 行改为：

```typescript
import { flushPromises, mount } from "@vue/test-utils";
```

并在文件顶部 import 区加：

```typescript
import type { PolishResult } from "../sync/polishClient";
```

(b) `describe("TextPanel", ...)` 内追加四个用例：

```typescript
  it("shows the smart paste action below paste when polish is available", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("文本"), writeText: vi.fn() } });
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
        polish: vi.fn(),
      },
      global: {
        stubs: {
          Dropdown: menuDropdownStub,
          NDropdown: menuDropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    await wrapper.get("textarea").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["复制", "粘贴", "智能粘贴", "Tips"]);
    wrapper.unmount();
  });

  it("hides the smart paste action without a polish handler", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("文本"), writeText: vi.fn() } });
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: menuDropdownStub,
          NDropdown: menuDropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    await wrapper.get("textarea").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["复制", "粘贴", "Tips"]);
    wrapper.unmount();
  });

  it("smart paste inserts polished lines at the caret and bubbles working then done", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("杂乱文本"), writeText: vi.fn() } });
    const polish = vi.fn(async (): Promise<PolishResult> => ({ items: ["1、要点A", "2、要点B"] }));
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
        polish,
      },
      global: {
        stubs: {
          Dropdown: menuDropdownStub,
          NDropdown: menuDropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.get('[data-key="smart-paste"]').trigger("click");
    await flushPromises();

    expect(polish).toHaveBeenCalledWith("note", "杂乱文本");
    expect(textarea.value).toBe("root\n1、要点A\n2、要点B");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
      { text: "root", indent: 0 },
      { text: "1、要点A", indent: 0 },
      { text: "2、要点B", indent: 0 },
    ]);
    const statuses = wrapper.emitted("polishMessage") ?? [];
    expect(statuses.map((call) => call[0])).toEqual(["working", "done"]);
    expect(statuses[1][1]).toBe("已排版为 2 行");
    wrapper.unmount();
  });

  it("smart paste falls back to raw text when polish fails", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("原文内容"), writeText: vi.fn() } });
    const polish = vi.fn(async (): Promise<PolishResult> => null);
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
        polish,
      },
      global: {
        stubs: {
          Dropdown: menuDropdownStub,
          NDropdown: menuDropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.get('[data-key="smart-paste"]').trigger("click");
    await flushPromises();

    expect(textarea.value).toBe("root\n原文内容");
    const statuses = wrapper.emitted("polishMessage") ?? [];
    expect(statuses.map((call) => call[0])).toEqual(["working", "fallback"]);
    expect(statuses[1][1]).toBe("AI 整理暂不可用，已粘贴原文");
    wrapper.unmount();
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/text-panel.test.ts
```

Expected: 新用例 FAIL（菜单无「智能粘贴」/无 polishMessage 事件）。

- [ ] **Step 3: 实现**

`src/components/TextPanel.vue` 五处修改：

(a) 图标 import（`ClipboardOutline, CopyOutline, HelpCircleOutline` 中加入 `ColorWandOutline`）：

```typescript
import { ClipboardOutline, ColorWandOutline, CopyOutline, HelpCircleOutline } from "@vicons/ionicons5";
```

(b) 类型 import 区（`import EditableTitle from "./EditableTitle.vue";` 之前）加：

```typescript
import type { PolishKind, PolishResult } from "../sync/polishClient";
import { runSmartPaste, smartPasteMessages } from "../utils/smartPaste";
import type { SmartPastePhase } from "../utils/smartPaste";
```

(c) props 加可选项（`language?: AppLanguage;` 之后）：

```typescript
  polish?: (kind: PolishKind, text: string) => Promise<PolishResult>;
```

(d) emits 加（`guide: ...` 之后）：

```typescript
  polishMessage: [phase: SmartPastePhase, message: string, anchor: HTMLElement | undefined];
```

(e) `menuOptions` 中「粘贴」行之后条件插入智能粘贴项：

```typescript
    options.push({ label: uiText.value.common.paste, key: "paste", disabled: !menu.value?.canPaste, icon: renderIcon(ClipboardOutline) });
    if (props.polish) {
      options.push({ label: uiText.value.common.smartPaste, key: "smart-paste", disabled: !menu.value?.canPaste, icon: renderIcon(ColorWandOutline) });
    }
```

(f) `handleMenuSelect` 中 `if (key === "paste" && target) {...}` 块之后加：

```typescript
  if (key === "smart-paste" && target) {
    if (!canPaste) return;
    await smartPasteFromClipboard(target);
    return;
  }
```

(g) `pasteTextFromClipboard` 函数之后加两个函数：

```typescript
/** 智能粘贴（便签区）：剪贴板全文交服务端排版润色，失败退化为原文粘贴。 */
async function smartPasteFromClipboard(target: HTMLTextAreaElement): Promise<void> {
  if (!props.polish) return;
  await runSmartPaste({
    kind: "note",
    polish: props.polish,
    messages: smartPasteMessages(uiText.value, "note"),
    anchor: target.closest<HTMLElement>(".text-panel") ?? undefined,
    insert: (texts) => insertTextsAtSelection(target, texts),
    fallbackTexts: (raw) => [raw],
    notify: (phase, message, anchor) => emit("polishMessage", phase, message, anchor),
  });
}

/** 整理结果按行拼接待入光标选区：与普通粘贴同语义（进入编辑态、编号归一化、上报 update）。 */
function insertTextsAtSelection(target: HTMLTextAreaElement, texts: string[]): void {
  if (texts.length === 0) return;
  const range = getTextSelectionRange(target);
  if (!editing.value || target.readOnly) startEditingFromTextarea(target);
  target.setSelectionRange(range.start, range.end);
  target.setRangeText(texts.join("\n"), range.start, range.end, "end");
  normalizeTextareaText(target);
  emit("update", editorTextToLines(text.value));
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/text-panel.test.ts
```

Expected: PASS（含既有用例——未传 polish 的用例菜单不变）。

- [ ] **Step 5: Commit**

```bash
git add src/components/TextPanel.vue src/__tests__/text-panel.test.ts
git commit -m "feat: 便签区右键菜单接入智能粘贴"
```

---

### Task 7: SpacePanel 透传

**Files:**
- Modify: `src/components/SpacePanel.vue`
- Test: `src/__tests__/space-panel.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/space-panel.test.ts` 的 `describe` 内追加（`mountSpacePanel` 助手不带 polish，这里直接 mount）：

```typescript
  it("forwards the smart paste polish handler and status events to the text panel", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("杂乱文本"), writeText: vi.fn() } });
    const polish = vi.fn(async () => ({ items: ["1、要点"] }) as import("../sync/polishClient").PolishResult);
    const wrapper = mount(SpacePanel, {
      attachTo: document.body,
      props: {
        spaces: [{ id: "workspace", title: "工作空间", lines: [] }],
        activeSpaceId: "workspace",
        polish,
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.get('[data-key="smart-paste"]').trigger("click");
    await flushPromises();

    expect(polish).toHaveBeenCalledWith("note", "杂乱文本");
    expect((wrapper.emitted("polishMessage") ?? []).map((call) => call[0])).toEqual(["working", "done"]);
    wrapper.unmount();
  });
```

并把该文件顶部 `import { mount } from "@vue/test-utils";` 改为 `import { flushPromises, mount } from "@vue/test-utils";`。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/space-panel.test.ts
```

Expected: 新用例 FAIL（SpacePanel 不识别 polish prop / 不转发 polishMessage）。

- [ ] **Step 3: 实现**

`src/components/SpacePanel.vue` 三处修改：

(a) 类型 import 区加：

```typescript
import type { PolishKind, PolishResult } from "../sync/polishClient";
import type { SmartPastePhase } from "../utils/smartPaste";
```

(b) props 加（`moveTargets?: WorkspaceMoveTarget[];` 之后）：

```typescript
  polish?: (kind: PolishKind, text: string) => Promise<PolishResult>;
```

emits 加（`moveSpaceToWorkspace: ...` 之后）：

```typescript
  polishMessage: [phase: SmartPastePhase, message: string, anchor: HTMLElement | undefined];
```

(c) 模板中 `<TextPanel ...>`（`@blur="emit('blur')"` 之前）加两行：

```html
          :polish="props.polish"
          @polish-message="(phase, message, anchor) => emit('polishMessage', phase, message, anchor)"
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/space-panel.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/SpacePanel.vue src/__tests__/space-panel.test.ts
git commit -m "feat: SpacePanel 透传智能粘贴通道"
```

---

### Task 8: TodoPanel 集成（提醒区）

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/todo-panel.test.ts`：顶部加类型 import：

```typescript
import type { PolishResult } from "../sync/polishClient";
```

`describe("TodoPanel", ...)` 内追加三个用例：

```typescript
  it("section 菜单在粘贴下方显示智能粘贴（有 polish 时）", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("文本"), writeText: vi.fn() } });
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        titles: DEFAULT_TITLES,
        polish: vi.fn(),
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "清理已完成",
      "隐藏已完成",
      "粘贴",
      "智能粘贴",
      "新建列表",
      "编辑列表",
      "删除列表",
      "Tips",
    ]);
    wrapper.unmount();
  });

  it("智能粘贴成功：拆条落到右键所在列表并气泡提示", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("买牛奶、交电费"), writeText: vi.fn() } });
    const polish = vi.fn(async (): Promise<PolishResult> => ({ items: ["买牛奶", "交电费"] }));
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        titles: DEFAULT_TITLES,
        polish,
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("contextmenu");
    await wrapper.get('[data-key="smart-paste"]').trigger("click");
    await flushPromises();

    expect(polish).toHaveBeenCalledWith("todo", "买牛奶、交电费");
    expect(wrapper.emitted("createFromText")?.at(-1)).toEqual(["morning", ["买牛奶", "交电费"]]);
    const statuses = wrapper.emitted("polishMessage") ?? [];
    expect(statuses.map((call) => call[0])).toEqual(["working", "done"]);
    expect(statuses[1][1]).toBe("已整理为 2 条提醒");
    wrapper.unmount();
  });

  it("智能粘贴失败：按普通粘贴语义拆行落原文并提示", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue("行A\n行B"), writeText: vi.fn() } });
    const polish = vi.fn(async (): Promise<PolishResult> => null);
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        titles: DEFAULT_TITLES,
        polish,
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("contextmenu");
    await wrapper.get('[data-key="smart-paste"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("createFromText")?.at(-1)).toEqual(["morning", ["行A", "行B"]]);
    const statuses = wrapper.emitted("polishMessage") ?? [];
    expect(statuses.map((call) => call[0])).toEqual(["working", "fallback"]);
    wrapper.unmount();
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/todo-panel.test.ts
```

Expected: 新用例 FAIL。

- [ ] **Step 3: 实现**

`src/components/TodoPanel.vue` 五处修改：

(a) 图标 import 列表（`CheckmarkDoneOutline,` 与 `ChevronDownOutline,` 之间按字母序）加入 `ColorWandOutline,`。

(b) 类型/工具 import 区（`import EditableTitle from "./EditableTitle.vue";` 之前）加：

```typescript
import type { PolishKind, PolishResult } from "../sync/polishClient";
import { runSmartPaste, smartPasteMessages } from "../utils/smartPaste";
import type { SmartPastePhase } from "../utils/smartPaste";
```

(c) props 加（`moveTargets?: WorkspaceMoveTarget[];` 之后）：

```typescript
  polish?: (kind: PolishKind, text: string) => Promise<PolishResult>;
```

emits 加（`moveTodoToWorkspace: ...` 之后）：

```typescript
  polishMessage: [phase: SmartPastePhase, message: string, anchor: HTMLElement | undefined];
```

(d) `menuOptions` 的 `sectionActions` 分支中「粘贴」行之后条件插入：

```typescript
      { label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) },
      ...(props.polish
        ? [{ label: uiText.value.common.smartPaste, key: "smart-paste", icon: renderIcon(ColorWandOutline) }]
        : []),
```

(e) `handleMenuSelect` 中 `if (key === "paste" && !id) {...}` 块之后加：

```typescript
  if (key === "smart-paste" && !id) {
    closeMenu();
    if (!props.polish) return;
    await runSmartPaste({
      kind: "todo",
      polish: props.polish,
      messages: smartPasteMessages(uiText.value, "todo"),
      anchor: getTodoSectionAnchor(period),
      insert: (texts) => emit("createFromText", period, texts),
      fallbackTexts: splitDroppedTodoText,
      notify: (phase, message, anchor) => emit("polishMessage", phase, message, anchor),
    });
    return;
  }
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/todo-panel.test.ts
```

Expected: PASS（既有 section 菜单用例未传 polish，期望列表不变）。

- [ ] **Step 5: Commit**

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: 提醒区右键菜单接入智能粘贴"
```

---

### Task 9: App.vue 接线 + 清空注销 + CLAUDE.md

**Files:**
- Modify: `src/App.vue`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 实现 App.vue**

(a) import 区加（`import { checkInboxKeyStatus, registerInboxKey, revokeInboxKey } from "./sync/inboxClient";` 之后）：

```typescript
import { generateInboxCode, isValidInboxCode } from "./sync/pairing";
import { polishClipboardText } from "./sync/polishClient";
import type { PolishKind, PolishResult } from "./sync/polishClient";
import type { SmartPastePhase } from "./utils/smartPaste";
```

（注意先确认 `App.vue` 是否已 import `generateInboxCode`/`isValidInboxCode`——若已有则合并进既有 import，勿重复。）

(b) `registerInbox` 函数之后加：

```typescript
/** 智能粘贴气泡时长：整理中长驻（服务端 LLM 硬超时 30s + 余量，结果到达即替换），结果常规停留。 */
const POLISH_WORKING_BUBBLE_MS = 60_000;
const POLISH_RESULT_BUBBLE_MS = 4000;

// 智能粘贴配对码：全局唯一（鉴权只要求「已注册」）。会话内注册成功一次即缓存；
// 清空数据后 state.polishCode 消失，下次使用生成新码并重新注册。
let polishRegisteredCode: string | null = null;

/** 面板注入的智能粘贴调用：确保配对码存在且已注册后请求服务端润色；注册失败按网络失败（null）降级。 */
async function polishClipboard(kind: PolishKind, text: string): Promise<PolishResult> {
  let code = state.polishCode;
  if (!code || !isValidInboxCode(code)) {
    code = generateInboxCode();
    state.polishCode = code;
    persistNow();
  }
  if (polishRegisteredCode !== code) {
    // 注册与润色串行：未注册码的 /polish 会 404，首次使用必须先等注册完成。
    const registered = await registerInboxKey(await inboxKeyHash(code));
    if (!registered) return null;
    polishRegisteredCode = code;
  }
  return polishClipboardText(kind, text, code);
}

/** 面板上浮的智能粘贴气泡：working 长驻等结果替换，done/fallback 常规停留。 */
function handlePolishStatus(phase: SmartPastePhase, message: string, anchor?: HTMLElement): void {
  if (phase === "working") {
    showBubbleText(message, anchor, {}, POLISH_WORKING_BUBBLE_MS);
    return;
  }
  showBubbleText(message, anchor, { hideCompanionAfter: true }, POLISH_RESULT_BUBBLE_MS);
}
```

(c) `clearData` 中两处：`const doomedInboxCodes = ...` 行之后加 `const doomedPolishCode = state.polishCode;`；`doomedInboxCodes.forEach((code) => void revokeInbox(code));` 行之后加：

```typescript
      if (doomedPolishCode) void revokeInbox(doomedPolishCode);
```

(d) `onMounted` 里收件箱注册自愈循环（`if (workspace.inbox) registerInbox(workspace.inbox.code, false);` 的 for 循环）之后加：

```typescript
  // 智能粘贴配对码同样启动自愈注册（INSERT IGNORE 幂等；首次使用时仍会串行复核）。
  if (state.polishCode && isValidInboxCode(state.polishCode)) registerInbox(state.polishCode, false);
```

(e) 模板 `<TodoPanel ...>` 加 `:polish="polishClipboard"` 与 `@polish-message="handlePolishStatus"`；`<SpacePanel ...>` 同样加这两行。

- [ ] **Step 2: 更新 CLAUDE.md**

Development 一节 relay 描述句（`POST /inbox/<key_hash>/register` … 那一句）末尾、句号后追加：

```
`POST /polish/<key_hash>`（桌面端智能粘贴：`kind∈todo/note` + `text`≤2000 字符，同步返回 `{items:[...]}`，LLM 失败返回 `200 {items:null,fallback:true}`，鉴权同注册制）
```

该段之后新增一段：

```
桌面端智能粘贴：提醒事项/便签右键菜单「智能粘贴」把剪贴板全文发到 `/polish`（提醒区拆条成待办、便签区排版润色），结果直接插入、任何失败退化为原文粘贴并气泡提示。配对码为全局 `state.polishCode`（首次使用生成并注册，清空数据时注销）；编排器在 `src/utils/smartPaste.ts`，网络层在 `src/sync/polishClient.ts`，气泡经各面板 `polishMessage` 事件上浮到 App.vue 的 `showBubbleText`。
```

- [ ] **Step 3: 验证**

```bash
npx vitest run src/__tests__/app-render.test.ts src/__tests__/todo-panel.test.ts src/__tests__/text-panel.test.ts src/__tests__/space-panel.test.ts
npm run build
```

Expected: 测试 PASS（`app-render.test.ts` 既有 `Errors 1 error` IndexedDB 桩噪音可忽略，与本功能无关）；build 成功。

- [ ] **Step 4: Commit**

```bash
git add src/App.vue CLAUDE.md
git commit -m "feat: 桌面端接入智能粘贴主流程（配对码管理 + 气泡接线 + 清空注销）"
```

---

### Task 10: 全量回归

**Files:** 无新增修改（验证-only）。

- [ ] **Step 1: 前端全量**

```bash
npm test
```

Expected: 全绿。既有噪音勿追：`app-render.test.ts` 的 `Errors 1 error`（IndexedDB 桩 rejection）。

- [ ] **Step 2: 服务端全量**

```bash
cd server && ./.venv/bin/python -m pytest
```

Expected: 全绿。

- [ ] **Step 3: 构建**

```bash
npm run build
```

Expected: 成功。

- [ ] **Step 4: 人工冒烟（可选，需 dev 环境 + 本地 relay）**

`npm run dev` 后在便签/提醒区右键 → 「智能粘贴」：首次点击应看到「✦ 整理中…」长驻气泡与插入结果；断网时点击应退化为原文粘贴并提示。服务端联调可 `VITE_INBOX_WORKER_URL=http://127.0.0.1:8787` 指向本地 `gunicorn -b 127.0.0.1:8787 app:app`。

- [ ] **Step 5: 无需提交**（无代码变更；若有因回归修复产生的提交，按 `fix:` 前缀单独提交）。

---

## Self-Review 记录

- **Spec coverage**：设计文档逐条对照——入口两区域菜单（Task 6/8）、✦ 图标 ColorWandOutline（6/8）、直接插入（6/8）、全文一次调用（Task 4 编排单次 polish）、区域决定 kind（6=note/8=todo）、GIF 气泡提示（Task 9 handlePolishStatus 两档时长）、失败退化普通粘贴（Task 4 兜底分支）、>2000 字符不请求（Task 4 限长预检 + Task 1 服务端 413 双保险）、服务端鉴权 404/410（Task 1）、fallback 标记非 5xx（Task 1）、无状态/CORS 零改动（Task 1 TestCors）、polishCode 全局生成/注册/清空注销（Task 3/9）、i18n 双语（Task 5）、测试矩阵（1–8 各任务）。未覆盖项：无。
- **Placeholder scan**：无 TBD/TODO/「类似 Task N」；所有代码步骤含完整代码。
- **Type consistency**：`PolishKind`/`PolishResult`（polishClient 定义，2/4/6/7/8/9 使用一致）；`POLISH_MAX_CHARS`（2 定义、4 使用）；`SmartPastePhase`/`SmartPasteMessages`/`SmartPasteOptions`（4 定义，6/7/8/9 使用一致）；i18n 键名与 `smartPasteMessages` 结构参数一一对应；事件名 `polishMessage`（emit 声明）/`@polish-message`（模板）配对正确。
