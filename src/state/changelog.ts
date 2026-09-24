/**
 * Hand-curated release notes, newest version first.
 *
 * Curation policy — only significant, user-facing updates are recorded:
 * new features, and major changes/optimizations users will clearly notice.
 * Tiny changes (small style tweaks, minor fixes) are intentionally omitted.
 * Keep each bullet short; adjacent minor releases are merged into their
 * newest version's entry. The newest entry's version must always equal the
 * current app version — a release with nothing significant to record merges
 * into the top entry and bumps its version label.
 *
 * The release skill appends a new entry at the top of `CHANGELOG` for each
 * release that carries significant changes (and skips trivial ones).
 *
 * `date` is the release date in ISO `YYYY-MM-DD`. `notes` carries per-language
 * bullet points; pick the list for the active language at render time.
 */

export interface ChangelogEntryNotes {
  zh: string[];
  en: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  notes: ChangelogEntryNotes;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.189",
    date: "2026-09-24",
    notes: {
      zh: [
        "修复：图片预览打开期间在记事本等任意输入区打字，退格/删除键不再被劫持成「删除图片」确认框、文字可正常删除；被预览的图片已不在列表时预览快捷键也会自动解除武装，不再有看不见的预览拦截全页按键",
      ],
      en: [
        "Fixed: while the image preview is open, Backspace/Delete inside any text field (notes, todos, titles) now edits text natively instead of popping the delete-image confirm; preview shortcuts also disarm once the previewed image is gone, so an invisible preview can no longer intercept page-wide keys",
      ],
    },
  },
  {
    version: "1.0.188",
    date: "2026-09-24",
    notes: {
      zh: [
        "新功能：记事本支持行内富文本标注——选中文字右键「格式」或按 Ctrl/⌘+Shift+H/X/U，可施加荧光笔高亮、中划线、下划线和文字颜色（各 5 色），重复施加即取消，Ctrl+Z 可撤销",
        "新功能：格式跟随文字编辑自动保持——打字、粘贴、重排编号、AI 润色替换后高亮和划线始终贴在原文字上，保存后刷新不丢失，旧数据无需迁移",
        "改进：智能粘贴遇到空剪贴板或非文本内容时气泡提示后返回，不再静默无反馈",
      ],
      en: [
        "New: rich-text annotations in notes — select text and use the right-click \"Format\" menu or Ctrl/⌘+Shift+H/X/U to apply highlight, strikethrough, underline, and text color (5 tints each); applying again removes the format, and Ctrl+Z undoes it",
        "New: formats follow the text as you edit — typing, pasting, list renumbering, and AI-polish replacements keep highlights and strikes attached to the original words; they persist across saves and refreshes with zero migration",
        "Improved: smart paste now shows a bubble and returns when the clipboard is empty or holds non-text content instead of failing silently",
      ],
    },
  },
  {
    version: "1.0.186",
    date: "2026-09-21",
    notes: {
      zh: [
        "调整：四区宽度比例改为从左到右 (1−0.618):0.618:0.618:1 的黄金分割，并修复比例此前未按分隔线之间的实际跨度精确生效的问题——现在任意窗口尺寸下都严格保持，改变窗口大小也不再偏移",
      ],
      en: [
        "Zone widths now split left-to-right in the golden ratio (1−0.618):0.618:0.618:1, and the ratio now applies exactly to the divider-to-divider span — it holds at any window size and no longer drifts on resize",
      ],
    },
  },
  {
    version: "1.0.185",
    date: "2026-09-20",
    notes: {
      zh: [
        "新增：快捷区标签头右键菜单顶部新增「标签管理」——一键打开标签管理器，并自动聚焦到该标签的改名输入框",
        "修复：便签里短横线条目按 Shift+Tab 取消缩进后，光标被级联重编号甩到最后一条编号行的问题——现在统一保留在当行",
      ],
      en: [
        "Tag headings now offer \"Manage tags\" at the top of their right-click menu — it opens the tag manager with that tag's rename input auto-focused",
        "Fixed the caret jumping to the last numbered line after Shift+Tab outdenting a dash item in notes — renumber cascades now keep it on the current line",
      ],
    },
  },
  {
    version: "1.0.184",
    date: "2026-09-19",
    notes: {
      zh: [
        "调整：快捷动作区「大按钮 / 紧凑按钮」切换增加平滑过渡动画——按钮高度、内边距与类型副标题渐进缩放，不再瞬变",
        "调整：「配对手机」弹窗打开与关闭增加过渡动画（遮罩淡入淡出 + 卡片缩放浮现/收起），ESC、取消、保存、清除配对四种关闭路径一致",
      ],
      en: [
        "Quick actions now animate smoothly when toggling between large and compact buttons — height, padding, and the type subtitle scale gradually instead of snapping",
        "The pair-phone dialog now animates open and close (mask fade + card scale); ESC, cancel, save, and clear all share the same animated exit",
      ],
    },
  },
  {
    version: "1.0.183",
    date: "2026-09-19",
    notes: {
      zh: [
        "新增：快捷动作面板头部加号左侧「智能粘贴」按钮，生成的快捷按钮直接落「其他」无标签分组",
        "新增：记事本标签右键菜单「重命名」改为「编辑」，顶部新增「新建」标签入口",
        "调整：删除确认视觉重做——待删区去掉红框改为整块淡红背景，删除标签/列表/空间标签时高亮覆盖整组（连按钮、条目、文本区），危险确认气泡同染浅红",
        "修复：记事本标签编辑中右键相邻标签不再命中错签",
      ],
      en: [
        "New smart paste button to the left of the quick actions header's plus — generated quick buttons land directly in the untagged \"Other\" group",
        "Notebook tag context menu: Rename becomes Edit, with a New entry added at the top",
        "Delete-confirm visuals reworked — the red outline gives way to a soft red wash over the whole pending area; deleting a tag, list, or space tag highlights the entire group (buttons, entries, text area), and the danger bubble shares the same red tint",
        "Fix: right-clicking an adjacent tag while a notebook tag is being edited no longer hits the wrong tag",
      ],
    },
  },
  {
    version: "1.0.182",
    date: "2026-09-19",
    notes: {
      zh: [
        "新增：快捷动作区智能粘贴——标签头加号左侧按钮或空白区右键「智能粘贴」，把剪贴板内容交给 AI 生成快捷按钮（网址型自动抓取页面标题命名；任何失败退化为普通粘贴语义）",
        "新增：贴图区标题栏「粘贴」按钮，一键追加剪贴板图片",
        "新增：快捷区标签头右键「删除」，连同标签下全部快捷动作一起删除（标签管理器删除仍保留按钮、归入未分组）",
        "新增：提醒事项可拖到便签区粘贴为最后一行，延续末行编号 / 短横线格式",
        "调整：伴宠主题「不显示」时静音普通消息气泡，仅保留需要确认的弹框",
        "调整：智能粘贴入口改主色蓝并换剪贴板图标，悬浮恢复彩色流动",
        "调整：润色模型切回 DeepSeek；关于弹窗与 README 的数据理念改为「无需任何登录，所有数据全部保存在浏览器本地」",
        "修复：隐藏导航栏后刷新不再闪现",
      ],
      en: [
        "Quick actions smart paste: a button beside each tag heading's plus, or the blank-area context menu, turns clipboard content into a quick button via AI (link-type buttons are named from the page title; any failure falls back to plain paste)",
        "New paste button in the image zone title bar — append a clipboard image in one click",
        "Tag heading context menu gains Delete, removing the tag together with all its quick buttons (tag manager delete still keeps buttons, moved to untagged)",
        "Reminders can be dragged into the sticky-notes zone and pasted as the last line, continuing the trailing numbering / dash format",
        "With the companion theme set to none, ordinary message bubbles are muted; only confirmation prompts remain",
        "Smart paste entries switch to the primary blue with a clipboard icon; the gradient flow returns on hover",
        "Polish model switched back to DeepSeek; the About dialog and README now read \"no sign-in required — all your data stays in your browser\"",
        "Fix: no more flash of the hidden nav rail after a page refresh",
      ],
    },
  },
  {
    version: "1.0.181",
    date: "2026-09-18",
    notes: {
      zh: [
        "调整：工作台默认宽度引入黄金比例（φ）——图片区保持 10% 窄轨，其余三区按 便签:提醒:工作区 = 1:1:φ 分摊（≈ 10% / 24.9% / 24.9% / 40.2%），已自定义过的工作区不受影响",
        "修复：收起列表点加号新增提醒后自动滚动到聚焦的提醒行，不再需要手动翻找",
      ],
      en: [
        "Default zone widths now follow the golden ratio (φ): the image rail stays at 10% while the other three zones split 1:1:φ (≈ 10% / 24.9% / 24.9% / 40.2%) with the workspace as the golden emphasis; customized workspaces are unaffected",
        "Fix: adding a reminder via a collapsed list's heading add button now scrolls the focused input row into view",
      ],
    },
  },
  {
    version: "1.0.180",
    date: "2026-09-18",
    notes: {
      zh: [
        "优化：明暗主题切换时全页颜色平滑过渡（240ms 交叉淡入淡出），空间标签页等不再闪变",
        "优化：删除工作区时同步清理其区域宽度记录与 IndexedDB 里的图片数据（图片保留 5 秒撤销宽限）",
        "调整：四区默认宽度比例调整为 10% / 30% / 30% / 30%，已自定义过的工作区不受影响",
      ],
      en: [
        "Light/dark theme switches now cross-fade across the whole page over 240ms instead of flashing",
        "Deleting a workspace now also clears its zone-width record and IndexedDB image payloads (images keep the 5s undo grace)",
        "Default zone width ratio adjusted to 10% / 30% / 30% / 30%; customized workspaces are unaffected",
      ],
    },
  },
  {
    version: "1.0.178",
    date: "2026-09-17",
    notes: {
      zh: [
        "新增：四个区域的宽度尺寸按工作区独立记忆，空间之间互不影响，旧尺寸自动作为各空间的初始值",
        "优化：快捷动作按钮一行最多显示两个，区域较窄时自动回落为整行一个",
        "优化：默认空间更名为「随手记」，已有的「随手机」空间自动迁移显示",
        "修复：快捷标签多列布局下空白列无法接收标签拖入；Windows 空格关闭图片预览后左侧图片卡片出现蓝色焦点边框",
      ],
      en: [
        "Zone widths are now remembered per workspace so layouts no longer leak across workspaces; existing sizes seed every workspace initially",
        "Quick action buttons now fit up to two per row, falling back to one full-width row when the panel is narrow",
        "The default space is renamed to 随手记 (Quick Notes); existing 随手机 spaces migrate automatically",
        "Fixed tags not landing in empty columns of the multi-column quick layout, and a Windows-only blue focus ring on the image card after closing the preview with Space",
      ],
    },
  },
  {
    version: "1.0.177",
    date: "2026-09-17",
    notes: {
      zh: [
        "新增：快捷动作区标签支持多列布局 —— 区域拉宽时自动分列，列序与拖拽换列和提醒事项区完全一致",
        "新增：快捷按钮右键菜单可切换「紧凑/大按钮」，紧凑模式隐藏类型说明并压低按钮高度",
        "新增：标签标题右侧的加号按钮，直接在该标签内新增快捷动作",
        "优化：提醒事项过期未完成时整行文本标红，一眼识别逾期项",
        "修复：Windows 下预览图片按空格关闭时图片周围出现焦点边框；快捷区滚动条不再遮挡按钮",
      ],
      en: [
        "Quick action tags now flow into multiple columns as the panel widens; column order and drag behavior match the reminders panel",
        "Right-click a quick button to switch between compact and large sizes; compact mode hides the type caption and shrinks the height",
        "A plus button next to each tag heading adds a new quick action directly inside that tag",
        "Overdue unfinished reminders now render their whole line in red so expired items stand out",
        "Fixed a Windows-only focus ring around the image preview when closing with Space; the quick panel scrollbar no longer covers buttons",
      ],
    },
  },
  {
    version: "1.0.176",
    date: "2026-09-17",
    notes: {
      zh: [
        "改版：桌面四区全新视觉 —— 无边框白色工作台、细分隔线、带图标的区域标题与清晰的标题层级",
        "新增：便签工具栏「智能粘贴」按钮，一键把剪贴板内容智能整理后追加到当前便签末尾（防重复点击、切换便签自动丢弃过期结果）",
        "优化：快捷按钮显示类型说明并更新悬停样式，分组展开按钮居中对齐；折叠的提醒事项行距更舒适",
        "优化：默认区域命名更新为「提醒事项 / 记事本 / 贴图 / 随手机」，旧默认名自动迁移，自定义标题保持不变",
        "改版：手机速记页重做为「打开的记事本」布局 —— 紧凑连接条、大写作区、拇指可达的粘贴/AI 控件与并排发送按钮",
        "优化：手机配对页简化，三步引导折叠为可展开面板；深色模式下蓝色按钮对比度提升",
      ],
      en: [
        "Redesign: refreshed desktop four-zone visuals — borderless white workbench, thin dividers, icon-headed zones and a clearer title hierarchy",
        "Added: a \"Smart paste\" button in the notes toolbar that polishes the clipboard and appends it to the active note (no double-clicks; stale results are discarded after switching notes)",
        "Improved: quick buttons now show type captions with new hover styling, group disclosure buttons are centered, and collapsed reminder rows get comfier spacing",
        "Improved: default zone names updated to Reminders / Notepad / Stickers / Quick Notes; old default names migrate automatically and custom titles are preserved",
        "Redesign: the mobile capture page is now an open-notebook layout — compact connection row, a large writing surface, thumb-reachable paste/AI controls and side-by-side send buttons",
        "Improved: simplified mobile pairing with setup steps folded into an expandable panel, plus better blue-button contrast in dark mode",
      ],
    },
  },
  {
    version: "1.0.173",
    date: "2026-09-15",
    notes: {
      zh: [
        "新增：便签选中文本的右键「智能润色」升级为「AI润色」并换用空心星星图标，子菜单可选润色风格：技术风格 / 简洁风格 / 口语风格",
      ],
      en: [
        "Added: the notes “Smart polish” action is now “AI polish” with a hollow sparkle icon and a submenu of polish styles: technical / concise / casual",
      ],
    },
  },
  {
    version: "1.0.172",
    date: "2026-09-13",
    notes: {
      zh: [
        "修复：iOS 安装态下「更换配对码」取消后，手机状态栏（刘海区）持续发灰的问题",
        "优化：状态栏/刘海区改为透明并由页面渐变铺满，与 Header 融为一体；深色主题下状态栏符号清晰可读",
      ],
      en: [
        "Fixed: on installed iOS PWAs the status bar (notch area) stayed gray after canceling the change-pairing-code sheet",
        "Improved: the status bar/notch area is now transparent and painted with the page gradient, blending into the header; status bar symbols stay legible in dark theme",
      ],
    },
  },
  {
    version: "1.0.171",
    date: "2026-09-13",
    notes: {
      zh: [
        "新增：便签/工作空间选中文本后，右键菜单新增「删除」，一键删除选中内容，有序列表自动重编号",
        "优化：手机端已配对页面恰好一屏铺满不滚动，速记输入框弹性撑满剩余屏幕高度，小屏自动压缩并保留滚动兜底",
      ],
      en: [
        "Added: a \"Delete\" action in the notes/workspace context menu for selected text — removes the selection in one click and renumbers ordered lists",
        "Improved: the mobile paired home now fits exactly one screen without scrolling; the capture textarea stretches to fill the remaining height and compresses gracefully on smaller screens",
      ],
    },
  },
  {
    version: "1.0.170",
    date: "2026-09-13",
    notes: {
      zh: [
        "优化：PWA/网页打开改为缓存优先，弱网下不再白屏等待，秒开本地页面",
        "优化：新版在后台静默预载，下次打开即更新；离线可用性与版本红点提醒不受影响",
      ],
      en: [
        "Improved: app shell now serves from cache first — no more blank white loading on slow networks",
        "Improved: new versions download silently in the background and arrive on next launch; offline support and the update badge are unchanged",
      ],
    },
  },
  {
    version: "1.0.169",
    date: "2026-09-12",
    notes: {
      zh: [
        "新增：手机配对弹窗顶部标明当前配对的工作空间名称，避免误配到其他空间",
        "调整：工作空间列表的操作（导出/配对/重命名/删除）收回「⋯」子菜单，行内恢复简洁",
      ],
      en: [
        "New: the phone pairing dialog now names the workspace being paired at the top, preventing mismatches",
        "Adjusted: workspace row actions (export/pair/rename/delete) move back into the \"⋯\" submenu for a cleaner list",
      ],
    },
  },
  {
    version: "1.0.168",
    date: "2026-09-12",
    notes: {
      zh: [
        "新增：页面右上角顶栏新增「显示区域」按钮，与收起 header 栏、主题切换按钮并列，可快速控制各区域显隐",
        "优化：工作空间列表每行直接平铺导出、配对、重命名、删除操作，不再需要点开三个点子菜单",
        "新增：「配对手机」入口加入右上角设置菜单的「数据」分组",
      ],
      en: [
        "New: a \"Visible areas\" button joins the top-right header next to the hide-header and theme buttons for quick zone toggles",
        "Improved: workspace rows now show export/pair/rename/delete actions inline, no more three-dot submenu",
        "New: \"Pair phone\" entry added to the Data group of the top-right settings menu",
      ],
    },
  },
  {
    version: "1.0.167",
    date: "2026-09-11",
    notes: {
      zh: [
        "新增：手机速记「AI 润色」开关开启时，标签四字显示彩色渐变流动效果；关闭时恢复默认文字色",
        "优化：明暗主题下工作台底色与面板的对比度调低，区域分割更柔和（状态栏、启动画面与清单颜色同步更新）",
      ],
      en: [
        "New: when the mobile \"AI polish\" toggle is on, its label shows a flowing rainbow gradient; off restores the default text color",
        "Improved: softer contrast between the workbench backdrop and panels in both light and dark themes (status-bar, splash, and manifest colors updated to match)",
      ],
    },
  },
  {
    version: "1.0.166",
    date: "2026-09-11",
    notes: {
      zh: [
        "优化：手机速记发送成功改为右下角伴宠 GIF 消息气泡弹出「已发送 N 条」，与桌面端保存反馈同款；发送按钮不再变绿，卡内也不再显示结果行",
        "优化：手机端文案再精简——标题改为「在手机随手速记」，移除副句、输码帮助行、已配对小字与润色说明行",
      ],
      en: [
        "Improved: a successful mobile capture now pops the companion GIF bubble with \"Sent N\" at the bottom-right — the same feedback as saving on desktop; the send button no longer turns green and the inline result row is gone",
        "Improved: leaner mobile copy — the hero title now reads \"Capture on your phone\", and the lede, code help line, paired-status small print, and polish hint line were removed",
      ],
    },
  },
  {
    version: "1.0.165",
    date: "2026-09-11",
    notes: {
      zh: [
        "全新：手机打开的首页重构为「桌面优先」引导页——像素猫 logo 随主题换色、四栏工作台微缩示意、三步配对引导与 3 组 × 4 位分组输码（自动跳组、整段粘贴自动分发），界面与文案全面精简",
        "优化：移动端不再弹出右下角消息气泡，引导集中在首页；已配对视图为状态卡片——配对码点击复制，「更换配对码」改为底部弹层二次确认",
      ],
      en: [
        "New: the page you get on a phone is rebuilt as a desktop-first guide — theme-aware pixel-cat logo, a miniature of the four-column workbench, three-step pairing with 3×4 grouped code entry (auto-advance and full-code paste distribution), all with much leaner copy",
        "Improved: mobile no longer pops the bottom-right companion bubble — guidance lives in the page itself; the paired view is a status card with tap-to-copy pairing code and a bottom-sheet confirm for changing the code",
      ],
    },
  },
  {
    version: "1.0.164",
    date: "2026-09-04",
    notes: {
      zh: [
        "新增：手机速记页标题行右侧「AI 润色」开关（默认关闭）——关闭时发送内容原文直存、不调用大模型，开启后恢复 AI 润色再同步；开关状态记忆在手机本地",
      ],
      en: [
        "New: \"AI polish\" toggle at the right of the mobile capture page's title row (off by default) — off sends raw text straight to storage without calling the LLM, on restores AI polishing before syncing; the choice is remembered on the phone",
      ],
    },
  },
  {
    version: "1.0.163",
    date: "2026-08-31",
    notes: {
      zh: [
        "新增：右键某条提醒的「粘贴/智能粘贴」改为把内容拆成新提醒插到该条下方；通知时间选择器底部新增「保存」按钮",
        "优化：「智能粘贴/智能润色」及手机速记润色支持英文——输出语言跟随输入文本，英文为主时输出英文，中文为主时保持简体中文",
      ],
      en: [
        "New: right-click \"Paste / Smart paste\" on a reminder now splits the content into new reminders inserted right below it; the notification time picker gained a \"Save\" button",
        "Improved: \"Smart paste / Smart polish\" (and mobile capture polishing) now supports English — output language follows the input: English-heavy text is polished into English, Chinese stays Chinese",
      ],
    },
  },
  {
    version: "1.0.162",
    date: "2026-08-31",
    notes: {
      zh: [
        "优化：「智能粘贴/智能润色」菜单项文字渐变流动高亮；修复星标/重点提醒悬浮滚动时文字动画卡住不动的问题",
        "调整：AI 润色便签的编号格式由「1、2、」改为「1. 2. 」，与编辑器编号列表识别保持一致",
        "更新：应用图标与桌面猫伴随素材微调",
      ],
      en: [
        "Polish: gradient flowing text on the \"Smart paste / Smart polish\" menu labels; fixed starred reminders freezing their text-flow animation while hovering to scroll",
        "Change: AI note-polish numbering switches from \"1、2、\" to \"1. 2. \" to match the editor's numbered-list detection",
        "Updated app icons and companion cat assets",
      ],
    },
  },
  {
    version: "1.0.161",
    date: "2026-08-31",
    notes: {
      zh: [
        "新增：提醒事项/便签右键菜单「智能粘贴」——剪贴板杂乱文本经 AI 整理后直接插入（提醒区拆成独立待办、便签区排版成编号要点），失败自动退化为普通粘贴",
        "新增：便签区选中文本后右键「智能润色」，选区经同一 AI 流程整理替换，失败或超长保留原文",
      ],
      en: [
        "New: \"Smart paste\" in the reminders/notes right-click menu — messy clipboard text is AI-organized and inserted directly (split into separate reminders, or polished into numbered note lines); any failure falls back to plain paste",
        "New: \"Smart polish\" on selected note text — the selection runs through the same AI flow and is replaced in place; the original is kept on failure or over-length",
      ],
    },
  },
  {
    version: "1.0.159",
    date: "2026-08-30",
    notes: {
      zh: [
        "新增：手机速记服务端 AI 润色——「提醒事项」自动拆分成一条条独立待办，「便签」自动总结润色为编号要点",
        "调整：速记改经自建服务器明文中转以支持服务端处理（取消端到端加密）；润色失败时原文直存，消息永不丢失",
      ],
      en: [
        "New: server-side AI polish for quick capture — reminders are auto-split into separate items, notes are summarized into numbered points",
        "Changed: captures now relay as plaintext via the self-hosted server to enable server-side processing (E2E encryption dropped); any polish failure stores the raw text, so messages are never lost",
      ],
    },
  },
  {
    version: "1.0.158",
    date: "2026-08-29",
    notes: {
      zh: [
        "新增：主题可自动跟随系统明暗，手动切换后保留手动选择，系统再次切换时重新交还跟随",
        "新增：普通消息气泡在场时点击 GIF 动图，逐条轮换当前区域的 Tips 提示（与右键菜单 Tips 同文案）",
        "修复：图片预览弹层不再遮挡左上角空间切换菜单与右上角 header 折叠图标",
        "修复：打开链接成功后不再误报「链接打开失败」",
        "调优：瘦身提示阈值调高为图片 30 张、快捷动作 50 个、提醒事项 20 条，保存状态灯判定同步调整",
      ],
      en: [
        "Added: theme can auto-follow the system light/dark mode; a manual choice wins until the system theme changes again",
        "Added: clicking the companion GIF while a normal bubble is showing rotates that area's Tips (same copy as the right-click Tips)",
        "Fixed: the image preview overlay no longer covers the workspace switcher menu or the header collapse icon",
        "Fixed: opening a link no longer falsely reports a failure",
        "Tuned: raised declutter thresholds to 30 images / 50 quick actions / 20 reminders; the save status lamp follows suit",
      ],
    },
  },
  {
    version: "1.0.156",
    date: "2026-08-29",
    notes: {
      zh: [
        "修复：折叠提醒列表时释放其中的焦点，消除 Chrome「Blocked aria-hidden」无障碍警告",
      ],
      en: [
        "Fixed: collapsing a reminder list now releases focus from its hidden content, clearing Chrome's \"Blocked aria-hidden\" accessibility warning",
      ],
    },
  },
  {
    version: "1.0.155",
    date: "2026-08-28",
    notes: {
      zh: [
        "新增：便签编辑中 Ctrl/Command + ↑/↓ 上下移动当前行，编号列表自动保持序号连续、短横线跟随保留",
        "新增：手机速记页标题行右侧新增清空按钮，一键清空输入内容",
      ],
      en: [
        "New: move the current line up/down with Ctrl/Cmd+↑/↓ while editing notes — ordered lists renumber automatically and dash markers are preserved",
        "New: a clear button beside the Mobile Inbox title clears the draft in one tap",
      ],
    },
  },
  {
    version: "1.0.154",
    date: "2026-08-27",
    notes: {
      zh: [
        "新增：手机速记页一键粘贴剪贴板，粘贴不弹键盘，多行内容自动按换行追加",
        "调整：进入速记页不再自动弹出键盘，配合粘贴按钮的安静体验",
      ],
      en: [
        "New: one-tap clipboard paste on the mobile capture page — no keyboard popup, multi-line content appends line by line",
        "Changed: opening the capture page no longer auto-opens the keyboard, pairing with the quiet paste flow",
      ],
    },
  },
  {
    version: "1.0.153",
    date: "2026-08-27",
    notes: {
      zh: [
        "修复：删除配对的工作区时自动注销其配对码，手机端立即失效",
        "修复：清空数据时同步注销全部配对码，不再遗留无人接收的死队列",
      ],
      en: [
        "Fixed: deleting a paired workspace now revokes its pairing code, cutting off phones immediately",
        "Fixed: clearing all data now revokes every pairing code, leaving no unattended queues behind",
      ],
    },
  },
  {
    version: "1.0.152",
    date: "2026-08-27",
    notes: {
      zh: [
        "新增：配对弹窗配对码旁一键复制，成功后自动浮现「已复制」提示",
        "调整：主题简化为明/暗两态，手动切换后不再跟随系统（跟随系统仅作初始默认）",
        "优化：工作区切换器的导出/配对/改名/删除收进「⋯」菜单，列表更清爽",
        "优化：手机速记页速记卡片更精致——输入自动聚焦、实时提示按行拆分条数，双按钮加图标更易分辨",
        "修复：删除配对便签落点的空间时自动清空配对码并注销云端队列",
      ],
      en: [
        "New: one-tap copy for the pairing code, with an auto \"Copied\" hint",
        "Changed: theme is now a simple light/dark toggle — a manual choice stops following the system (system-follow stays the initial default)",
        "Improved: workspace export/pair/rename/delete actions moved into a \"⋯\" menu for a cleaner list",
        "Improved: a more polished mobile quick-capture card — auto-focus input, live split-by-line count, and icons on the two send buttons",
        "Fixed: deleting a space that a pairing sends notes to now clears the pairing code and revokes its relay queue",
      ],
    },
  },
  {
    version: "1.0.150",
    date: "2026-08-26",
    notes: {
      zh: [
        "新增：主题支持跟随系统明暗，默认自动切换",
        "优化：手机速记页点击配对码即可复制，深色顶栏与聚焦样式更统一",
      ],
      en: [
        "New: theme can follow your system's light/dark mode (now the default)",
        "Improved: tap the pairing code to copy it; cleaner dark header and focus styles on mobile",
      ],
    },
  },
  {
    version: "1.0.149",
    date: "2026-08-26",
    notes: {
      zh: [
        "改版：手机速记改为「发送到提醒」「发送到便签」双按钮直发",
        "优化：提醒时间选择后立即保存",
      ],
      en: [
        "Redesign: quick capture now sends via direct Send-to-reminders / Send-to-notes buttons",
        "Improved: reminder time saves immediately on selection",
      ],
    },
  },
  {
    version: "1.0.148",
    date: "2026-08-26",
    notes: {
      zh: [
        "优化：「更换配对码」增加二次确认，避免误触退出已配对状态",
      ],
      en: [
        "Improved: \"Change pairing code\" now asks for confirmation to avoid accidental taps",
      ],
    },
  },
  {
    version: "1.0.146",
    date: "2026-08-26",
    notes: {
      zh: [
        "新增：配对码注册制——不存在的配对码无法配对，手机输码时联网校验并明确提示",
        "优化：配对码由桌面端自动注册到中继，清除/轮换后立即失效（含历史码自动迁移）",
      ],
      en: [
        "New: pairing-code registration — non-existent codes can no longer be paired; phones verify online when typing a code with a clear message",
        "Improved: codes are registered with the relay automatically by the desktop, and clearing/rotating takes effect immediately (existing codes migrate automatically)",
      ],
    },
  },
  {
    version: "1.0.145",
    date: "2026-08-26",
    notes: {
      zh: [
        "新增：清除/轮换配对码会同步注销云端队列——手机端立即感知失效并引导更换配对码，输入内容不丢失",
        "优化：切换到已配对的工作空间时立即拉取一次手机速记，不再等 5 分钟轮询",
        "优化：手机速记占位词按提醒事项/便签区分；配对后隐藏右下角「建议在浏览器打开」",
        "优化：发送成功/失败增加动画与触觉反馈",
      ],
      en: [
        "New: clearing or rotating a pairing code now revokes the relay queue — phones immediately see the invalid-code notice with a change-code action, and the draft is preserved",
        "Improved: switching to a paired workspace pulls new captures immediately instead of waiting for the 5-minute poll",
        "Improved: differentiated placeholders for reminders vs notes; the bottom-right \"open on desktop\" hint is hidden once paired",
        "Improved: success/failure send feedback animations and haptic response",
      ],
    },
  },
  {
    version: "1.0.144",
    date: "2026-08-25",
    notes: {
      zh: [
        "优化：手机速记中继改为「读即消费」——每条数据只响应一次，桌面端读取后即从队列移除",
        "优化：收件箱轮询跟随当前工作区——只在配置过配对码的空间轮询，停留未配对空间期间零请求",
      ],
      en: [
        "Improved: relay now serves each item exactly once — consumed on desktop read, then removed from the queue",
        "Improved: inbox polling follows the active workspace — requests only while a paired workspace is active",
      ],
    },
  },
  {
    version: "1.0.143",
    date: "2026-08-25",
    notes: {
      zh: [
        "优化：手机速记中继迁移到自建服务器（阿里云 + MySQL），发送不限次数",
        "优化：桌面端同步间隔从每 1 小时缩短为每 5 分钟，速记秒级可达",
        "优化：手机速记取消单次 20 行上限，一次可粘贴任意多行",
      ],
      en: [
        "Improved: mobile quick capture relay migrated to a self-hosted server (Aliyun + MySQL) — unlimited sends",
        "Improved: desktop sync interval shortened from hourly to every 5 minutes",
        "Improved: removed the 20-lines-per-send cap on mobile quick capture",
      ],
    },
  },
  {
    version: "1.0.142",
    date: "2026-08-25",
    notes: {
      zh: [
        "新增：手机速记记住配对码——主屏图标或微信重新打开免输码，自动恢复配对",
        "新增：速记页脚显示当前配对码（4-4-4 分组），支持一键更换",
      ],
      en: [
        "New: mobile quick capture remembers the pairing code — reopening from the home screen or WeChat auto-restores pairing, no re-entry needed",
        "New: the capture footer shows the current pairing code (grouped 4-4-4) with a one-tap change button",
      ],
    },
  },
  {
    version: "1.0.141",
    date: "2026-08-25",
    notes: {
      zh: [
        "新增：手机速记支持多行输入，按行拆分为多条逐条发送",
        "优化：手机端点按输入框不再触发 iOS 自动缩放",
      ],
      en: [
        "New: mobile quick capture accepts multi-line input — each line becomes its own entry, sent one by one",
        "Improved: tapping the input on the phone no longer triggers iOS auto-zoom",
      ],
    },
  },
  {
    version: "1.0.139",
    date: "2026-08-24",
    notes: {
      zh: [
        "新增：手机速记——扫码配对后手机随手记待办与便签，自动同步到电脑",
        "新增：端到端加密中转，服务器只存密文，条目送达或 30 天过期即不可再读",
        "新增：配对支持轮换与清除，随空间导出迁移；导入他人文件后提示轮换配对码",
      ],
      en: [
        "New: mobile quick capture — pair by QR code, jot todos and notes on the phone, auto-synced to the desktop",
        "New: end-to-end encrypted relay — the server stores ciphertext only; entries become unreadable once delivered or after 30 days",
        "New: pairing supports rotate/clear and travels with workspace exports; importing someone else's file prompts a code rotation",
      ],
    },
  },
  {
    version: "1.0.138",
    date: "2026-08-22",
    notes: {
      zh: [
        "新增：离线可用——首次访问后断网也能完整打开",
        "新增：可安装为桌面应用，标题栏颜色随明暗主题自动切换",
        "优化：安装提示不再主动弹出，可从浏览器菜单手动安装",
      ],
      en: [
        "New: offline support — the board fully opens with no network after the first visit",
        "New: installable as a desktop app; the title-bar color follows the light/dark theme",
        "Improved: no more automatic install banner — install from the browser menu instead",
      ],
    },
  },
  {
    version: "1.0.137",
    date: "2026-08-21",
    notes: {
      zh: [
        "新增：提醒事项 Ctrl+方向键跳行首尾、组内上下移动",
        "新增：便签 Tab 补短横线；多类条目右键「移动到空间」",
        "优化：工作空间切换器改为 ClickUp 风格；修复 Ctrl+↑ 连续移动失焦与动画缺失",
      ],
      en: [
        "Added: Ctrl+arrow keys jump to line ends and reorder todos within their group",
        "Added: Tab auto-dashes note lines; right-click \"move to workspace\" for many item types",
        "Improved: ClickUp-style workspace switcher; fixed Ctrl+↑ repeated-move focus loss and missing animation",
      ],
    },
  },
  {
    version: "1.0.136",
    date: "2026-08-18",
    notes: {
      zh: [
        "修复：暗色模式打开页面闪白",
        "修复：输入法输入的提醒文字点击别处后丢失；≥7 条时连续删除确认失效",
        "新增：列表全收起时右键空白处新建列表",
      ],
      en: [
        "Fix: light-theme flash on load in dark mode",
        "Fix: IME-typed reminder text lost on clicking away; delete confirm failing on lists with ≥7 items",
        "New: right-click blank area to create a list when all lists are collapsed",
      ],
    },
  },
  {
    version: "1.0.129",
    date: "2026-08-16",
    notes: {
      zh: [
        "性能：待办输入防抖保存，打字更流畅、内存更低；首屏体积减少约 344KB",
        "提醒勾选/删除后条目平滑上移；连续删除两次后不再逐条确认",
        "提醒勾选框与工具栏按钮统一为圆形样式",
        "安全：阻断快捷按钮中的危险链接协议",
      ],
      en: [
        "Performance: debounced todo-input saves (smoother typing, lower memory); first-load payload down ~344KB",
        "Items slide up smoothly after check/delete; no per-item confirm after two consecutive deletes",
        "Todo checkboxes and toolbar buttons unified to circles",
        "Security: block dangerous URL schemes in quick buttons",
      ],
    },
  },
  {
    version: "1.0.126",
    date: "2026-08-14",
    notes: {
      zh: [
        "新增「更新记录」弹窗（设置菜单版本号进入）",
        "过期提醒红点移至列表标题；多列布局下同列列表平分高度",
      ],
      en: [
        "New release-notes modal (open via the version number in settings)",
        "Overdue dot moved to list titles; multi-column lists share height evenly",
      ],
    },
  },
  {
    version: "1.0.123",
    date: "2026-08-12",
    notes: {
      zh: [
        "导入同名空间支持「覆盖」或「新增」（自动编号）",
        "solo 模式图片可拖动调整宽度",
        "清空数据增加加载动画，并提示将清空所有空间",
      ],
      en: [
        "Importing a same-named workspace: overwrite or add (auto-numbered)",
        "Solo-mode image width is draggable",
        "Clear-data gained a loading animation and an all-workspaces warning",
      ],
    },
  },
  {
    version: "1.0.118",
    date: "2026-08-10",
    notes: {
      zh: [
        "提醒列宽超过阈值自动分多列",
        "显示区域改为每空间独立配置；设置菜单新增「配置」子菜单",
      ],
      en: [
        "Reminder lists auto-split into columns past a width threshold",
        "Zone visibility is now per-workspace; settings gained a Zones submenu",
      ],
    },
  },
  {
    version: "1.0.113",
    date: "2026-08-08",
    notes: {
      zh: [
        "快捷动作空白处右键可粘贴直接创建按钮",
        "图片支持精确拖放到指定列表项；清空数据彻底清理无残留",
      ],
      en: [
        "Right-click quick-actions blank area to paste buttons directly",
        "Images drop precisely next to a target item; clear-data wipes storage fully",
      ],
    },
  },
  {
    version: "1.0.110",
    date: "2026-08-07",
    notes: {
      zh: [
        "提醒截止时间新增快捷预设（15 分钟后、明天 9 点等）",
        "快捷按钮新增 API 模板与「打开应用」类型，标签自动配色",
      ],
      en: [
        "Deadline quick presets (in 15 min, tomorrow 9:00, …)",
        "Quick buttons gained API templates and an open-app type; tags auto-colored",
      ],
    },
  },
  {
    version: "1.0.102",
    date: "2026-08-02",
    notes: {
      zh: [
        "新增多工作空间：创建/切换/重命名/删除/拖动排序",
        "导入支持单空间/全量，可导出当前空间",
      ],
      en: [
        "Multi-workspace: create/switch/rename/delete/drag-to-reorder",
        "Import single-workspace or full payloads; export the current workspace",
      ],
    },
  },
  {
    version: "1.0.97",
    date: "2026-07-28",
    notes: {
      zh: [
        "新增全局搜索：命令栏按关键词过滤快捷动作并高亮",
        "视觉刷新：网格背景、入场动画、弹簧微交互；落地页滚动动画",
      ],
      en: [
        "Global search: command-bar filter for quick actions with highlighting",
        "Visual refresh (mesh backdrop, entrance motion, spring micro-interactions) and scroll-driven landing animations",
      ],
    },
  },
  {
    version: "1.0.93",
    date: "2026-07-15",
    notes: {
      zh: ["快捷动作按标签分组折叠收纳"],
      en: ["Quick actions collapse into tag groups"],
    },
  },
  {
    version: "1.0.86",
    date: "2026-06-22",
    notes: {
      zh: ["图片粘贴按列表项定位插入，右键可上下文粘贴"],
      en: ["Image paste positions by the hovered list item, with contextual paste actions"],
    },
  },
  {
    version: "1.0.55",
    date: "2026-06-10",
    notes: {
      zh: ["多标签页同时打开时状态互不覆盖"],
      en: ["Multi-tab safety: concurrent tabs no longer overwrite each other"],
    },
  },
  {
    version: "1.0.45",
    date: "2026-06-06",
    notes: {
      zh: [
        "首个正式版：图片/便签/提醒事项/工作区四区看板",
        "行编辑器 Tab 缩进、Enter 分行、拖拽排序；提醒支持截止时间与到期通知",
        "自定义提醒列表、今日重点视图、陪伴 GIF 主题与移动端适配",
      ],
      en: [
        "First official release: the four-zone board (images / notes / reminders / workspace)",
        "Line editor with Tab indent, Enter splitting, drag-to-sort; reminders with deadlines and notifications",
        "Custom lists, Today's Focus view, companion GIF themes, and mobile support",
      ],
    },
  },
];
