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
      "保存好啦",
      "收好啦，放心吧",
      "已存好，继续写吧",
      "改动已收好，没有遗漏",
      "这一页归档好啦",
      "放心，都记下来了",
      "整理完毕，存好了",
      "把你的想法收好啦",
    ],
  },
  todoCompleted: {
    mood: "encouraging",
    surface: "companion",
    variants: [
      "太棒了，又完成一项",
      "厉害，继续加油",
      "搞定一个，距离目标更近了",
      "很好，保持这个节奏",
      "完成了，给自己点个赞",
      "又划掉一个，进度加一",
      "这一步稳稳拿下",
    ],
  },
  clipboardPasteUnsupported: {
    mood: "warning",
    surface: "naive-message",
    variants: [
      "当前浏览器不支持读取剪贴板图片，请直接 Ctrl+V 粘贴",
      "还不能主动读取剪贴板，试试 Ctrl+V 粘贴图片",
      "剪贴板读取暂不可用，可以用 Ctrl+V 把图片贴进来",
    ],
  },
  clipboardImageMissing: {
    mood: "warning",
    surface: "naive-message",
    variants: [
      "剪贴板里没有找到图片",
      "这次剪贴板里似乎没有图片",
      "没有检测到可粘贴的图片内容",
    ],
  },
  imageAdded: {
    mood: "happy",
    surface: "naive-message",
    variants: [
      "图片已添加",
      "图片收进来了",
      "截图已经放到图床里",
      "图片保存到列表了",
    ],
  },
  imageCopied: {
    mood: "happy",
    surface: "naive-message",
    variants: [
      "图片已复制",
      "图片内容复制好了",
      "这张图片已经复制到剪贴板",
      "复制完成，可以去粘贴了",
    ],
  },
  imageDataCopied: {
    mood: "surprised",
    surface: "naive-message",
    variants: [
      "图片内容已复制为 Data URL",
      "已改用 Data URL 复制图片内容",
      "图片已按 Data URL 形式复制",
    ],
  },
  quickLinkCopied: {
    mood: "happy",
    surface: "naive-message",
    variants: [
      "链接已复制",
      "链接复制好了",
      "这个链接已经放进剪贴板",
      "链接准备好了，可以粘贴",
    ],
  },
  quickTextCopied: {
    mood: "happy",
    surface: "companion",
    variants: [
      "文本已复制",
      "复制文本已放进剪贴板",
      "这段文字复制好了",
      "文本准备好了，可以粘贴",
    ],
  },
  quickTextCopyFailed: {
    mood: "warning",
    surface: "companion",
    variants: [
      "复制失败了，请再试一次",
      "这次没能复制成功",
      "剪贴板暂时没接住这段文字",
    ],
  },
  noCompletedTodos: {
    mood: "happy",
    surface: "companion",
    variants: [
      "这里还没有已完成事项，不用清理",
      "暂无完成事项需要清除",
      "现在没有可清理的完成项",
    ],
  },
  dataImported: {
    mood: "surprised",
    surface: "companion",
    variants: [
      "数据已导入",
      "导入完成，内容已经更新",
      "数据接收完成，页面已同步",
      "导入好了，新的内容已生效",
    ],
  },
  dataExported: {
    mood: "happy",
    surface: "companion",
    variants: [
      "数据已导出，备份文件准备好了",
      "导出完成，当前看板已经打包",
      "备份已生成，可以安心保存",
      "数据导出好了，留一份更稳妥",
    ],
  },
  confirmDeleteImage: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除这张图片？",
      "要把这张图片删掉吗？",
      "确定移除这张图片吗？",
      "这张图片删除后就不在列表里了，确认吗？",
    ],
  },
  confirmDeleteQuick: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除这个快捷按钮？",
      "要移除这个快捷按钮吗？",
      "确定删掉这个快捷入口吗？",
      "这个快捷按钮会被删除，确认吗？",
    ],
  },
  confirmDeleteTodo: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认删除这条待办？",
      "要删掉这条待办吗？",
      "确定移除这条提醒事项吗？",
      "这条待办会被删除，确认吗？",
    ],
  },
  confirmClearCompleted: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确认清除已完成事项？",
      "要清掉这些已完成事项吗？",
      "确定移除当前已完成事项吗？",
      "已完成事项会从这里清除，确认吗？",
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
