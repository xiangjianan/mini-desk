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
      version: "1.1.15",
      date: "2026-10-27",
      notes: {
        zh: [
          "改版：快捷动作区改为持久分组，纯文字紧凑胶囊样式",
          "优化：面板菜单统一收敛为竖排 ⋮ 菜单，去除重复创建入口",
          "新增：粘贴条目闪烁高亮反馈与全新智能粘贴图标",
        ],
        en: [
          "Redesigned: quick actions as persistent groups with compact text-only pills",
          "Improved: panel menus unified into vertical ⋮ menus without duplicate creation actions",
          "New: flash highlight on pasted items and a fresh smart-paste icon",
        ],
      },
    },
    {
      version: "1.1.14",
      date: "2026-10-27",
      notes: {
        zh: [
          "优化：大幅降低大看板拖拽排序与分组折叠的布局开销，操作更流畅",
        ],
        en: [
          "Improved: far less layout work while drag sorting or collapsing groups on large boards, for smoother interactions",
        ],
      },
    },
  {
    version: "1.1.13-offline",
    date: "2026-10-25",
    notes: {
      zh: [
        "同步 1.1.13：优化大看板拖拽和折叠性能，保持分组折叠时的底色稳定",
        "复用图片预览工具栏、缩放交互和右键菜单；修复切换便签时未取消重命名的问题",
        "保留普通粘贴按钮、无彩色悬浮特效，以及离线版的 AI 和手机速记功能删减",
      ],
      en: [
        "Updated to 1.1.13: faster large-board dragging and collapsing with stable group surfaces",
        "Shared preview toolbars, image transforms, and context menus; fixed note-tab rename cancellation",
        "Retained plain paste controls without animated hover colors and the offline edition's AI/mobile feature removal",
      ],
    },
  },
  {
    version: "1.1.12-offline",
    date: "2026-10-23",
    notes: {
      zh: [
        "同步 1.1.12：拖拽排序实时预览落位空隙，支持拖入折叠分组",
        "优化提醒列表拖拽落位与动画稳定性；隐藏的快捷按钮按当前标签筛选",
        "未分类快捷动作统一显示为「无标签」；保留普通粘贴按钮和离线版功能取舍",
      ],
      en: [
        "Updated to 1.1.12: live landing-gap previews and drops onto collapsed groups",
        "Improved reminder drag landing and animations; hidden quick actions are scoped to the selected tag",
        "Untagged quick actions now use No tag; plain paste controls and offline edition behavior are retained",
      ],
    },
  },
    {
      version: "1.1.12",
      date: "2026-10-23",
      notes: {
        zh: [
          "新增：拖拽排序实时预览落位空隙，支持拖入折叠分组",
          "优化：提醒列表拖拽排序与落位动画更顺滑稳定",
          "修复：隐藏的快捷按钮按当前标签筛选显示",
        ],
        en: [
          "New: live landing-gap preview while drag sorting; drops onto collapsed groups",
          "Improved: smoother, steadier reminder drag sorting and landing animations",
          "Fixed: hidden quick actions now filtered by the selected tag",
        ],
      },
    },
  {
    version: "1.1.10-offline",
    date: "2026-10-22",
    notes: {
      zh: ["离线特别版：移除智能粘贴、AI 润色及相关入口", "移除手机速记、配对与同步；保留普通粘贴和本地工作台", "保留各区域及列表的普通粘贴按钮，取消悬浮彩色特效；修复设置菜单重复分割线"],
      en: ["Offline edition: removed smart paste, AI polish, and their controls", "Removed mobile capture, pairing, and sync; kept ordinary paste and the local workbench", "Kept plain paste buttons in area and list headers without animated hover colors; fixed duplicate settings dividers"],
    },
  },
    {
      version: "1.1.10",
      date: "2026-10-22",
      notes: {
        zh: [
          "新增：一键清理所有列表的已完成提醒",
          "新增：快捷按钮右键按类型复制",
        ],
        en: [
          "New: clear completed reminders across all lists in one click",
          "New: per-type copy on quick button right-click",
        ],
      },
    },
    {
      version: "1.1.8",
      date: "2026-10-15",
      notes: {
        zh: [
          "新增：顶栏一键切换浅色 / 深色 / 跟随系统",
          "新增：提醒拖入快捷区或记事本，快捷按钮显示点击次数",
          "调整：名称限长 20 字；石墨灰 + 钢青蓝配色与动画细节打磨",
        ],
        en: [
          "New: one-button light / dark / system theme cycling in the top bar",
          "New: drag reminders into the quick area or notebook; quick buttons show click counts",
          "Changed: 20-character name cap; graphite-blue palette and animation polish",
        ],
      },
    },
    {
      version: "1.0.209",
      date: "2026-10-11",
      notes: {
        zh: [
          "新增：「现在做这个」专注模式（计时 + 记事 + 贴图）",
          "新增：提醒多列布局，智能粘贴识别时间生成闹钟，记事本富文本标注",
          "改版：桌面与手机视觉焕新，四区宽度引入黄金分割",
        ],
        en: [
          "New: \"Do it now\" focus mode with timer, notes, and images",
          "New: multi-column reminders, time-aware smart paste, rich-text notes",
          "Redesign: refreshed desktop and mobile visuals with golden-ratio zones",
        ],
      },
    },
    {
      version: "1.0.156",
      date: "2026-08-29",
      notes: {
        zh: [
          "新增：手机速记，扫码配对自动同步到电脑",
          "新增：多工作空间、全局搜索与快捷动作分组",
          "优化：自建中继不限量，可离线使用与安装",
        ],
        en: [
          "New: mobile quick capture synced to the desktop via QR pairing",
          "New: multi-workspace, global search, grouped quick actions",
          "Improved: self-hosted relay, offline support, installable app",
        ],
      },
    },
    {
      version: "1.0.45",
      date: "2026-06-06",
      notes: {
        zh: [
          "首个正式版：四区看板、截止时间与到期通知",
          "随后补齐：多标签页保护、贴图、自定义列表与陪伴 GIF",
        ],
        en: [
          "First release: four-zone board with deadlines and notifications",
          "Then: multi-tab safety, images, custom lists, companion GIFs",
        ],
      },
    },
];
