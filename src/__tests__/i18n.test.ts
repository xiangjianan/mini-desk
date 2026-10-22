import { describe, expect, it } from "vitest";
import {
  GUIDE_MESSAGES,
  SHORTCUT_HELP,
  UI_TEXT,
  getDefaultTitles,
  getIconHeadingText,
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

    expect(getDisplayTodoListTitle({ id: "morning", title: "✅ 待办", collapsed: false, compact: false }, "en")).toBe("Today");
    expect(getDisplayTodoListTitle({ id: "morning", title: "客户跟进", collapsed: false, compact: false }, "en")).toBe("客户跟进");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "en")).toBe("Quick Notes");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "个人计划", lines: [] }, "en")).toBe("个人计划");
  });

  it("recognizes previous emoji defaults without changing custom names", () => {
    expect(getDisplayTodoListTitle({ id: "morning", title: "✅ 提醒事项", collapsed: false, compact: false }, "zh")).toBe("今天");
    expect(getDisplayTodoListTitle({ id: "morning", title: "✅ Reminders", collapsed: false, compact: false }, "en")).toBe("Today");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "📝 便签", lines: [] }, "zh")).toBe("随手记");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "📝 Sticky", lines: [] }, "en")).toBe("Quick Notes");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "📝 我的笔记", lines: [] }, "zh")).toBe("📝 我的笔记");
    expect(getDisplayTodoListTitle({ id: "custom", title: "✅ 提醒事项", collapsed: false, compact: false }, "zh")).toBe("✅ 提醒事项");
  });

  it("only replaces the matching legacy heading prefix", () => {
    expect(getIconHeadingText("🎨 图片", "image")).toBe("图片");
    expect(getIconHeadingText("⚡ Quick Actions", "quick")).toBe("Quick Actions");
    expect(getIconHeadingText("‼️ 重点事项", "focus")).toBe("重点事项");
    expect(getIconHeadingText("客户 ⚡ 资料", "quick")).toBe("客户 ⚡ 资料");
    expect(getIconHeadingText("📥 收件箱", "focus")).toBe("📥 收件箱");
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
      "双击列表标题或空间标签可以改名。",
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
    expect(SHORTCUT_HELP.en.flatMap((section) => section.tips)).toContain("Double-click list titles or space tabs to rename them.");
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
    expect(getUiText("en").todo.createList).toBe("New list");
    expect(getUiText("en").common.delete).toBe("Delete");
    expect(getUiText("zh").settings.language).toBe("Language");
  });

  it("localizes the merged image paste action in English", () => {
    expect(getUiText("en").images.paste).toBe("Paste");
    expect(getUiText("zh").images.paste).toBe("粘贴");
  });

  it("uses MiniDesk as the public app name while naming the Chinese about board", () => {
    expect(getUiText("zh").app.boardLabel).toBe("MiniDesk");
    expect(getUiText("zh").app.mobileTitle).toBe("MiniDesk");
    expect(getUiText("zh").app.aboutTitle).toBe("MiniDesk");
    expect(getUiText("zh").app.aboutDescription).toBe(
      "一个本地优先的轻量工作台，把截图、提醒事项、快捷动作和便签缝合得恰到好处。\n无需任何登录，所有数据全部保存在浏览器本地。",
    );
    expect(getUiText("zh").app.aboutSignature).toBe("(100% AI BUILT)");
    expect(getUiText("en").app.boardLabel).toBe("MiniDesk");
    expect(getUiText("en").app.mobileTitle).toBe("MiniDesk");
    expect(getUiText("en").app.aboutTitle).toBe("MiniDesk");
    expect(getUiText("en").app.aboutDescription).toBe(
      "A local-first lightweight desk for organizing screenshots, reminders, quick actions, and sticky notes.\nNo sign-in required — all your data stays in your browser.",
    );
    expect(getUiText("en").app.aboutSignature).toBe("(100% AI BUILT)");
  });

  it("uses plain default note names while recognizing older names", () => {
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "zh")).toBe("随手记");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "📕 备忘录", lines: [] }, "zh")).toBe("随手记");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "en")).toBe("Quick Notes");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "Workspace", lines: [] }, "en")).toBe("Quick Notes");
  });

  it("主题切换文案中英齐全（两态，无跟随系统档）", () => {
    expect(getUiText("zh").app.themeToDark).toBe("切换到深色");
    expect(getUiText("zh").app.themeToLight).toBe("切换到浅色");
    expect(getUiText("en").app.themeToDark).toBe("Switch to dark");
    expect(getUiText("en").app.themeToLight).toBe("Switch to light");
  });

  it("「现在做这个」徽标 aria 文案中英都含 {time} 占位符", () => {
    expect(getUiText("zh").todo.focusBadgeAria).toContain("{time}");
    expect(getUiText("en").todo.focusBadgeAria).toContain("{time}");
  });
});
