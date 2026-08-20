#!/usr/bin/env python3
"""Render vertical (1080x1920) title cards and caption pills for the Douyin cut."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
CARDS = ROOT.parent / "assets" / "cards-v"
CAPS = ROOT.parent / "assets" / "captions-v"
CARDS.mkdir(parents=True, exist_ok=True)
CAPS.mkdir(parents=True, exist_ok=True)

W, H = 1080, 1920
FONT_DIR = Path("/Users/xiangjianan/Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/python/fonts")
FONT_BOLD = str(FONT_DIR / "NotoSansSC-Bold.ttf")
FONT_REG = str(FONT_DIR / "NotoSansSC-Regular.ttf")
LOGO = REPO / "favicon.png"

# ---------------- cards ----------------


def background() -> Image.Image:
    """Deep-navy base with aurora glows and a touch of grain (vertical framing)."""
    top = np.array([10, 14, 26], dtype=np.float32)
    bottom = np.array([16, 22, 40], dtype=np.float32)
    ramp = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    col = top[None, None, :] * (1 - ramp) + bottom[None, None, :] * ramp
    img = Image.fromarray(np.repeat(col, W, axis=1).astype(np.uint8), "RGB")

    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-320, -380, 620, 460], fill=(16, 64, 52))       # teal-green, top-left
    gd.ellipse([480, -420, 1420, 380], fill=(34, 40, 84))       # indigo, top-right
    gd.ellipse([420, 1180, 1500, 2120], fill=(46, 26, 70))      # violet, bottom-right
    gd.ellipse([-460, 1300, 480, 2200], fill=(10, 44, 58))      # cyan, bottom-left
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    img = Image.blend(img, Image.blend(img, glow, 0.85), 0.5)

    beam = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(beam)
    bd.rectangle([0, H // 2 - 150, W, H // 2 + 150], fill=24)
    beam = beam.filter(ImageFilter.GaussianBlur(110))
    img = Image.composite(Image.new("RGB", (W, H), (28, 46, 64)), img, beam)

    noise = np.random.default_rng(7).normal(0, 3.2, (H, W, 1)).repeat(3, axis=2)
    return Image.fromarray(np.clip(np.asarray(img, dtype=np.float32) + noise, 0, 255).astype(np.uint8), "RGB")


def paste_logo(img: Image.Image, cy: int, size: int = 168) -> None:
    logo = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    halo = Image.new("RGBA", (size * 3, size * 3), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([size // 2, size // 2, size * 5 // 2, size * 5 // 2], fill=(80, 200, 160, 90))
    halo = halo.filter(ImageFilter.GaussianBlur(40))
    img.paste(halo, (W // 2 - size * 3 // 2, cy - size * 3 // 2), halo)
    img.paste(logo, (W // 2 - size // 2, cy - size // 2), logo)


def text(draw: ImageDraw.ImageDraw, y: int, value: str, font: ImageFont.FreeTypeFont,
         fill=(244, 247, 252, 255), tracking: int = 0) -> int:
    width = (
        sum(draw.textlength(ch, font=font) for ch in value) + tracking * (len(value) - 1)
        if tracking
        else draw.textlength(value, font=font)
    )
    x = (W - width) / 2
    cx = x
    for ch in value:
        draw.text((cx, y), ch, font=font, fill=fill)
        cx += draw.textlength(ch, font=font) + (tracking if tracking else 0)
    return y + font.size


def intro() -> None:
    img = background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    paste_logo(img, 560)
    text(draw, 700, "Mini Desk", ImageFont.truetype(FONT_BOLD, 116), tracking=2)
    text(draw, 866, "本地优先的个人桌面工作台", ImageFont.truetype(FONT_REG, 48), fill=(205, 216, 232, 255), tracking=6)
    uw = 440
    draw.rounded_rectangle([(W - uw) / 2, 940, (W + uw) / 2, 945], radius=2, fill=(94, 234, 190, 200))
    text(draw, 986, "截图 · 便签 · 提醒 · 快捷动作", ImageFont.truetype(FONT_REG, 34), fill=(148, 163, 190, 255), tracking=2)
    text(draw, 1044, "都收在这一张安静的小桌面", ImageFont.truetype(FONT_REG, 34), fill=(148, 163, 190, 255), tracking=2)
    img.convert("RGB").save(CARDS / "intro.png")


def outro() -> None:
    img = background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    paste_logo(img, 600, size=140)
    text(draw, 726, "Do less, do it well.", ImageFont.truetype(FONT_BOLD, 78))
    text(draw, 856, "打开浏览器，三分钟布置好你的小桌面", ImageFont.truetype(FONT_REG, 37), fill=(205, 216, 232, 255), tracking=2)
    pill_font = ImageFont.truetype(FONT_BOLD, 40)
    label = "minidesk.online"
    tw = draw.textlength(label, font=pill_font)
    px, py = (W - tw) / 2, 972
    draw.rounded_rectangle([px - 38, py - 18, px + tw + 38, py + 66], radius=42,
                           outline=(94, 234, 190, 230), width=3)
    draw.text((px, py), label, font=pill_font, fill=(126, 240, 200, 255))
    text(draw, 1120, "数据保存在本地浏览器 · 无需注册 · 免费使用", ImageFont.truetype(FONT_REG, 28), fill=(148, 163, 190, 255), tracking=2)
    img.convert("RGB").save(CARDS / "outro.png")


# ---------------- caption pills ----------------

FONT_SIZE = 44
PAD_X, PAD_Y = 32, 18
PILL_Y = int(H * 0.755)  # sits above Douyin's bottom UI
RADIUS = 20

SEGMENTS = {
    "cap-a1": ("导入主题空间，十秒上手", None),
    "cap-a2": ("快捷动作：链接 · 应用 · 模板，一键直达", None),
    "cap-a3": ("星标 + 截止，今日重点自动置顶", None),
    "cap-a4": ("便签多页签，Tab 缩进随手记", None),
    "cap-b1": ("截图照片拖进来，图床自动收好", None),
    "cap-c1": ("多工作空间，装下生活每一面", None),
    "cap-c3": ("浅色 / 深色，随手切换", None),
}

MONTAGE = [
    ("cap-m1", "人生清单", (59, 130, 246)),
    ("cap-m2", "内容创作工坊", (139, 92, 246)),
    ("cap-m3", "旅行手账", (14, 165, 233)),
    ("cap-m4", "健身训练站", (249, 115, 22)),
]


def render_cap(name: str, value: str, accent: tuple[int, int, int] | None) -> None:
    font = ImageFont.truetype(FONT_BOLD, FONT_SIZE)
    probe = Image.new("RGBA", (8, 8))
    pd = ImageDraw.Draw(probe)
    left, top, right, bottom = pd.textbbox((0, 0), value, font=font)
    tw, th = right - left, bottom - top
    pill_w = tw + PAD_X * 2
    pill_h = th + PAD_Y * 2
    x0 = (W - pill_w) // 2
    y0 = PILL_Y - pill_h // 2

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fill = (*accent, 186) if accent else (10, 12, 18, 148)
    draw.rounded_rectangle([x0, y0, x0 + pill_w, y0 + pill_h], radius=RADIUS, fill=fill)
    draw.text((x0 + PAD_X - left, y0 + PAD_Y - top), value, font=font, fill=(255, 255, 255, 255))
    img.save(CAPS / f"{name}.png")


intro()
outro()
for key, (value, accent) in SEGMENTS.items():
    render_cap(key, value, accent)
for key, value, accent in MONTAGE:
    render_cap(key, value, accent)
print("cards →", CARDS)
print("captions →", CAPS)
