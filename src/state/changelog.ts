/**
 * Hand-curated release notes, newest version first.
 *
 * Curation policy — only significant, user-facing updates are recorded:
 * new features, and major changes/optimizations users will clearly notice.
 * Tiny changes (small style tweaks, minor fixes) are intentionally omitted.
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
    version: "1.0.132",
    date: "2026-08-17",
    notes: {
      zh: [
        "修复：暗色模式下打开页面先闪一下亮色的问题（防闪烁脚本改为外链，不再被 CSP 拦截）",
        "修复：导入的工作区提醒事项较多（≥7 条）时，连续右键删除从第二次起确认气泡不再弹出的问题",
        "新增：提醒事项列表全部收起时，右键空白区域也能弹出菜单快速新建列表",
      ],
      en: [
        "Fix: light-theme flash on page load in dark mode (the anti-flash script now ships as an external file CSP won't block)",
        "Fix: in imported workspaces with many todos (≥7 visible), the delete-confirm bubble stopped appearing from the second consecutive right-click delete",
        "New: right-click the blank area of the reminder panel (lists all collapsed) to open a menu and create a list",
      ],
    },
  },
  {
    version: "1.0.129",
    date: "2026-08-16",
    notes: {
      zh: [
        "性能优化：待办输入改为防抖保存，保存与撤销的内存开销大幅降低，大量待办与图片下打字更流畅",
        "首屏加载体积减少约 344KB（伙伴 GIF 素材压缩 + 打包分包修正）",
        "提醒事项勾选完成或删除后，下方条目平滑上移，不再生硬跳动",
        "连续删除提醒事项时每次都会弹出确认气泡，连续删除超过两次后直接删除",
        "提醒勾选框重绘为透明圆形细描边，勾选后绿色实心；顶部工具栏按钮统一为正圆样式",
        "安全修复：阻断快捷按钮配置中的 javascript:/data: 等危险链接协议",
      ],
      en: [
        "Performance: debounced todo-input saves and much lower save/undo memory overhead — smoother typing with many todos and images",
        "First-load payload reduced by ~344KB (compressed companion GIFs + fixed vendor chunking)",
        "Reminder items now slide up smoothly after being checked or deleted",
        "Deleting reminders in a row now confirms each time, then deletes directly after two consecutive deletes",
        "Todo checkbox redrawn as a thin-outline circle that fills green when done; toolbar buttons unified to circles",
        "Security: block javascript:/data: and other dangerous URL schemes in quick-button configs",
      ],
    },
  },
  {
    version: "1.0.126",
    date: "2026-08-14",
    notes: {
      zh: [
        "新增「更新记录」弹窗：点击设置菜单底部版本号，即可查看各版本的功能变更（含发版日期与分点说明）",
      ],
      en: [
        "New Release notes modal — click the version number at the bottom of the settings menu to browse what each version changed, with release dates and bullet details",
      ],
    },
  },
  {
    version: "1.0.125",
    date: "2026-08-13",
    notes: {
      zh: [
        "过期提醒的红点移至列表标题，列表收起时也能看到",
        "提醒事项多列布局下，同一列内展开的列表改为平分垂直高度",
      ],
      en: [
        "Overdue reminder dot moved to the list title — visible even when collapsed",
        "In multi-column layout, expanded lists in a column now share the vertical height evenly",
      ],
    },
  },
  {
    version: "1.0.123",
    date: "2026-08-12",
    notes: {
      zh: [
        "导入同名空间时支持「覆盖」或「新增」（新增会自动追加编号）",
        "图片进入 solo 模式后可拖动调整宽度",
        "清空数据新增从左到右的加载动画，并提示「所有空间都会被清空」",
      ],
      en: [
        "Importing a same-named workspace now asks to overwrite or add (added ones auto-suffix a number)",
        "Solo image mode width is now draggable",
        "Clear-data now shows a left-to-right loading animation and warns all workspaces will be cleared",
      ],
    },
  },
  {
    version: "1.0.118",
    date: "2026-08-10",
    notes: {
      zh: ["显示区域配置迁移为每个空间独立配置，各空间可单独显示/隐藏区域"],
      en: ["Zone visibility config moved to per-workspace — each workspace shows/hides zones on its own"],
    },
  },
  {
    version: "1.0.117",
    date: "2026-08-10",
    notes: {
      zh: [
        "提醒事项列宽超过阈值时自动分为多列",
        "设置菜单新增「配置」区域显示子菜单",
      ],
      en: [
        "Reminder list auto-splits into multiple columns past a width threshold",
        "Added a Zones submenu to the settings menu",
      ],
    },
  },
  {
    version: "1.0.113",
    date: "2026-08-08",
    notes: {
      zh: [
        "快捷动作空白区域右键菜单支持「粘贴」，直接创建按钮",
        "清空数据彻底清空 localStorage 与 IndexedDB，不留残留",
      ],
      en: [
        "Right-click the quick-actions blank area and paste to create buttons directly",
        "Clear-data now wipes localStorage and IndexedDB thoroughly with no leftovers",
      ],
    },
  },
  {
    version: "1.0.111",
    date: "2026-08-08",
    notes: {
      zh: ["图片支持精确定位拖放，可拖放到指定列表项位置"],
      en: ["Images can be dropped at a precise position next to a specific list item"],
    },
  },
  {
    version: "1.0.110",
    date: "2026-08-07",
    notes: {
      zh: [
        "提醒截止时间新增快捷预设（15 分钟后、1 小时后、明天 9 点等）",
        "快捷按钮新增 API 模板，可快速创建接口快捷动作",
      ],
      en: [
        "Reminder deadlines gained quick presets (in 15 minutes, in 1 hour, tomorrow 9:00, …)",
        "Quick buttons gained API templates to create API actions quickly",
      ],
    },
  },
  {
    version: "1.0.106",
    date: "2026-08-05",
    notes: {
      zh: [
        "快捷动作新增「打开应用」类型，支持 URL 协议唤起本地软件",
        "快捷动作标签配色系统，不同标签自动着色",
      ],
      en: [
        "Quick actions gained an \"open app\" type that launches local software via URL schemes",
        "Quick-action tag color system — each tag gets its own color",
      ],
    },
  },
  {
    version: "1.0.102",
    date: "2026-08-02",
    notes: {
      zh: [
        "新增多工作空间：标题区切换器，支持创建/切换/重命名/删除/拖动排序",
        "导入支持单空间/全量分流，设置菜单支持导出当前空间",
      ],
      en: [
        "Multi-workspace support: a title-bar switcher with create/switch/rename/delete/drag-to-reorder",
        "Import handles both single-workspace and full payloads; export the current workspace from settings",
      ],
    },
  },
  {
    version: "1.0.97",
    date: "2026-07-28",
    notes: {
      zh: ["新增全局搜索：命令栏搜索框，快捷动作按关键词过滤并高亮匹配"],
      en: ["Global search: a command-bar search box filters quick actions by keyword with match highlighting"],
    },
  },
  {
    version: "1.0.96",
    date: "2026-07-27",
    notes: {
      zh: ["整体视觉刷新：环境网格背景、入场编排动画、弹簧微交互"],
      en: ["Visual refresh: ambient mesh backdrop, entrance choreography, and spring micro-interactions"],
    },
  },
  {
    version: "1.0.95",
    date: "2026-07-24",
    notes: {
      zh: ["落地页新增滚动驱动的动画效果"],
      en: ["The landing page gained scroll-driven animations"],
    },
  },
  {
    version: "1.0.93",
    date: "2026-07-15",
    notes: {
      zh: ["快捷动作支持按标签分组折叠收纳，无标签动作统一收进默认分组"],
      en: ["Quick actions can be collapsed into tag groups; untagged ones fold into a default group"],
    },
  },
  {
    version: "1.0.86",
    date: "2026-06-22",
    notes: {
      zh: ["图片粘贴增强：按所在列表项定位插入，右键菜单提供上下文粘贴操作"],
      en: ["Image paste upgrades: insert relative to the hovered list item, with contextual paste actions"],
    },
  },
  {
    version: "1.0.55",
    date: "2026-06-10",
    notes: {
      zh: ["多标签页同时打开时防止本地状态相互覆盖，数据更安全"],
      en: ["Guarded local saves against multi-tab conflicts so data never overwrites itself"],
    },
  },
  {
    version: "1.0.45",
    date: "2026-06-06",
    notes: {
      zh: [
        "首个正式版：图片 / 便签 / 提醒事项 / 工作区四区看板",
        "行编辑器支持 Tab 缩进、Enter 分行、拖拽排序",
        "提醒事项支持截止时间、到期通知与「今日重点」聚合视图",
        "提醒列表可自定义（新增 / 重命名 / 删除）",
        "陪伴 GIF 主题切换（含无 GIF 模式）",
        "移动端适配与桌面版引导页",
      ],
      en: [
        "First official release: the four-zone board (images / notes / reminders / workspace)",
        "Line editor with Tab indent, Enter splitting, and drag-to-sort",
        "Reminders with deadlines, due notifications, and a Today's Focus view",
        "Customizable reminder lists (create / rename / delete)",
        "Companion GIF themes (including a GIF-free mode)",
        "Mobile adaptation with a desktop handoff page",
      ],
    },
  },
];
