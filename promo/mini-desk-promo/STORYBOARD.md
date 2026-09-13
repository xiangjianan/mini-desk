---
format: 1920x1080
duration: 45s
message: "把零碎的一天收进一张安静的小桌面 — Do less, do it well"
arc: "Demo Loop（hook → product intro → demo cycles → trust → CTA），章节沿用现版 70s 弧线"
audience: 个人效率工具用户与开发者
mode: collaborative
music: none
---

<!-- music: none = 阻止曲库检索；自托管 assets/music-bed.mp3 在装配后手工接线（见 Video direction · BGM 接线） -->

## Video direction

- **palette system**（frame.md 为准）— canvas `#07090f` 深底由装配器铺在 index `#root`；aurora 三色 `#5eeabe → #22d3ee → #a78bfa` 只存在于环境光场与 F10 定版辉光，不上正文文字；primary `#5eeabe` 是唯一强调色，只给每帧的焦点时刻（成形 / 一键 / 自分 / 先进图床 / 只在你的浏览器）；正文 text `#eef2f8`、muted `#a6b1c6`、light `#6d7890` 三级灰梯；玻璃面板 card-bg `rgba(255,255,255,0.045)` + border `rgba(255,255,255,0.09)`，圆角 card-lg 20px / card-md 14px。禁纯黑纯白。
- **环境地床** — 全片底为 `aurora-drift`（catalog component）：三团 accent 派生柔光场在深底上极缓漂移 + 轻暗角；各帧只微调色场占比，维持「同一间屋子」的连续感——F09 收到最暗（信任拍的静谧），F10 升到最亮（定版）。
- **motion grammar** — 全片 `power3` 长尾缓落，禁 bounce/back/elastic 默认（全片仅两处弹性豁免：F01 logo 定版、F10 logo 绽出 + URL 药丸的轻度 spring-pop）；**VO 驱动揭示**：每块内容等 VO 念到才进场，揭示摊在后 50%，禁前 25% 倾泻；hold 一律静置，至多 subtle jitter（`sine-wave-loop` 低幅）；浏览器 mock 全部 element-level 动效（mock 内录屏为 muted clip）；相机基本锁死——全片仅 F08 一支横移长镜，帧间推拉交给注入转场。
- **节拍网格** — audiomap.json：117.5 BPM ≈ 0.512s/拍。F01 词卡、F08 站点停靠吸附拍点；其余帧揭示对 VO 不对拍。各帧 Scene 时窗以 VO 线索为准，sync-durations 后按比例伸缩。
- **rhythm / 静帧分配** — F09 是全片唯一呼吸拍（titlecard 静置 ≥28%）；F01/F08 承担动能峰值；F03–F06 功能段稳定 5–6s 步频，靠 mock 左右换边 + push-slide 转场避免模板感。
- **caption band** — 字幕开启：所有主内容压在顶部 ~83%，底部 ~17% 留给字幕药丸（含 F10 的 URL 药丸也不越线）。
- **BGM 接线** — STORYBOARD `music: none`（阻止曲库检索）；自托管 `assets/music-bed.mp3`（22s、乐句干净、22s 硬停）在装配与转场注入完成后手工接入 index：无缝 loop ~2.6 圈铺满全片，乐句边界尽量对齐 F02/F05/F08 入点，尾随短淡出收束（对齐 22s 硬停手感）。
- **negative list** — 无导航栏/页脚/滚动条/真实光标（浏览器 mock 是刻意的 UI-demo 重建，仅保留红绿灯圆点 + minidesk.online 地址药丸的品牌化 chrome）；无浮空 bokeh、无紫蓝「AI 渐变」糊弄；两个失败模式全片禁止——slideshow（前 25% 倾泻后冻结）与 screensaver（元素各自漂浮）；无无限循环、无随机数、无墙钟。

## Frame 1 — 把零碎的一天收进来

- scene: aurora 底上，截图 / 便签 / 提醒 / 快捷动作四组词卡像散落的碎事逐拍飞入，聚合成一行「收进一张安静的小桌面」，logo 弹出定版
- voiceover: "截图，便签，提醒，快捷动作——把零碎的一天，收进一张安静的小桌面。"
- duration: 5.695s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- type: hook
- persuasion: Future pacing（把混乱收进秩序的愿景）
- beat: 渴望 → 安定
- asset_candidates: assets/logo.png — 像素猫 logo，定版弹现
- blueprint: kinetic-type-beats (Adapt)
- focal: assets/logo.png
- roles: logo.png = cutout（定版主角）；词卡 = 纯排版（无素材）
- sfx: tick-soft ×4（词卡落拍）、pop（logo 定版）

Adapt: 保留「多拍陈述构建 → spring-pop 收束」骨架与节拍感；变化——四拍不是整屏替换而是散落飞入后**聚合**（散乱→秩序正是本片 message），收束拍 = 聚合句 + logo 弹出。
Scene 1 (0.0–0.5s): aurora 地床在场，空场半拍蓄势——VO 起句「截图」前 Centered 空构图。
Scene 2 (0.5–2.4s): 四张词卡（截图 / 便签 / 提醒 / 快捷动作）随 VO 逐词**带运动残影的快速飞入**（motion-blur fly-in，参考所选蓝图词汇表）从四角散落位撞入停驻，每词约一拍吸附节拍网格——四角 rule-of-thirds 角位散布，单卡小体量、灰白字。
Scene 3 (2.4–3.8s): VO「把零碎的一天」——四卡同时向中心**聚合**（外→内、power3 长尾的编组位移，无需专门规则），途中字色渐变 primary。
Scene 4 (3.8–5.0s): 聚合定格成一行「收进一张安静的小桌面」（Centered，~60% 宽），logo **spring-pop**（`spring-pop-entrance`，弹性豁免一）落在句上方；全静置收拍。

narrativeRole: 用观众自己的碎事语言说出承诺；message 本身就是这个镜头。
keyMessage: Mini Desk 是收拢一天零碎的地方。

## Frame 2 — 导入即成形

- scene: 浏览器 mock 框里播放导入录屏：设置 → 导入空间 → 选 JSON → 看板即刻成形；步骤字幕（选文件 / 导入 / 成形）按 VO 落拍
- voiceover: "导入一个主题空间——十秒上手，看板即刻成形。"
- duration: 3.762s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-import.html
- type: product_intro
- persuasion: Friction reduction（十秒上手的低门槛证明）
- beat: 清晰 → 掌控
- asset_candidates: assets/features-import.mp4 — 真实导入流程录屏
- blueprint: device-surface-showcase (Adapt)
- focal: assets/features-import.mp4
- roles: features-import.mp4 = cutout（mock 内主录屏）；地床 = background
- sfx: whoosh（mock 入场）、click（「成形」落拍）

Adapt: 保留「一块持久 surface 为英雄、屏内流程推进、相机锁死全靠 element-level」的 static-tour 骨架；变化——流程是导入闭环（设置→导入→选 JSON→成形），mock 下步骤链逐节点亮替代表格化步骤字幕。
Scene 1 (0.0–1.2s): 右侧浏览器 mock（红绿灯圆点 + minidesk.online 地址药丸）**edge slide-in** 自右入画定格，mock 内录屏起播——asymmetric 35/65，mock ~55% 宽，深度 3 层（地床 / mock / 文字）。
Scene 2 (1.2–3.2s): VO「导入一个主题空间」——mock 内走到导入对话框；左栏标题「导入即成形」**per-word staggered reveal**（`dynamic-content-sequencing`）落定，display 字号，左上三分位。
Scene 3 (3.2–4.8s): VO「十秒上手」——mock 底部步骤链「选 JSON → 导入」前两节依序 **pop**（`spring-pop-entrance` 低过冲），节点灰→亮。
Scene 4 (4.8–6.0s): VO「看板即刻成形」——第三节「成形」primary 高亮落拍 + **keyword glow**（`asr-keyword-glow`）；mock 内看板同时铺开（录屏自身时序）；静置 hold 收拍。

narrativeRole: 产品首次亮相即完成核心闭环（导入→成形），证明「十秒上手」不是口号。
keyMessage: 一切从一个 JSON 开始。

## Frame 3 — 快捷动作

- scene: 录屏居左播放，右侧价值句分两拍点亮：「常去的地方，一键打开」/「常用的模板，一键复制」
- voiceover: "常去的地方，一键打开；常用的模板，一键复制。"
- duration: 4.519s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/03-quick.html
- type: feature_showcase
- persuasion: Feature-to-benefit translation（按钮 → 每天少点 N 次）
- beat: 轻松
- asset_candidates: assets/features-quick.mp4 — 快捷按钮点击录屏
- blueprint: video-text-pivot (Adapt)
- focal: assets/features-quick.mp4
- roles: features-quick.mp4 = cutout（左侧常驻录屏块）
- sfx: click ×2（两个「一键」落拍）

Adapt: 保留签名动作「**weight-transfer 滑移让位 + 同锚点交棒**」与「pill 封印」；变化——接棒的不是数字 stat 而是中文价值句，两拍双句（原版单 stat），视频全程可见不退场。
Scene 1 (0.0–1.0s): quick 录屏块平滑 scale-up 落在中央偏右 + 轻微 y-bob **breath**（`sine-wave-loop` 低幅、仅限本窗）——claiming attention。
Scene 2 (1.0–2.6s): 签名拍——VO「常去的地方，一键打开」：录屏块**滑移让位**（x 左移 + scale 收至 ~40% 宽，`gsap-effects` power3），同一锚点上「常去的地方，一键打开」以 **3D-depth type**（`3d-text-depth-layers` 静态深度）弹入接管重量——一次交棒读作一个事件。
Scene 3 (2.6–4.0s): VO「常用的模板，一键复制」：价值句原地**整句换装**（`discrete-text-sequence`），「一键」二字 primary 高亮。
Scene 4 (4.0–5.0s): primary 描边 **pill scaleX 扣合**（`gsap-effects`）封住句尾，辉光 halo 晚一拍落定（`ambient-glow-bloom`）；静置 hold。

narrativeRole: 第一个功能证据，把「快捷按钮」翻译成日常省力。
keyMessage: 高频动作一步直达。

## Frame 4 — 提醒事项

- scene: 浏览器 mock 框里 todos 录屏：星标置顶、截止时间、勾选完成；「轻重自分」大字随星标动作落拍
- voiceover: "提醒事项，轻重自分——星标置顶，截止清晰，今日重点一眼看清。"
- duration: 6.426s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/04-todos.html
- type: feature_showcase
- persuasion: Show-don't-tell proof（真实勾选与置顶动作）
- beat: 掌控
- asset_candidates: assets/features-todos.mp4 — 星标/截止/完成录屏
- blueprint: device-surface-showcase (Reproduce — static-tour)
- focal: assets/features-todos.mp4
- roles: features-todos.mp4 = cutout（右侧 mock 主录屏）
- sfx: tick ×3（chips 落拍）

Reproduce: static-tour 原味——mock 英雄 + 相机全程锁死 + element-level 换屏；左侧文字栏 + 三要点 chips 承担 VO 逐拍。
Scene 1 (0.0–1.2s): 右侧浏览器 mock slide-in 定格（与 F02 同款品牌 chrome），todos 录屏起播——asymmetric 35/65。
Scene 2 (1.2–2.8s): VO「提醒事项，轻重自分」——左栏 eyebrow 淡入，「轻重**自分**」**per-word staggered** 落定（「自分」primary）——display 尺寸、左上三分位、3 深度层。
Scene 3 (2.8–5.2s): VO 逐点名「星标置顶 / 截止清晰 / 今日重点一眼看清」——三枚 chips 逐拍 **pop**（`spring-pop-entrance` 低过冲，一拍一枚）落在大字下方，与 mock 内动作（星标 / 截止 / 勾选）同拍呼应。
Scene 4 (5.2–6.0s): 内容齐，全静置 hold——mock 内最后的勾选自己收尾。

narrativeRole: 核心待办能力的证据：优先级与完成态可见。
keyMessage: 重要的事自己浮上来。

## Frame 5 — 便签多页签

- scene: 便签录屏在 mock 框内，Tab 缩进的层级随光标实时出现；页签逐个点亮对应「一个页签一个主题」
- voiceover: "便签点进去就写——Tab 缩进，一个页签一个主题。"
- duration: 4.075s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-notes.html
- type: feature_showcase
- persuasion: Friction reduction（点进去就写）
- beat: 平静
- asset_candidates: assets/features-notes.mp4 — 行编辑缩进录屏
- blueprint: device-surface-showcase (Adapt)
- focal: assets/features-notes.mp4
- roles: features-notes.mp4 = cutout（左侧 mock 主录屏）
- sfx: tick ×3（页签点亮）

Adapt: 保留 surface 英雄 + element-level 换屏骨架；与 F02/F04 **镜像换边**（mock 左、文字右），页签 rail 替代步骤链承担逐拍点亮。
Scene 1 (0.0–1.0s): 左侧浏览器 mock 自左 slide-in 定格，notes 录屏起播（Tab 缩进在屏内实时发生）——asymmetric 65/35 反向。
Scene 2 (1.0–2.2s): VO「便签点进去就写」——右栏「点进去 就写」display 大字 **per-word reveal**；页签 rail（A/B/C）随骨架淡入但保持灰。
Scene 3 (2.2–4.0s): VO「Tab 缩进，一个页签一个主题」——页签 A→B→C 逐拍**点亮**（`discrete-text-sequence` 状态步进 + `asr-keyword-glow` 焦点辉光），亮起者 primary 描边，与 mock 内换页签同拍。
Scene 4 (4.0–5.0s): 静置 hold，屏内缩进行自己收尾。

narrativeRole: 记录零成本的证据——想法落地没有仪式。
keyMessage: 想法进来，不用收拾。

## Frame 6 — 图床

- scene: Ctrl+V 大字键帽按下 → 粘贴截图录屏；「原图躺在本地」随大图预览出现
- voiceover: "Ctrl+V——截图先进图床，原图躺在本地。"
- duration: 2.873s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-images.html
- type: feature_showcase
- persuasion: Show-don't-tell proof（粘贴即入的真实操作）
- beat: 顺畅 → 安心
- asset_candidates: assets/features-images.mp4 — 粘贴截图与预览录屏
- blueprint: device-surface-showcase (Adapt)
- focal: assets/features-images.mp4
- roles: features-images.mp4 = cutout（右侧 mock 主录屏）
- sfx: keypress（Ctrl+V 按下）、whoosh（大图预览出现）

Adapt: 保留 surface 英雄骨架；以**键帽按下开场**替代 3D-hand 变体（WebGL 手模为 flagged 特性，弃用）——「按下 Ctrl+V」的真实感由键帽 press 承担，随后粘贴录屏接管。
Scene 1 (0.0–1.4s): VO「Ctrl」——左栏「Ctrl」键帽落下（`spring-pop-entrance`）；VO「V」——「V」键帽 primary 描边落定并**按下**（`press-release-spring`：压缩→回弹）；两键帽并排 display 尺寸——asymmetric 35/65，右侧 mock 同步 slide-in 起播。
Scene 2 (1.4–3.0s): VO「截图先进图床」——键帽下「截图**先进图床**」per-word reveal（「图床」primary）；mock 内粘贴动作与大图预览出现（录屏自身时序）。
Scene 3 (3.0–4.6s): VO「原图躺在本地」——副句「粘贴 / 拖放即入 · 原图躺在本地」muted 淡入；mock 内大图预览放大定格。
Scene 4 (4.6–6.0s): 静置 hold。

narrativeRole: 证据：零碎的视觉素材也有归宿，且不占云端。
keyMessage: 截图有自己的家。

## Frame 7 — 多空间与深浅色

- scene: 中央固定一块看板，四周空间名（工作 / 学习 / 旅行）与深浅主题环绕切换，看板本体随之换肤但构图不动
- voiceover: "工作，学习，旅行——各就各位；深色浅色，随手切换。"
- duration: 5.329s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/07-switcher.html
- type: benefit_highlight
- persuasion: Rule of three（三空间 + 双主题的秩序感）
- beat: 秩序 → 舒适
- asset_candidates: assets/features-switcher.mp4 — 空间切换录屏; assets/features-theme.mp4 — 深浅色切换录屏
- blueprint: fixed-anchor-cycle (Reproduce)
- focal: assets/features-switcher.mp4
- roles: features-switcher.mp4 = cutout（中央锚看板）；features-theme.mp4 = supporting（换肤段替换 mock 内放映源）
- sfx: swap ×3（空间轮换）、whoosh（换肤）

Reproduce: 锚（看板）入画后**零位移**，环绕区离散轮换 + 换肤拍——「everything changes, this stays」原味；几何律：轮换区永不触碰锚。
Scene 1 (0.0–1.6s): 中央看板 mock **fade/scale-in 一次性入画并钉死**（此后零运动——锚契约）——Centered，看板 ~46% 宽，3 深度层，四向留出轮换位。
Scene 2 (1.6–3.6s): VO「工作，学习，旅行」——环绕位 chips 逐拍**硬切换装**（`discrete-text-sequence` ~0.6s/拍）：工作 → 学习 → 旅行，chip 宽度自适应、向远离锚方向生长；与 mock 内空间切换录屏同拍。
Scene 3 (3.6–5.0s): VO「各就各位」——三 chip 并存定格（emphasis beat），primary 描边收束。
Scene 4 (5.0–6.0s): VO「深色浅色，随手切换」——看板本体**原地换肤**（`theme-crossfade-morph` ~0.4s crossfade：深→浅→深），锚几何一丝不动；底部「深 / 浅」小 chips 同步互换高亮；静置收拍。

narrativeRole: 把「多空间/多主题」收束成一个秩序画面——everything changes, this stays。
keyMessage: 生活分区，互不打扰。

## Frame 8 — 七套主题蒙太奇

- scene: 七块主题看板卡沿横向长卷依次入画（每块一拍，主题色描边 + 名称 slogan），节拍网格对切，收在「导入即用，改改成你的」
- voiceover: "七套主题空间，导入即用——改改成你的。"
- duration: 3.291s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/08-montage.html
- type: benefit_highlight
- persuasion: Value stacking（七套预置空间的价值堆叠）
- beat: 丰富 → 心动
- asset_candidates: assets/themes-bucket.mp4 — 人生清单看板; assets/themes-study.mp4 — 前端进阶学习; assets/themes-work.mp4 — 我的工作台; assets/themes-fitness.mp4 — 健身训练站; assets/themes-travel.mp4 — 旅行手账; assets/themes-creator.mp4 — 内容创作工坊; assets/themes-finance.mp4 — 家庭账本
- blueprint: spatial-pan-stations (Reproduce)
- focal: assets/themes-bucket.mp4（首站；七站等权，此为入画站）
- roles: 七段 themes-*.mp4 = cutout（七站看板卡，等权）；无 background 素材
- sfx: whoosh ×6（逐站横移）、pop（callout 收束）

Reproduce: 超宽画布预置站点 + **单支虚拟相机逐站横移** + 末站停驻 hold；站点 = 七块主题看板卡（录屏慢放呈现）。
Scene 1 (0.0–1.6s): 相机开在首站「人生清单」（themes-bucket 卡居中）；顶部标题「七套主题空间 · 总有一款适合你」随 zoom-through 入画即读；首站卡名 callout **spring-pop** 弹起。
Scene 2–7 (1.6–6.4s，~0.8s/站): 相机沿横轴 **ease-in-out 逐站左移**（`viewport-change` PAN + `multi-phase-camera` 停靠序列，`coordinate-target-zoom` 定靶），每站停靠时站名 **reveal**（`discrete-text-sequence`）：前端进阶 → 我的工作台 → 健身训练 → 旅行手账 → 内容创作 → 家庭账本；未停靠站在画缘以浅景深掠过（`depth-of-field-blur`）——长卷过场感。
Scene 8 (6.4–8.0s): 末站「家庭账本」停驻，右侧 primary callout「导入即用，改改成你的 →」**pop** 落定；相机死停，静置 hold 收拍。

narrativeRole: 广度证据：不是空产品，是带着七种生活模板来的。
keyMessage: 总有一款适合你。

## Frame 9 — 本地优先

- scene: 干净的标题卡：一枚锁形图标轻点，「你的数据，只在你的浏览器」淡入定格；下方三枚小字标签（无账号 · 无后端 · 随时导出）
- voiceover: "没有账号，没有后端——你的数据，只在你的浏览器。"
- duration: 3.918s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/09-privacy.html
- type: social_proof
- persuasion: Risk reversal（隐私与迁移成本双消解）
- beat: 信任 → 安心
- asset_candidates: （纯排版帧，无素材）
- blueprint: titlecard-reveal (Reproduce)
- focal: 无素材（纯排版帧）
- roles: （纯排版，无素材）
- sfx: bloom-single（主句落定，本帧唯一音效）

Reproduce: 全片唯一呼吸拍——一次克制的 reveal + 长静置；低运动即内容，无第二发展段。
Scene 1 (0.0–0.4s): 最暗 aurora 静场（色场收到近纯深底），空构图。
Scene 2 (0.4–2.2s): VO「没有账号，没有后端」——锁形图标 **stroke draw-on**（`svg-path-draw`）自绘一次；主句「你的数据，**只在你的浏览器**」**fade-in + 95%→100% settle**（`scale-swap-transition` 克制档）——Centered，~55% 宽。
Scene 3 (2.2–3.6s): VO 收尾——三枚小标签（无账号 / 无后端 / 随时完整导出）横向 **stagger 淡入**（一拍一枚）。
Scene 4 (3.6–5.0s): 全静置 hold（分配静置 ≥28%）；无呼吸动画、无漂移。

narrativeRole: 信任拍：把「本地优先」从功能列表升格为承诺。
keyMessage: 数据主权在你手里。

## Frame 10 — Do less, do it well

- scene: aurora 辉光中 logo 组装定版，slogan「Do less, do it well.」与 minidesk.online 逐字落定，URL 药丸最后弹现
- voiceover: "Do less, do it well——现在就打开 minidesk.online。"
- duration: 4.023s
- transition_in: crossfade
- status: animated
- src: compositions/frames/10-outro.html
- type: cta
- persuasion: 品牌格言收束 + 单一明确行动点
- beat: 余韵 → 行动
- asset_candidates: assets/logo.png — 定版 lockup
- blueprint: logo-assemble-lockup (Adapt — text-clear bloom 味)
- focal: assets/logo.png
- roles: logo.png = cutout（定版主角）
- sfx: bloom（logo 绽出）、chime-soft（URL 药丸落定）

Adapt: 保留「标记从无到有 → 收束成居中 lockup → 末段长静置」骨架，取 text-clear bloom 变体；变化——前序不是文字拍而是 blur-crossfade 直接进空台，slogan 逐词落定替代 wordmark 逐字（中文不拆字距）。
Scene 1 (0.0–1.2s): blur-crossfade 退净后空台一拍，aurora 升到全片最亮（三色辉光中位聚拢——`ambient-glow-bloom` 预热）。
Scene 2 (1.2–2.8s): VO「Do less, do it well」——logo **spring-bloom from zero**（`spring-pop-entrance` 弹性豁免二，带轻微旋入）正中绽出；「Mini Desk」字标 **slide-out-from-behind**（x 位移 + clip 遮罩，logo 压字 z 序）从右侧拉出，lockup 居中成立。
Scene 3 (2.8–4.4s): slogan「Do less, do it well.」**左→右 wipe-in**（clip-path `inset()`）落定于字标下方；VO「现在就打开」——URL 药丸「minidesk.online」**pop** 落定于最底（仍在 caption 线之上），primary 描边 + 辉光 halo 晚一拍（`ambient-glow-bloom`）。
Scene 4 (4.4–6.0s): 死静置 hold（≥26%）——lockup 即终点，全片最后一帧不动。

narrativeRole: 品牌哲学收束并给出唯一行动：打开网址。
keyMessage: 打开 minidesk.online。
