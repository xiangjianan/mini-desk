#!/usr/bin/env bash
# 同步 server/ 到 aliyun 的 /opt/minidesk-inbox 并重启服务
set -euo pipefail
REMOTE_DIR=/opt/minidesk-inbox
HERE="$(cd "$(dirname "$0")" && pwd)"
rsync -av --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '.env' --exclude 'logs' --exclude '.pytest_cache' \
  "$HERE/" "aliyun:$REMOTE_DIR/"
ssh aliyun "cd $REMOTE_DIR && ./.venv/bin/pip install -q -r requirements.txt && supervisorctl restart minidesk-inbox"
