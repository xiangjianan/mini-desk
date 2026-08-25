# 配对码注销联动与手机速记体验优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌面端清除/轮换配对码时注销中继数据（DELETE + 永久 410），手机端感知失效并可保留草稿换码；切到已配对空间立即拉取；手机端占位词区分、隐藏右下角提示、发送反馈动画。

**Architecture:** 后端（`server/` Flask+MySQL）新增 `revoked_keys` 永久注销表与 `DELETE /inbox/<key_hash>` 端点，POST 命中注销返回 410。前端在 `inboxClient.ts` 加 `revokeInboxKey()`，由 `App.vue` 的 `handleInboxUpdate` 在清除/轮换时对旧码触发；`MobileInboxCapture.vue` 负责失效提示、草稿上提（`defineModel`）与发送反馈；轮询 watch 扩展为「切到已配对空间立即拉取」。

**Tech Stack:** Vue 3（`defineModel` 可用，vue@latest）+ Naive UI + vitest（@vue/test-utils）；Flask + PyMySQL + pytest（真 MySQL）；spec：`docs/superpowers/specs/2026-08-25-inbox-code-revocation-and-mobile-ux-design.md`。

**参考事实（写死，避免实现时再找）：**
- 测试命令：前端 `npm test`（vitest 全量）；后端 `cd server && ./.venv/bin/python -m pytest`（本机 127.0.0.1:3306 root 免密）。
- `server/tests/conftest.py` 的 `db` fixture 每用例 TRUNCATE 表；`client` fixture 装好环境变量。
- `src/__tests__/app-render.test.ts` 已有：`stubMatchMedia(true)` 模拟手机壳、`mountApp()`、`flushAsyncComponents()`、"App inbox pull wiring" describe（`pullAllInboxes` 已文件级 mock）。
- 配对测试码固定 `AB2CDE4FGHJK`；`KEY = "a"*64`（后端测试）。
- i18n 键是 `src/state/i18n.ts` 内 `app` 对象的字段（zh 约 531-575 行，en 约 908-950 行），en 对象与 zh 同构，缺键会编译报错。

---

### Task 1: 后端——注销表 schema 与失败测试

**Files:**
- Modify: `server/schema.sql`
- Modify: `server/tests/conftest.py:39-46`（`db` fixture）
- Modify: `server/tests/test_inbox.py`（新增 `TestRevocation`；更新 405 断言）

- [ ] **Step 1: schema.sql 增加注销表**

在 `server/schema.sql` 末尾追加（保留现有 `inbox_items` 表不动）：

```sql
-- 注销记录：桌面端清除/轮换配对码时写入，永久保留（码永久有效，除非主动注销；
-- 注销后该 key_hash 的 POST 一律 410）。30 天保留期只清 inbox_items，不清本表。
CREATE TABLE revoked_keys (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  revoked_at BIGINT NOT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

- [ ] **Step 2: conftest 的 db fixture 同步清空新表**

`server/tests/conftest.py` 的 `db` fixture 中，把

```python
        cursor.execute("TRUNCATE TABLE inbox_items")
```

改为

```python
        cursor.execute("TRUNCATE TABLE inbox_items")
        cursor.execute("TRUNCATE TABLE revoked_keys")
```

- [ ] **Step 3: 写失败测试（test_inbox.py 末尾新增 + 更新既有断言）**

先更新既有 405 用例（`TestContract.test_method_not_allowed_with_allow_header`）：

```python
        assert response.headers["Allow"] == "GET, POST, DELETE, OPTIONS"
```

再在文件末尾追加：

```python
class TestRevocation:
    def test_delete_removes_items_and_revokes_future_posts(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "AAA"}).status_code == 200

        assert client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN}).status_code == 200
        assert client.delete(f"/inbox/{KEY}").get_json() == {"ok": True}  # 幂等

        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).status_code == 410
        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).get_json() == {"error": "revoked"}
        assert get(client, KEY).get_json()["items"] == []

    def test_delete_unknown_key_still_ok(self, client):
        assert client.delete(f"/inbox/{OTHER}").get_json() == {"ok": True}

    def test_delete_invalid_key_hash_404(self, client):
        assert client.delete("/inbox/XYZ").status_code == 404
        assert client.delete("/inbox/XYZ").get_json() == {"error": "not_found"}

    def test_revocation_is_per_key_hash(self, client):
        post(client, KEY, {"id": "i1", "payload": "AAA"})
        client.delete(f"/inbox/{KEY}")
        assert post(client, OTHER, {"id": "i1", "payload": "BBB"}).status_code == 200

    def test_revoked_keys_survive_retention_sweep(self, client, db):
        now = int(time.time() * 1000)
        with db.cursor() as cursor:
            cursor.execute(
                "INSERT INTO revoked_keys (key_hash, revoked_at) VALUES (%s, %s)",
                (KEY, now - 40 * 24 * 3600 * 1000),
            )
            cursor.execute(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s)",
                (OTHER, "stale", "OLD", now - 31 * 24 * 3600 * 1000),
            )

        assert post(client, OTHER, {"id": "fresh", "payload": "NEW"}).status_code == 200

        with db.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM inbox_items WHERE id = 'stale'")
            assert cursor.fetchone()[0] == 0  # inbox_items 过期行照常被清扫
            cursor.execute("SELECT COUNT(*) FROM revoked_keys WHERE key_hash = %s", (KEY,))
            assert cursor.fetchone()[0] == 1  # 注销记录不随清扫删除
        assert post(client, KEY, {"id": "x", "payload": "AAA"}).status_code == 410

    def test_cors_allows_delete(self, client):
        response = client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN})

        assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, DELETE, OPTIONS"
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_inbox.py -v`
Expected: `TestRevocation` 全部 FAIL（405 断言也 FAIL）；其余既有用例 PASS。

- [ ] **Step 5: Commit**

```bash
git add server/schema.sql server/tests/conftest.py server/tests/test_inbox.py
git commit -m "test: 注销端点契约测试（先红后绿）"
```

---

### Task 2: 后端——实现 DELETE 注销端点与 POST 410

**Files:**
- Modify: `server/app.py`

- [ ] **Step 1: 路由与 CORS 放行 DELETE**

`server/app.py` 中把

```python
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
```

改为

```python
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
```

`http_error` 中把

```python
    headers = {"Allow": "GET, POST, OPTIONS"} if err.code == 405 else None
```

改为

```python
    headers = {"Allow": "GET, POST, DELETE, OPTIONS"} if err.code == 405 else None
```

路由装饰器把

```python
    @app.route("/inbox/<key_hash>", methods=["GET", "POST", "OPTIONS"])
```

改为

```python
    @app.route("/inbox/<key_hash>", methods=["GET", "POST", "DELETE", "OPTIONS"])
```

路由体内把

```python
        if request.method == "POST":
            return handle_post(key_hash)
        return handle_get(key_hash)
```

改为

```python
        if request.method == "POST":
            return handle_post(key_hash)
        if request.method == "DELETE":
            return handle_delete(key_hash)
        return handle_get(key_hash)
```

- [ ] **Step 2: handle_post 前置注销检查**

`handle_post` 开头（`body = request.get_json(silent=True)` 之前）插入：

```python
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM revoked_keys WHERE key_hash = %s", (key_hash,))
            if cursor.fetchone() is not None:
                return error_response(410, "revoked")
```

并把模块顶部 docstring 第 3 行的「（多台桌面共用一个码，回收交给保留期清理）」更新为「（多台桌面共用一个码，回收交给保留期清理；DELETE 注销后 POST 一律 410，注销记录永久保留）」。

- [ ] **Step 3: 新增 handle_delete**

在 `handle_post` 之后新增：

```python
    def handle_delete(key_hash: str) -> tuple:
        # 注销：单事务清空该队列并登记注销记录；revoked_keys 永久保留（见设计文档）。
        # 幂等：重复注销、注销从未存在过的码均返回 ok。
        now = int(time.time() * 1000)
        with pymysql.connect(**database_kwargs()) as conn:
            conn.begin()
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM inbox_items WHERE key_hash = %s", (key_hash,))
                cursor.execute(
                    "INSERT INTO revoked_keys (key_hash, revoked_at) VALUES (%s, %s) "
                    "AS new ON DUPLICATE KEY UPDATE revoked_at = new.revoked_at",
                    (key_hash, now),
                )
            conn.commit()
        return jsonify({"ok": True})
```

- [ ] **Step 4: 运行测试确认全绿**

Run: `cd server && ./.venv/bin/python -m pytest -v`
Expected: 全部 PASS（含既有 16 个用例与 Task 1 新用例）。

- [ ] **Step 5: Commit**

```bash
git add server/app.py
git commit -m "feat: 中继新增配对码注销（DELETE 清队列+登记，POST 命中返回 410）"
```

---

### Task 3: 前端——revokeInboxKey、410 映射与失效文案（原子提交）

> `InboxPostFailure` 新增成员后，`MobileInboxCapture.errorTextFor` 的穷尽性检查（`const exhaustive: never`）会编译报错。
> 因此本任务把「类型扩展 + 状态映射 + 失效文案键」作为一个原子提交，避免中间提交类型红。

**Files:**
- Modify: `src/sync/inboxClient.ts`
- Modify: `src/state/i18n.ts`
- Modify: `src/components/MobileInboxCapture.vue`（仅 `errorTextFor`）
- Test: `src/__tests__/sync-inbox-client.test.ts`、`src/__tests__/mobile-inbox-capture.test.ts`

- [ ] **Step 1: 写失败测试（追加到 describe 内）**

```typescript
  it("410 映射为 code_revoked（配对码已注销）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":\"revoked\"}", { status: 410 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: false, reason: "code_revoked" });
  });

  it("revokeInboxKey：DELETE /inbox/:keyHash，成功 true、非 2xx/网络异常 false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"ok\":true}", { status: 200 })));
    expect(await revokeInboxKey(KEY)).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await revokeInboxKey(KEY)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await revokeInboxKey(KEY)).toBe(false);
  });

  it("revokeInboxKey 请求打到 DELETE /inbox/:keyHash 且无 body", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeInboxKey(KEY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith(`/inbox/${KEY}`)).toBe(true);
    expect(init.method).toBe("DELETE");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
```

文件顶部 import 行改为：

```typescript
import { fetchInboxItems, postInboxItem, revokeInboxKey } from "../sync/inboxClient";
```

`src/__tests__/mobile-inbox-capture.test.ts` describe 末尾追加（失效文案先落地，换码按钮在 Task 5）：

```typescript
  it("失败原因映射：code_revoked 提示配对码已失效", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "code_revoked" });
    const wrapper = mountCapture();
    await fillAndSend(wrapper, "死码内容");
    await until(() =>
      expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码已失效，可能已在桌面端被清除"),
    );
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/sync-inbox-client.test.ts src/__tests__/mobile-inbox-capture.test.ts`
Expected: 新用例 FAIL（`revokeInboxKey` 未导出/文案缺失）。

- [ ] **Step 3: 实现**

`src/sync/inboxClient.ts`：

类型联合改为

```typescript
export type InboxPostFailure = "rate_limited" | "queue_full" | "too_large" | "bad_request" | "code_revoked" | "server" | "network";
```

`postFailureForStatus` 中 `if (status === 409) ...` 之后插入一行：

```typescript
  if (status === 410) return "code_revoked";
```

文件末尾追加：

```typescript
/** 注销旧配对码（DELETE 清队列+登记）：失败一律 false，不抛异常——调用方照常清本地配对，仅气泡提示。 */
export async function revokeInboxKey(keyHash: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(inboxUrl(keyHash), { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
```

`src/state/i18n.ts`：zh 段 `mobileInboxErrorNetwork` 之后加

```typescript
      mobileInboxErrorRevoked: "配对码已失效，可能已在桌面端被清除",
```

en 段 `mobileInboxErrorNetwork` 之后加

```typescript
      mobileInboxErrorRevoked: "This pairing code is no longer active — it may have been cleared on the desktop",
```

`src/components/MobileInboxCapture.vue` 的 `errorTextFor` switch 中 `case "bad_request":` 之前插入：

```typescript
    case "code_revoked":
      return app.value.mobileInboxErrorRevoked;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/sync-inbox-client.test.ts src/__tests__/mobile-inbox-capture.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync/inboxClient.ts src/state/i18n.ts src/components/MobileInboxCapture.vue src/__tests__/sync-inbox-client.test.ts src/__tests__/mobile-inbox-capture.test.ts
git commit -m "feat: inboxClient 增加配对码注销请求与 410 失效映射"
```

---

### Task 4: 手机端——占位词区分与草稿上提（defineModel）

**Files:**
- Modify: `src/state/i18n.ts`（zh `app` 段 + en `app` 段）
- Modify: `src/components/MobileInboxCapture.vue`
- Test: `src/__tests__/mobile-inbox-capture.test.ts`、`src/__tests__/i18n.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/mobile-inbox-capture.test.ts`：

1) 「渲染标题…」用例中把

```typescript
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("记点什么（每行一条）…");
```

改为

```typescript
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("每行一条提醒，如：周五前取快递");
```

2) 文件末尾（describe 内）追加：

```typescript
  it("占位词随 kind 切换：便签给段落式提示", async () => {
    const wrapper = mountCapture();

    await wrapper.get('[data-testid="mobile-inbox-kind-note"]').trigger("click");

    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("写一段便签，可换行，换行会保留…");
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("aria-label")).toBe("写一段便签，可换行，换行会保留…");
    await wrapper.get('[data-testid="mobile-inbox-kind-todo"]').trigger("click");
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("每行一条提醒，如：周五前取快递");
  });

  it("草稿经 v-model 上提：外部初始值渲染、输入回传、卸载重挂不丢", async () => {
    const wrapper = mount(MobileInboxCapture, { props: { code: CODE, language: "zh", modelValue: "外部草稿" } });
    expect(draftValue(wrapper)).toBe("外部草稿");

    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("补充一行");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toBe("补充一行");

    // 换码场景：组件卸载后父级带着同一 v-model 值重挂，草稿仍在输入框。
    wrapper.unmount();
    const reborn = mount(MobileInboxCapture, { props: { code: "ZZ9YXW8VTSRQ", language: "zh", modelValue: "补充一行" } });
    expect(draftValue(reborn)).toBe("补充一行");
  });
```

`src/__tests__/i18n.test.ts` 末尾（describe 内）追加：

```typescript
  it("手机速记占位词按类型区分且中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxPlaceholderTodo).toBe("每行一条提醒，如：周五前取快递");
    expect(getUiText("zh").app.mobileInboxPlaceholderNote).toBe("写一段便签，可换行，换行会保留…");
    expect(getUiText("en").app.mobileInboxPlaceholderTodo).toBe("One reminder per line, e.g. Pick up the package Friday");
    expect(getUiText("en").app.mobileInboxPlaceholderNote).toBe("Write a note — line breaks are kept…");
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 新断言 FAIL（键不存在/占位词未区分）。

- [ ] **Step 3: 实现 i18n 键**

`src/state/i18n.ts` zh 段：把

```typescript
      mobileInboxPlaceholder: "记点什么（每行一条）…",
```

替换为

```typescript
      mobileInboxPlaceholderTodo: "每行一条提醒，如：周五前取快递",
      mobileInboxPlaceholderNote: "写一段便签，可换行，换行会保留…",
```

en 段：把

```typescript
      mobileInboxPlaceholder: "Type something… (one per line)",
```

替换为

```typescript
      mobileInboxPlaceholderTodo: "One reminder per line, e.g. Pick up the package Friday",
      mobileInboxPlaceholderNote: "Write a note — line breaks are kept…",
```

（zh 与 en 两处都必须改，en 缺键编译报错。）

- [ ] **Step 4: 实现 MobileInboxCapture 草稿上提与占位词**

`src/components/MobileInboxCapture.vue` script 部分：

1) import 行 `import { computed, ref } from "vue";` 改为 `import { computed, ref } from "vue";`（不变，确认即可）；
2) 把

```typescript
const draft = ref("");
```

改为

```typescript
// 草稿上提到父级（App.vue）：换码导致组件卸载重挂后内容不丢。
const draft = defineModel<string>({ default: "" });
```

3) `sentText` 定义之后追加：

```typescript
const placeholder = computed(() => (kind.value === "todo" ? app.value.mobileInboxPlaceholderTodo : app.value.mobileInboxPlaceholderNote));
```

template 中 textarea 的两个属性改为：

```html
        :placeholder="placeholder"
        :aria-label="placeholder"
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/state/i18n.ts src/components/MobileInboxCapture.vue src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts
git commit -m "feat: 手机速记占位词按提醒/便签区分，草稿上提 v-model"
```

---

### Task 5: 手机端——410 失效提示与「去更换配对码」

**Files:**
- Modify: `src/state/i18n.ts`
- Modify: `src/components/MobileInboxCapture.vue`
- Test: `src/__tests__/mobile-inbox-capture.test.ts`、`src/__tests__/i18n.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/mobile-inbox-capture.test.ts` describe 末尾追加：

```typescript
  it("410 失效：显示失效提示与换码按钮，点击 emit change-code，草稿保留", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "code_revoked" });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "死码内容");

    await until(() =>
      expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码已失效，可能已在桌面端被清除"),
    );
    expect(draftValue(wrapper)).toBe("死码内容");
    const change = wrapper.get('[data-testid="mobile-inbox-revoked-change"]');
    expect(change.text()).toBe("去更换配对码");
    await change.trigger("click");
    expect(wrapper.emitted("change-code")).toHaveLength(1);
  });

  it("多行发送中途 410：已成功行不重发，剩余行回输入框且换码按钮可见", async () => {
    let call = 0;
    postMock.mockImplementation(async () => (call++ === 0 ? { ok: true } : { ok: false, reason: "code_revoked" }));
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "第一条\n第二条");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码已失效，可能已在桌面端被清除"));
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(draftValue(wrapper)).toBe("第二条");
    expect(wrapper.find('[data-testid="mobile-inbox-revoked-change"]').exists()).toBe(true);
  });

  it("非失效错误不渲染换码按钮", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "network" });
    const wrapper = mountCapture();
    await fillAndSend(wrapper, "离线内容");
    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("网络异常，请检查网络后重试"));
    expect(wrapper.find('[data-testid="mobile-inbox-revoked-change"]').exists()).toBe(false);
  });
```

`src/__tests__/i18n.test.ts` 的占位词用例后追加断言（并入同一 it 或新开均可，新开）：

```typescript
  it("配对码失效提示与换码按钮文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxErrorRevoked).toBe("配对码已失效，可能已在桌面端被清除");
    expect(getUiText("zh").app.mobileInboxRevokedChange).toBe("去更换配对码");
    expect(getUiText("en").app.mobileInboxErrorRevoked).toBe("This pairing code is no longer active — it may have been cleared on the desktop");
    expect(getUiText("en").app.mobileInboxRevokedChange).toBe("Change pairing code");
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 新用例 FAIL。

- [ ] **Step 3: 实现 i18n 键**

zh 段 `mobileInboxErrorRevoked` 之后追加：

```typescript
      mobileInboxRevokedChange: "去更换配对码",
```

en 段 `mobileInboxErrorRevoked` 之后追加：

```typescript
      mobileInboxRevokedChange: "Change pairing code",
```

（`mobileInboxErrorRevoked` 已在 Task 3 落地。）

- [ ] **Step 4: 实现组件**

`src/components/MobileInboxCapture.vue` script：

1) emits 声明（props 之后）：

```typescript
const emit = defineEmits<{ "change-code": [] }>();
```

2) `errorTextFor` 的 `code_revoked` 分支已在 Task 3 落地，本任务不再改动。

3) 失效标记：`errorText` 声明旁新增

```typescript
/** 仅 code_revoked 时为 true：错误区据此渲染「去更换配对码」入口。 */
const codeRevoked = ref(false);
```

4) `failAt` 改为带原因（`errorText` 由映射产出，顺路维护 codeRevoked）：

```typescript
  /** 失败即停：未发送的行（含当前失败行）放回输入框，直接重试不会重复已成功的行。 */
  const failAt = (index: number, reason: InboxPostFailure): void => {
    status.value = "error";
    codeRevoked.value = reason === "code_revoked";
    errorText.value = errorTextFor(reason);
    draft.value = lines.slice(index).join("\n");
  };
```

原两处 `failAt(index, app.value.mobileInboxErrorNetwork)` / `failAt(0, app.value.mobileInboxErrorNetwork)` 调用改为 `failAt(index, "network")` / `failAt(0, "network")`；`failAt(index, errorTextFor(result.reason))` 改为 `failAt(index, result.reason)`。

5) `send()` 开头 `status.value = "sending";` 之后加一行复位：

```typescript
  codeRevoked.value = false;
```

template 错误 `<p>` 之后追加按钮（与 `<p>` 同级）：

```html
    <button
      v-if="status === 'error' && codeRevoked"
      type="button"
      class="mobile-inbox-revoked-change"
      data-testid="mobile-inbox-revoked-change"
      @click="emit('change-code')"
    >
      {{ app.mobileInboxRevokedChange }}
    </button>
```

`src/styles.css` 在 `.mobile-inbox-status[data-status="error"]` 规则后追加：

```css
button.mobile-inbox-revoked-change {
  justify-self: start;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line-main);
  border-radius: var(--radius-control);
  background: var(--panel);
  color: var(--accent-foreground);
  font-size: var(--app-font-size);
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/state/i18n.ts src/components/MobileInboxCapture.vue src/styles.css src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts
git commit -m "feat: 手机端感知配对码失效并提供保留草稿的换码入口"
```

---

### Task 6: 手机端——发送反馈动画与触觉

**Files:**
- Modify: `src/state/i18n.ts`
- Modify: `src/components/MobileInboxCapture.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/mobile-inbox-capture.test.ts`、`src/__tests__/i18n.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/mobile-inbox-capture.test.ts` describe 末尾追加：

```typescript
  it("发送成功：按钮进入 ✓已发送 态并自动复位，触觉反馈触发", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "动画内容");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-send"]').text()).toContain("已发送"));
    expect(wrapper.get('[data-testid="mobile-inbox-send"]').classes()).toContain("is-sent");
    expect(vibrate).toHaveBeenCalledWith(20);

    // 真实定时器等待自动复位（≈2.5s）。
    await new Promise((resolve) => setTimeout(resolve, 2800));
    expect(wrapper.get('[data-testid="mobile-inbox-send"]').text()).toBe("发送");
    expect(wrapper.find(".mobile-inbox-status").exists()).toBe(false);
  }, 10000);

  it("发送失败：错误行带抖动标记并触发失败触觉", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    postMock.mockResolvedValue({ ok: false, reason: "network" });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "抖动内容");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("网络异常，请检查网络后重试"));
    expect(wrapper.get('[data-testid="mobile-inbox-error"]').classes()).toContain("is-shake");
    expect(vibrate).toHaveBeenCalledWith([40, 60, 40]);
  });
```

`src/__tests__/i18n.test.ts` 的失效文案用例后追加（并入新 it 或原 it 皆可，新开）：

```typescript
  it("发送按钮成功态文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxSentButton).toBe("已发送");
    expect(getUiText("en").app.mobileInboxSentButton).toBe("Sent");
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 新用例 FAIL。

- [ ] **Step 3: 实现**

i18n：zh 段 `mobileInboxSending` 后加 `mobileInboxSentButton: "已发送",`；en 段对应位置加 `mobileInboxSentButton: "Sent",`。

`src/components/MobileInboxCapture.vue` script：

1) import 增加 `onBeforeUnmount`：

```typescript
import { computed, onBeforeUnmount, ref } from "vue";
```

2) 常量与工具（`sentText` 后）：

```typescript
const SENT_RESET_MS = 2500;
let sentResetTimer: number | undefined;

/** 触觉反馈：不支持的机型（iOS Safari）静默忽略。 */
function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

function clearSentResetTimer(): void {
  if (sentResetTimer !== undefined) {
    window.clearTimeout(sentResetTimer);
    sentResetTimer = undefined;
  }
}
```

3) `send()` 中 `status.value = "sending";` 后追加 `clearSentResetTimer();`；`failAt` 内 `status.value = "error";` 后追加 `vibrate([40, 60, 40]);`；成功收尾（`draft.value = "";` 之后）追加：

```typescript
  vibrate(20);
  sentResetTimer = window.setTimeout(() => {
    // 仍在 sent 态才复位：期间用户再次发送会重置定时器。
    if (status.value === "sent") {
      status.value = "idle";
      sentCount.value = 0;
    }
  }, SENT_RESET_MS);
```

4) 组件底部：

```typescript
onBeforeUnmount(clearSentResetTimer);
```

5) 发送按钮文案（template）：

```html
      <button
        type="button"
        class="mobile-inbox-send"
        :class="{ 'is-sent': status === 'sent' }"
        data-testid="mobile-inbox-send"
        :disabled="status === 'sending'"
        @click="send"
      >
        {{ status === "sending" ? app.mobileInboxSending : status === "sent" ? `✓ ${app.mobileInboxSentButton}` : app.mobileInboxSend }}
      </button>
```

6) 状态行动画标记：sent 的 `<p>` 加 `class="mobile-inbox-status is-slide-in"`（保留其余属性），error 的 `<p>` 加 `is-shake`：

```html
    <p v-if="status === 'sent'" class="mobile-inbox-status is-slide-in" role="status" aria-live="polite" data-status="sent">
      {{ sentText }}
    </p>
    <p
      v-else-if="status === 'error'"
      class="mobile-inbox-status is-shake"
      role="status"
      aria-live="polite"
      data-status="error"
      data-testid="mobile-inbox-error"
    >
      {{ errorText }}
    </p>
```

`src/styles.css` 在 `button.mobile-inbox-send:disabled` 规则后追加：

```css
button.mobile-inbox-send.is-sent {
  background: var(--primary);
  color: var(--primary-foreground);
  animation: mobile-inbox-pop 320ms var(--motion-ease, ease-out);
}

button.mobile-inbox-send:disabled {
  animation: mobile-inbox-pulse 1.2s ease-in-out infinite;
}

.mobile-inbox-status.is-slide-in {
  animation: mobile-inbox-slide-in 240ms ease-out;
}

.mobile-inbox-status.is-shake {
  animation: mobile-inbox-shake 360ms ease-in-out;
}

@keyframes mobile-inbox-pop {
  0% { transform: scale(0.92); }
  55% { transform: scale(1.04); }
  100% { transform: scale(1); }
}

@keyframes mobile-inbox-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes mobile-inbox-slide-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

@keyframes mobile-inbox-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  50% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  button.mobile-inbox-send.is-sent,
  button.mobile-inbox-send:disabled,
  .mobile-inbox-status.is-slide-in,
  .mobile-inbox-status.is-shake {
    animation: none;
  }
}
```

注意：已有 `button.mobile-inbox-send:disabled { opacity: 0.6; ... }` 规则保留（pulse 动画叠加其上），上面新增的是同名选择器的动画补充规则，直接追加即可。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 全部 PASS（成功复位用例真实等待 ~2.8s）。

- [ ] **Step 5: Commit**

```bash
git add src/state/i18n.ts src/components/MobileInboxCapture.vue src/styles.css src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts
git commit -m "feat: 手机速记发送成功/失败反馈动画与触觉"
```

---

### Task 7: App——配对后隐藏右下角提示、草稿接线与换码处理

**Files:**
- Modify: `src/App.vue`
- Test: `src/__tests__/app-render.test.ts`（手机壳 describe，参考 383-449 行既有用例）

- [ ] **Step 1: 写失败测试**

`src/__tests__/app-render.test.ts`「renders the mobile capture form directly when the URL carries a valid inbox fragment」用例（约 437 行）的断言区（`expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);` 之后）追加：

```typescript
      // 已配对进入速记态：右下角「建议在浏览器打开」伙伴气泡整体隐藏。
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);
```

同 describe 内新增用例（紧随其后）：

```typescript
  it("keeps the mobile companion hidden while paired and restores it after changing code", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await vi.advanceTimersByTimeAsync(10500);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

      // 点「更换配对码」：回到输码表单，伙伴气泡恢复、草稿保留。
      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("AB2CDE4FGHJK");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("preserves the capture draft across a code change and re-pairing", async () => {
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      wrapper = mountApp();

      await wrapper.get('[data-testid="mobile-inbox-text"]').setValue("换码前的想法");
      await wrapper.get('[data-testid="mobile-inbox-change-code"]').trigger("click");
      await wrapper.vm.$nextTick();
      await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue("AB2CDE4FGHJK");
      await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
      await wrapper.vm.$nextTick();

      const textarea = wrapper.get('[data-testid="mobile-inbox-text"]').element as HTMLTextAreaElement;
      expect(textarea.value).toBe("换码前的想法");
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
    }
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/app-render.test.ts -t "mobile"`
Expected: 新增两用例 FAIL（气泡仍显示/草稿丢失）；companion 断言 FAIL。

- [ ] **Step 3: 实现（App.vue）**

1) `activeCompanionVisible`（约 343 行）：

```typescript
const activeCompanionVisible = computed(() => (isMobileBlocked.value && mobileInboxCode.value === null) || companionVisible.value);
```

2) 草稿 ref：`mobileInboxCodeError` 声明（约 292 行）后加：

```typescript
// 手机速记草稿上提：换码卸载重挂（甚至跨会话内的多次换码）内容不丢。
const mobileInboxDraftText = ref("");
```

3) template（约 3326 行）：

```html
          <MobileInboxCapture v-model="mobileInboxDraftText" :code="mobileInboxCode" :language="state.language" @change-code="forgetMobileInboxCode" />
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/app-render.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: 已配对速记页隐藏右下角引导气泡并保留换码草稿"
```

---

### Task 8: App——清除/轮换联动注销旧码

**Files:**
- Modify: `src/state/i18n.ts`
- Modify: `src/App.vue`
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/app-render.test.ts` 顶部：文件级 mock 区（`vi.mock("../sync/pull", ...)` 之后）追加：

```typescript
// App 只消费 revokeInboxKey；postInboxItem/fetchInboxItems 保留真实现（经 mocked 的 pull.ts 隔离）。
vi.mock("../sync/inboxClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sync/inboxClient")>()),
  revokeInboxKey: vi.fn(async () => true),
}));
```

import 区追加：

```typescript
import { revokeInboxKey } from "../sync/inboxClient";
```

「App inbox pull wiring」describe 之后新增 describe：

```typescript
describe("App inbox revoke wiring", () => {
  function seedPaired(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          {
            ...defaultWorkspace(),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  beforeEach(() => {
    vi.mocked(revokeInboxKey).mockClear();
    vi.mocked(revokeInboxKey).mockResolvedValue(true);
  });

  async function openInboxDialog(wrapper: ReturnType<typeof mountApp>): Promise<void> {
    await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
    await flushAsyncComponents();
  }

  it("清除配对后对旧码 keyHash 发送注销且不弹失败警告", async () => {
    seedPaired();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-clear"]').trigger("click");
      await flushAsyncComponents();

      expect(revokeInboxKey).toHaveBeenCalledTimes(1);
      const [keyHash] = vi.mocked(revokeInboxKey).mock.calls[0];
      expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(wrapper.text()).not.toContain("云端清理失败");
    } finally {
      wrapper.unmount();
    }
  });

  it("轮换配对（新码≠旧码）同样注销旧码；保存未改码不注销", async () => {
    seedPaired();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-rotate"]').trigger("click");
      await flushAsyncComponents();
      expect(revokeInboxKey).toHaveBeenCalledTimes(1);

      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      expect(revokeInboxKey).toHaveBeenCalledTimes(1); // 新码原样保存：不再注销
    } finally {
      wrapper.unmount();
    }
  });

  it("注销失败时气泡警告云端清理失败", async () => {
    seedPaired();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(revokeInboxKey).mockResolvedValue(false);
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await wrapper.get('[data-testid="inbox-clear"]').trigger("click");
      await flushAsyncComponents();

      expect(wrapper.text()).toContain("云端清理失败，数据将在 30 天保留期内自动过期");
    } finally {
      wrapper.unmount();
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/app-render.test.ts -t "revoke"`
Expected: 三个用例 FAIL（revokeInboxKey 未被调用/无警告文案）。

- [ ] **Step 3: 实现**

i18n：zh 段 `inboxCleared` 后加

```typescript
      inboxRevokeFailed: "云端清理失败，数据将在 30 天保留期内自动过期",
```

en 段对应位置加

```typescript
      inboxRevokeFailed: "Cloud cleanup failed; queued data expires with the 30-day retention window",
```

`src/App.vue`：

1) import 区（`import { applyInboxItems, pullAllInboxes } from "./sync/pull";` 附近）追加：

```typescript
import { inboxKeyHash } from "./sync/crypto";
import { revokeInboxKey } from "./sync/inboxClient";
```

2) `handleInboxUpdate` 改为（在原函数末尾追加注销逻辑）：

```typescript
/** 配对弹窗更新/清除：按 id 不可变替换目标工作区并立即落盘。弹窗开合由弹窗自身的 close 事件驱动（轮换仅更新、不关闭）。 */
function handleInboxUpdate(inbox: WorkspaceInbox | null): void {
  const id = inboxPairingWorkspaceId.value;
  if (!id) return;
  const workspace = state.workspaces.find((item) => item.id === id);
  if (!workspace) return;
  const oldCode = workspace.inbox?.code;
  let next: WorkspaceData;
  if (inbox) {
    next = { ...workspace, inbox };
  } else {
    next = { ...workspace };
    delete next.inbox;
  }
  state.workspaces = state.workspaces.map((item) => (item.id === id ? next : item));
  persistNow();
  showBubbleText(inbox ? uiText.value.app.inboxSaved : uiText.value.app.inboxCleared, undefined, { hideCompanionAfter: true });
  // 清除或轮换（新码≠旧码）：旧码云端队列一并注销；失败不阻塞本地变更，仅气泡警告。
  if (oldCode !== undefined && (inbox === null || inbox.code !== oldCode)) {
    void revokeInbox(oldCode);
  }
}

/** 注销旧配对码：任何失败（网络/服务端/哈希异常）只提示，不抛出。 */
async function revokeInbox(oldCode: string): Promise<void> {
  try {
    const ok = await revokeInboxKey(await inboxKeyHash(oldCode));
    if (!ok) showBubbleText(uiText.value.app.inboxRevokeFailed, undefined, { hideCompanionAfter: true });
  } catch {
    showBubbleText(uiText.value.app.inboxRevokeFailed, undefined, { hideCompanionAfter: true });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/app-render.test.ts`
Expected: 全部 PASS（含既有 inbox 弹窗用例——若「clears workspace pairing…」用例因 revoke mock 未在该用例生效而网络超时，确认文件级 mock 已覆盖：revokeInboxKey 全文件被 mock，不会发真实请求）。

- [ ] **Step 5: Commit**

```bash
git add src/state/i18n.ts src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: 清除/轮换配对码时注销中继旧队列"
```

---

### Task 9: App——切到已配对空间立即拉取

**Files:**
- Modify: `src/App.vue`（`watch(hasInboxConfigured, ...)`，约 915 行）
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 写失败测试**

「App inbox pull wiring」describe 内（`seedPairedState` 旁）新增辅助与用例：

```typescript
  function seedMixedState(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        workspaces: [
          defaultWorkspace(),
          {
            ...defaultWorkspace("b"),
            inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 },
          },
        ],
      }),
    );
  }

  it("pulls immediately when switching to a paired workspace and stops on unpaired", async () => {
    seedMixedState();
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      // 启动停在未配对空间：零请求（既有行为）。
      expect(pullAllInboxes).not.toHaveBeenCalled();

      const app = wrapper.vm as unknown as { state: { activeWorkspaceId: string } };
      app.state.activeWorkspaceId = "b";
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);

      app.state.activeWorkspaceId = DEFAULT_WORKSPACE_ID;
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
    }
  });

  it("pulls on every switch between two paired workspaces", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState(),
        activeWorkspaceId: "a",
        workspaces: [
          { ...defaultWorkspace("a"), inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 } },
          { ...defaultWorkspace("b"), inbox: { code: "ZZ9YXW8VTSRQ", todoListId: "morning", noteTarget: DEFAULT_SPACE_ID, lastSeenAt: 7 } },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(1); // 启动拉取

      const app = wrapper.vm as unknown as { state: { activeWorkspaceId: string } };
      app.state.activeWorkspaceId = "b";
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(2);

      app.state.activeWorkspaceId = "a";
      await flushAsyncComponents();
      expect(pullAllInboxes).toHaveBeenCalledTimes(3);
    } finally {
      wrapper.unmount();
    }
  });
```

注意第二个用例的第二个码必须合法（Crockford base32 12 位，`MNPQRSTVWXYZ0123` 恰好 12 字符且不含 I/L/O/U）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/app-render.test.ts -t "pull wiring"`
Expected: 新两用例 FAIL（切换不触发拉取）；既有用例 PASS。

- [ ] **Step 3: 实现**

`src/App.vue` 把

```typescript
watch(hasInboxConfigured, (configured) => {
  if (configured) startInboxPolling();
  else stopInboxPolling();
});
```

改为

```typescript
// 轮询跟随当前活动空间：停未配对空间全静默；切到/配对成功已配对空间时除定时轮询外立即拉取一次
// （启动拉取仍由 onMounted 负责，此 watch 非 immediate，不产生重复）。
watch([() => state.activeWorkspaceId, hasInboxConfigured], ([, configured]) => {
  if (configured) {
    startInboxPolling();
    void pullInboxes();
  } else {
    stopInboxPolling();
  }
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/app-render.test.ts`
Expected: 全部 PASS（含「pulls inboxes exactly once on startup」——watch 非 immediate，启动仍只拉一次）。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: 切换到已配对工作区立即拉取收件箱"
```

---

### Task 10: 回归、构建与文档收尾

**Files:**
- Modify: `CLAUDE.md`（server 描述行）
- Modify: `docs/superpowers/specs/2026-08-25-inbox-code-revocation-and-mobile-ux-design.md`（如实现与设计有偏差，回写）

- [ ] **Step 1: 全量前端测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 2: 全量后端测试**

Run: `cd server && ./.venv/bin/python -m pytest`
Expected: 全部 PASS。

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: vue-tsc + vite 构建成功（defineModel、新 i18n 键、新导入无类型错误）。

- [ ] **Step 4: 更新 CLAUDE.md**

`server/` 描述段中「（协议与原 Cloudflare Worker 完全一致）」所在句子（「The mobile-inbox relay is self-hosted: `server/` is a Flask + MySQL app (protocol identical to the legacy Worker in `worker/`...)」）改为：

```markdown
The mobile-inbox relay is self-hosted: `server/` is a Flask + MySQL app (legacy-Worker-compatible protocol plus `DELETE /inbox/<key_hash>` revocation — clearing/rotating a pairing code purges its queue and permanently blocks further POSTs with 410). It runs on the aliyun host at `/opt/minidesk-inbox` behind nginx on `https://relay.minidesk.online:8443`; `server/deploy.sh` rsyncs and restarts it.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers
git commit -m "docs: 更新中继注销协议与收件箱拉取说明"
```

- [ ] **Step 6: 部署提示（人工步骤，不自动执行）**

1. aliyun 生产库建表（一次）：`ssh aliyun "mysql -u <user> -p <db> -e \"$(sed -n '/revoked_keys/,$p' server/schema.sql)\""`——以实际 `.env` 凭据为准。
2. `cd server && ./deploy.sh` 发布新后端。
3. 手机端真机验证走 `npm run preview:lan`（`crypto.subtle` 需安全上下文）。
4. 发版（版本号 + changelog）走既有 release 流程，另起提交。

---

## Self-Review 结论（已执行）

- **Spec 覆盖**：注销端点/410（Task 1-3,8）、清除失败警告（Task 8）、切空间立即拉取（Task 9）、占位词（Task 4）、失效提示+换码+草稿（Task 4,5,7）、隐藏右下角（Task 7）、发送反馈（Task 6）、CORS DELETE（Task 1-2）、注销记录永久保留（Task 1 测试显式覆盖）、回归与部署（Task 10）。
- **类型一致性**：`revokeInboxKey(keyHash): Promise<boolean>`、`InboxPostFailure` 增 `code_revoked`、`failAt(index, reason)`、`defineModel<string>` + `change-code` emit、i18n 键名在各任务间一致。
- **无占位符**：所有步骤含完整代码与命令。
