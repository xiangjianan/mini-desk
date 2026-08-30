"""手机速记中继：明文速记经大模型润色后入库，旧密文协议兼容直存（协议沿革见 CLAUDE.md「手机速记」一节）。

路由键是 SHA-256(配对码) 的 hex；条目保留 30 天，无账号、无按条删除（回收交给保留期清理）。
注册制：pairing_keys 三态（unknown/active/revoked），桌面端保存/轮换/启动时注册，
未注册码 POST 404、已注销码 POST 410（注销即永久，注册不复活）。幂等：同 id 覆盖。
明文路径（新手机页）：POST 校验后立刻 ack，后台线程调 DeepSeek 润色（llm.polish_capture），
拆行入库；LLM 任何失败兜底存原文。密文路径（SW 缓存的旧手机页）：与原 Worker 协议一致，原样直存。
自建服务器无次数限制：只做输入校验，不做限流/配额。
"""
import json
import os
import threading
import time
import traceback
from typing import Callable

import pymysql
from flask import Flask, Response, jsonify, request
from werkzeug.exceptions import HTTPException

import llm

MAX_CIPHER_BYTES = 4096
MAX_PLAINTEXT_BYTES = 2048
MAX_ID_LENGTH = 64
RETENTION_MS = 30 * 24 * 60 * 60 * 1000
HEX_DIGITS = set("0123456789abcdef")
NOT_JSON = object()  # payload 不是 JSON 的哨兵（区别于「是 JSON 但结构非法」）


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


def spawn_worker(target: Callable[[], None]) -> None:
    """POST 线程只做校验与排队，润色入库在后台 daemon 线程执行（测试 monkeypatch 为同步跑）。"""
    threading.Thread(target=target, daemon=True).start()


def load_payload_json(payload: str) -> object:
    """解析 payload 为 JSON 值；解析失败返回 NOT_JSON 哨兵。"""
    try:
        return json.loads(payload)
    except (ValueError, TypeError, RecursionError):
        return NOT_JSON


def is_plain_item(value: object) -> bool:
    """明文速记行：{"kind": "todo"|"note", "text": 非空字符串}（createdAt 可选，入库时重签）。"""
    if not isinstance(value, dict):
        return False
    return value.get("kind") in ("todo", "note") and isinstance(value.get("text"), str) and bool(value["text"].strip())


def encode_payload(kind: str, text: str, created_at: int) -> str:
    """明文入库行：与桌面端 InboxPlainItem 同构的紧凑 JSON。"""
    return json.dumps({"kind": kind, "text": text, "createdAt": created_at}, ensure_ascii=False, separators=(",", ":"))


def store_plain_items(key_hash: str, item_id: str, kind: str, text: str) -> None:
    """后台润色入库：LLM 失败或空结果兜底存原文一行（原 id）；非空则每条一行（id 加 #序号）。
    同基名旧行先清——手机端同 id 重试时以最后一次结果为准，避免兜底行与润色行并存。"""
    try:
        items = llm.polish_capture(kind, text)
    except Exception:
        items = None  # polish_capture 自身不应抛出，双保险：任何异常都走原文兜底。
    now = int(time.time() * 1000)
    if not items:
        rows_to_insert = [(key_hash, item_id, encode_payload(kind, text, now), now)]
    else:
        rows_to_insert = [
            (key_hash, f"{item_id}#{index}", encode_payload(kind, item, now), now) for index, item in enumerate(items)
        ]
    try:
        with pymysql.connect(**database_kwargs()) as conn:
            conn.begin()
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM inbox_items WHERE key_hash = %s AND (id = %s OR id LIKE %s)",
                    (key_hash, item_id, item_id + "#%"),
                )
                cursor.executemany(
                    "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s)",
                    rows_to_insert,
                )
                cursor.execute("DELETE FROM inbox_items WHERE created_at < %s", (now - RETENTION_MS,))
            conn.commit()
    except Exception:
        # 入库失败即丢条（POST 已 ack）：打印到 stderr 供 gunicorn 日志排查，daemon 线程不向上抛。
        traceback.print_exc()


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
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Vary"] = "Origin"
        return response

    def error_response(status: int, code: str, headers: dict = None) -> tuple:
        return jsonify({"error": code}), status, headers or {}

    @app.errorhandler(HTTPException)
    def http_error(err: HTTPException) -> tuple:
        code_by_status = {404: "not_found", 405: "method_not_allowed"}
        headers = {"Allow": "GET, POST, DELETE, OPTIONS"} if err.code == 405 else None
        return error_response(err.code or 500, code_by_status.get(err.code, "internal"), headers)

    @app.errorhandler(Exception)
    def unexpected_error(_err: Exception) -> tuple:
        # 数据库故障等运行时错误也走 JSON 契约，浏览器端才能分类而不是只看到解析失败。
        return error_response(500, "internal")

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.route("/inbox/<key_hash>", methods=["GET", "POST", "DELETE", "OPTIONS"])
    def inbox(key_hash: str):
        if request.method == "OPTIONS":
            return Response(status=204)
        if not is_valid_key_hash(key_hash):
            return error_response(404, "not_found")
        if request.method == "POST":
            return handle_post(key_hash)
        if request.method == "DELETE":
            return handle_delete(key_hash)
        return handle_get(key_hash)

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

    def store_cipher_item(key_hash: str, item_id: str, payload: str) -> tuple:
        """旧密文路径：与改造前完全一致——状态检查 + 幂等插入 + 保留期清扫，同步完成。"""
        created_at = int(time.time() * 1000)
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute("SELECT revoked_at FROM pairing_keys WHERE key_hash = %s", (key_hash,))
            key_row = cursor.fetchone()
            if key_row is None:
                return error_response(404, "unknown_code")
            if key_row["revoked_at"] is not None:
                return error_response(410, "revoked")
            cursor.execute(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s) "
                "AS new ON DUPLICATE KEY UPDATE payload = new.payload, created_at = new.created_at",
                (key_hash, item_id, payload, created_at),
            )
            cursor.execute("DELETE FROM inbox_items WHERE created_at < %s", (created_at - RETENTION_MS,))
        return jsonify({"ok": True})

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
        # 大小预检先于 JSON 解析（沿用旧密文公式，base64 每 4 字符约 3 字节）：
        # 超大输入不付解析成本，深嵌套构造也不会把递归撑爆。
        if len(payload) * 0.75 > MAX_CIPHER_BYTES:
            return error_response(413, "payload_too_large")
        parsed = load_payload_json(payload)
        if parsed is NOT_JSON:
            # 旧密文直存（SW 缓存的旧手机页仍在发 base64 密文）：不润色，按原协议入队。
            return store_cipher_item(key_hash, item_id, payload)
        if not is_plain_item(parsed):
            return error_response(400, "bad_request")
        if len(item_id) > MAX_ID_LENGTH - 3:
            # 明文路径 id 会追加 #N 后缀（最多 3 字符），预留空间避免超出 VARCHAR(64) 落库失败静默丢条。
            return error_response(400, "bad_request")
        if len(payload) > MAX_PLAINTEXT_BYTES:
            return error_response(413, "payload_too_large")
        with pymysql.connect(**database_kwargs()) as conn, conn.cursor() as cursor:
            cursor.execute("SELECT revoked_at FROM pairing_keys WHERE key_hash = %s", (key_hash,))
            key_row = cursor.fetchone()
        if key_row is None:
            return error_response(404, "unknown_code")
        if key_row["revoked_at"] is not None:
            return error_response(410, "revoked")
        kind = parsed["kind"]
        text = parsed["text"]
        # 秒回 + 后台润色：入库前 GET 拉不到本条；润色失败由 store_plain_items 兜底存原文。
        spawn_worker(lambda: store_plain_items(key_hash, item_id, kind, text))
        return jsonify({"ok": True})

    def handle_delete(key_hash: str) -> tuple:
        # 注销：单事务清空该队列并在 pairing_keys 置 revoked（未注册过的码也落 revoked 行）；注销即永久。
        # 幂等：重复注销、注销从未存在过的码均返回 ok。
        now = int(time.time() * 1000)
        with pymysql.connect(**database_kwargs()) as conn:
            conn.begin()
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM inbox_items WHERE key_hash = %s", (key_hash,))
                cursor.execute(
                    "INSERT INTO pairing_keys (key_hash, registered_at, revoked_at) VALUES (%s, %s, %s) "
                    "AS new ON DUPLICATE KEY UPDATE revoked_at = new.revoked_at",
                    (key_hash, now, now),
                )
            conn.commit()
        return jsonify({"ok": True})

    def handle_get(key_hash: str) -> tuple:
        # 读即消费（软删除）：同一事务内 FOR UPDATE 锁定未读行并标记 read_at，
        # 每条数据只响应一次，下次 GET 只返回新数据。并发 GET 不会重复响应同一批。
        now = int(time.time() * 1000)
        with pymysql.connect(**database_kwargs()) as conn:
            conn.begin()
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, payload, created_at FROM inbox_items "
                    "WHERE key_hash = %s AND read_at IS NULL ORDER BY created_at, id FOR UPDATE",
                    (key_hash,),
                )
                rows = cursor.fetchall()
                if rows:
                    placeholders = ", ".join(["%s"] * len(rows))
                    cursor.execute(
                        f"UPDATE inbox_items SET read_at = %s WHERE key_hash = %s AND id IN ({placeholders})",
                        [now, key_hash, *(row["id"] for row in rows)],
                    )
            conn.commit()
        items = [{"id": row["id"], "payload": row["payload"], "createdAt": row["created_at"]} for row in rows]
        return jsonify({"items": items})

    return app
