# Mini Desk 宣传物料流水线

本目录包含客户演示与宣传物料的全部制作管线：主题示例空间、录屏脚本、
成片合成、Landing Page。所有画面均来自真实应用（`npm run dev`）的录制，未使用摆拍模型。

## 目录结构

```text
promo/
├── harness/            # 录制与合成工具链
│   ├── record.mjs      #   Playwright 录屏：7 套主题巡览 + 5 段功能演示
│   ├── lib.mjs         #   共享库（假光标注入、UI 导入流程、鼠标编排）
│   ├── server.mjs      #   按需拉起/回收主应用 dev server
│   ├── make_cards.py   #   片头/片尾卡片渲染（PIL）
│   ├── make_captions.py#   字幕药丸覆盖层渲染（PIL，本地 ffmpeg 无 drawtext）
│   ├── assemble.sh     #   合成宣传片 mini-desk-promo.mp4（70s，含配音与背景音乐）
│   └── media.sh        #   导出 Landing Page 所需的全部 web 媒体
├── landing/            # 宣传 Landing Page（Vite + 原生 TS，独立 dev server）
│   └── public/media/   #   页面引用的视频/海报/截图（由 media.sh 生成）
└── assets/             # 中间产物（raw 录屏、截图、音频、卡片、字幕）
```

## 重新制作一遍

```bash
# 1. 录屏（自动拉起主应用 dev server，结束后自动回收）
cd promo/harness && npm install
node record.mjs all            # 也可单独录：node record.mjs theme-travel

# 2. 卡片 + 字幕 + 合成成片（需要系统 python3 有 pillow/numpy）
python3 make_cards.py && python3 make_captions.py
bash assemble.sh               # → promo/out/mini-desk-promo.mp4

# 3. 生成 Landing Page 媒体
bash media.sh                  # → promo/landing/public/media/**

# 4. 预览 Landing Page
cd ../landing && npm install && npm run dev
```

Landing Page 的浏览器冒烟测试（DOM 契约、滚动 reveal、视频可见性播放、三断点横向溢出检查）：

```bash
# 需要先构建并启动 vite preview（默认 http://127.0.0.1:4173/）
cd promo/landing && npm run build && npm run preview -- --port 4173 &
node smoke.mjs   # 截图输出 smoke.png（已 gitignore）
```

## 素材来源说明

- `assets/drop/aurora.png`、`snow-mountain.png`：AI 生成图片（含「AI生成」角标），
  用于演示图床拖放，仅作演示素材。
- 配音（`n2`–`n10`）与背景音乐（`music-bed`）：AI 生成的 TTS 与氛围音乐。
- 主题示例 JSON：`samples/`（原有 3 套）与 `samples/themes/`（新增 4 套：
  健身训练 / 旅行规划 / 自媒体创作 / 家庭理财），均受 `src/__tests__/` 下的
  导入守护测试保护。
