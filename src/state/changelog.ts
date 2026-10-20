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
      version: "1.1.9",
      date: "2026-10-20",
      notes: {
        zh: [
          "新增：提醒区菜单一键清理所有列表的已完成项",
          "新增：快捷动作右键按类型复制（标题 / 内容 / 请求链接 / 应用协议）",
        ],
        en: [
          "New: clear completed reminders across all lists from the area menu",
          "New: per-type copy actions on quick buttons (title / content / request URL / app scheme)",
        ],
      },
    },
    {
      version: "1.1.8",
      date: "2026-10-15",
      notes: {
        zh: [
          "新增：顶栏单按钮切换浅色 / 深色 / 跟随系统",
          "新增：提醒可拖入快捷区生成按钮、拖入记事本续写；快捷按钮显示累计点击",
          "新增：标签、列表、空间与工作区名称限长 20 字",
          "调整：石墨灰 + 钢青蓝品牌配色，桌面视觉整体打磨",
          "优化：分区显隐与列表高度全流程动画，细节样式统一",
        ],
        en: [
          "New: one-button light / dark / system theme cycling in the top bar",
          "New: drag reminders into the quick area or notebook; quick buttons show click counts",
          "New: user-authored names capped at 20 characters",
          "Changed: graphite-and-steel-blue palette with refreshed desktop surfaces",
          "Improved: animated zone visibility and list heights, unified details",
        ],
      },
    },
    {
      version: "1.0.209",
      date: "2026-10-11",
      notes: {
        zh: [
          "新增：「现在做这个」专注模式——全屏计时、随手记与贴图",
          "新增：提醒多列布局；智能粘贴自动识别时间生成闹钟",
          "新增：记事本富文本标注与快捷按钮热度染色；右键「智能粘贴 / AI 润色」",
          "改版：桌面与手机端视觉焕新，四区宽度引入黄金分割",
        ],
        en: [
          "New: \"Do it now\" focus mode — full-screen timer with quick notes and images",
          "New: multi-column reminders; smart paste turns recognized times into alarms",
          "New: rich-text notes and heat-tinted quick buttons; smart paste and AI polish menus",
          "Redesign: refreshed desktop and mobile visuals, golden-ratio zone widths",
        ],
      },
    },
    {
      version: "1.0.156",
      date: "2026-08-29",
      notes: {
        zh: [
          "新增：手机速记——扫码配对，手机记录自动同步到电脑",
          "新增：多工作空间与全局搜索；快捷动作标签分组",
          "优化：自建中继不限次数；应用可离线使用、可安装",
        ],
        en: [
          "New: mobile quick capture — QR pairing with auto-sync to the desktop",
          "New: multi-workspace and global search; quick actions grouped by tag",
          "Improved: self-hosted relay with unlimited sends; offline support and installability",
        ],
      },
    },
    {
      version: "1.0.45",
      date: "2026-06-06",
      notes: {
        zh: [
          "首个正式版：四区看板、截止时间与到期通知",
          "随后补齐：多标签页保护、贴图定位、自定义列表与陪伴 GIF",
        ],
        en: [
          "First official release: the four-zone board with deadlines and notifications",
          "Then: multi-tab safety, per-item images, custom lists, and companion GIFs",
        ],
      },
    },
];
