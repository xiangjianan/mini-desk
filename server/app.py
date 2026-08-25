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
