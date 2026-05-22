export type MessageMood = "happy" | "surprised" | "encouraging" | "warning" | "calm";
export type MessageSurface = "companion" | "naive-message";

export type MessageKey =
  | "save"
  | "todoCompleted"
  | "clipboardPasteUnsupported"
  | "clipboardImageMissing"
  | "imageAdded"
  | "imageCopied"
  | "imageDataCopied"
  | "quickLinkCopied"
  | "quickTextCopied"
  | "quickTextCopyFailed"
  | "noCompletedTodos"
  | "dataExported"
  | "dataImported"
  | "deleteImage"
  | "deleteQuick"
  | "deleteTodo"
  | "deleteSpace"
  | "clearCompleted"
  | "importJsonInvalid"
  | "importDataInvalid"
  | "imageStoreFailed"
  | "imageReadFailed"
  | "clipboardPermissionDenied"
  | "imageCopyFailed"
  | "linkOpenFailed"
  | "confirmDeleteImage"
  | "confirmDeleteQuick"
  | "confirmDeleteTodo"
  | "confirmDeleteSpace"
  | "confirmClearCompleted"
  | "confirmImportData"
  | "about";

type MessageEntry = {
  mood: MessageMood;
  surface: MessageSurface;
  variants: string[];
};

/**
 * Central copy catalog for companion bubbles and confirmation prompts.
 * Keep message keys scenario-based so components do not hard-code user-facing
 * copy. Delete-result keys intentionally do not imply undo or recovery.
 */
export const KAOMOJI_BY_MOOD: Record<MessageMood, string[]> = {
  happy: [
    "(＾▽＾)",
    "(｡･∀･)ﾉﾞ",
    "(￣▽￣)ノ",
    "(＾－＾)V",
    "(づ￣ ³￣)づ",
    "(´▽`ʃ♡ƪ)",
    "(*^▽^*)",
    "(⌒▽⌒)",
    "(๑˃ᴗ˂)ﻭ",
    "٩(◕‿◕｡)۶",
  ],
  surprised: [
    "(⊙o⊙)",
    "(ﾉﾟ0ﾟ)ﾉ~",
    "(๑°ㅁ°๑)",
    "Σ(っ °Д °;)っ",
    "(゜ロ゜)",
    "w(ﾟДﾟ)w",
    "(⊙_⊙)",
    "ヽ(°〇°)ﾉ",
    "(º Д º*)",
    "(☉_☉)",
  ],
  encouraging: [
    "(๑•̀ㅂ•́)و✧",
    "(ง •_•)ง",
    "(｡•̀ᴗ-)✧",
    "( •̀ ω •́ )y",
    "୧(๑•̀⌄•́๑)૭",
    "ᕦ(ò_óˇ)ᕤ",
    "٩(ˊᗜˋ*)و",
    "(ง'̀-'́)ง",
    "୧(＾ 〰 ＾)୨",
    "ᕙ(⇀‸↼‶)ᕗ",
  ],
  warning: [
    "(・_・;)",
    "(；′⌒`)",
    "(＞﹏＜)",
    "(￣_￣|||)",
    "(；´д｀)ゞ",
    "(｡•́︿•̀｡)",
    "(；一_一)",
    "(´-﹏-`；)",
    "(；￣Д￣)",
    "(・へ・)",
  ],
  calm: [
    "( ˘ω˘ )",
    "(´･ᴗ･`)",
    "(´ー`)",
    "( ˙꒳​˙ )",
    "(｡･ω･｡)",
    "(￣︶￣)",
    "( ´ ▽ ` )",
    "(｡-_-｡)",
    "( ˊᵕˋ )",
    "(´ω｀)",
  ],
};

export const MESSAGE_CATALOG: Record<MessageKey, MessageEntry> = {
  save: {
    mood: "happy",
    surface: "companion",
    variants: [
      "已保存，放心继续",
      "内容收好啦",
      "改动记下了",
      "这一版稳稳存好",
      "想法已经收好",
      "保存完成，继续推进",
      "刚刚已存好",
      "内容稳稳保存",
      "记录已更新",
      "放心继续写",
    ],
  },
  todoCompleted: {
    mood: "encouraging",
    surface: "companion",
    variants: [
      "又完成一项",
      "进度加一",
      "这一步拿下了",
      "节奏不错",
      "继续稳稳推进",
      "又靠近目标一点",
      "完成得漂亮",
      "这一项收尾了",
      "进展很稳",
      "继续保持节奏",
    ],
  },
  clipboardPasteUnsupported: {
    mood: "warning",
    surface: "companion",
    variants: [
      "暂不支持读取剪贴板图片",
      "试试 Ctrl+V 粘贴图片",
      "先用 Ctrl+V 贴图片",
      "请用 Ctrl+V 粘贴",
      "无法读取剪贴板",
      "浏览器暂不支持",
      "请直接粘贴图片",
      "图片读取受限",
      "换 Ctrl+V 试试",
      "请改用快捷键",
    ],
  },
  clipboardImageMissing: {
    mood: "warning",
    surface: "companion",
    variants: [
      "剪贴板里没有图片",
      "这次没找到图片",
      "没有可粘贴的图片",
      "剪贴板暂无图片",
      "未发现图片内容",
      "没有图片可贴",
      "先复制一张图片",
      "请先复制图片",
      "这里没读到图片",
      "图片不在剪贴板",
    ],
  },
  imageAdded: {
    mood: "happy",
    surface: "companion",
    variants: [
      "图片已添加",
      "图片收进来了",
      "截图放好啦",
      "图片进列表了",
      "截图已收好",
      "图片已放入",
      "这张图已保存",
      "图片加入完成",
      "截图已添加",
      "图片已归位",
    ],
  },
  imageCopied: {
    mood: "happy",
    surface: "companion",
    variants: [
      "图片已复制",
      "图片复制好了",
      "剪贴板已收好",
      "可以去粘贴啦",
      "图片进剪贴板",
      "复制图片完成",
      "图片已备好",
      "可以粘贴图片",
      "截图复制好了",
      "图片已带走",
    ],
  },
  imageDataCopied: {
    mood: "surprised",
    surface: "companion",
    variants: [
      "已复制为 Data URL",
      "图片按 Data URL 复制",
      "改用 Data URL 复制",
      "Data URL 已复制",
      "已复制图片文本",
      "图片文本已复制",
      "改用文本复制",
      "图片源码已复制",
      "已复制图片源码",
      "图片转文本复制",
    ],
  },
  quickLinkCopied: {
    mood: "happy",
    surface: "companion",
    variants: [
      "链接已复制",
      "链接复制好了",
      "链接放进剪贴板",
      "链接可以粘贴啦",
      "链接已备好",
      "可以粘贴链接",
      "链接已带走",
      "剪贴板有链接",
      "复制链接完成",
      "链接收进剪贴板",
    ],
  },
  quickTextCopied: {
    mood: "happy",
    surface: "companion",
    variants: [
      "文本已复制",
      "文字复制好了",
      "剪贴板已收好",
      "可以去粘贴啦",
      "文本进剪贴板",
      "复制文本完成",
      "文字已备好",
      "可以粘贴文本",
      "文本已带走",
      "内容已复制",
    ],
  },
  quickTextCopyFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "复制失败，再试一次",
      "这次没复制成功",
      "剪贴板暂时没接住",
      "复制失败",
      "请重试复制",
      "剪贴板写入失败",
      "暂时无法复制",
      "复制没有完成",
      "请稍后再复制",
      "复制被浏览器拦截",
    ],
  },
  noCompletedTodos: {
    mood: "happy",
    surface: "companion",
    variants: [
      "还没有完成项，不用清理",
      "暂无完成项要清理",
      "没有可清理的完成项",
      "完成项为空",
      "现在不用清理",
      "没有完成记录",
      "无需清理完成项",
      "清理列表为空",
      "完成项还没有",
      "暂无可清理内容",
    ],
  },
  dataImported: {
    mood: "happy",
    surface: "companion",
    variants: [
      "数据已导入",
      "导入完成，内容已更新",
      "导入的数据收好了",
      "新的内容已生效",
      "导入已完成",
      "看板已更新",
      "备份内容已生效",
      "数据已同步",
      "内容导入完成",
      "新数据已就位",
    ],
  },
  dataExported: {
    mood: "happy",
    surface: "companion",
    variants: [
      "数据已导出",
      "备份文件准备好了",
      "当前看板已导出",
      "备份留一份更稳妥",
      "备份已生成",
      "导出已完成",
      "看板备份好了",
      "文件已准备好",
      "数据已备份",
      "导出文件好了",
    ],
  },
  deleteImage: {
    mood: "calm",
    surface: "companion",
    variants: [
      "图片已删除",
      "这张图已删除",
      "图片已移除",
      "截图已删除",
      "截图已移除",
      "图片从列表移除",
      "这张图已移除",
      "图片删除完成",
      "截图删除完成",
      "图片已清掉",
    ],
  },
  deleteQuick: {
    mood: "calm",
    surface: "companion",
    variants: [
      "快捷按钮已删除",
      "快捷入口已删除",
      "按钮已移除",
      "入口已移除",
      "快捷内容已删除",
      "这个按钮已删除",
      "快捷按钮已移除",
      "入口删除完成",
      "按钮删除完成",
      "快捷项已删除",
    ],
  },
  deleteTodo: {
    mood: "calm",
    surface: "companion",
    variants: [
      "提醒已删除",
      "提醒已移除",
      "事项已删除",
      "待办已删除",
      "这条提醒已删",
      "提醒删除完成",
      "事项删除完成",
      "这条待办已删",
      "提醒已清掉",
      "待办已移除",
    ],
  },
  deleteSpace: {
    mood: "calm",
    surface: "companion",
    variants: [
      "空间已删除",
      "空间已移除",
      "工作区已删除",
      "这个空间已删除",
      "空间删除完成",
      "空间已清掉",
      "工作区已移除",
      "空间从列表移除",
      "这个空间已移除",
      "空间已收起",
    ],
  },
  clearCompleted: {
    mood: "calm",
    surface: "companion",
    variants: [
      "已清理完成项",
      "完成项已清理",
      "完成记录已清理",
      "已移除完成项",
      "完成项已移除",
      "清理完成项完成",
      "完成事项已清理",
      "已清掉完成项",
      "完成列表已清理",
      "已清理完成记录",
    ],
  },
  importJsonInvalid: {
    mood: "warning",
    surface: "companion",
    variants: [
      "文件格式不正确",
      "请检查文件格式",
      "JSON 格式有误",
      "文件无法读取",
      "请换正确文件",
      "备份文件格式错",
      "文件内容有误",
      "请重新选择文件",
      "导入文件无效",
      "文件解析失败",
    ],
  },
  importDataInvalid: {
    mood: "warning",
    surface: "companion",
    variants: [
      "数据内容不适用",
      "请换备份文件",
      "备份数据无效",
      "导入数据不匹配",
      "请检查备份",
      "数据结构有误",
      "文件不是看板备份",
      "备份内容异常",
      "无法使用此备份",
      "请导入看板备份",
    ],
  },
  imageStoreFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "图片保存失败",
      "请重试保存图片",
      "图片暂未存好",
      "图片写入失败",
      "请减少图片后重试",
      "图片存储受限",
      "保存图片出错",
      "图片没有保存",
      "请稍后再保存",
      "图片存储失败",
    ],
  },
  imageReadFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "图片读取失败",
      "请重新粘贴图片",
      "图片无法读取",
      "请换一张图片",
      "读取图片出错",
      "图片内容异常",
      "请重新选择图片",
      "没有读到图片",
      "图片加载失败",
      "请再粘贴一次",
    ],
  },
  clipboardPermissionDenied: {
    mood: "warning",
    surface: "companion",
    variants: [
      "剪贴板权限受限",
      "请检查剪贴板权限",
      "浏览器限制剪贴板",
      "无法读取剪贴板",
      "请改用 Ctrl+V",
      "剪贴板读取失败",
      "权限不足无法读取",
      "请允许剪贴板",
      "剪贴板访问失败",
      "请检查浏览器权限",
    ],
  },
  imageCopyFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "图片复制失败",
      "请重试复制图片",
      "暂时无法复制图片",
      "图片没有复制",
      "复制图片出错",
      "剪贴板写入失败",
      "请稍后再复制",
      "图片写入剪贴板失败",
      "复制图片未完成",
      "请再复制一次",
    ],
  },
  linkOpenFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "链接打开失败",
      "请检查链接",
      "浏览器拦截链接",
      "无法打开链接",
      "链接未打开",
      "请检查网址",
      "打开链接受限",
      "链接跳转失败",
      "请稍后再打开",
      "链接可能无效",
    ],
  },
  confirmDeleteImage: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除这张图片？",
      "要删掉这张图片吗？",
      "确定移除这张图片吗？",
      "删除后列表里就没有了",
      "删除这张图片？",
      "确定删除图片？",
      "图片会从列表移除",
      "确认移除图片？",
      "删除后不可恢复",
      "要移除这张图？",
    ],
  },
  confirmDeleteQuick: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除这个快捷按钮？",
      "要移除这个快捷按钮吗？",
      "确定删掉这个入口吗？",
      "删除后就不在这里了",
      "删除这个快捷按钮？",
      "确定删除快捷入口？",
      "按钮会从这里移除",
      "确认移除这个入口？",
      "删除后不可恢复",
      "要删除这个按钮？",
    ],
  },
  confirmDeleteTodo: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除这条提醒？",
      "要删掉这条提醒吗？",
      "确定移除这条提醒事项吗？",
      "删除后就看不到了",
      "删除这条提醒？",
      "确定删除提醒？",
      "提醒会从列表移除",
      "确认移除提醒？",
      "删除后不可恢复",
      "要移除这条待办？",
    ],
  },
  confirmDeleteSpace: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除空间？不可恢复",
      "要删掉这个空间吗？内容不会恢复",
      "确定移除空间？不可撤回",
      "删除空间？内容不可恢复",
      "删除后空间不可恢复",
      "空间内容会永久删除",
      "确认删除空间？不可恢复",
      "删除这个空间？不可恢复",
      "空间删除后无法恢复",
      "确定移除空间？不可恢复",
    ],
  },
  confirmClearCompleted: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认清除已完成事项？",
      "要清掉这些完成事项吗？",
      "确定移除完成事项吗？",
      "完成事项清理掉吗？",
      "清理这些完成项？",
      "移除已完成事项？",
      "清掉完成记录？",
      "完成项会被移除",
      "清理后不可恢复",
      "确定清理完成项？",
    ],
  },
  confirmImportData: {
    mood: "warning",
    surface: "companion",
    variants: [
      "导入会覆盖当前数据，确认吗",
      "当前数据会被覆盖，继续导入吗",
      "确认导入并覆盖现有数据",
      "导入会覆盖当前数据",
      "覆盖当前看板？",
      "当前内容将被覆盖",
      "确认覆盖导入？",
      "导入后现有数据会变更",
      "覆盖后当前内容丢失",
      "确认用备份覆盖？",
    ],
  },
  about: {
    mood: "calm",
    surface: "companion",
    variants: [
      "To Do List 看板 · Vue 3 + Naive UI + TypeScript",
      "To Do List 看板，基于 Vue 3、Naive UI 和 TypeScript 构建",
      "To Do List 看板已经迁移到 Vue 3 + Naive UI + TypeScript",
      "To Do List 看板，轻量本地任务面板",
      "To Do List 看板，适合整理每日任务",
      "To Do List 看板，数据保存在浏览器本地",
      "To Do List 看板，支持图片、便签和待办",
      "To Do List 看板，专注快速记录和整理",
      "To Do List 看板，当前版本基于 Vue 3",
      "To Do List 看板，开源项目入口在下方",
    ],
  },
};

export function getMessage(key: MessageKey, random = Math.random): string {
  const entry = MESSAGE_CATALOG[key];
  return withKaomoji(randomItem(entry.variants, random), entry.mood, random);
}

export function withKaomoji(text: string, mood: MessageMood, random = Math.random): string {
  return text
    .split("\n")
    .map((segment) => {
      if (!segment.trim()) return segment;
      return `${segment} ${randomItem(KAOMOJI_BY_MOOD[mood], random)}`;
    })
    .join("\n");
}

export function getMessageCatalogSummary(): string {
  return Object.entries(MESSAGE_CATALOG)
    .map(([key, entry]) => `${key}: ${entry.surface}/${entry.mood} -> ${entry.variants.join(" | ")}`)
    .join("\n");
}

function randomItem<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}
