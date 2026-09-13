---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "把零碎的一天收进一张安静的小桌面 — Do less, do it well"
destination: website-embed
aspect: 1920x1080
language: zh
length: 60s
angle: tour-upgrade
audience: 个人效率工具用户与开发者
narration: yes
---

## Intent

Mini Desk 官网 hero 位宣传片的重制：定位是「秀（tour）」——真实产品录屏是主角，不摆拍、不发明界面。用户已有完整画面：**现版 70s 宣传片的升级版**，沿用同样的章节弧线（导入空间 → 快捷动作 → 提醒事项 → 便签 → 图床 → 多空间 → 深浅色 → 主题蒙太奇 → 片尾），把节奏、包装、字幕与动效整体升级一个档次。气质跟随产品：安静、克制、低干扰，参考 Apple HIG 的紧凑感；不是叫卖式 promo。

## Assets

以下素材全部复用，**不重录**：

- `../landing/public/media/features/*.mp4`（7 段功能录屏：import / quick / todos / notes / images / switcher / theme）——各章节的视觉主体
- `../landing/public/media/themes/*.mp4`（7 套主题空间录屏：bucket / study / work / fitness / travel / creator / finance）——蒙太奇章节素材
- `../landing/public/media/posters/*.jpg` 与 `../landing/public/media/shots/*.jpg`——海报帧与静态底板
- `../assets/audio/music-bed.mp3`——背景音乐，节拍网格对切的数据源
- `../landing/public/logo.png`——品牌 logo
- `../landing/src/style.css`——**设计规范的真源（design truth）**：从中提取色板 / 字体 / aurora 质感写入 tokens.json，让 frame 预设按品牌重混，成片与 landing hero 视觉一体

## Customizations

- **BGM 节拍网格对切**：用 music-bed.mp3 的节拍/能量分析（analyze-beatgrid）驱动章节切点与元素脉动，而非均匀时间切割。
- **章节转场原语**：章节之间使用 registry 转场原语（wipe / shader 转场先查 catalog 再手搓），替代现版的简单淡入淡出。
- **重新配音**：按 60s 新脚本重新 TTS（zh，安静克制的声线），旧 n2–n10 配音段落弃用（锁死在旧版节奏）。
- **字幕药丸**：跟随 frame.md 品牌重混的 caption skin；hero 默认静音自动播放，静音时字幕必须独立承载信息。

## Notes

- 成片输出后替换 `../landing/public/media/promo.mp4`，并同步更新海报帧 `../landing/public/media/posters/promo.jpg`；landing hero 有声音开关，成片必须带完整音轨（配音 + BGM）。
- 现版成片（70s / 1600×1000）可随时参照：`../landing/public/media/promo.mp4`。
- 不跑网站抓取（no-capture path）：素材与品牌 token 本地全部已有，capture/ 目录手工构造。
- hero 视频在浏览器 mock 内循环静音播放：前 3 秒必须有静音也成立的钩子，避免开头依赖声音。
