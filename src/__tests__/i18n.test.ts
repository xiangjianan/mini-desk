import { describe, expect, it } from "vitest";
import {
  GUIDE_MESSAGES,
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
      "workspace-title": "📝 Memo.txt",
      "tools-title": "🔧 Tools",
    });

    expect(getDisplayTodoListTitle({ id: "morning", title: "✅ 待办", collapsed: false, compact: false }, "en")).toBe("✅ Reminders");
    expect(getDisplayTodoListTitle({ id: "morning", title: "客户跟进", collapsed: false, compact: false }, "en")).toBe("客户跟进");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "en")).toBe("📝 Memo");
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
    ]));
    expect(GUIDE_MESSAGES.en.quickButtons).toEqual(expect.arrayContaining([
      "Use the context menu to hide an action.",
      "Drag actions to reorder them.",
      "Text shortcuts copy their text instantly.",
    ]));
    expect(GUIDE_MESSAGES.en.note).toContain("Edited text saves automatically after 3 seconds.");
  });

  it("localizes shared menu labels", () => {
    expect(getUiText("en").settings.language).toBe("语言");
    expect(getUiText("en").quick.add).toBe("Add");
    expect(getUiText("en").quick.menu).toBe("Quick actions menu");
    expect(getUiText("en").todo.createList).toBe("New reminder list");
    expect(getUiText("en").common.delete).toBe("Delete");
    expect(getUiText("zh").settings.language).toBe("Language");
  });

  it("uses Mini Desk as the public app name while naming the Chinese about board", () => {
    expect(getUiText("zh").app.boardLabel).toBe("Mini Desk");
    expect(getUiText("zh").app.mobileTitle).toBe("Mini Desk");
    expect(getUiText("zh").app.aboutTitle).toBe("Mini Desk 看板");
    expect(getUiText("zh").app.aboutDescription).toBe(
      "一个本地优先的轻量工作台，把截图、提醒事项、快捷动作和备忘录缝合得恰到好处。\n所有操作均在本地浏览器完成，绝不上传您的任何数据。",
    );
    expect(getUiText("en").app.boardLabel).toBe("Mini Desk");
    expect(getUiText("en").app.mobileTitle).toBe("Mini Desk");
    expect(getUiText("en").app.mobileDescription).toBe("This board is designed for desktop workflows to organize screenshots, notes, reminders, quick actions, and a memo.");
    expect(getUiText("en").app.aboutTitle).toBe("Mini Desk");
    expect(getUiText("en").app.aboutDescription).toBe(
      "A local-first lightweight desk for organizing screenshots, reminders, quick actions, and a memo.\nEverything happens in your local browser. None of your data is ever uploaded.",
    );
  });

  it("uses the memo emoji in default memo names", () => {
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "zh")).toBe("📝 备忘录");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "📕 备忘录", lines: [] }, "zh")).toBe("📝 备忘录");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "备忘录", lines: [] }, "en")).toBe("📝 Memo");
    expect(getDisplaySpaceTitle({ id: "workspace", title: "Workspace", lines: [] }, "en")).toBe("📝 Memo");
  });
});
