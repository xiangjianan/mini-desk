# 配对码注册制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌面端生成/保存配对码时向中继注册 key_hash；未注册的码手机配对被拒（输码验证）、发送报 404（unknown_code）；存量码靠桌面启动自动注册无感迁移。

**Architecture:** 后端把 `revoked_keys` 升级为三态单表 `pairing_keys`（unknown/active/revoked，INSERT IGNORE 注册不复活注销行），新增 `POST /inbox/<hash>/register` 与 `GET /inbox/<hash>/status` 端点，POST 门控三分支。前端 `inboxClient` 增 `registerInboxKey`/`checkInboxKeyStatus`；App 桌面端启动+保存/轮换注册；手机端输码 async 验证（网络失败 fail-open），`InboxPostFailure` 增 `unknown_code` 与换码 CTA 共用。

**Tech Stack:** Flask + PyMySQL + pytest（本地 MySQL 127.0.0.1:3306 root 免密）；Vue 3 + TS + vitest。spec：`docs/superpowers/specs/2026-08-26-pairing-code-registration-design.md`。

**参考事实（已核实当前代码状态）：**
- `server/app.py` 现状：`handle_post` 单连接内 `SELECT 1 FROM revoked_keys` → 410；`handle_delete` 单事务 DELETE 队列 + upsert `revoked_keys`；CORS/405 方法串为 `GET, POST, DELETE, OPTIONS`。
- `server/tests/conftest.py` 的 `db` fixture TRUNCATE `inbox_items` + `revoked_keys`；`_schema` 用 `CLIENT.MULTI_STATEMENTS` 加载 schema.sql。
- `server/tests/test_inbox.py`：`KEY = "a"*64`、`OTHER = "b"*64`、`post()/get()` 助手；既有用例全部直接 POST（注册制上线后需先注册——用 autouse fixture 统一预注册，既有用例体零改动）。
- `src/sync/inboxClient.ts`：`postFailureForStatus` 已含 410→code_revoked；`revokeInboxKey` 在文件末尾。
- `src/components/MobileInboxCapture.vue`：`codeRevoked` ref + `failAt(index, reason)` + `errorTextFor`（带 `never` 穷尽校验）+ 换码按钮 `v-if="status === 'error' && codeRevoked"`（testid `mobile-inbox-revoked-change`）。
- `src/App.vue`：`confirmMobileInboxCode`（同步，`mobileInboxCodeError = ref(false)`）；`forgetMobileInboxCode`；onMounted 启动块在 `startVersionPolling()` 前有 `if (hasInboxConfigured.value) { void pullInboxes(); startInboxPolling(); }`；`handleInboxUpdate` 尾部注销分支 + `revokeInbox(oldCode)`（appMounted 守卫）；模板输码区约 3368-3400 行（`mobile-inbox-code-input` / `mobile-inbox-code-confirm` / `mobile-inbox-code-error`）。
- `src/__tests__/app-render.test.ts`：文件级 `vi.mock("../sync/inboxClient", ...)` 目前只覆盖 `revokeInboxKey: vi.fn(async () => true)`；全局 `beforeEach` 的 `vi.restoreAllMocks()` 不重置 vi.fn 工厂实现（仅 spyOn），模块级默认实现跨用例存活；`vi.mocked(...)` 断言惯例见 "App inbox revoke wiring" describe。

---

### Task 1+2: 后端——pairing_keys 三态表、注册/状态端点与 POST 门控

**Files:**
- Modify: `server/schema.sql`
- Create: `server/migrations/2026-08-26-pairing-keys.sql`
- Modify: `server/tests/conftest.py`（db fixture）
- Modify: `server/tests/test_inbox.py`
- Modify: `server/app.py`

> 按上一轮惯例：内部走 TDD（先红后绿），但**合并为一个绿灯提交**（main 上每个提交必须可测通过）。

- [ ] **Step 1: schema.sql 替换表**

把 `server/schema.sql` 中整个 `revoked_keys` 的 CREATE TABLE（含其上方两行注释）替换为：

```sql
-- 配对码注册表：三态——无行 unknown（从未注册）/ revoked_at IS NULL active / 非空 revoked。
-- 注册 INSERT IGNORE（不复活注销行）；表永久保留，30 天保留期只清 inbox_items。
CREATE TABLE pairing_keys (
  key_hash       CHAR(64) CHARACTER SET ascii NOT NULL,
  registered_at  BIGINT NOT NULL,
  revoked_at     BIGINT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

- [ ] **Step 2: 生产迁移脚本**

新建 `server/migrations/2026-08-26-pairing-keys.sql`：

```sql
-- 一次性生产迁移（root 手动执行，见 spec 迁移顺序：先发前端 1.0.146，再跑本脚本 + deploy.sh）。
-- 幂等可重跑：表不存在则建；backfill 用 INSERT IGNORE 防重复；DROP 用 IF EXISTS。
CREATE TABLE IF NOT EXISTS pairing_keys (
  key_hash       CHAR(64) CHARACTER SET ascii NOT NULL,
  registered_at  BIGINT NOT NULL,
  revoked_at     BIGINT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO pairing_keys (key_hash, registered_at, revoked_at)
  SELECT key_hash, revoked_at, revoked_at FROM revoked_keys;

DROP TABLE IF EXISTS revoked_keys;
```

- [ ] **Step 3: conftest db fixture**

`server/tests/conftest.py` 中把

```python
        cursor.execute("TRUNCATE TABLE inbox_items")
        cursor.execute("TRUNCATE TABLE revoked_keys")
```

改为

```python
        cursor.execute("TRUNCATE TABLE inbox_items")
        cursor.execute("TRUNCATE TABLE pairing_keys")
```

- [ ] **Step 4: 测试改造与新增（先写，跑红）**

`server/tests/test_inbox.py`：

1) 在 `get()` 助手后新增：

```python
def register(client, key_hash, origin=ORIGIN):
    return client.post(f"/inbox/{key_hash}/register", headers={"Origin": origin})


import pytest


@pytest.fixture(autouse=True)
def _preregistered_keys(client):
    """注册制默认钥匙：既有契约用例零改动直接可用；unknown 语义用独立新 hash 覆盖。"""
    register(client, KEY)
    register(client, OTHER)
```

（`import pytest` 放文件顶部与 `import time` 并列，不放在中间。）

2) `TestContract.test_post_get_roundtrip_sorted_with_cors` 保持不变（autouse 已注册）。`test_method_not_allowed_with_allow_header` 保持不变。

3) `TestRetention.test_revoked_keys_survive_retention_sweep` 中种数据的

```python
            cursor.execute(
                "INSERT INTO revoked_keys (key_hash, revoked_at) VALUES (%s, %s)",
                (KEY, now - 40 * 24 * 3600 * 1000),
            )
```

改为

```python
            cursor.execute(
                "INSERT INTO pairing_keys (key_hash, registered_at, revoked_at) VALUES (%s, %s, %s) "
                "AS new ON DUPLICATE KEY UPDATE revoked_at = new.revoked_at",
                (KEY, now - 40 * 24 * 3600 * 1000, now - 40 * 24 * 3600 * 1000),
            )
```

并把其后两处 `FROM revoked_keys` 的断言查询改为 `FROM pairing_keys WHERE key_hash = %s`（保留参数 `(KEY,)`）。

4) 新增两个测试类（文件末尾）：

```python
class TestRegistration:
    def test_unregistered_key_post_404_get_permissive(self, client):
        fresh = "c" * 64
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 404
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).get_json() == {"error": "unknown_code"}
        # GET 宽松：未知码返回空列表不报错（升级窗口容错）。
        assert get(client, fresh).get_json()["items"] == []

    def test_register_idempotent_and_enables_posts(self, client):
        fresh = "d" * 64
        assert register(client, fresh).status_code == 200
        assert register(client, fresh).get_json() == {"ok": True}
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 200

    def test_register_does_not_revive_revoked(self, client):
        fresh = "e" * 64
        register(client, fresh)
        assert client.delete(f"/inbox/{fresh}").status_code == 200
        assert register(client, fresh).get_json() == {"ok": True}
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 410

    def test_status_three_states(self, client):
        fresh = "f" * 64
        assert client.get(f"/inbox/{fresh}/status").get_json() == {"status": "unknown"}
        register(client, fresh)
        assert client.get(f"/inbox/{fresh}/status").get_json() == {"status": "active"}
        client.delete(f"/inbox/{fresh}")
        assert client.get(f"/inbox/{fresh}/status").get_json() == {"status": "revoked"}

    def test_delete_unregistered_marks_revoked(self, client):
        fresh = "1" * 64
        assert client.delete(f"/inbox/{fresh}").get_json() == {"ok": True}
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 410

    def test_register_and_status_invalid_hash_404(self, client):
        assert client.post("/inbox/XYZ/register").status_code == 404
        assert client.get("/inbox/XYZ/status").status_code == 404


class TestRegisterCors:
    def test_register_preflight_allows_post(self, client):
        preflight = client.open(
            f"/inbox/{KEY}/register", method="OPTIONS", headers={"Origin": ORIGIN}
        )
        assert preflight.status_code == 204
        assert preflight.headers["Access-Control-Allow-Origin"] == ORIGIN
```

5) 既有 `TestRevocation` 全部用例在 autouse 注册后仍应通过（它们操作 KEY/OTHER，先注册后 DELETE/POST 的语义不变）。

- [ ] **Step 5: 跑红**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_inbox.py -v`
Expected: `TestRegistration` 全 FAIL（路由不存在→404 not_found 而非预期）、`TestRegisterCors` FAIL；既有用例因 revoked_keys 表被 schema 换名而 ERROR/FAIL（conftest TRUNCATE pairing_keys 也报错）。

- [ ] **Step 6: 实现 app.py**

1) 模块 docstring 第 3-4 行改为：

```
路由键是 SHA-256(配对码) 的 hex；条目保留 30 天，无账号、无按条删除（回收交给保留期清理）。
注册制：pairing_keys 三态（unknown/active/revoked），桌面端保存/轮换/启动时注册，
未注册码 POST 404、已注销码 POST 410（注销即永久，注册不复活）。幂等：同 id 覆盖。
```

2) `inbox` 路由之后新增两个路由：

```python
    @app.route("/inbox/<key_hash>/register", methods=["POST", "OPTIONS"])
    def inbox_register(key_hash: str):
        if request.method == "OPTIONS":
            return Response(status=204)
        if not is_valid_key_hash(key_hash):
            return error_response(404, "not_found")
        # INSERT IGNORE：幂等，且不复活已注销行（注销即永久）。
        now = int(time.time() * 1000)
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute(
                "INSERT IGNORE INTO pairing_keys (key_hash, registered_at) VALUES (%s, %s)",
                (key_hash, now),
            )
        return jsonify({"ok": True})

    @app.route("/inbox/<key_hash>/status", methods=["GET"])
    def inbox_status(key_hash: str):
        if not is_valid_key_hash(key_hash):
            return error_response(404, "not_found")
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute("SELECT revoked_at FROM pairing_keys WHERE key_hash = %s", (key_hash,))
            row = cursor.fetchone()
        if row is None:
            status = "unknown"
        elif row["revoked_at"] is not None:
            status = "revoked"
        else:
            status = "active"
        return jsonify({"status": status})
```

3) `handle_post` 中把

```python
            cursor.execute("SELECT 1 FROM revoked_keys WHERE key_hash = %s", (key_hash,))
            if cursor.fetchone() is not None:
                return error_response(410, "revoked")
```

改为

```python
            cursor.execute("SELECT revoked_at FROM pairing_keys WHERE key_hash = %s", (key_hash,))
            key_row = cursor.fetchone()
            if key_row is None:
                return error_response(404, "unknown_code")
            if key_row["revoked_at"] is not None:
                return error_response(410, "revoked")
```

4) `handle_delete` 中把 revoked_keys 的 upsert 改为（未注册码被清除也落 revoked 行）：

```python
                cursor.execute(
                    "INSERT INTO pairing_keys (key_hash, registered_at, revoked_at) VALUES (%s, %s, %s) "
                    "AS new ON DUPLICATE KEY UPDATE revoked_at = new.revoked_at",
                    (key_hash, now, now),
                )
```

注释同步改为「注销：单事务清空该队列并在 pairing_keys 置 revoked（未注册过的码也落 revoked 行）；注销即永久。」

- [ ] **Step 7: 跑绿（全量）**

Run: `cd server && ./.venv/bin/python -m pytest -v`
Expected: 全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add server/schema.sql server/migrations server/tests/conftest.py server/tests/test_inbox.py server/app.py
git commit -m "feat: 中继配对码注册制（pairing_keys 三态，未注册码 POST 404）"
```

---

### Task 3: 前端——registerInboxKey / checkInboxKeyStatus / unknown_code 全链路（原子提交）

> `InboxPostFailure` 新增 `"unknown_code"` 会触发 `errorTextFor` 的 never 穷尽校验，类型+映射+文案+CTA 必须同一提交。

**Files:**
- Modify: `src/sync/inboxClient.ts`
- Modify: `src/state/i18n.ts`
- Modify: `src/components/MobileInboxCapture.vue`
- Test: `src/__tests__/sync-inbox-client.test.ts`、`src/__tests__/mobile-inbox-capture.test.ts`、`src/__tests__/i18n.test.ts`

- [ ] **Step 1: 失败测试**

`src/__tests__/sync-inbox-client.test.ts`（describe 内追加；import 行改为 `import { checkInboxKeyStatus, fetchInboxItems, postInboxItem, registerInboxKey, revokeInboxKey } from "../sync/inboxClient";`）：

```typescript
  it("404 映射为 unknown_code（配对码未注册）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":\"unknown_code\"}", { status: 404 })));
    expect(await postInboxItem(KEY, "i1", "AAA")).toEqual({ ok: false, reason: "unknown_code" });
  });

  it("registerInboxKey：POST /register 幂等注册，成功 true、非 2xx/网络异常 false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"ok\":true}", { status: 200 })));
    expect(await registerInboxKey(KEY)).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await registerInboxKey(KEY)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await registerInboxKey(KEY)).toBe(false);
  });

  it("registerInboxKey 请求形状：POST /inbox/:keyHash/register 且带 AbortSignal", async () => {
    const fetchMock = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await registerInboxKey(KEY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith(`/inbox/${KEY}/register`)).toBe(true);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("checkInboxKeyStatus：解析三态，网络/非 2xx/结构非法返回 null", async () => {
    for (const status of ["active", "revoked", "unknown"] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status }), { status: 200, headers: { "Content-Type": "application/json" } })));
      expect(await checkInboxKeyStatus(KEY)).toBe(status);
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await checkInboxKeyStatus(KEY)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await checkInboxKeyStatus(KEY)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"status\":\"weird\"}", { status: 200, headers: { "Content-Type": "application/json" } })));
    expect(await checkInboxKeyStatus(KEY)).toBeNull();
  });
```

`src/__tests__/mobile-inbox-capture.test.ts`（describe 末尾追加）：

```typescript
  it("发送遇 unknown_code：显示未注册文案且换码按钮可见", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "unknown_code" });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "未注册码内容");

    await until(() =>
      expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码不存在，请到桌面端重新配对"),
    );
    expect(wrapper.find('[data-testid="mobile-inbox-revoked-change"]').exists()).toBe(true);
    expect(draftValue(wrapper)).toBe("未注册码内容");
  });
```

`src/__tests__/i18n.test.ts`（describe 内追加）：

```typescript
  it("配对码注册制相关文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxErrorUnknown).toBe("配对码不存在，请到桌面端重新配对");
    expect(getUiText("en").app.mobileInboxErrorUnknown).toBe("This pairing code doesn't exist; re-pair on the desktop");
  });
```

- [ ] **Step 2: 跑红**

Run: `npm test -- src/__tests__/sync-inbox-client.test.ts src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 新用例 FAIL（导出缺失/文案缺失）。

- [ ] **Step 3: 实现**

`src/sync/inboxClient.ts`：

1) 类型与映射：

```typescript
export type InboxPostFailure = "rate_limited" | "queue_full" | "too_large" | "bad_request" | "code_revoked" | "unknown_code" | "server" | "network";

export type InboxKeyStatus = "active" | "revoked" | "unknown";
```

`postFailureForStatus` 中 `if (status === 410) ...` 之后插入：

```typescript
  if (status === 404) return "unknown_code";
```

2) 文件末尾追加：

```typescript
/** 注册配对码（桌面端保存/轮换/启动时调用）：失败一律 false，不抛异常——调用方仅提示或静默重试。 */
export async function registerInboxKey(keyHash: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${inboxUrl(keyHash)}/register`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

/** 查询配对码状态（手机输码验证用）：网络/非 2xx/结构非法一律 null，调用方 fail-open。 */
export async function checkInboxKeyStatus(keyHash: string): Promise<InboxKeyStatus | null> {
  try {
    const response = await fetchWithTimeout(`${inboxUrl(keyHash)}/status`);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const status = typeof data === "object" && data !== null ? (data as { status?: unknown }).status : undefined;
    return status === "active" || status === "revoked" || status === "unknown" ? status : null;
  } catch {
    return null;
  }
}
```

`src/state/i18n.ts`（zh/en 两块都要，en 缺键编译报错）：
- zh `mobileInboxErrorRevoked` 之后加 `mobileInboxErrorUnknown: "配对码不存在，请到桌面端重新配对",`
- en `mobileInboxErrorRevoked` 之后加 `mobileInboxErrorUnknown: "This pairing code doesn't exist; re-pair on the desktop",`

`src/components/MobileInboxCapture.vue`：
1) `errorTextFor` 的 switch 中 `case "code_revoked":` 之后插入：

```typescript
    case "unknown_code":
      return app.value.mobileInboxErrorUnknown;
```

2) `codeRevoked` ref 更名扩展语义（三处同步：声明、`send()` 开头复位、`failAt` 赋值）：

```typescript
/** code_revoked / unknown_code 时为 true：错误区据此渲染「去更换配对码」入口。 */
const codeUnusable = ref(false);
```

`send()` 开头 `codeRevoked.value = false;` → `codeUnusable.value = false;`；`failAt` 内 `codeRevoked.value = reason === "code_revoked";` → `codeUnusable.value = reason === "code_revoked" || reason === "unknown_code";`；模板按钮 `v-if="status === 'error' && codeRevoked"` → `v-if="status === 'error' && codeUnusable"`。

- [ ] **Step 4: 跑绿**

Run: `npm test -- src/__tests__/sync-inbox-client.test.ts src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sync/inboxClient.ts src/state/i18n.ts src/components/MobileInboxCapture.vue src/__tests__/sync-inbox-client.test.ts src/__tests__/mobile-inbox-capture.test.ts src/__tests__/i18n.test.ts
git commit -m "feat: 前端配对码注册制基础（注册/查询客户端与 unknown_code 失效链路）"
```

---

### Task 4: App 桌面端——启动/保存轮换注册 + 失败警告

**Files:**
- Modify: `src/App.vue`
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 失败测试**

`src/__tests__/app-render.test.ts`：

1) 文件级 `vi.mock("../sync/inboxClient", ...)` 扩展为：

```typescript
// App 只消费 revokeInboxKey/registerInboxKey/checkInboxKeyStatus；其余保留真实现（经 mocked 的 pull.ts 隔离）。
vi.mock("../sync/inboxClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sync/inboxClient")>()),
  revokeInboxKey: vi.fn(async () => true),
  registerInboxKey: vi.fn(async () => true),
  checkInboxKeyStatus: vi.fn(async () => "active"),
}));
```

import 行扩为 `import { checkInboxKeyStatus, registerInboxKey, revokeInboxKey } from "../sync/inboxClient";`

2) "App inbox revoke wiring" describe 之后新增：

```typescript
describe("App inbox register wiring", () => {
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
    vi.mocked(registerInboxKey).mockClear();
    vi.mocked(registerInboxKey).mockResolvedValue(true);
  });

  async function openInboxDialog(wrapper: ReturnType<typeof mountApp>): Promise<void> {
    await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
    await flushAsyncComponents();
  }

  it("启动时对所有已配对工作区的码各注册一次（存量迁移路径），未配对不发", async () => {
    seedPaired();
    const wrapper = mountApp();

    try {
      await flushAsyncComponents();
      expect(registerInboxKey).toHaveBeenCalledTimes(1);
      const [keyHash] = vi.mocked(registerInboxKey).mock.calls[0];
      expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      wrapper.unmount();
    }
  });

  it("配对弹窗保存后注册当前码；注册失败弹警告", async () => {
    seedPaired();
    const wrapper = mountApp();

    try {
      await openInboxDialog(wrapper);
      await flushAsyncComponents();
      const callsAfterStartup = vi.mocked(registerInboxKey).mock.calls.length;

      vi.mocked(registerInboxKey).mockResolvedValueOnce(true);
      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      expect(vi.mocked(registerInboxKey).mock.calls.length).toBe(callsAfterStartup + 1);

      vi.mocked(registerInboxKey).mockResolvedValueOnce(false);
      await wrapper.get('[data-testid="workspace-trigger"]').trigger("click");
      await wrapper.get('[data-testid="workspace-pair-default"]').trigger("click");
      await flushAsyncComponents();
      await wrapper.get('[data-testid="inbox-save"]').trigger("click");
      await flushAsyncComponents();
      expect(wrapper.text()).toContain("配对码注册失败，手机暂时无法配对，下次启动会自动重试");
    } finally {
      wrapper.unmount();
    }
  });
});
```

（第二个用例复开弹窗走完整 openInboxDialog；若 NModal 二次打开有交互差异，以实际 DOM 为准调整——不允许删断言，只允许修交互路径。）

- [ ] **Step 2: 跑红**

Run: `npm test -- src/__tests__/app-render.test.ts -t "register wiring"`
Expected: 两用例 FAIL（registerInboxKey 未被调用/无警告文案）。

- [ ] **Step 3: 实现**

`src/state/i18n.ts`：zh `inboxRevokeFailed` 后加 `inboxRegisterFailed: "配对码注册失败，手机暂时无法配对，下次启动会自动重试",`；en 对应位置加 `inboxRegisterFailed: "Pairing-code registration failed; phones can't pair for now — it retries on next launch",`。

`src/App.vue`：

1) import 扩展：`import { checkInboxKeyStatus, inboxKeyHash ... }` —— 实际写法：

```typescript
import { inboxKeyHash } from "./sync/crypto";
import { checkInboxKeyStatus, registerInboxKey, revokeInboxKey } from "./sync/inboxClient";
```

（`inboxKeyHash`/`revokeInboxKey` 已在上一轮引入，只需补 `checkInboxKeyStatus, registerInboxKey`。）

2) `revokeInbox` 函数之后新增：

```typescript
/** 注册配对码：warn=true 时失败弹警告（保存/轮换路径）；启动路径静默等下次自愈。 */
function registerInbox(code: string, warn: boolean): void {
  inboxKeyHash(code)
    .then((hash) => registerInboxKey(hash))
    .then((ok) => {
      if (ok === false && warn && appMounted) {
        showBubbleText(uiText.value.app.inboxRegisterFailed, undefined, { hideCompanionAfter: true });
      }
    })
    .catch(() => {
      if (warn && appMounted) {
        showBubbleText(uiText.value.app.inboxRegisterFailed, undefined, { hideCompanionAfter: true });
      }
    });
}
```

3) `handleInboxUpdate` 尾部注销分支之后追加：

```typescript
  // 注册制：保存/轮换后当前码立即可配对（启动路径见 onMounted 的幂等注册）。
  if (inbox) registerInbox(inbox.code, true);
```

4) onMounted 启动块 `if (hasInboxConfigured.value) { ... }` 之后追加：

```typescript
  // 注册制迁移与自愈：启动即幂等注册所有已配对码，失败静默等下次启动。
  for (const workspace of state.workspaces) {
    if (workspace.inbox) registerInbox(workspace.inbox.code, false);
  }
```

- [ ] **Step 4: 跑绿（全文件）**

Run: `npm test -- src/__tests__/app-render.test.ts`
Expected: 全部 PASS（revoke wiring 与 mobile 既有用例不受影响——模块级 mock 默认 true/active 跨用例存活）。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/state/i18n.ts src/__tests__/app-render.test.ts
git commit -m "feat: 桌面端启动与保存/轮换时注册配对码"
```

---

### Task 5: App 手机端——输码验证四分支与自动配对不验证

**Files:**
- Modify: `src/App.vue`
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 失败测试**

app-render.test.ts 手机壳 describe（含 "renders the mobile capture form directly..." 的那个）内新增：

```typescript
  function mountMobileCodeEntry(): ReturnType<typeof mountApp> {
    stubMatchMedia(true);
    window.location.hash = "";
    return mountApp();
  }

  async function submitCode(wrapper: ReturnType<typeof mountApp>, code: string): Promise<void> {
    await wrapper.get('[data-testid="mobile-inbox-code-input"]').setValue(code);
    await wrapper.get('[data-testid="mobile-inbox-code-confirm"]').trigger("click");
    await flushAsyncComponents();
  }

  it("输码验证 active：配对成功进入速记页", async () => {
    const wrapper = mountMobileCodeEntry();

    try {
      vi.mocked(checkInboxKeyStatus).mockClear();
      await submitCode(wrapper, "AB2CDE4FGHJK");

      expect(checkInboxKeyStatus).toHaveBeenCalledTimes(1);
      expect(wrapper.get('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mobile-inbox-code-input"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("输码验证 unknown/revoked：留在输码表单并给出对应提示", async () => {
    const wrapper = mountMobileCodeEntry();

    try {
      vi.mocked(checkInboxKeyStatus).mockResolvedValueOnce("unknown");
      await submitCode(wrapper, "AB2CDE4FGHJK");
      expect(wrapper.get('[data-testid="mobile-inbox-code-error"]').text()).toBe("配对码不存在，请到桌面端获取");
      expect(wrapper.get('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);

      vi.mocked(checkInboxKeyStatus).mockResolvedValueOnce("revoked");
      await submitCode(wrapper, "AB2CDE4FGHJK");
      expect(wrapper.get('[data-testid="mobile-inbox-code-error"]').text()).toBe("配对码已失效，请到桌面端获取新配对码");
      expect(wrapper.get('[data-testid="mobile-inbox-code-input"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("输码验证网络失败 fail-open：直接配对", async () => {
    const wrapper = mountMobileCodeEntry();

    try {
      vi.mocked(checkInboxKeyStatus).mockResolvedValueOnce(null);
      await submitCode(wrapper, "AB2CDE4FGHJK");
      expect(wrapper.get('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("fragment 自动配对不触发验证请求", async () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    let wrapper: ReturnType<typeof mountApp> | undefined;

    try {
      vi.mocked(checkInboxKeyStatus).mockClear();
      wrapper = mountApp();
      await vi.advanceTimersByTimeAsync(300);
      expect(wrapper.get('[data-testid="mobile-inbox-text"]').exists()).toBe(true);
      expect(checkInboxKeyStatus).not.toHaveBeenCalled();
    } finally {
      window.location.hash = "";
      wrapper?.unmount();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
```

既有 mobile 用例核对：格式非法路径断言如有（`mobileInboxCodeInvalid` 文案），错误提示从布尔切到字符串后文案不变；`@input` 清错逻辑保持。

- [ ] **Step 2: 跑红**

Run: `npm test -- src/__tests__/app-render.test.ts -t "输码\|mobile"`
Expected: 新四用例 FAIL（无验证逻辑/无文案）。

- [ ] **Step 3: 实现**

`src/state/i18n.ts`（zh/en 两块）：
- zh `mobileInboxCodeInvalid` 后加：

```typescript
      mobileInboxCodeUnknown: "配对码不存在，请到桌面端获取",
      mobileInboxCodeRevoked: "配对码已失效，请到桌面端获取新配对码",
      mobileInboxChecking: "验证中…",
```

- en 对应位置加：

```typescript
      mobileInboxCodeUnknown: "This pairing code doesn't exist; get it from the desktop",
      mobileInboxCodeRevoked: "This pairing code is no longer active; get a new one from the desktop",
      mobileInboxChecking: "Checking…",
```

`src/App.vue`：

1) `mobileInboxCodeError` 从布尔改为消息字符串（声明处）：

```typescript
const mobileInboxCodeError = ref<string | null>(null);
const mobileInboxCodeChecking = ref(false);
```

2) `confirmMobileInboxCode` 改为 async 验证版（整体替换）：

```typescript
/** 输码配对：格式校验 → 联网验证注册状态（unknown/revoked 拒绝；网络失败 fail-open 放行，发送时兜底）。 */
async function confirmMobileInboxCode(): Promise<void> {
  if (mobileInboxCodeChecking.value) return;
  const code = normalizeInboxCode(mobileInboxDraftCode.value);
  if (!isValidInboxCode(code)) {
    // 移动壳上 showBubbleText 被 shouldBlockBoardEffects 拦截，提示就近显示在输码区。
    mobileInboxCodeError.value = uiText.value.app.mobileInboxCodeInvalid;
    return;
  }
  mobileInboxCodeChecking.value = true;
  let status: Awaited<ReturnType<typeof checkInboxKeyStatus>> = null;
  try {
    status = await checkInboxKeyStatus(await inboxKeyHash(code));
  } catch {
    status = null;
  }
  mobileInboxCodeChecking.value = false;
  if (status === "unknown") {
    mobileInboxCodeError.value = uiText.value.app.mobileInboxCodeUnknown;
    return;
  }
  if (status === "revoked") {
    mobileInboxCodeError.value = uiText.value.app.mobileInboxCodeRevoked;
    return;
  }
  // active 或 null（网络失败 fail-open）：照常配对。
  mobileInboxCodeError.value = null;
  mobileInboxCode.value = code;
  mobileInboxDraftCode.value = "";
  // 写回 fragment：刷新/再次打开仍停留在速记页。
  window.location.hash = `#inbox=${code}`;
}
```

3) 其余引用点同步：
- `forgetMobileInboxCode` 内 `mobileInboxCodeError.value = false;` → `mobileInboxCodeError.value = null;`（两处：forget 与 confirm 旧路径已被替换覆盖）。
- 模板：错误 `<p v-if="mobileInboxCodeError">{{ mobileInboxCodeError }}</p>`（保留 `data-testid="mobile-inbox-code-error"` 与 id/aria 结构）；input 的 `:aria-invalid="mobileInboxCodeError ? 'true' : undefined"` 与 `:aria-describedby` 条件改为 `mobileInboxCodeError !== null`（真值判断本身兼容，字符串非空即真，可不动；但确认无 `=== true` 类比较）；`@input="mobileInboxCodeError = false"` → `@input="mobileInboxCodeError = null"`。
- 确认按钮（NButton）加 `:loading="mobileInboxCodeChecking"`，文案 `{{ mobileInboxCodeChecking ? uiText.app.mobileInboxChecking : uiText.app.mobileInboxCodeConfirm }}`。

- [ ] **Step 4: 跑绿（全文件）**

Run: `npm test -- src/__tests__/app-render.test.ts`
Expected: 全部 PASS（既有换码重输用例依赖模块级 mock 默认 "active"，天然通过）。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/state/i18n.ts src/__tests__/app-render.test.ts
git commit -m "feat: 手机输码联网验证配对码注册状态"
```

---

### Task 6: 回归、CLAUDE.md 与部署 runbook（不执行部署）

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 全量回归**

```bash
npm test          # 期望全绿（56 文件）
cd server && ./.venv/bin/python -m pytest   # 期望全绿
npm run build     # vue-tsc + vite 通过
```

- [ ] **Step 2: CLAUDE.md 更新**

Development 节中继句子里「plus `DELETE /inbox/<key_hash>` revocation — clearing/rotating a pairing code purges its queue and permanently blocks further POSTs with 410; the `revoked_keys` table must be created manually on the server before deploying」替换为：

```markdown
plus pairing-code registration — `POST /inbox/<key_hash>/register` (desktop registers codes on startup and on save/rotate; `INSERT IGNORE`, revocation is permanent), `GET /inbox/<key_hash>/status` (mobile verifies on code entry, network failures fail open), POSTs to unregistered codes return 404 `unknown_code` and to revoked codes 410; the `pairing_keys` table is created by `server/migrations/2026-08-26-pairing-keys.sql` (run once as root before deploying)
```

并在同节 client 行为段落末尾补一句：

```markdown
Phones verify pairing codes against `/status` when typed manually (fail-open on network errors; URL-fragment and remembered codes skip verification and rely on send-time errors), and send-time 404/410 both offer the change-code action.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 记录配对码注册制协议与迁移路径"
```

- [ ] **Step 4: 部署 runbook（人工步骤，写入最终汇报，不自动执行）**

1. 发布前端 1.0.146（release 流程，单独提交）→ 桌面端打开一次（启动自动注册存量码）。
2. aliyun 上 root 执行 `server/migrations/2026-08-26-pairing-keys.sql`（root 密码在 `/root/.mysql_root_password`）。
3. `cd server && ./deploy.sh` 上线门控。
4. 服务器上验证：`curl http://127.0.0.1:8787/inbox/<随机hash>/status` → `{"status":"unknown"}`；POST 未注册 hash → 404。

---

## Self-Review 结论（已执行）

- **Spec 覆盖**：register/status 端点与三态（Task 1+2）、POST 门控 404/410（Task 1+2）、DELETE 未注册码落 revoked（Task 1+2）、迁移脚本（Task 1 Step 2、Task 6 runbook）、桌面启动+保存注册与警告（Task 4）、手机输码四分支+fail-open+自动路径不验证（Task 5）、unknown_code 发送链路与 CTA 共用（Task 3）、CLAUDE.md（Task 6）。
- **类型一致性**：`InboxKeyStatus`/`registerInboxKey`/`checkInboxKeyStatus`/`codeUnusable`/`mobileInboxCodeError: string | null` 各任务间一致；`registerInbox(code, warn)` 私有助手仅 App 内用。
- **无占位符**：全部步骤含完整代码与命令；Task 4 Step 1 标注了一处允许按实际 DOM 调整的交互路径（断言不可删）。
