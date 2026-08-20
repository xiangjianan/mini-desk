// Assemble the landscape (1600x1000) Mini Desk promo from the camera-driven raw takes.
// Camera stays wide by default; zooms happen only at key beats (import menu,
// template copy, todo pin, note typing, image drop, switcher hop, theme toggle).
// The theme montage is full-board hops labeled by colored caption pills.
// - Beats come from w-*.marks.json; a white sync flash at t0 aligns marks to video time.
// - Scene takes stay continuous (camera moves ARE the transitions); scene boundaries
//   use 0.35s xfade crossfades. Captions are timed PNG pill overlays.
// Usage: node assemble-wide.mjs
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const RAW = join(ROOT, "assets/raw");
const AUDIO = join(ROOT, "assets/audio");
const CARDS = join(ROOT, "assets/cards");
const CAPS = join(ROOT, "assets/captions");
const SEG = join(ROOT, "assets/seg");
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
for (const name of ["w-work", "w-travel", "w-spaces"]) {
  const raw = join(RAW, `${name}.webm`);
  offsets[name] = flashOffset(raw);
  const list = JSON.parse(readFileSync(join(RAW, `${name}.marks.json`), "utf8"));
  marks[name] = Object.fromEntries(list.map(({ label, t }) => [label, t + offsets[name]]));
  console.log(`✂ ${name}: flash@${offsets[name].toFixed(2)}s`, JSON.stringify(marks[name]));
}

/* ---------- 2. segment plan (video times already include the flash offset) ---------- */
const W = marks["w-work"];
const B = marks["w-travel"];
const C = marks["w-spaces"];

// captions: [png, fromVideoTime, toVideoTime] — converted to segment-local seconds
const SEGMENTS = [
  { kind: "card", png: join(CARDS, "intro.png"), dur: 2.8, name: "w01-intro" },
  {
    kind: "take", src: join(RAW, "w-work.webm"), start: W.t0 + 0.35, end: W["A-notes"] + 1.1, speed: 1.1, name: "w02-work",
    captions: [
      ["cap-s02", W.t0 + 0.5, W["A-import"] + 1.3],
      ["cap-s03", W["A-import"] + 1.8, W["A-quick"] + 1.0],
      ["cap-s04", W["A-quick"] + 1.5, W["A-todos"] + 1.0],
      ["cap-s05", W["A-todos"] + 1.5, W["A-notes"] + 0.9],
    ],
  },
  {
    kind: "take", src: join(RAW, "w-travel.webm"), start: B["B-ready"] + 0.25, end: B["B-preview"] + 1.4, speed: 1.1, name: "w03-images",
    captions: [["cap-s06", B["B-ready"] + 0.6, B["B-preview"] + 1.1]],
  },
  {
    kind: "take", src: join(RAW, "w-spaces.webm"), start: C["C-ready"] + 0.3, end: C["C-switch"] + 1.2, speed: 1.25, name: "w04-switcher",
    captions: [["cap-s07", C["C-ready"] + 0.7, C["C-switch"] + 0.9]],
  },
  {
    // full-board montage — natural speed so the n9 narration fits end to end
    kind: "take", src: join(RAW, "w-spaces.webm"), start: C["C-switch"] + 1.4, end: C["C-montage-健身训练站"] + 1.1, speed: 1.0, name: "w05-montage",
    captions: [
      ["cap-m1", C["C-montage-人生清单"] - 2.1, C["C-montage-人生清单"] + 1.3],
      ["cap-m6", C["C-montage-内容创作工坊"] - 2.1, C["C-montage-内容创作工坊"] + 1.3],
      ["cap-m4", C["C-montage-健身训练站"] - 2.1, C["C-montage-健身训练站"] + 1.0],
    ],
  },
  {
    kind: "take", src: join(RAW, "w-spaces.webm"), start: C["C-montage-健身训练站"] + 1.3, end: C["C-theme"] + 0.5, speed: 1.0, name: "w06-theme",
    captions: [["cap-s08", C["C-montage-健身训练站"] + 1.9, C["C-theme"] + 0.3]],
  },
  // 6.6s so the 5.66s outro narration (starting +0.4s) is never clipped
  { kind: "card", png: join(CARDS, "outro.png"), dur: 6.6, name: "w07-outro" },
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
  "-filter_complex", vchain.slice(0, -1), "-map", `[${vlabel}]`, ...ENC, join(OUT, "promo-wide-video.mp4")]);
console.log(`▸ video track ${total.toFixed(2)}s`);

/* ---------- 5. narration + music ---------- */
// narration lands at the output-timeline position of its beat's mark
function outTime(segIndex, videoTime) {
  const seg = SEGMENTS[segIndex];
  return starts[segIndex] + (videoTime - seg.start) / seg.speed;
}
const NARR = [
  ["n2-import.mp3", outTime(1, W.t0 + 0.9)],
  ["n3-quick.mp3", outTime(1, W["A-import"] + 0.9)],
  ["n4-todos.mp3", outTime(1, W["A-quick"] + 0.9)],
  ["n5-notes.mp3", outTime(1, W["A-todos"] + 0.9)],
  ["n6-images.mp3", outTime(2, B["B-ready"] + 0.8)],
  ["n7-switcher.mp3", outTime(3, C["C-ready"] + 0.8)],
  ["n9-montage.mp3", outTime(4, C["C-switch"] + 1.8)],
  ["n8-theme.mp3", outTime(5, C["C-montage-健身训练站"] + 1.7)],
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
  "-filter_complex", audioFilter, "-map", "[aout]", "-t", String(total.toFixed(2)), "-c:a", "aac", "-b:a", "160k", join(OUT, "promo-wide-audio.m4a")]);
console.log("▸ narration at", NARR.map(([f, t]) => `${f.split(".")[0]}@${t.toFixed(1)}s`).join(" "));

/* ---------- 6. mux ---------- */
const finalPath = join(OUT, "mini-desk-promo.mp4");
sh("ffmpeg", ["-y", "-v", "error", "-i", join(OUT, "promo-wide-video.mp4"), "-i", join(OUT, "promo-wide-audio.m4a"),
  "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", finalPath]);
const size = execSync(`du -h "${finalPath}"`, { encoding: "utf8" }).split("\t")[0];
writeFileSync(join(OUT, "wide-timeline.json"), JSON.stringify({ starts, total }, null, 2));
console.log(`✔ landscape promo → ${finalPath}  (${total.toFixed(2)}s, ${size})`);
