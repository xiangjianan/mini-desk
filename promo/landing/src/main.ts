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

/* ---------- theme gallery ---------- */
const grid = document.getElementById("themeGrid");
if (grid) {
  grid.innerHTML = THEMES.map(
    (t) => `
    <article class="theme-card reveal" style="--tc: ${t.color}" data-slug="${t.slug}">
      <span class="t-live">录屏直出</span>
      <div class="theme-media">
        <video src="/media/themes/${t.slug}.mp4" poster="/media/posters/${t.slug}.jpg" muted loop playsinline preload="metadata" aria-label="${t.name} 看板演示"></video>
      </div>
      <div class="theme-body">
        <div class="theme-name"><i class="t-dot"></i>${t.name}</div>
        <p class="theme-slogan">${t.slogan}</p>
        <div class="theme-chips">${t.chips.map((c) => `<span>${c}</span>`).join("")}</div>
      </div>
    </article>`,
  ).join("");
}

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
