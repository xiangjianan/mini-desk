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
 * Older history is consolidated: releases from the same era are folded into
 * one entry labeled with that era's newest version, holding a few summary
 * bullets instead of per-release detail. Fold entries upward the same way
 * whenever this list grows unwieldy again.
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
      version: "1.1.4",
      date: "2026-10-14",
      notes: {
        zh: [
          "新增：外观切换收进顶栏设置旁，单按钮在浅色/深色/跟随系统间循环，默认浅色主题",
          "新增：快捷按钮显示累计点击次数，右键菜单按作用域重新分组",
          "优化：分区显隐切换宽度平滑动画，面板头部操作精简，折叠头部悬停反馈更克制",
          "修复：记事本合并行保留行内格式；提醒列表滚动占位居中、记事本标签圆角等一批细节修正",
        ],
        en: [
          "New: appearance control lives beside the top-bar settings — one button cycles light / dark / system, with light as the default theme",
          "New: quick buttons show their accumulated click counts, and context menus are regrouped by scope",
          "Improved: zone show/hide animates widths smoothly, panel header actions are leaner, and collapsed headers reveal more subtly on hover",
          "Fixed: joining notebook lines keeps inline formatting; plus a batch of details including scrollbar-aware reminder centering and notebook tab corners",
        ],
      },
    },
    {
      version: "1.1.3",
      date: "2026-10-13",
      notes: {
        zh: [
          "优化：macOS 风格视觉全面打磨——表面层级、间距图标、悬停反馈与完成动效整体统一",
          "新增：提醒事项可拖到快捷区一键生成快捷按钮，文本可拖入记事本续写",
          "优化：列表高度与显隐切换全流程动画；展开的列表整行可点新建待办",
        ],
        en: [
          "Improved: a full macOS-style visual polish — surfaces, spacing, icons, hover feedback, and completion motion unified",
          "New: drag a reminder onto the quick-action area to create a quick button; text drags into the notebook to append",
          "Improved: list heights and visibility toggles animate throughout; expanded lists create todos on a full-row tap",
        ],
      },
    },
    {
      version: "1.0.209",
      date: "2026-10-11",
      notes: {
        zh: [
          "新增：「现在做这个」专注弹窗——全屏计时、随手记与贴图，任务行显示累计专注时长",
          "新增：提醒事项多列布局（可设 1–6 列，每列独立滚动）；快捷区宽面板自动多列铺开",
          "新增：智能粘贴与手机速记自动识别时间生成闹钟；品牌升级为 MiniDesk",
          "优化：手机速记配对引导与手动同步完善；工作区导出不再包含配对信息",
        ],
        en: [
          "New: the \"Do it now\" focus modal — a full-screen timer with quick notes and images, plus per-task focus-time badges",
          "New: multi-column reminder layout (a configurable 1–6 columns, each scrolling independently); quick actions spread into columns on wide panels",
          "New: smart paste and mobile capture recognize times and set alarms; rebranded as MiniDesk",
          "Improved: better pairing guidance and a manual sync for mobile capture; workspace exports no longer carry pairing data",
        ],
      },
    },
    {
      version: "1.0.195",
      date: "2026-09-29",
      notes: {
        zh: [
          "新增：记事本行内富文本标注——高亮、划线、下划线与文字颜色，编辑后自动保持",
          "新增：快捷按钮使用热度染色；快捷区智能粘贴可由剪贴板一键生成快捷按钮",
          "优化：四区宽度引入黄金分割；删除确认、尺寸切换等一批交互与动效打磨",
        ],
        en: [
          "New: rich-text annotations in notes — highlight, strikethrough, underline, and text color that survive editing",
          "New: usage-heat tinting for quick buttons, and quick-area smart paste generates quick buttons from the clipboard",
          "Improved: golden-ratio zone widths, plus polish passes over delete confirms, size toggles, and more interactions",
        ],
      },
    },
    {
      version: "1.0.181",
      date: "2026-09-18",
      notes: {
        zh: [
          "改版：桌面四区视觉焕新——无边框工作台、细分隔线、清晰标题层级，区域宽度按工作区独立记忆",
          "优化：快捷区多列布局与紧凑模式；主题切换全页平滑过渡；页面缓存优先弱网秒开",
          "改版：手机端首页重构为配对引导页，速记页改「打开的记事本」布局，iOS 状态栏与页面融合",
        ],
        en: [
          "Redesign: refreshed four-zone desktop visuals — borderless workbench, thin dividers, clearer headings — with zone widths remembered per workspace",
          "Improved: multi-column quick tags with a compact mode, whole-page theme cross-fades, and cache-first instant loads",
          "Redesign: the mobile home became a pairing guide, the capture page an open-notebook layout, and the iOS status bar blends into the page",
        ],
      },
    },
    {
      version: "1.0.164",
      date: "2026-09-04",
      notes: {
        zh: [
          "新增：右键「智能粘贴 / AI 润色」——剪贴板杂文经 AI 整理后插入，选区可按风格润色替换",
          "新增：手机速记服务端 AI 润色（待办拆条、便签要点化），可开关、支持英文",
          "优化：主题可跟随系统明暗；伴宠 GIF 点击轮换区域 Tips",
        ],
        en: [
          "New: right-click \"Smart paste / AI polish\" — messy clipboard text is AI-organized on insert, and selections polish by style",
          "New: server-side AI polish for mobile capture (todos split, notes summarized), toggleable, with English support",
          "Improved: the theme can follow the system light/dark mode; clicking the companion GIF rotates area tips",
        ],
      },
    },
    {
      version: "1.0.156",
      date: "2026-08-29",
      notes: {
        zh: [
          "新增：手机速记——扫码配对后手机随手记待办与便签，自动同步到电脑；配对码注册/轮换/注销全链路可靠",
          "优化：中继迁至自建服务器，同步缩短至 5 分钟且不限次数；应用离线可用、可安装为桌面应用",
        ],
        en: [
          "New: mobile quick capture — pair by QR and jot todos or notes on the phone, auto-synced to the desktop, with reliable code registration, rotation, and revocation",
          "Improved: the relay moved to a self-hosted server (5-minute sync, unlimited sends); the app works offline and installs as a desktop app",
        ],
      },
    },
    {
      version: "1.0.137",
      date: "2026-08-21",
      notes: {
        zh: [
          "新增：多工作空间（创建/切换/导入导出）与全局搜索；快捷动作按标签分组，支持 API 模板与打开应用",
          "优化：提醒列宽自适应多列、截止时间快捷预设；性能瘦身与键盘编辑增强（防抖保存、Ctrl+方向键移动行）",
        ],
        en: [
          "New: multi-workspace (create/switch/import/export) and global search; quick actions group by tag, with API templates and open-app buttons",
          "Improved: auto-column reminder lists and deadline presets; performance slimming and keyboard editing (debounced saves, Ctrl+arrow line moves)",
        ],
      },
    },
    {
      version: "1.0.45",
      date: "2026-06-06",
      notes: {
        zh: [
          "首个正式版：图片/便签/提醒事项/工作区四区看板，行编辑缩进分行拖拽排序，提醒截止时间与到期通知",
          "随后补齐：多标签页状态互不覆盖、贴图按列表项定位插入、自定义列表与陪伴 GIF 主题",
        ],
        en: [
          "First official release: the four-zone board (images / notes / reminders / workspace) with the line editor, deadlines, and notifications",
          "Followed by: multi-tab safety, per-item image paste positioning, custom lists, and companion GIF themes",
        ],
      },
    },
];
