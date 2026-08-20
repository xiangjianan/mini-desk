#!/usr/bin/env python3
"""Render caption pills for promo segments as transparent PNG overlays (1600x1000)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "assets" / "captions"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1600, 1000
FONT_DIR = Path("/Users/xiangjianan/Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/python/fonts")
FONT_BOLD = str(FONT_DIR / "NotoSansSC-Bold.ttf")

FONT_SIZE = 34
PAD_X, PAD_Y = 26, 14
PILL_BOTTOM = 62
X0 = 64
RADIUS = 17

SEGMENTS = {
    "cap-s02": ("导入主题空间，十秒上手", None),
    "cap-s03": ("快捷动作：链接 · 应用 · 模板，一键直达", None),
    "cap-s04": ("星标 + 截止时间，今日重点自动置顶", None),
    "cap-s05": ("便签多页签，Tab 缩进随手记", None),
    "cap-s06": ("截图照片拖进来，图床自动收好", None),
    "cap-s07": ("多工作空间，装下生活每一面", None),
    "cap-s08": ("浅色 / 深色，随手切换", None),
}

MONTAGE = [
    ("cap-m1", "人生清单", (59, 130, 246)),
    ("cap-m2", "前端进阶学习", (34, 197, 94)),
    ("cap-m3", "我的工作台", (20, 184, 166)),
    ("cap-m4", "健身训练站", (249, 115, 22)),
    ("cap-m5", "旅行手账", (14, 165, 233)),
    ("cap-m6", "内容创作工坊", (139, 92, 246)),
    ("cap-m7", "家庭账本", (16, 185, 129)),
]


def render(name: str, text: str, accent: tuple[int, int, int] | None) -> None:
    font = ImageFont.truetype(FONT_BOLD, FONT_SIZE)
    probe = Image.new("RGBA", (8, 8))
    pd = ImageDraw.Draw(probe)
    left, top, right, bottom = pd.textbbox((0, 0), text, font=font)
    tw, th = right - left, bottom - top
    pill_w = tw + PAD_X * 2
    pill_h = th + PAD_Y * 2
    y0 = H - PILL_BOTTOM - pill_h

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if accent:
        fill = (*accent, 178)
        # thin light edge so colored pills stay readable over bright scenes
        draw.rounded_rectangle([X0, y0, X0 + pill_w, y0 + pill_h], radius=RADIUS, fill=fill)
    else:
        draw.rounded_rectangle([X0, y0, X0 + pill_w, y0 + pill_h], radius=RADIUS, fill=(10, 12, 18, 132))
    draw.text((X0 + PAD_X - left, y0 + PAD_Y - top), text, font=font, fill=(255, 255, 255, 255))
    img.save(OUT / f"{name}.png")


for key, (text, accent) in SEGMENTS.items():
    render(key, text, accent)
for key, text, accent in MONTAGE:
    render(key, text, accent)
print("captions →", OUT)
