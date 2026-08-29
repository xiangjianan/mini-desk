import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = (path) => resolve(root, path);
const work = out("tmp/mini-desk-cat-assets");

mkdirSync(work, { recursive: true });
mkdirSync(out("static/img"), { recursive: true });
mkdirSync(out("static/video"), { recursive: true });

const light = {
  bg: "#f7f5ef",
  ink: "#5f5a52",
  mid: "#837c72",
  detail: "#f1eee6",
  quiet: "#c9c4ba",
  accent: "#aaa398",
};

const dark = {
  bg: "#171615",
  ink: "#d8d2c6",
  mid: "#aaa398",
  detail: "#3c3935",
  quiet: "#69635b",
  accent: "#8d867b",
};

const GIF_FRAME_COUNT = 12;
const CAT_OFFSET_X = -2;
const CAT_OFFSET_Y = -1;

function rect(x, y, w, h, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;
}

function poly(points, fill) {
  return `<polygon points="${points.map((point) => point.join(",")).join(" ")}" fill="${fill}"/>`;
}

function tail(p, frame, y) {
  const sway = [0, 1, 1, 0, -1, -1, 0, 0][frame % 8];
  return [
    rect(23 + sway, 20 + y, 4, 3, p.ink),
    rect(26 + sway, 17 + y, 2, 5, p.ink),
    rect(24 + sway, 16 + y, 3, 2, p.ink),
    rect(24 + sway, 20 + y, 2, 1, p.mid),
  ].join("");
}

function catSvg(p, frame = 0) {
  const y = frame === 1 || frame === 6 ? -1 : 0;
  const blink = frame === 4;
  const ear = frame === 2 ? -1 : 0;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">`,
    `<g transform="translate(${CAT_OFFSET_X} ${CAT_OFFSET_Y})">`,
    tail(p, frame, y),
    rect(8, 23 + y, 17, 4, p.ink),
    rect(10, 20 + y, 13, 4, p.ink),
    rect(12, 24 + y, 4, 2, p.detail),
    rect(20, 24 + y, 3, 2, p.detail),
    rect(8, 8 + y + ear, 2, 3, p.ink),
    rect(8, 11 + y, 5, 2, p.ink),
    rect(9, 13 + y, 5, 2, p.ink),
    rect(21, 8 + y - ear, 2, 3, p.ink),
    rect(18, 11 + y, 5, 2, p.ink),
    rect(18, 13 + y, 5, 2, p.ink),
    rect(8, 13 + y, 16, 8, p.ink),
    rect(10, 12 + y, 12, 2, p.ink),
    rect(13, 16 + y, 6, 4, p.detail),
    blink ? rect(11, 15 + y, 3, 1, p.detail) : rect(11, 14 + y, 2, 3, p.detail),
    blink ? rect(19, 15 + y, 3, 1, p.detail) : rect(20, 14 + y, 2, 3, p.detail),
    rect(15, 16 + y, 2, 1, p.mid),
    rect(14, 18 + y, 4, 1, p.mid),
    rect(8, 18 + y, 4, 1, p.detail),
    rect(20, 18 + y, 4, 1, p.detail),
    rect(13, 9 + y, 2, 2, p.quiet),
    rect(18, 9 + y, 2, 2, p.quiet),
    rect(16, 7 + y, 1, 3, p.accent),
    `</g>`,
    `</svg>`,
  ].join("");
}

function renderTheme(name, palette) {
  const suffix = name === "dark" ? "-dark" : "";
  const staticSvg = resolve(work, `${name}.svg`);
  writeFileSync(staticSvg, catSvg(palette, 0));
  execFileSync("magick", ["-background", "none", staticSvg, "-alpha", "on", "-filter", "point", "-resize", "512x512", "-depth", "8", out(`static/img/mini-desk-cat${suffix}.png`)]);

  const frames = [];
  for (let frame = 0; frame < GIF_FRAME_COUNT; frame += 1) {
    const svgPath = resolve(work, `${name}-${String(frame).padStart(2, "0")}.svg`);
    const pngPath = resolve(work, `${name}-${String(frame).padStart(2, "0")}.png`);
    writeFileSync(svgPath, catSvg(palette, frame));
    execFileSync("magick", ["-background", "none", svgPath, "-alpha", "on", "-filter", "point", "-resize", "128x128", "-depth", "8", pngPath]);
    frames.push(pngPath);
  }
  execFileSync("magick", ["-dispose", "Background", "-delay", "15", "-loop", "0", ...frames, "-layers", "OptimizeTransparency", out(`static/video/mini-desk-cat${suffix}.gif`)]);
}

renderTheme("light", light);
renderTheme("dark", dark);

execFileSync("magick", [out("static/img/mini-desk-cat.png"), "-background", "#ffffff", "-alpha", "remove", "-alpha", "off", "-resize", "512x512", "-depth", "8", out("favicon.png")]);
execFileSync("magick", [out("favicon.png"), "-background", light.bg, "-alpha", "remove", "-quality", "96", out("favicon.jpeg")]);
execFileSync("magick", [out("favicon.png"), "-background", "#ffffff", "-alpha", "remove", "-alpha", "off", "-depth", "8", resolve(work, "favicon-ico-source.png")]);
execFileSync("magick", [resolve(work, "favicon-ico-source.png"), "-define", "icon:auto-resize=64,48,32,16", out("favicon.ico")]);
