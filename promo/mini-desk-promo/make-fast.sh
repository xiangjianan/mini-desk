#!/usr/bin/env bash
# make-fast.sh — 统一提速成片（VO + 动效 + SFX 同步缩放，零失同步）。
# 母版始终是 renders/video.mp4（1.0×）；本脚本产出提速交付版。
# 用法: ./make-fast.sh [倍率]   # 默认 1.15
set -euo pipefail
cd "$(dirname "$0")"
RATE="${1:-1.15}"
ffmpeg -y -v error -i renders/video.mp4 \
  -filter_complex "[0:v]setpts=PTS/${RATE}[v];[0:a]atempo=${RATE}[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k \
  renders/promo-fast.mp4
echo "✓ renders/promo-fast.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 renders/promo-fast.mp4)s, ${RATE}x)"
