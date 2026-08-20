#!/usr/bin/env bash
# Produce all web-ready media for the landing page from raw recordings.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/assets/raw"
SHOTS="$ROOT/assets/shots"
MEDIA="$ROOT/landing/public/media"
mkdir -p "$MEDIA/themes" "$MEDIA/features" "$MEDIA/posters" "$MEDIA/shots"

ENC=(-c:v libx264 -preset medium -crf 27 -pix_fmt yuv420p -an -movflags +faststart)

# loop <input> <start> <end> <speed> <output>
loop() {
  local input="$1" start="$2" end="$3" speed="$4" output="$5"
  ffmpeg -y -v error -i "$input" \
    -vf "trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed},fps=30,scale=1280:800,format=yuv420p,setsar=1" \
    "${ENC[@]}" "$output"
}

echo "▸ theme loops"
for slug in bucket study work fitness travel creator finance; do
  loop "$RAW/theme-${slug}.webm" 8.5 20.3 1.15 "$MEDIA/themes/${slug}.mp4"
done

echo "▸ feature cuts"
loop "$RAW/feature-import.webm"   1.5 11.4 1.25 "$MEDIA/features/import.mp4"
loop "$RAW/feature-switcher.webm" 15.5 27.5 1.5  "$MEDIA/features/switcher.mp4"
loop "$RAW/feature-theme.webm"    7.2 11.8 1.0  "$MEDIA/features/theme.mp4"
loop "$RAW/feature-images.webm"   7.5 15.5 1.0  "$MEDIA/features/images.mp4"
loop "$RAW/feature-notes.webm"    6.8 12.9 1.0  "$MEDIA/features/notes.mp4"
# quick-actions / todos rows reuse the fitness/bucket loops with their own pacing
loop "$RAW/theme-fitness.webm"    8.6 17.0 1.05 "$MEDIA/features/quick.mp4"
loop "$RAW/theme-bucket.webm"    10.6 18.5 1.05 "$MEDIA/features/todos.mp4"

echo "▸ promo + poster"
cp "$ROOT/out/mini-desk-promo.mp4" "$MEDIA/promo.mp4"
ffmpeg -y -v error -ss 33 -i "$ROOT/out/mini-desk-promo.mp4" -frames:v 1 -q:v 4 "$MEDIA/posters/promo.jpg"

echo "▸ theme posters + board shots"
for slug in bucket study work fitness travel creator finance; do
  ffmpeg -y -v error -ss 2 -i "$MEDIA/themes/${slug}.mp4" -frames:v 1 -q:v 4 "$MEDIA/posters/${slug}.jpg"
  # 1280w static board screenshot for non-video fallbacks / gallery
  ffmpeg -y -v error -i "$SHOTS/theme-${slug}.png" -vf "scale=1280:-1" -q:v 4 "$MEDIA/shots/${slug}.jpg"
done
ffmpeg -y -v error -i "$SHOTS/feature-theme-dark.png" -vf "scale=1280:-1" -q:v 4 "$MEDIA/shots/dark.jpg"
ffmpeg -y -v error -i "$SHOTS/feature-images-preview.png" -vf "scale=1280:-1" -q:v 4 "$MEDIA/shots/preview.jpg"

echo "▸ summary"
du -h "$MEDIA"/promo.mp4 "$MEDIA"/themes/*.mp4 "$MEDIA"/features/*.mp4 | sed "s|$MEDIA/||"
