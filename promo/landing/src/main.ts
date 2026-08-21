import "./style.css";

interface ThemeDef {
  slug: string;
  name: string;
  slogan: string;
  chips: string[];
  color: string;
}

const THEMES: ThemeDef[] = [
  { slug: "bucket", name: "人生清单", slogan: "想做的事，一件件打勾", chips: ["双提醒列表", "梦想基金", "行前模板"], color: "#3b82f6" },
  { slug: "study", name: "前端进阶学习", slogan: "每天进步一点点", chips: ["课程文档", "刷题练习", "API 按钮"], color: "#22c55e" },
  { slug: "work", name: "我的工作台", slogan: "少开会，多做事", chips: ["高频入口", "协同工具", "日报模板"], color: "#14b8a6" },
  { slug: "fitness", name: "健身训练站", slogan: "练出线条，也练出耐心", chips: ["训练计划", "饮食记录", "身体数据"], color: "#f97316" },
  { slug: "travel", name: "旅行手账", slogan: "把远方，拆成一张张小票", chips: ["行程规划", "装备清单", "预算速算"], color: "#0ea5e9" },
  { slug: "creator", name: "内容创作工坊", slogan: "持续更新，比灵感更可靠", chips: ["选题库", "脚本大纲", "数据复盘"], color: "#8b5cf6" },
  { slug: "finance", name: "家庭账本", slogan: "钱不多，但要心里有数", chips: ["固定支出", "储蓄目标", "账单日"], color: "#10b981" },
];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;

/* ---------- theme (light/dark) + palette switching ---------- */
interface PaletteDef {
  id: string;
  name: string;
  swatch: [string, string, string];
}

const PALETTES: PaletteDef[] = [
  { id: "aurora", name: "极光", swatch: ["#5eeabe", "#22d3ee", "#a78bfa"] },
  { id: "ocean", name: "海洋", swatch: ["#7dd3fc", "#38bdf8", "#818cf8"] },
  { id: "sunset", name: "落日", swatch: ["#fbbf24", "#fb7185", "#e879f9"] },
  { id: "violet", name: "星紫", swatch: ["#c4b5fd", "#a78bfa", "#67e8f9"] },
];

const PREFS_KEY = "mini-desk-landing-prefs";

function currentPrefs(): { theme: string; palette: string } {
  return {
    theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
    palette: document.documentElement.getAttribute("data-palette") || "aurora",
  };
}

function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(currentPrefs()));
  } catch {
    /* 隐私模式等场景下静默降级为会话内切换 */
  }
}

/* 同步浏览器 chrome 颜色与色系菜单的选中态 */
function syncChromeState(): void {
  /* 从 --bg 变量取值而非 body 的 computed style:body 背景有过渡动画,切换瞬间读到的是旧值 */
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  const active = currentPrefs().palette;
  document.querySelectorAll<HTMLButtonElement>(".palette-opt").forEach((btn) => {
    btn.setAttribute("aria-checked", String(btn.dataset.palette === active));
  });
}

const themeToggle = document.getElementById("themeToggle");
themeToggle?.addEventListener("click", () => {
  const el = document.documentElement;
  el.setAttribute("data-theme", el.getAttribute("data-theme") === "light" ? "dark" : "light");
  savePrefs();
  syncChromeState();
});

const paletteBtn = document.getElementById("paletteBtn");
const palettePop = document.getElementById("palettePop");
if (palettePop) {
  palettePop.innerHTML = PALETTES.map(
    (p) => `
    <button class="palette-opt" type="button" role="menuitemradio" aria-checked="false" data-palette="${p.id}">
      <span class="opt-dot" style="background: linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]} 55%, ${p.swatch[2]})"></span>
      <span>${p.name}</span>
      <svg class="opt-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
    </button>`,
  ).join("");

  const closePop = () => {
    palettePop.classList.remove("open");
    paletteBtn?.setAttribute("aria-expanded", "false");
  };
  const openPop = () => {
    palettePop.classList.add("open");
    paletteBtn?.setAttribute("aria-expanded", "true");
  };

  palettePop.querySelectorAll<HTMLButtonElement>(".palette-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.documentElement.setAttribute("data-palette", btn.dataset.palette || "aurora");
      savePrefs();
      syncChromeState();
      closePop();
    });
  });

  paletteBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (palettePop.classList.contains("open")) closePop();
    else openPop();
  });
  /* 点击气泡外部关闭 */
  document.addEventListener("click", (event) => {
    if (palettePop.classList.contains("open") && !(event.target as Element | null)?.closest?.(".palette-wrap")) {
      closePop();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePop();
  });
}
syncChromeState();

/* ---------- theme gallery ---------- */
const grid = document.getElementById("themeGrid");
if (grid) {
  grid.innerHTML = THEMES.map(
    (t) => `
    <article class="theme-card reveal" style="--tc: ${t.color}" data-slug="${t.slug}">
      <span class="t-live">录屏直出</span>
      <div class="theme-media hover-play" data-video="/media/themes/${t.slug}.mp4" role="button" aria-label="播放 ${t.name} 看板演示">
        <img src="/media/posters/${t.slug}.jpg" alt="${t.name} 看板截图" loading="lazy" />
        <span class="play-badge" aria-hidden="true">▶</span>
      </div>
      <div class="theme-body">
        <div class="theme-name"><i class="t-dot"></i>${t.name}</div>
        <p class="theme-slogan">${t.slogan}</p>
        <div class="theme-chips">${t.chips.map((c) => `<span>${c}</span>`).join("")}</div>
      </div>
    </article>`,
  ).join("");
}

/* ---------- hover / tap to play: static poster by default, video on demand ---------- */
function initHoverPlay(container: HTMLElement): void {
  const src = container.dataset.video;
  if (!src) return;
  let video: HTMLVideoElement | null = null;
  const ensureVideo = (): HTMLVideoElement => {
    if (!video) {
      video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      container.appendChild(video);
    }
    return video;
  };
  const play = () => {
    const v = ensureVideo();
    container.classList.add("playing");
    v.play().catch(() => {});
  };
  const stop = () => {
    container.classList.remove("playing");
    video?.pause();
  };
  if (isTouch) {
    container.addEventListener("click", () => {
      if (container.classList.contains("playing")) stop();
      else play();
    });
  } else {
    container.addEventListener("pointerenter", play);
    container.addEventListener("pointerleave", stop);
  }
}
document.querySelectorAll<HTMLElement>(".hover-play").forEach(initHoverPlay);

/* ---------- marquee (seamless loop needs the track duplicated) ---------- */
const marqueeTrack = document.getElementById("marqueeTrack");
if (marqueeTrack) marqueeTrack.innerHTML += marqueeTrack.innerHTML;

/* ---------- nav scroll state ---------- */
const nav = document.getElementById("nav");
const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 12);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- scroll reveal ---------- */
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

/* ---------- videos: play only while visible ---------- */
const videoObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const video = entry.target as HTMLVideoElement;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  },
  { threshold: 0.15 },
);
document.querySelectorAll("video").forEach((video) => {
  if (prefersReducedMotion) video.removeAttribute("autoplay");
  videoObserver.observe(video);
});

/* ---------- hero sound toggle ---------- */
const promoVideo = document.getElementById("promoVideo") as HTMLVideoElement | null;
const soundToggle = document.getElementById("soundToggle") as HTMLButtonElement | null;
soundToggle?.addEventListener("click", () => {
  if (!promoVideo) return;
  promoVideo.muted = !promoVideo.muted;
  if (!promoVideo.muted) {
    promoVideo.currentTime = 0;
    promoVideo.play().catch(() => {});
  }
  soundToggle.textContent = promoVideo.muted ? "🔇 点开有声版" : "🔊 正在播放声音";
});

/* ---------- subtle 3D tilt on theme cards ---------- */
if (!isTouch && !prefersReducedMotion) {
  document.querySelectorAll<HTMLElement>(".theme-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${px * 5}deg) rotateX(${py * -5}deg) translateY(-4px)`;
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
}
