export type MessageMood = "happy" | "surprised" | "encouraging" | "warning";
export type MessageSurface = "companion" | "naive-message" | "dialog";

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
  | "confirmDeleteImage"
  | "confirmDeleteQuick"
  | "confirmDeleteTodo"
  | "confirmClearCompleted"
  | "about";

type MessageEntry = {
  mood: MessageMood;
  surface: MessageSurface;
  variants: string[];
};

export const KAOMOJI_BY_MOOD: Record<MessageMood, string[]> = {
  happy: [
    "(＾▽＾)",
    "(｡･∀･)ﾉﾞ",
    "(￣▽￣)ノ",
    "(＾－＾)V",
    "(づ￣ ³￣)づ",
    "(´▽`ʃ♡ƪ)",
  ],
  surprised: [
    "(⊙o⊙)",
    "(ﾉﾟ0ﾟ)ﾉ~",
    "(๑°ㅁ°๑)",
    "Σ(っ °Д °;)っ",
    "(゜ロ゜)",
    "w(ﾟДﾟ)w",
  ],
  encouraging: [
    "(๑•̀ㅂ•́)و✧",
    "(ง •_•)ง",
    "(｡•̀ᴗ-)✧",
    "( •̀ ω •́ )y",
    "୧(๑•̀⌄•́๑)૭",
    "ᕦ(ò_óˇ)ᕤ",
  ],
  warning: [
    "(・_・;)",
    "(；′⌒`)",
    "(＞﹏＜)",
    "(￣_￣|||)",
    "(；´д｀)ゞ",
    "(｡•́︿•̀｡)",
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
    ],
  },
  clipboardPasteUnsupported: {
    mood: "warning",
    surface: "naive-message",
    variants: [
      "暂不支持读取剪贴板图片",
      "试试 Ctrl+V 粘贴图片",
      "先用 Ctrl+V 贴图片",
    ],
  },
  clipboardImageMissing: {
    mood: "warning",
    surface: "naive-message",
    variants: [
      "剪贴板里没有图片",
      "这次没找到图片",
      "没有可粘贴的图片",
    ],
  },
  imageAdded: {
    mood: "happy",
    surface: "naive-message",
    variants: [
      "图片已添加",
      "图片收进来了",
      "截图放好啦",
      "图片进列表了",
    ],
  },
  imageCopied: {
    mood: "happy",
    surface: "naive-message",
    variants: [
      "图片已复制",
      "图片复制好了",
      "剪贴板已收好",
      "可以去粘贴啦",
    ],
  },
  imageDataCopied: {
    mood: "surprised",
    surface: "naive-message",
    variants: [
      "已复制为 Data URL",
      "图片按 Data URL 复制",
      "改用 Data URL 复制",
    ],
  },
  quickLinkCopied: {
    mood: "happy",
    surface: "naive-message",
    variants: [
      "链接已复制",
      "链接复制好了",
      "链接放进剪贴板",
      "链接可以粘贴啦",
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
    ],
  },
  quickTextCopyFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "复制失败，再试一次",
      "这次没复制成功",
      "剪贴板暂时没接住",
    ],
  },
  noCompletedTodos: {
    mood: "happy",
    surface: "companion",
    variants: [
      "还没有完成项，不用清理",
      "暂无完成项要清理",
      "没有可清理的完成项",
    ],
  },
  dataImported: {
    mood: "surprised",
    surface: "companion",
    variants: [
      "数据已导入",
      "导入完成，内容已更新",
      "导入的数据收好了",
      "新的内容已生效",
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
    ],
  },
  about: {
    mood: "happy",
    surface: "dialog",
    variants: [
      "To Do List 看板 · Vue 3 + Naive UI + TypeScript",
      "To Do List 看板，基于 Vue 3、Naive UI 和 TypeScript 构建",
      "To Do List 看板已经迁移到 Vue 3 + Naive UI + TypeScript",
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
