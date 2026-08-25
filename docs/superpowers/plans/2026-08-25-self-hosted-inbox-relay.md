# 手机速记中继自建迁移（阿里云 + MySQL）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把手机速记中继从 Cloudflare Worker 迁到 aliyun 上的 Flask + MySQL 后端（协议零改动），拆除全部次数限制，桌面端拉取间隔回归 5 分钟。

**Architecture:** 新增 `server/` 单文件 Flask 应用，接口与 Worker 线上协议逐字段一致（`GET/POST/OPTIONS /inbox/{64hex}`，CORS 白名单，`INSERT ... ON DUPLICATE KEY UPDATE` 幂等）；gunicorn 绑 127.0.0.1:8787，supervisord 守护，nginx 8443 TLS（acme.sh DNS-01，绕开国内无备案限制）反代。前端只改一个 URL 常量 + 拉取间隔 + 删行数上限。

**Tech Stack:** Python 3.9（server 上 `/opt/python3.9.6`，本地 Mac 用系统 python3 均可跑）、Flask、PyMySQL、gunicorn、MySQL 8、supervisord、nginx、acme.sh（DNS-01 via Cloudflare）、vitest。

**Spec:** `docs/superpowers/specs/2026-08-25-self-hosted-inbox-relay-design.md`

---

## 前置事实（已勘察，直接可用）

- aliyun：CentOS 7，`/opt/python3.9.6/bin/python3` 可用（pip 21，PyPI 可达），nginx 1.20.1（80/443 已监听但无真实站点），supervisord 3.4.0（`/usr/bin/supervisord`），MySQL 8.0.46（3306，root 密码 `*p3Pd9u42mqH`）。
- 本地 Mac：MySQL 9.6.0 在 127.0.0.1:3306，root 免密可登录（pytest 红绿循环在本机做）。
- 前端无既有测试断言 `INBOX_WORKER_URL` 默认值或拉取间隔（`version.test.ts` 里的 24h 是版本检查，无关）。
- i18n 是 `UI_TEXT = { zh, en }` 推断式类型，无显式接口——`mobileInboxErrorTooManyLines` 删 zh/en 两处 + 组件一处引用即可。
- ssh 命令默认假定 aliyun 上是 root；若 `whoami` 非 root，所有写 `/etc`、`/opt`、MySQL 的命令加 `sudo`。

## 用户协作点（执行到对应任务时向用户提出，不要提前）

- Task 9：需要一个 Cloudflare API Token（权限：Zone → DNS → Edit，作用域限定 `minidesk.online` 这一个 zone；同时能读 Zone 更好）。用来给 acme.sh 做 DNS-01 签证书。
- Task 10：用户在 Cloudflare 控制台加 A 记录 `relay.minidesk.online` → 服务器公网 IP（灰云 DNS only）；在阿里云控制台安全组放行入方向 8443/TCP。
- Task 12：发版确认（走 `/release-mini-desk` 流程）。

---

### Task 1: server/ 骨架 + 测试基建 + /healthz

**Files:**
- Create: `server/requirements.txt`
- Create: `server/requirements-dev.txt`
- Create: `server/pytest.ini`
- Create: `server/.gitignore`
- Create: `server/schema.sql`
- Create: `server/app.py`
- Create: `server/tests/conftest.py`
- Test: `server/tests/test_inbox.py`

- [ ] **Step 1: 建目录与基础设施文件**

`server/requirements.txt`:

```
flask>=3.0,<4
pymysql>=1.1,<2
cryptography>=42
gunicorn>=21
```

`server/requirements-dev.txt`:

```
-r requirements.txt
pytest>=8
```

`server/pytest.ini`:

```
[pytest]
testpaths = tests
```

`server/.gitignore`:

```
.venv/
__pycache__/
*.pyc
.env
logs/
.pytest_cache/
```

`server/schema.sql`（单条语句；部署与测试共用）:

```sql
CREATE TABLE inbox_items (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  id         VARCHAR(64) NOT NULL,
  payload    TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (key_hash, id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

- [ ] **Step 2: 本地 venv**

```bash
cd server && python3 -m venv .venv && ./.venv/bin/pip install -q -U pip && ./.venv/bin/pip install -q -r requirements-dev.txt
```

预期：无报错。（Mac 系统 python3 为 Homebrew 3.12/3.13，依赖均兼容。）

- [ ] **Step 3: 写失败测试（conftest + 第一个测试）**

`server/tests/conftest.py`:

```python
import os
import sys
from pathlib import Path

import pymysql
import pytest

# 让 tests/ 能 import server/ 下的 app.py（无包结构，手动置路径）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TEST_DB = "minidesk_inbox_test"
ORIGIN = "https://todolist.pages.dev"


def _mysql_kwargs() -> dict:
    return {
        "host": os.environ.get("MINIDESK_TEST_MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MINIDESK_TEST_MYSQL_PORT", "3306")),
        "user": os.environ.get("MINIDESK_TEST_MYSQL_USER", "root"),
        "password": os.environ.get("MINIDESK_TEST_MYSQL_PASSWORD", ""),
        "autocommit": True,
        "charset": "utf8mb4",
    }


@pytest.fixture(scope="session")
def _schema():
    with pymysql.connect(**_mysql_kwargs()) as conn, conn.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
        cursor.execute(f"CREATE DATABASE {TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin")
    schema_sql = (Path(__file__).resolve().parent.parent / "schema.sql").read_text(encoding="utf-8")
    with pymysql.connect(**{**_mysql_kwargs(), "database": TEST_DB}) as conn, conn.cursor() as cursor:
        cursor.execute(schema_sql)
    yield
    with pymysql.connect(**_mysql_kwargs()) as conn, conn.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")


@pytest.fixture
def db(_schema):
    """每个测试一张空表；直接暴露连接供测试种数据。"""
    conn = pymysql.connect(**{**_mysql_kwargs(), "database": TEST_DB})
    with conn.cursor() as cursor:
        cursor.execute("TRUNCATE TABLE inbox_items")
    yield conn
    conn.close()


@pytest.fixture
def client(db, monkeypatch):
    for key, value in {
        "MYSQL_HOST": os.environ.get("MINIDESK_TEST_MYSQL_HOST", "127.0.0.1"),
        "MYSQL_PORT": os.environ.get("MINIDESK_TEST_MYSQL_PORT", "3306"),
        "MYSQL_USER": os.environ.get("MINIDESK_TEST_MYSQL_USER", "root"),
        "MYSQL_PASSWORD": os.environ.get("MINIDESK_TEST_MYSQL_PASSWORD", ""),
        "MYSQL_DB": TEST_DB,
        "ALLOWED_ORIGINS": f"{ORIGIN},http://localhost:5173",
    }.items():
        monkeypatch.setenv(key, value)
    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application.test_client()
```

`server/tests/test_inbox.py`（先只放 healthz 一个测试类）:

```python
"""中继契约测试：语义对照 worker/__tests__/inbox-worker.test.ts（去掉其 429/409 限流用例）。"""


class TestHealthz:
    def test_returns_ok_without_cors(self, client):
        response = client.get("/healthz")

        assert response.status_code == 200
        assert response.get_json() == {"ok": True}
        assert "Access-Control-Allow-Origin" not in response.headers
```

- [ ] **Step 4: 跑测试确认失败**

```bash
cd server && ./.venv/bin/python -m pytest -q
```

预期：FAIL（`ModuleNotFoundError: No module named 'app'` 或收集错误）。

- [ ] **Step 5: 最小实现 app.py（仅 healthz + 骨架）**

`server/app.py`:

```python
"""手机速记中继：只存 AES-GCM 密文队列（协议与原 Cloudflare Worker 完全一致）。

路由键是 SHA-256(配对码) 的 hex；条目保留 30 天，无账号、无按条删除
（多台桌面共用一个码，回收交给保留期清理）。幂等：同 id 覆盖。
自建服务器无次数限制：只做输入校验，不做限流/配额。
"""
import os

from flask import Flask


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    return app
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd server && ./.venv/bin/python -m pytest -q
```

预期：1 passed。

- [ ] **Step 7: Commit**

```bash
git add server/
git commit -m "feat: 手机速记自建中继后端骨架与健康检查"
```

---

### Task 2: 收发契约（校验 / 往返 / 幂等 / 排序 / CORS / 405）

**Files:**
- Modify: `server/app.py`
- Test: `server/tests/test_inbox.py`

- [ ] **Step 1: 写失败测试（追加到 test_inbox.py）**

```python
ORIGIN = "https://todolist.pages.dev"
KEY = "a" * 64
OTHER = "b" * 64


def post(client, key_hash, body, origin=ORIGIN):
    return client.post(f"/inbox/{key_hash}", json=body, headers={"Origin": origin})


def get(client, key_hash, origin=ORIGIN):
    return client.get(f"/inbox/{key_hash}", headers={"Origin": origin})


class TestContract:
    def test_post_get_roundtrip_sorted_with_cors(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "AAA"}).status_code == 200
        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).status_code == 200

        response = get(client, KEY)

        assert response.status_code == 200
        items = response.get_json()["items"]
        assert [item["id"] for item in items] == ["i1", "i2"]
        assert items[0]["payload"] == "AAA"
        assert items[0]["createdAt"] > 0
        assert response.headers["Access-Control-Allow-Origin"] == ORIGIN

    def test_post_ok_body(self, client):
        response = post(client, KEY, {"id": "i1", "payload": "AAA"})

        assert response.status_code == 200
        assert response.get_json() == {"ok": True}

    def test_duplicate_id_overwrites(self, client):
        post(client, KEY, {"id": "i1", "payload": "AAA"})
        post(client, KEY, {"id": "i1", "payload": "CCC"})

        items = get(client, KEY).get_json()["items"]

        assert len(items) == 1
        assert items[0]["payload"] == "CCC"

    def test_key_hash_isolation(self, client):
        post(client, KEY, {"id": "i1", "payload": "AAA"})

        assert get(client, OTHER).get_json()["items"] == []

    def test_invalid_paths_and_bodies(self, client):
        assert client.get("/nope").status_code == 404
        assert client.get("/nope").get_json() == {"error": "not_found"}
        assert post(client, "XYZ", {"id": "i1", "payload": "AAA"}).status_code == 404
        assert post(client, "a" * 63, {"id": "i1", "payload": "AAA"}).status_code == 404
        assert post(client, KEY, {"id": "", "payload": "AAA"}).status_code == 400
        assert post(client, KEY, {"id": "x" * 65, "payload": "AAA"}).status_code == 400
        assert post(client, KEY, {"id": "i1"}).status_code == 400
        assert post(client, KEY, {"id": "i1", "payload": 123}).status_code == 400
        assert client.post(f"/inbox/{KEY}", data="not-json", content_type="application/json").status_code == 400

    def test_payload_too_large_returns_413(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "A" * 6000}).status_code == 413

    def test_no_write_limit_500_posts(self, client):
        for index in range(500):
            assert post(client, KEY, {"id": f"item-{index}", "payload": "AAA"}).status_code == 200

        assert len(get(client, KEY).get_json()["items"]) == 500

    def test_method_not_allowed_with_allow_header(self, client):
        response = client.put(f"/inbox/{KEY}", headers={"Origin": ORIGIN})

        assert response.status_code == 405
        assert response.headers["Allow"] == "GET, POST, OPTIONS"
        assert response.get_json() == {"error": "method_not_allowed"}

    def test_cors_whitelist_and_preflight(self, client):
        evil = get(client, KEY, origin="https://evil.example")
        assert evil.headers.get("Access-Control-Allow-Origin") != "https://evil.example"

        preflight = client.open(f"/inbox/{KEY}", method="OPTIONS", headers={"Origin": ORIGIN})
        assert preflight.status_code == 204
        assert preflight.headers["Access-Control-Allow-Origin"] == ORIGIN
        assert preflight.headers["Vary"] == "Origin"
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && ./.venv/bin/python -m pytest -q
```

预期：新增用例全部 FAIL（404，路由不存在），healthz 仍 PASS。

- [ ] **Step 3: 实现完整 app.py**

`server/app.py` 整体替换为：

```python
"""手机速记中继：只存 AES-GCM 密文队列（协议与原 Cloudflare Worker 完全一致）。

路由键是 SHA-256(配对码) 的 hex；条目保留 30 天，无账号、无按条删除
（多台桌面共用一个码，回收交给保留期清理）。幂等：同 id 覆盖。
自建服务器无次数限制：只做输入校验，不做限流/配额。
"""
import os
import time

import pymysql
from flask import Flask, Response, jsonify, request
from werkzeug.exceptions import HTTPException

MAX_CIPHER_BYTES = 4096
MAX_ID_LENGTH = 64
HEX_DIGITS = set("0123456789abcdef")


def database_kwargs() -> dict:
    return {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "user": os.environ["MYSQL_USER"],
        "password": os.environ["MYSQL_PASSWORD"],
        "database": os.environ["MYSQL_DB"],
        "autocommit": True,
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor,
    }


def is_valid_key_hash(value: str) -> bool:
    return len(value) == 64 and all(char in HEX_DIGITS for char in value)


def create_app() -> Flask:
    app = Flask(__name__)
    allowed_origins = [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]

    @app.after_request
    def apply_cors(response: Response) -> Response:
        if request.path == "/healthz":
            return response
        origin = request.headers.get("Origin")
        # 白名单内回显；白名单外回落到第一个（与 Worker 行为一致），绝不回显陌生 Origin。
        allow = origin if origin in allowed_origins else (allowed_origins[0] if allowed_origins else "")
        response.headers["Access-Control-Allow-Origin"] = allow
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Vary"] = "Origin"
        return response

    def error_response(status: int, code: str, headers: dict = None) -> tuple:
        return jsonify({"error": code}), status, headers or {}

    @app.errorhandler(HTTPException)
    def http_error(err: HTTPException) -> tuple:
        code_by_status = {404: "not_found", 405: "method_not_allowed"}
        headers = {"Allow": "GET, POST, OPTIONS"} if err.code == 405 else None
        return error_response(err.code or 500, code_by_status.get(err.code, "internal"), headers)

    @app.errorhandler(Exception)
    def unexpected_error(_err: Exception) -> tuple:
        # 数据库故障等运行时错误也走 JSON 契约，浏览器端才能分类而不是只看到解析失败。
        return error_response(500, "internal")

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.route("/inbox/<key_hash>", methods=["GET", "POST", "OPTIONS"])
    def inbox(key_hash: str):
        if request.method == "OPTIONS":
            return Response(status=204)
        if not is_valid_key_hash(key_hash):
            return error_response(404, "not_found")
        if request.method == "POST":
            return handle_post(key_hash)
        return handle_get(key_hash)

    def handle_post(key_hash: str) -> tuple:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error_response(400, "bad_request")
        item_id = body.get("id")
        payload = body.get("payload")
        if not isinstance(item_id, str) or not item_id or len(item_id) > MAX_ID_LENGTH:
            return error_response(400, "bad_request")
        if not isinstance(payload, str) or not payload:
            return error_response(400, "bad_request")
        # base64 每 4 字符约 3 字节密文（与 Worker 同式）
        if len(payload) * 0.75 > MAX_CIPHER_BYTES:
            return error_response(413, "payload_too_large")
        created_at = int(time.time() * 1000)
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s) "
                "AS new ON DUPLICATE KEY UPDATE payload = new.payload, created_at = new.created_at",
                (key_hash, item_id, payload, created_at),
            )
        return jsonify({"ok": True})

    def handle_get(key_hash: str) -> tuple:
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, payload, created_at FROM inbox_items WHERE key_hash = %s ORDER BY created_at, id",
                (key_hash,),
            )
            rows = cursor.fetchall()
        items = [{"id": row["id"], "payload": row["payload"], "createdAt": row["created_at"]} for row in rows]
        return jsonify({"items": items})

    return app
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && ./.venv/bin/python -m pytest -q
```

预期：全部 PASS（11 个用例左右，`test_no_write_limit_500_posts` 在本机 MySQL 下约 2–5 秒）。

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: 中继收发契约(校验/幂等/排序/CORS)"
```

---

### Task 3: 30 天保留期清理

**Files:**
- Modify: `server/app.py`
- Test: `server/tests/test_inbox.py`

- [ ] **Step 1: 写失败测试（追加）**

```python
import time


class TestRetention:
    def test_post_purges_rows_older_than_30_days(self, client, db):
        now = int(time.time() * 1000)
        with db.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s)",
                [
                    (KEY, "stale", "OLD", now - 31 * 24 * 3600 * 1000),
                    (KEY, "recent", "KEEP", now - 29 * 24 * 3600 * 1000),
                ],
            )

        assert post(client, KEY, {"id": "fresh", "payload": "NEW"}).status_code == 200

        ids = [item["id"] for item in get(client, KEY).get_json()["items"]]
        assert "stale" not in ids
        assert "recent" in ids
        assert "fresh" in ids
```

（`import time` 放文件顶部与既有 import 合并，不要重复。）

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && ./.venv/bin/python -m pytest -k TestRetention -q
```

预期：FAIL（`stale` 仍在 items 里）。

- [ ] **Step 3: 实现——`handle_post` 写入后追加清理**

模块级加常量（放 `MAX_ID_LENGTH` 旁）：

```python
RETENTION_MS = 30 * 24 * 60 * 60 * 1000
```

`handle_post` 的 `cursor.execute(INSERT ...)` 之后、`with` 块内追加：

```python
            cursor.execute("DELETE FROM inbox_items WHERE created_at < %s", (created_at - RETENTION_MS,))
```

- [ ] **Step 4: 跑全量测试确认通过**

```bash
cd server && ./.venv/bin/python -m pytest -q
```

预期：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: 中继条目 30 天保留期清理"
```

---

### Task 4: 前端——中继地址与 5 分钟拉取间隔

**Files:**
- Modify: `src/sync/config.ts`
- Create: `src/__tests__/sync-config.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/sync-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  INBOX_FOCUS_THROTTLE_MS,
  INBOX_PLAINTEXT_MAX_CHARS,
  INBOX_PULL_INTERVAL_MS,
  INBOX_WORKER_URL,
} from "../sync/config";

describe("sync configuration", () => {
  it("默认指向自建中继（8443 非常规端口，灰云直解避开备案探针）", () => {
    expect(INBOX_WORKER_URL).toBe("https://relay.minidesk.online:8443");
  });

  it("定时拉取间隔为 5 分钟，聚焦节流保持 1 分钟", () => {
    expect(INBOX_PULL_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(INBOX_FOCUS_THROTTLE_MS).toBe(60 * 1000);
  });

  it("单行明文上限保持 500 字（数据形状，非配额）", () => {
    expect(INBOX_PLAINTEXT_MAX_CHARS).toBe(500);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/sync-config.test.ts
```

预期：URL 与间隔两个断言 FAIL。

- [ ] **Step 3: 修改 `src/sync/config.ts`**

把文件头两段改为（其余行不动）：

```typescript
/** 中转后端地址（自建阿里云 + MySQL，协议与原 Worker 一致）。本地联调用 .env.local 里 VITE_INBOX_WORKER_URL=http://127.0.0.1:8787 覆盖。 */
export const INBOX_WORKER_URL: string =
  ((import.meta.env.VITE_INBOX_WORKER_URL as string | undefined) ?? "").trim() ||
  "https://relay.minidesk.online:8443";

export const INBOX_PLAINTEXT_MAX_CHARS = 500;
export const INBOX_PULL_INTERVAL_MS = 5 * 60 * 1000;
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/__tests__/sync-config.test.ts
```

预期：3 passed。

- [ ] **Step 5: Commit**

```bash
git add src/sync/config.ts src/__tests__/sync-config.test.ts
git commit -m "feat: 桌面端切换自建中继并回归 5 分钟拉取"
```

---

### Task 5: 前端——取消手机端单次行数上限

**Files:**
- Modify: `src/components/MobileInboxCapture.vue`
- Modify: `src/state/i18n.ts:573`（zh）、`src/state/i18n.ts:949`（en）
- Test: `src/__tests__/mobile-inbox-capture.test.ts:194-202`

- [ ] **Step 1: 改测试（用“无上限”用例替换“超限”用例）**

把 `src/__tests__/mobile-inbox-capture.test.ts` 中这个用例：

```typescript
  it("超过单次行数上限：报错且不发送，输入保留", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, Array.from({ length: 21 }, (_, i) => `第${i + 1}行`).join("\n"));

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("一次最多 20 行，请分批发送"));
    expect(postMock).not.toHaveBeenCalled();
    expect(draftValue(wrapper).split("\n").length).toBe(21);
  });
```

整体替换为：

```typescript
  it("无行数上限：21 行也全部逐条发送并提示 21 条", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, Array.from({ length: 21 }, (_, i) => `第${i + 1}行`).join("\n"));

    await until(() => expect(postMock).toHaveBeenCalledTimes(21));
    await until(() => expect(wrapper.get(".mobile-inbox-status").text()).toContain("已发送 21 条"));
    expect(draftValue(wrapper)).toBe("");
  }, 20000);
```

（21 行 × 真实 PBKDF2 约 60–80ms/行 ≈ 1.3–1.7s，`until` 内部 4s 轮询窗口够用；用例级 20s 兜底。）

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/__tests__/mobile-inbox-capture.test.ts
```

预期：新用例 FAIL（第 21 行触发“一次最多 20 行”错误，`postMock` 调用数停在 0）。

- [ ] **Step 3: 改组件**

`src/components/MobileInboxCapture.vue` 三处：

1. 删除常量及其注释（第 17–18 行）：

```typescript
/** 单次发送的行数上限：每行一条独立条目（各自占一条每日写入配额），防一次粘贴烧光 60 条/天的额度。 */
const MAX_LINES_PER_SEND = 20;
```

2. `send()` 中删除上限分支（第 59–63 行）：

```typescript
  if (lines.length > MAX_LINES_PER_SEND) {
    status.value = "error";
    errorText.value = app.value.mobileInboxErrorTooManyLines.replace("{count}", () => String(MAX_LINES_PER_SEND));
    return;
  }
```

同时把 `send()` 的文档注释里“每行一条独立条目”后面的配额语义更新——原注释如无配额字样则不动。

3. textarea 删除 `:maxlength` 属性（原 `:maxlength="MAX_LINES_PER_SEND * INBOX_PLAINTEXT_MAX_CHARS"`，第 130 行）；单行 500 字仍由发送时 `slice` 保证。

4. `src/state/i18n.ts` 删除两行：

```typescript
      mobileInboxErrorTooManyLines: "一次最多 {count} 行，请分批发送",
```

```typescript
      mobileInboxErrorTooManyLines: "Up to {count} lines per send; please send in batches",
```

（zh/en 各一行；i18n 为推断式结构，两侧同删即类型一致。）

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

```bash
npx vitest run src/__tests__/mobile-inbox-capture.test.ts && npm test
```

预期：全绿（其余用例不引用被删 key）。

- [ ] **Step 5: Commit**

```bash
git add src/components/MobileInboxCapture.vue src/state/i18n.ts src/__tests__/mobile-inbox-capture.test.ts
git commit -m "feat: 手机速记取消单次行数上限"
```

---

### Task 6: CLAUDE.md 记录自建中继 + 全量验证

**Files:**
- Modify: `CLAUDE.md`
- Modify: `package.json`（无改动则跳过对应 commit 命令里的路径）

- [ ] **Step 1: 更新 CLAUDE.md 的 Development 段**

把：

```
`npm run deploy:worker` deploys the mobile-inbox relay Worker (Cloudflare Worker + KV, config in `worker/wrangler.toml`). Local relay testing: point `VITE_INBOX_WORKER_URL` in `.env.local` at `http://127.0.0.1:8787` and run `npx wrangler dev --config worker/wrangler.toml`.
```

改为：

```
The mobile-inbox relay is self-hosted: `server/` is a Flask + MySQL app (protocol identical to the legacy Worker in `worker/`, which stays deployed until decommissioned). It runs on the aliyun host at `/opt/minidesk-inbox` behind nginx on `https://relay.minidesk.online:8443`; `server/deploy.sh` rsyncs and restarts it. Local backend tests: `cd server && ./.venv/bin/python -m pytest` (needs MySQL on 127.0.0.1:3306, root passwordless). Local relay testing: point `VITE_INBOX_WORKER_URL` in `.env.local` at `http://127.0.0.1:8787` and run `gunicorn -b 127.0.0.1:8787 app:app` from `server/`.
```

- [ ] **Step 2: 全量测试 + 构建（含 vue-tsc 与 worker typecheck）**

```bash
npm test && npm run build
```

预期：vitest 全绿，`vue-tsc --noEmit` 与 `tsc -p worker/tsconfig.json` 无错，vite build 成功。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 记录自建中继的开发与部署方式"
```

---

### Task 7: 服务器 MySQL 建库建号建表

**Files:** 无仓库改动（远程操作）

- [ ] **Step 1: 生成专用账号密码并建库建号**

在本地生成密码（记下来，后面 .env 与验证要用）：

```bash
openssl rand -base64 24
```

在 aliyun 上执行（把 `<PW>` 换成生成的密码；root 密码已勘察）：

```bash
ssh aliyun "mysql -uroot -p'*p3Pd9u42mqH' -e \"
CREATE DATABASE IF NOT EXISTS minidesk_inbox CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'minidesk_inbox'@'localhost' IDENTIFIED BY '<PW>';
CREATE USER IF NOT EXISTS 'minidesk_inbox'@'127.0.0.1' IDENTIFIED BY '<PW>';
GRANT SELECT, INSERT, UPDATE, DELETE ON minidesk_inbox.* TO 'minidesk_inbox'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON minidesk_inbox.* TO 'minidesk_inbox'@'127.0.0.1';
FLUSH PRIVILEGES;\""
```

（同时建 `localhost` 与 `127.0.0.1` 两个主机名，规避 `skip_name_resolve` 开关导致的匹配差异。）

- [ ] **Step 2: 建表**

```bash
ssh aliyun "mysql -uminidesk_inbox -p'<PW>' minidesk_inbox" < server/schema.sql
```

- [ ] **Step 3: 验证专用账号权限（拿不到 root 才对）**

```bash
ssh aliyun "mysql -uminidesk_inbox -p'<PW>' minidesk_inbox -e 'SHOW TABLES; INSERT INTO inbox_items (key_hash,id,payload,created_at) VALUES (\"test\",\"t1\",\"AAA\",0); DELETE FROM inbox_items; SELECT COUNT(*) FROM inbox_items;' && mysql -uminidesk_inbox -p'<PW>' -e 'USE mysql' 2>&1 | tail -1"
```

预期：SHOW TABLES 列出 `inbox_items`，增删成功，最后一条访问 `mysql` 库被拒（`Access denied`）——证明权限被限制在专库。

---

### Task 8: 部署代码到 /opt/minidesk-inbox + supervisord 守护 + 服务器上跑 pytest

**Files:**
- Create: `server/run.sh`
- Create: `server/deploy.sh`

- [ ] **Step 1: 写部署辅助脚本（进仓库）**

`server/run.sh`（gunicorn 入口，从 .env 注入环境变量）:

```bash
#!/bin/sh
# supervisord 启动入口：加载 .env 后以 gunicorn 前台运行
cd /opt/minidesk-inbox || exit 1
set -a
. ./.env
set +a
exec ./.venv/bin/gunicorn -b 127.0.0.1:8787 --workers 2 app:app
```

`server/deploy.sh`（日常更新入口；首次部署的 venv 建立见 Task 8 Step 3）:

```bash
#!/usr/bin/env bash
# 同步 server/ 到 aliyun 的 /opt/minidesk-inbox 并重启服务
set -euo pipefail
REMOTE_DIR=/opt/minidesk-inbox
HERE="$(cd "$(dirname "$0")" && pwd)"
rsync -av --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '.env' --exclude 'logs' --exclude '.pytest_cache' \
  "$HERE/" "aliyun:$REMOTE_DIR/"
ssh aliyun "cd $REMOTE_DIR && ./.venv/bin/pip install -q -r requirements.txt && supervisorctl restart minidesk-inbox"
```

```bash
chmod +x server/run.sh server/deploy.sh
```

- [ ] **Step 2: 首次部署目录 + venv（用 /opt/python3.9.6）**

```bash
ssh aliyun 'mkdir -p /opt/minidesk-inbox/logs'
rsync -av --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' --exclude '.env' --exclude 'logs' server/ aliyun:/opt/minidesk-inbox/
ssh aliyun 'cd /opt/minidesk-inbox && /opt/python3.9.6/bin/python3 -m venv .venv && ./.venv/bin/pip install -q -U pip && ./.venv/bin/pip install -q -r requirements.txt -r requirements-dev.txt'
```

预期：无报错（PyPI 已验证可达）。

- [ ] **Step 3: 服务器上写 .env（不入仓库）**

```bash
ssh aliyun 'cat > /opt/minidesk-inbox/.env <<EOF
MYSQL_USER=minidesk_inbox
MYSQL_PASSWORD=<PW>
MYSQL_DB=minidesk_inbox
ALLOWED_ORIGINS=https://minidesk.online,https://todolist-7i5.pages.dev,http://localhost:5173,http://127.0.0.1:5173,https://localhost:4173,https://127.0.0.1:4173
EOF
chmod 600 /opt/minidesk-inbox/.env'
```

（ALLOWED_ORIGINS 与 `worker/wrangler.toml` 现值一致。）

- [ ] **Step 4: 服务器上跑 pytest（root 密码只进测试环境变量）**

```bash
ssh aliyun 'cd /opt/minidesk-inbox && MINIDESK_TEST_MYSQL_PASSWORD="*p3Pd9u42mqH" ./.venv/bin/python -m pytest -q'
```

预期：全部 PASS（MySQL 8.0.46 上同样绿）。

- [ ] **Step 5: 配置 supervisord**

先确认 supervisord 的 include 目录与身份：

```bash
ssh aliyun 'ps -o args= -C supervisord; grep -E "^(\[include\]|files=)" /etc/supervisord.conf 2>/dev/null; ls /etc/supervisord.d/ 2>/dev/null; whoami'
```

按输出的 include 目录写 `/etc/supervisord.d/minidesk-inbox.conf`（若 include 指向别处如 `/opt/supervisord.conf` 同址追加；非 root 加 sudo）：

```ini
[program:minidesk-inbox]
directory=/opt/minidesk-inbox
command=/opt/minidesk-inbox/run.sh
autostart=true
autorestart=true
startsecs=3
stdout_logfile=/opt/minidesk-inbox/logs/gunicorn.out.log
stderr_logfile=/opt/minidesk-inbox/logs/gunicorn.err.log
```

```bash
ssh aliyun 'supervisorctl reread && supervisorctl update && supervisorctl status minidesk-inbox'
```

预期：`minidesk-inbox  RUNNING`。

- [ ] **Step 6: 本机冒烟 healthz**

```bash
ssh aliyun 'sleep 1; curl -sS http://127.0.0.1:8787/healthz'
```

预期：`{"ok":true}`。

- [ ] **Step 7: Commit（部署脚本进仓库）**

```bash
git add server/run.sh server/deploy.sh
git commit -m "chore: 中继部署与运行脚本"
```

---

### Task 9: acme.sh 签证书（DNS-01）——需要用户提供 Cloudflare API Token

**USER GATE：** 先向用户要一个 Cloudflare API Token（Zone → DNS → Edit，限定 `minidesk.online`；建议同时给 Zone → Zone → Read），以及 Cloudflare 账号 Account ID（dashboard 右侧可见）。

**Files:** 无仓库改动

- [ ] **Step 1: 安装 acme.sh 并签发**

```bash
ssh aliyun 'curl -s https://get.acme.sh | sh -s email=admin@minidesk.online'
ssh aliyun 'export CF_Token="<TOKEN>" CF_Account_ID="<ACCOUNT_ID>" && ~/.acme.sh/acme.sh --issue --dns dns_cf -d relay.minidesk.online --server letsencrypt'
```

预期：`Cert success`。acme.sh 会自动记下 CF_Token 用于后续自动续期（默认装了 cron）。

- [ ] **Step 2: 证书装载到 nginx 目录 + 自动 reload**

```bash
ssh aliyun 'mkdir -p /etc/nginx/certs && ~/.acme.sh/acme.sh --install-cert -d relay.minidesk.online \
  --key-file /etc/nginx/certs/relay.minidesk.online.key \
  --fullchain-file /etc/nginx/certs/relay.minidesk.online.crt \
  --reloadcmd "nginx -s reload"'
```

预期：证书文件出现在 `/etc/nginx/certs/`。（此时 nginx 还没配 8443，reload 无副作用。）

---

### Task 10: DNS A 记录 + 安全组 + nginx 8443——需要用户两步操作

**USER GATE：** 请用户做两件事，期间可以先写好 nginx 配置：
1. Cloudflare 控制台：`relay.minidesk.online` A 记录 → 服务器公网 IP，**DNS only（灰云）**。公网 IP 用下面命令取。
2. 阿里云控制台：安全组入方向放行 **8443/TCP**（源 0.0.0.0/0）。

**Files:** 无仓库改动

- [ ] **Step 1: 取公网 IP（给用户加 A 记录用）**

```bash
ssh aliyun 'curl -s http://100.100.100.200/latest/meta-data/public-ipv4 || curl -s http://100.100.100.200/latest/meta-data/eip/public-ipv4'
```

- [ ] **Step 2: 写 nginx server 块（8443 反代 8787）**

```bash
ssh aliyun 'cat > /etc/nginx/conf.d/minidesk-inbox.conf <<EOF
server {
    listen 8443 ssl http2;
    listen [::]:8443 ssl http2;
    server_name relay.minidesk.online;

    ssl_certificate     /etc/nginx/certs/relay.minidesk.online.crt;
    ssl_certificate_key /etc/nginx/certs/relay.minidesk.online.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 访问日志会记完整 URL（含 keyHash），与"不记录 keyHash"承诺冲突——关闭
    access_log off;

    client_max_body_size 8k;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
nginx -t && nginx -s reload'
```

（非 root 加 sudo。）

- [ ] **Step 3: 等 DNS 与安全组生效后，从 Mac 外网验证**

```bash
curl -sS https://relay.minidesk.online:8443/healthz
```

预期：`{"ok":true}`。若超时→安全组未生效；若证书告警→DNS 仍指向别处（`dig +short relay.minidesk.online` 核对）。

---

### Task 11: 端到端契约冒烟（外网 → nginx → gunicorn → MySQL）

**Files:** 无仓库改动

- [ ] **Step 1: 假条目 POST/GET/幂等冒烟**

```bash
KEY=$(python3 -c "print('a'*64)")
ORIGIN='https://minidesk.online'
curl -sS -X POST "https://relay.minidesk.online:8443/inbox/$KEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"id":"smoke-1","payload":"QUFB"}'
curl -sS "https://relay.minidesk.online:8443/inbox/$KEY" -H "Origin: $ORIGIN"
curl -sS -X POST "https://relay.minidesk.online:8443/inbox/$KEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"id":"smoke-1","payload":"Q0ND"}'
curl -sS "https://relay.minidesk.online:8443/inbox/$KEY" -H "Origin: $ORIGIN"
curl -sS "https://relay.minidesk.online:8443/inbox/$KEY" -H "Origin: https://evil.example" -i | grep -i "access-control-allow-origin"
```

预期依次：`{"ok":true}`；单条 items 且 payload `QUFB`；`{"ok":true}`；单条且 payload 变 `Q0ND`（幂等覆盖）；ACAO 不是 evil（回落白名单第一项）。

- [ ] **Step 2: 清理冒烟数据**

```bash
ssh aliyun "mysql -uminidesk_inbox -p'<PW>' minidesk_inbox -e \"DELETE FROM inbox_items WHERE id='smoke-1';\""
```

---

### Task 12: 发版（USER GATE）

- [ ] **Step 1: 与用户确认发版**

向用户说明：后端已全链路验证，前端改动将把默认中继切到 `relay.minidesk.online:8443`；老 Worker 保持在线，旧客户端下次打开页面经 SW 更新。征得同意。

- [ ] **Step 2: 走发布流程**

调用 Skill `release-mini-desk`（版本号延续现有节奏，由用户确认）。发布产物部署到 Cloudflare Pages。

- [ ] **Step 3: 用户手机实测**

请用户用手机速记页发一条提醒事项和一条便签，桌面端（最长 5 分钟）自动出现即迁移完成。

---

## 后续事项（不在本计划内，验证稳定数日后执行）

1. 下线老 Worker：Cloudflare 控制台删除 `inbox.minidesk.online` 自定义域与 Worker，删除 KV namespace（id `30a05e0a03994963853639720f46626f`）。
2. 仓库清理：删 `worker/`、`worker/__tests__`、`package.json` 的 `deploy:worker` 与 `typecheck:worker`（build 脚本同步去掉 typecheck:worker）、CLAUDE.md 里 Worker 遗留描述。
3. 建议项（独立事项）：服务器 MySQL 3306 目前监听公网，建议收紧为仅本机或用安全组封禁。
