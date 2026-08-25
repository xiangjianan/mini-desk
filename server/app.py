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
