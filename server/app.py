"""手机速记中继：只存 AES-GCM 密文队列（沿用了早期 Cloudflare Worker 的协议，
客户端兼容性见 src/sync/ 与 CLAUDE.md「手机速记」一节）。

路由键是 SHA-256(配对码) 的 hex；条目保留 30 天，无账号、无按条删除（回收交给保留期清理）。
注册制：pairing_keys 三态（unknown/active/revoked），桌面端保存/轮换/启动时注册，
未注册码 POST 404、已注销码 POST 410（注销即永久，注册不复活）。幂等：同 id 覆盖。
自建服务器无次数限制：只做输入校验，不做限流/配额。
"""
import os
import time

import pymysql
from flask import Flask, Response, jsonify, request
from werkzeug.exceptions import HTTPException

MAX_CIPHER_BYTES = 4096
MAX_ID_LENGTH = 64
RETENTION_MS = 30 * 24 * 60 * 60 * 1000
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
