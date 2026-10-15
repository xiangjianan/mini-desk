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
      version: "1.1.8",
      date: "2026-10-15",
      notes: {
        zh: [
          "新增：外观单按钮切换（浅色/深色/跟随系统）收进顶栏，默认浅色主题",
          "新增：提醒事项可拖到快捷区生成快捷按钮、拖入记事本续写；快捷按钮显示累计点击次数",
          "新增：标签、提醒列表、空间与工作区名称限长 20 字，超长自动截断",
          "调整：品牌配色换为石墨灰 + 钢青蓝；桌面表面与置顶任务视觉整体打磨",
          "优化：分区显隐与列表高度全流程动画；滚动条、圆角与菜单等细节统一",
        ],
        en: [
          "New: one-button appearance cycling (light / dark / system) beside the top-bar settings, defaulting to light",
          "New: drag reminders onto the quick area to create buttons and into the notebook to append; quick buttons show lifetime click counts",
          "New: user-authored names (tags, reminder lists, spaces, workspaces) are capped at 20 characters",
          "Changed: a graphite-and-steel-blue brand palette, with desktop surfaces and pinned tasks visually unified",
          "Improved: full-flow animations for zone visibility and list heights, plus unified scrollbar, corner, and menu details",
        ],
      },
    },
    {
      version: "1.0.209",
      date: "2026-10-11",
      notes: {
        zh: [
          "新增：「现在做这个」专注弹窗——全屏计时、随手记与贴图，任务行显示累计专注时长",
          "新增：提醒事项多列布局；智能粘贴与手机速记自动识别时间生成闹钟",
          "新增：记事本行内富文本标注与快捷按钮热度染色；右键「智能粘贴 / AI 润色」",
          "改版：桌面四区视觉焕新、手机端首页重构为配对引导页；四区宽度引入黄金分割",
        ],
        en: [
          "New: the \"Do it now\" focus modal — a full-screen timer with quick notes and images, plus per-task focus-time badges",
          "New: multi-column reminder lists; smart paste and mobile capture recognize times and set alarms",
          "New: rich-text annotations in notes and heat-tinted quick buttons; right-click \"Smart paste / AI polish\"",
          "Redesign: refreshed desktop visuals and a pairing-guide mobile home; golden-ratio zone widths",
        ],
      },
    },
    {
      version: "1.0.156",
      date: "2026-08-29",
      notes: {
        zh: [
          "新增：手机速记——扫码配对后手机随手记待办与便签，自动同步到电脑",
          "新增：多工作空间与全局搜索；快捷动作按标签分组，支持 API 模板与打开应用",
          "优化：中继迁至自建服务器（5 分钟同步、不限次数）；应用离线可用、可安装为桌面应用",
        ],
        en: [
          "New: mobile quick capture — pair by QR, jot todos or notes on the phone, auto-synced to the desktop",
          "New: multi-workspace and global search; quick actions group by tag with API templates and open-app buttons",
          "Improved: self-hosted relay (5-minute sync, unlimited sends); offline support and desktop install",
        ],
      },
    },
    {
      version: "1.0.45",
      date: "2026-06-06",
      notes: {
        zh: [
          "首个正式版：图片/便签/提醒事项/工作区四区看板，提醒截止时间与到期通知",
          "随后补齐：多标签页状态互不覆盖、贴图按列表项定位、自定义列表与陪伴 GIF 主题",
        ],
        en: [
          "First official release: the four-zone board with deadlines and notifications",
          "Followed by: multi-tab safety, per-item image paste, custom lists, and companion GIF themes",
        ],
      },
    },
];
