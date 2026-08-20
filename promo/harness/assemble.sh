#!/usr/bin/env bash
# Assemble the Mini Desk promo video from recorded sessions + TTS narration.
# Captions are pre-rendered PNG pills composited with the overlay filter
# (the local ffmpeg build has no drawtext).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/assets/raw"
AUDIO="$ROOT/assets/audio"
CARDS="$ROOT/assets/cards"
CAP="$ROOT/assets/captions"
SEG="$ROOT/assets/seg"
OUT="$ROOT/out"
mkdir -p "$SEG" "$OUT"

ENC=(-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an)

# cut <input> <start> <end> <speed> <output> <caption.png|->
cut() {
  local input="$1" start="$2" end="$3" speed="$4" output="$5" caption="$6"
  local dur out_st
  dur=$(python3 -c "print((${end} - ${start}) / ${speed})")
  out_st=$(python3 -c "print(round(${dur} - 0.3, 3))")
  local chain="trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed},fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=${out_st}:d=0.3"
  if [[ "$caption" == "-" ]]; then
    ffmpeg -y -v error -i "$input" -vf "${chain}" "${ENC[@]}" "$output"
  else
    local cap_st
    cap_st=$(python3 -c "print(round(${dur} - 0.25, 3))")
    ffmpeg -y -v error -i "$input" -loop 1 -t "$dur" -i "$caption" \
      -filter_complex "[0:v]${chain}[base];[1:v]format=argb,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${cap_st}:d=0.25:alpha=1[cap];[base][cap]overlay=0:0:shortest=1[out]" \
      -map "[out]" "${ENC[@]}" "$output"
  fi
}

echo "▸ s01 intro card"
ffmpeg -y -v error -loop 1 -t 3.2 -i "$CARDS/intro.png" \
  -vf "fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.9:d=0.3" \
  "${ENC[@]}" "$SEG/s01.mp4"

echo "▸ s02 import";        cut "$RAW/feature-import.webm"   1.5 11.4 1.25 "$SEG/s02.mp4" "$CAP/cap-s02.png"
echo "▸ s03 quick actions"; cut "$RAW/theme-fitness.webm"    8.6 14.9 1.05 "$SEG/s03.mp4" "$CAP/cap-s03.png"
echo "▸ s04 todos";         cut "$RAW/theme-bucket.webm"    10.6 16.9 1.05 "$SEG/s04.mp4" "$CAP/cap-s04.png"
echo "▸ s05 notes";         cut "$RAW/feature-notes.webm"    6.8 12.9 1.0  "$SEG/s05.mp4" "$CAP/cap-s05.png"
echo "▸ s06 images";        cut "$RAW/feature-images.webm"   7.5 15.5 1.0  "$SEG/s06.mp4" "$CAP/cap-s06.png"
echo "▸ s07 switcher";      cut "$RAW/feature-switcher.webm" 15.5 27.5 1.5 "$SEG/s07.mp4" "$CAP/cap-s07.png"
echo "▸ s08 theme toggle";  cut "$RAW/feature-theme.webm"    7.2 11.8 1.0  "$SEG/s08.mp4" "$CAP/cap-s08.png"

echo "▸ s09 theme montage"
M=( "bucket:cap-m1" "study:cap-m2" "work:cap-m3" "fitness:cap-m4" "travel:cap-m5" "creator:cap-m6" "finance:cap-m7" )
i=0
for entry in "${M[@]}"; do
  IFS=: read -r slug cap <<<"$entry"
  i=$((i + 1))
  cut "$RAW/theme-${slug}.webm" 11.0 13.4 1.2 "$SEG/s09-${i}.mp4" "$CAP/${cap}.png"
done

echo "▸ s10 outro card"
ffmpeg -y -v error -loop 1 -t 6.4 -i "$CARDS/outro.png" \
  -vf "fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=5.9:d=0.5" \
  "${ENC[@]}" "$SEG/s10.mp4"

echo "▸ concat video"
cat > "$SEG/list.txt" <<EOF
file 's01.mp4'
file 's02.mp4'
file 's03.mp4'
file 's04.mp4'
file 's05.mp4'
file 's06.mp4'
file 's07.mp4'
file 's08.mp4'
file 's09-1.mp4'
file 's09-2.mp4'
file 's09-3.mp4'
file 's09-4.mp4'
file 's09-5.mp4'
file 's09-6.mp4'
file 's09-7.mp4'
file 's10.mp4'
EOF
ffmpeg -y -v error -f concat -safe 0 -i "$SEG/list.txt" -c copy "$OUT/promo-video.mp4"

echo "▸ mix narration + music"
ffmpeg -y -v error \
  -i "$AUDIO/n2-import.mp3" -i "$AUDIO/n3-quick.mp3" -i "$AUDIO/n4-todos.mp3" \
  -i "$AUDIO/n5-notes.mp3" -i "$AUDIO/n6-images.mp3" -i "$AUDIO/n7-switcher.mp3" \
  -i "$AUDIO/n8-theme.mp3" -i "$AUDIO/n9-montage.mp3" -i "$AUDIO/n10-outro.mp3" \
  -stream_loop -1 -i "$AUDIO/music-bed.mp3" \
  -filter_complex "\
[0:a]adelay=4000|4000[a2];\
[1:a]adelay=11400|11400[a3];\
[2:a]adelay=17500|17500[a4];\
[3:a]adelay=23500|23500[a5];\
[4:a]adelay=29800|29800[a6];\
[5:a]adelay=38000|38000[a7];\
[6:a]adelay=45700|45700[a8];\
[7:a]adelay=51400|51400[a9];\
[8:a]adelay=64200|64200[a10];\
[a2][a3][a4][a5][a6][a7][a8][a9][a10]amix=inputs=9:normalize=0[narr];\
[9:a]atrim=0:70.2,volume=0.13,afade=t=in:st=0:d=1.2,afade=t=out:st=68.2:d=2.0[music];\
[narr][music]amix=inputs=2:normalize=0[aout]" \
  -map "[aout]" -t 70.2 -c:a aac -b:a 160k "$OUT/promo-audio.m4a"

echo "▸ mux"
ffmpeg -y -v error -i "$OUT/promo-video.mp4" -i "$OUT/promo-audio.m4a" -c:v copy -c:a copy -movflags +faststart "$OUT/mini-desk-promo.mp4"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/mini-desk-promo.mp4")
SIZE=$(du -h "$OUT/mini-desk-promo.mp4" | /usr/bin/cut -f1)
echo "✔ promo → $OUT/mini-desk-promo.mp4  (${DUR}s, ${SIZE})"
