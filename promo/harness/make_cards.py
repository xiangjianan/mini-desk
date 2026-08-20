#!/usr/bin/env python3
"""Render the intro/outro title cards for the Mini Desk promo video (1600x1000)."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
OUT = ROOT.parent / "assets" / "cards"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1600, 1000
FONT_DIR = Path("/Users/xiangjianan/Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/python/fonts")
FONT_BOLD = str(FONT_DIR / "NotoSansSC-Bold.ttf")
FONT_REG = str(FONT_DIR / "NotoSansSC-Regular.ttf")
LOGO = REPO / "favicon.png"


def background() -> Image.Image:
    """Deep-navy base with aurora glows and a touch of grain."""
    base = Image.new("RGB", (W, H))
    top = np.array([10, 14, 26], dtype=np.float32)
    bottom = np.array([16, 22, 40], dtype=np.float32)
    ramp = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    col = (top[None, None, :] * (1 - ramp) + bottom[None, None, :] * ramp)
    base = Image.fromarray(np.repeat(col, W, axis=1).astype(np.uint8), "RGB")

    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-350, -420, 700, 480], fill=(16, 64, 52))      # teal-green, top-left
    gd.ellipse([900, -500, 2000, 350], fill=(34, 40, 84))      # indigo, top-right
    gd.ellipse([1050, 620, 2100, 1450], fill=(46, 26, 70))     # violet, bottom-right
    gd.ellipse([-500, 700, 550, 1500], fill=(10, 44, 58))      # cyan, bottom-left
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    img = Image.blend(base, Image.blend(base, glow, 0.85), 0.5)

    # Soft horizon beam
    beam = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(beam)
    bd.rectangle([0, H // 2 - 130, W, H // 2 + 130], fill=26)
    beam = beam.filter(ImageFilter.GaussianBlur(120))
    img = Image.composite(Image.new("RGB", (W, H), (28, 46, 64)), img, beam)

    noise = np.random.default_rng(7).normal(0, 3.2, (H, W, 1)).repeat(3, axis=2)
    img = Image.fromarray(np.clip(np.asarray(img, dtype=np.float32) + noise, 0, 255).astype(np.uint8), "RGB")
    return img


def paste_logo(img: Image.Image, cy: int, size: int = 148) -> None:
    logo = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    # halo
    halo = Image.new("RGBA", (size * 3, size * 3), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([size // 2, size // 2, size * 5 // 2, size * 5 // 2], fill=(80, 200, 160, 90))
    halo = halo.filter(ImageFilter.GaussianBlur(40))
    img.paste(halo, (W // 2 - size * 3 // 2, cy - size * 3 // 2), halo)
    img.paste(logo, (W // 2 - size // 2, cy - size // 2), logo)


def text(draw: ImageDraw.ImageDraw, y: int, value: str, font: ImageFont.FreeTypeFont,
         fill=(244, 247, 252, 255), tracking: int = 0) -> int:
    if tracking:
        width = sum(draw.textlength(ch, font=font) for ch in value) + tracking * (len(value) - 1)
    else:
        width = draw.textlength(value, font=font)
    x = (W - width) / 2
    if tracking:
        cx = x
        for ch in value:
            draw.text((cx, y), ch, font=font, fill=fill)
            cx += draw.textlength(ch, font=font) + tracking
    else:
        draw.text((x, y), value, font=font, fill=fill)
    return y + font.size


def intro() -> None:
    img = background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    paste_logo(img, 330)
    text(draw, 452, "Mini Desk", ImageFont.truetype(FONT_BOLD, 108), tracking=2)
    text(draw, 606, "本地优先的个人桌面工作台", ImageFont.truetype(FONT_REG, 44), fill=(205, 216, 232, 255), tracking=6)
    text(draw, 700, "截图 · 便签 · 提醒 · 快捷动作，都收在这里", ImageFont.truetype(FONT_REG, 30), fill=(148, 163, 190, 255), tracking=2)
    # accent underline
    uw = 420
    draw.rounded_rectangle([(W - uw) / 2, 672, (W + uw) / 2, 676], radius=2, fill=(94, 234, 190, 200))
    img.convert("RGB").save(OUT / "intro.png")


def outro() -> None:
    img = background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    paste_logo(img, 300, size=120)
    text(draw, 424, "Do less, do it well.", ImageFont.truetype(FONT_BOLD, 76))
    text(draw, 548, "打开浏览器，三分钟布置好你的小桌面", ImageFont.truetype(FONT_REG, 36), fill=(205, 216, 232, 255), tracking=2)
    # URL pill
    pill_font = ImageFont.truetype(FONT_BOLD, 34)
    label = "minidesk.online"
    tw = draw.textlength(label, font=pill_font)
    px, py = (W - tw) / 2, 660
    draw.rounded_rectangle([px - 34, py - 16, px + tw + 34, py + 58], radius=37,
                           outline=(94, 234, 190, 230), width=3)
    draw.text((px, py), label, font=pill_font, fill=(126, 240, 200, 255))
    text(draw, 800, "数据保存在本地浏览器 · 无需注册 · 免费使用", ImageFont.truetype(FONT_REG, 26), fill=(148, 163, 190, 255), tracking=2)
    img.convert("RGB").save(OUT / "outro.png")


intro()
outro()
print("cards →", OUT)
