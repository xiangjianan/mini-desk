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
