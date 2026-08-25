#!/bin/sh
# supervisord 启动入口：加载 .env 后以 gunicorn 前台运行
cd /opt/minidesk-inbox || exit 1
set -a
. ./.env
set +a
exec ./.venv/bin/gunicorn -b 127.0.0.1:8787 --workers 2 "app:create_app()"
