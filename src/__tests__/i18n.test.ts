import { describe, expect, it } from "vitest";
import {
  GUIDE_MESSAGES,
  SHORTCUT_HELP,
  getDefaultTitles,
  getDisplaySpaceTitle,
  getDisplayTodoListTitle,
  getUiText,
} from "../state/i18n";

describe("localized public copy", () => {
  it("translates default board titles without translating custom titles", () => {
    expect(getDefaultTitles("zh")).toMatchObject({
      "note-title": "🔧 工具",
      "tools-title": "🔧 工具",
    });
    expect(getDefaultTitles("en")).toMatchObject({
      "image-title": "🎨 Images",
      "note-title": "🔧 Tools",
      "quick-title": "⚡ Quick Actions",
      "todo-morning-title": "✅ Reminders",
      "todo-noon-title": "💻 Work",
      "todo-evening-title": "📚 Study",
      "workspace-title": "📝 Sticky.txt",
      "tools-title": "🔧 Tools",
    });

    expect(getDisplayTodoListTitle({ id: "morning", title: "✅ 待办", collapsed: false, compact: false }, "en")).toBe("✅ Reminders");
    expect(getDisplayTodoListTitle({ id: "morning", title: "客户跟进", collapsed: false, compact: false }, "en")).toBe("客户跟进");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "en")).toBe("📝 Sticky");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "个人计划", lines: [] }, "en")).toBe("个人计划");
  });

  it("includes the expanded Chinese Tips and English counterparts", () => {
    expect(GUIDE_MESSAGES.zh.workspace).toEqual(expect.arrayContaining([
      "试试把工作空间里的文本拖到提醒事项。",
      "双击空间标签可以修改空间名。",
      "从外部拖入文本，也能直接收进工作空间。",
      "编辑文字后停顿 3 秒会自动保存。",
    ]));
    expect(GUIDE_MESSAGES.zh.workspace).toContain("适合把任务拆成步骤。");
    expect(GUIDE_MESSAGES.zh.todos).toEqual(expect.arrayContaining([
      "试试把提醒事项拖到工作空间。",
      "按住列表名拖动可以调整列表顺序。",
      "点击闹钟可以设置通知时间。",
      "空白处右键可以新增提醒事项列表。",
    ]));
    expect(GUIDE_MESSAGES.zh.images).toEqual(expect.arrayContaining([
      "试试把外部图片拖到这里。",
      "Ctrl+V 可以直接粘贴图片。",
      "单击图片可以预览。",
      "预览时 Enter 可以编辑图片，再按 Enter 保存。",
    ]));
    expect(GUIDE_MESSAGES.en.quickButtons).toEqual(expect.arrayContaining([
      "Use the context menu to hide an action.",
      "Drag actions to reorder them.",
      "Text shortcuts copy their text instantly.",
    ]));
    expect(GUIDE_MESSAGES.en.note).toContain("Edited text saves automatically after 3 seconds.");
  });

  it("keeps shortcut help focused on hidden tips plus key commands", () => {
    expect(SHORTCUT_HELP.zh).toHaveLength(5);
    expect(SHORTCUT_HELP.zh[0]).toMatchObject({
      area: "工作台",
      icon: "⌘",
      summary: expect.stringContaining("一个桌面"),
    });
    expect(SHORTCUT_HELP.zh.flatMap((section) => section.tips)).toEqual(expect.arrayContaining([
      "双击任意区域标题可以改名，包括今日重点和空间标签。",
      "右键空白处可以新增提醒事项列表，列表名也能拖动排序。",
      "快捷动作可以按标签分组，也能拖到其他分类或无标签区域。",
    ]));
    expect(SHORTCUT_HELP.zh.flatMap((section) => section.shortcuts.map((shortcut) => shortcut.key))).toEqual(expect.arrayContaining([
      "Ctrl + S",
      "Esc / Space",
      "Enter",
      "5",
      "拖动按钮",
    ]));
    const imageShortcuts = SHORTCUT_HELP.zh.find((section) => section.area === "图床与预览")?.shortcuts ?? [];
    expect(imageShortcuts).toEqual(expect.arrayContaining([
      { key: "Enter", desc: "编辑图片 / 保存编辑" },
      { key: "5", desc: "复制图片" },
    ]));
    expect(imageShortcuts).not.toEqual(expect.arrayContaining([
      { key: "5 / Enter", desc: "复制图片" },
    ]));
    expect(SHORTCUT_HELP.zh.flatMap((section) => [section.area, section.summary, ...section.tips, ...section.shortcuts.map((shortcut) => `${shortcut.key} ${shortcut.desc}`)]).join("\n")).not.toContain("工具");
    expect(SHORTCUT_HELP.en.flatMap((section) => section.tips)).toContain("Double-click section titles to rename them, including Focus and space tabs.");
    const englishImageShortcuts = SHORTCUT_HELP.en.find((section) => section.area === "Images & Preview")?.shortcuts ?? [];
    expect(englishImageShortcuts).toEqual(expect.arrayContaining([
      { key: "Enter", desc: "Edit image / Save edit" },
      { key: "5", desc: "Copy image" },
    ]));
  });

  it("localizes shared menu labels", () => {
    expect(getUiText("en").settings.language).toBe("语言");
    expect(getUiText("zh").settings.shortcutHelp).toBe("帮助与快捷键");
    expect(getUiText("en").settings.shortcutHelp).toBe("Help & Shortcuts");
    expect(getUiText("en").quick.add).toBe("Add");
    expect(getUiText("en").quick.menu).toBe("Quick actions menu");
    expect(getUiText("en").todo.createList).toBe("New reminder list");
    expect(getUiText("en").common.delete).toBe("Delete");
    expect(getUiText("zh").settings.language).toBe("Language");
  });

  it("localizes the merged image paste action in English", () => {
    expect(getUiText("en").images.paste).toBe("Paste");
    expect(getUiText("zh").images.paste).toBe("粘贴");
  });

  it("uses Mini Desk as the public app name while naming the Chinese about board", () => {
    expect(getUiText("zh").app.boardLabel).toBe("Mini Desk");
    expect(getUiText("zh").app.mobileTitle).toBe("Mini Desk");
    expect(getUiText("zh").app.aboutTitle).toBe("Mini Desk");
    expect(getUiText("zh").app.aboutDescription).toBe(
      "一个本地优先的轻量工作台，把截图、提醒事项、快捷动作和便签缝合得恰到好处。\n所有操作均在本地浏览器完成，绝不上传您的任何数据。",
    );
    expect(getUiText("zh").app.aboutSignature).toBe("(100% AI BUILT)");
    expect(getUiText("en").app.boardLabel).toBe("Mini Desk");
    expect(getUiText("en").app.mobileTitle).toBe("Mini Desk");
    expect(getUiText("en").app.mobileDescription).toBe("This board is designed for desktop workflows to organize screenshots, notes, reminders, quick actions, and sticky notes.");
    expect(getUiText("en").app.aboutTitle).toBe("Mini Desk");
    expect(getUiText("en").app.aboutDescription).toBe(
      "A local-first lightweight desk for organizing screenshots, reminders, quick actions, and sticky notes.\nEverything happens in your local browser. None of your data is ever uploaded.",
    );
    expect(getUiText("en").app.aboutSignature).toBe("(100% AI BUILT)");
  });

  it("uses the memo emoji in default sticky names", () => {
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "zh")).toBe("📝 便签");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "📕 备忘录", lines: [] }, "zh")).toBe("📝 便签");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "en")).toBe("📝 Sticky");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "Workspace", lines: [] }, "en")).toBe("📝 Sticky");
  });

  it("手机速记占位词按类型区分且中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxPlaceholderTodo).toBe("每行一条提醒");
    expect(getUiText("zh").app.mobileInboxPlaceholderNote).toBe("写一段便签，可换行，换行会保留…");
    expect(getUiText("en").app.mobileInboxPlaceholderTodo).toBe("One reminder per line");
    expect(getUiText("en").app.mobileInboxPlaceholderNote).toBe("Write a note — line breaks are kept…");
  });

  it("更换配对码确认文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxChangeCodeConfirm).toBe("更换后需要重新输入配对码，确定更换吗？");
    expect(getUiText("en").app.mobileInboxChangeCodeConfirm).toBe("You'll need to re-enter a pairing code after changing. Change anyway?");
  });

  it("配对码失效提示与换码按钮文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxErrorRevoked).toBe("配对码已失效，可能已在桌面端被清除");
    expect(getUiText("zh").app.mobileInboxRevokedChange).toBe("去更换配对码");
    expect(getUiText("en").app.mobileInboxErrorRevoked).toBe("This pairing code is no longer active — it may have been cleared on the desktop");
    expect(getUiText("en").app.mobileInboxRevokedChange).toBe("Change pairing code");
  });

  it("发送按钮成功态文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxSentButton).toBe("已发送");
    expect(getUiText("en").app.mobileInboxSentButton).toBe("Sent");
  });

  it("配对码注册制相关文案中英齐全", () => {
    expect(getUiText("zh").app.mobileInboxErrorUnknown).toBe("配对码不存在，请到桌面端重新配对");
    expect(getUiText("en").app.mobileInboxErrorUnknown).toBe("This pairing code doesn't exist; re-pair on the desktop");
  });
});
