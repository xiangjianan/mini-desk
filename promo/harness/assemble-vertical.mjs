// Assemble the vertical (1080x1920) Douyin cut from the camera-driven raw takes.
// - Beats come from v-*.marks.json; a white sync flash at t0 aligns marks to video time.
// - Scene takes stay continuous (camera moves ARE the transitions); scene boundaries
//   use 0.35s xfade crossfades. Captions are timed PNG pill overlays.
// Usage: node assemble-vertical.mjs
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const RAW = join(ROOT, "assets/raw");
const AUDIO = join(ROOT, "assets/audio");
const CARDS = join(ROOT, "assets/cards-v");
const CAPS = join(ROOT, "assets/captions-v");
const SEG = join(ROOT, "assets/seg-v");
const OUT = join(ROOT, "out");
mkdirSync(SEG, { recursive: true });
mkdirSync(OUT, { recursive: true });

const XFADE = 0.35; // crossfade seconds between scenes
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

/* ---------- 1. locate the sync flash → video time of mark "t0" ---------- */
function flashOffset(file) {
  const log = execSync(
    `ffmpeg -v info -t 5 -i "${file}" -vf "fps=15,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 | grep -E "pts_time|YAVG"`,
    { encoding: "utf8", shell: "/bin/bash" },
  );
  let best = { t: 0, y: -1 };
  let pendingT = 0;
  for (const line of log.split("\n")) {
    const mt = line.match(/pts_time:([\d.]+)/);
    if (mt) pendingT = Number(mt[1]);
    const my = line.match(/YAVG=([\d.]+)/);
    if (my && Number(my[1]) > best.y) best = { t: pendingT, y: Number(my[1]) };
  }
  if (best.y < 60) throw new Error(`sync flash not found in ${file} (peak YAVG ${best.y})`);
  return Math.max(0, best.t - 0.08); // flash starts ~one frame before the peak
}

const offsets = {};
const marks = {};
for (const name of ["v-work", "v-travel", "v-spaces"]) {
  const raw = join(RAW, `${name}.webm`);
  offsets[name] = flashOffset(raw);
  const list = JSON.parse(readFileSync(join(RAW, `${name}.marks.json`), "utf8"));
  marks[name] = Object.fromEntries(list.map(({ label, t }) => [label, t + offsets[name]]));
  console.log(`✂ ${name}: flash@${offsets[name].toFixed(2)}s`, JSON.stringify(marks[name]));
}

/* ---------- 2. segment plan (video times already include the flash offset) ---------- */
const W = marks["v-work"];
const B = marks["v-travel"];
const C = marks["v-spaces"];

// captions: [png, fromVideoTime, toVideoTime] — converted to segment-local seconds
const SEGMENTS = [
  { kind: "card", png: join(CARDS, "intro.png"), dur: 2.8, name: "v01-intro" },
  {
    kind: "take", src: join(RAW, "v-work.webm"), start: W.t0 + 0.35, end: W["A-notes"] + 0.5, speed: 1.08, name: "v02-work",
    captions: [
      ["cap-a1", W.t0 + 0.6, W["A-import"] - 0.5],
      ["cap-a2", W["A-import"] + 0.5, W["A-quick"] - 0.4],
      ["cap-a3", W["A-quick"] + 0.5, W["A-todos"] - 0.4],
      ["cap-a4", W["A-todos"] + 0.5, W["A-notes"] + 0.3],
    ],
  },
  {
    kind: "take", src: join(RAW, "v-travel.webm"), start: B["B-ready"] + 0.25, end: B["B-preview"] + 1.3, speed: 1.12, name: "v03-images",
    captions: [["cap-b1", B["B-ready"] + 0.55, B["B-preview"] + 1.0]],
  },
  {
    kind: "take", src: join(RAW, "v-spaces.webm"), start: C["C-ready"] + 0.3, end: C["C-switcher"] + 0.35, speed: 1.35, name: "v04-switcher",
    captions: [["cap-c1", C["C-ready"] + 0.7, C["C-switcher"] + 0.1]],
  },
  {
    kind: "take", src: join(RAW, "v-spaces.webm"), start: C["C-switcher"] + 0.55, end: C["C-montage-健身训练站"] + 0.05, speed: 1.3, name: "v05-montage",
    // mark = camera parked on the theme's todo panel; the theme becomes visible
    // ~1.95s before the mark (item click) and stays until the next click, so each
    // caption covers arrival + parked dwell + start of departure.
    captions: [
      ["cap-m1", C["C-montage-人生清单"] - 1.8, C["C-montage-人生清单"] + 1.9],
      ["cap-m2", C["C-montage-内容创作工坊"] - 1.8, C["C-montage-内容创作工坊"] + 1.9],
      ["cap-m3", C["C-montage-旅行手账"] - 1.8, C["C-montage-旅行手账"] + 1.9],
      ["cap-m4", C["C-montage-健身训练站"] - 1.8, C["C-montage-健身训练站"] + 0.02],
    ],
  },
  {
    kind: "take", src: join(RAW, "v-spaces.webm"), start: C["C-montage-健身训练站"] + 0.25, end: C["C-theme"] + 0.35, speed: 1.05, name: "v06-theme",
    captions: [["cap-c3", C["C-montage-健身训练站"] + 0.6, C["C-theme"] + 0.15]],
  },
  { kind: "card", png: join(CARDS, "outro.png"), dur: 5.6, name: "v07-outro" },
];

/* ---------- 3. render segments ---------- */
const ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-an"];
const rendered = [];

for (const seg of SEGMENTS) {
  const out = join(SEG, `${seg.name}.mp4`);
  if (seg.kind === "card") {
    sh("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-t", String(seg.dur), "-i", seg.png,
      "-vf", "fps=30,format=yuv420p,setsar=1", ...ENC, out]);
  } else {
    const dur = (seg.end - seg.start) / seg.speed;
    const base = `trim=start=${seg.start}:end=${seg.end},setpts=(PTS-STARTPTS)/${seg.speed},fps=30,format=yuv420p,setsar=1`;
    const inputs = ["-i", seg.src];
    const filters = [`[0:v]${base}[base]`];
    let last = "base";
    (seg.captions ?? []).forEach(([png, from, to], i) => {
      const li = i + 1;
      inputs.push("-loop", "1", "-t", String(dur), "-i", join(CAPS, `${png}.png`));
      const fromL = (from - seg.start) / seg.speed;
      const toL = (to - seg.start) / seg.speed;
      filters.push(
        `[${li}:v]format=argb,fade=t=in:st=${fromL.toFixed(2)}:d=0.25:alpha=1,fade=t=out:st=${(toL - 0.25).toFixed(2)}:d=0.25:alpha=1[cap${li}]`,
        `[${last}][cap${li}]overlay=0:0:enable='between(t,${fromL.toFixed(2)},${toL.toFixed(2)})'[v${li}]`,
      );
      last = `v${li}`;
    });
    sh("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", `[${last}]`, ...ENC, out]);
  }
  rendered.push({ name: seg.name, file: out, dur: probe(out) });
  console.log(`▸ ${seg.name}  ${rendered[rendered.length - 1].dur.toFixed(2)}s`);
}

/* ---------- 4. xfade chain ---------- */
let vchain = "";
let vlabel = "0:v";
let offset = 0;
const starts = []; // output-timeline start time of each segment
rendered.forEach((seg, i) => {
  starts.push(offset);
  if (i === 0) {
    offset = seg.dur;
    return;
  }
  const outLabel = `xf${i}`;
  offset = offset - XFADE;
  vchain += `[${vlabel}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(2)}[${outLabel}];`;
  vlabel = outLabel;
  offset += seg.dur;
});
const total = offset;
sh("ffmpeg", ["-y", "-v", "error", ...rendered.flatMap((s) => ["-i", s.file]),
  "-filter_complex", vchain.slice(0, -1), "-map", `[${vlabel}]`, ...ENC, join(OUT, "promo-v-video.mp4")]);
console.log(`▸ video track ${total.toFixed(2)}s`);

/* ---------- 5. narration + music ---------- */
// narration lands at the output-timeline position of its beat's mark
function outTime(segIndex, videoTime) {
  const seg = SEGMENTS[segIndex];
  return starts[segIndex] + (videoTime - seg.start) / seg.speed;
}
const NARR = [
  ["n2-import.mp3", outTime(1, W.t0 + 0.9)],
  ["n3-quick.mp3", outTime(1, W["A-import"] + 0.6)],
  ["n4-todos.mp3", outTime(1, W["A-quick"] + 0.7)],
  ["n5-notes.mp3", outTime(1, W["A-todos"] + 0.7)],
  ["n6-images.mp3", outTime(2, B["B-ready"] + 0.8)],
  ["n7-switcher.mp3", outTime(3, C["C-ready"] + 0.8)],
  ["n8-theme.mp3", outTime(5, C["C-montage-健身训练站"] + 0.8)],
  ["n10-outro.mp3", starts[6] + 0.4],
];
const audioInputs = NARR.flatMap(([f]) => ["-i", join(AUDIO, f)]);
const narrFilters = NARR.map(([, t], i) => `[${i}:a]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[a${i}]`).join(";");
const narrMix = `${NARR.map((_, i) => `[a${i}]`).join("")}amix=inputs=${NARR.length}:normalize=0[narr]`;
const musicIdx = NARR.length;
const audioFilter =
  `${narrFilters};${narrMix};` +
  `[${musicIdx}:a]atrim=0:${total.toFixed(2)},volume=0.13,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2).toFixed(2)}:d=2.0[music];` +
  `[narr][music]amix=inputs=2:normalize=0[aout]`;
sh("ffmpeg", ["-y", "-v", "error", ...audioInputs, "-stream_loop", "-1", "-i", join(AUDIO, "music-bed.mp3"),
  "-filter_complex", audioFilter, "-map", "[aout]", "-t", String(total.toFixed(2)), "-c:a", "aac", "-b:a", "160k", join(OUT, "promo-v-audio.m4a")]);
console.log("▸ narration at", NARR.map(([f, t]) => `${f.split(".")[0]}@${t.toFixed(1)}s`).join(" "));

/* ---------- 6. mux ---------- */
const finalPath = join(OUT, "mini-desk-promo-vertical.mp4");
sh("ffmpeg", ["-y", "-v", "error", "-i", join(OUT, "promo-v-video.mp4"), "-i", join(OUT, "promo-v-audio.m4a"),
  "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", finalPath]);
const size = execSync(`du -h "${finalPath}"`, { encoding: "utf8" }).split("\t")[0];
writeFileSync(join(OUT, "vertical-timeline.json"), JSON.stringify({ starts, total }, null, 2));
console.log(`✔ vertical promo → ${finalPath}  (${total.toFixed(2)}s, ${size})`);
