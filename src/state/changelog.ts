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
