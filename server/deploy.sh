#!/usr/bin/env bash
# 同步 server/ 到 aliyun 的 /opt/minidesk-inbox 并重启服务
set -euo pipefail
REMOTE_DIR=/opt/minidesk-inbox
HERE="$(cd "$(dirname "$0")" && pwd)"
rsync -av --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '.env' --exclude 'logs' --exclude '.pytest_cache' \
  "$HERE/" "aliyun:$REMOTE_DIR/"
# 服务器 venv 是 Python 3.9：rsync 后、重启前先编译检查，避免 3.10+ 语法让 worker 起不来（gunicorn "Worker failed to boot" → FATAL）。
ssh aliyun "cd $REMOTE_DIR && ./.venv/bin/python -m py_compile \$(grep -rl '^from\|^import' --include='*.py' . --exclude-dir=.venv | sort -u | tr '\n' ' ')"
ssh aliyun "cd $REMOTE_DIR && ./.venv/bin/pip install -q -r requirements.txt && supervisorctl restart minidesk-inbox"
