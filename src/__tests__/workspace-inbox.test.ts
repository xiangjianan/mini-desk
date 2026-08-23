import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import { normalizeWorkspaceData, normalizeWorkspaceInbox } from "../state/storage/normalize";
import { getSerializableWorkspace } from "../state/storage/serialize";
import type { TodoListConfig, WorkspaceData, WorkspaceInbox, WorkspaceInboxNoteTarget } from "../types";

const LISTS: TodoListConfig[] = [
  { id: "morning", title: "上午", collapsed: false, compact: false, column: 0 },
  { id: "evening", title: "晚上", collapsed: false, compact: false, column: 1 },
];

function validInbox(overrides: Partial<WorkspaceInbox> = {}): WorkspaceInbox {
  return { code: "AB2CDE4FGHJK", todoListId: "evening", noteTarget: "note", lastSeenAt: 100, ...overrides };
}

describe("normalizeWorkspaceInbox", () => {
  it("合法配置原样保留", () => {
    expect(normalizeWorkspaceInbox(validInbox(), LISTS)).toEqual(validInbox());
  });

  it("非对象或缺少合法配对码时丢弃整个字段", () => {
    expect(normalizeWorkspaceInbox(undefined, LISTS)).toBeUndefined();
    expect(normalizeWorkspaceInbox("x", LISTS)).toBeUndefined();
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "short" }, LISTS)).toBeUndefined();
    // 字母表排除 I L O U
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "ABCDEFGHIJKL" }, LISTS)).toBeUndefined();
  });

  it("todoListId 不在清单中时回退第一个清单", () => {
    expect(normalizeWorkspaceInbox(validInbox({ todoListId: "nope" }), LISTS)?.todoListId).toBe("morning");
  });

  it("noteTarget 非法回退 note，lastSeenAt 非法回退 0", () => {
    const result = normalizeWorkspaceInbox(
      validInbox({ noteTarget: "other" as WorkspaceInboxNoteTarget, lastSeenAt: Number.NaN }),
      LISTS,
    );
    expect(result?.noteTarget).toBe("note");
    expect(result?.lastSeenAt).toBe(0);
  });
});

describe("WorkspaceData.inbox", () => {
  it("defaultWorkspace 不含 inbox 字段", () => {
    expect("inbox" in defaultWorkspace("a")).toBe(false);
  });

  it("normalizeWorkspaceData 透传并清洗 inbox", () => {
    const base = defaultWorkspace("a");
    const workspace = normalizeWorkspaceData({ ...base, inbox: validInbox() }, "zh");
    expect(workspace.inbox).toEqual(validInbox({ todoListId: "morning" })); // defaultWorkspace 的清单是 morning
    const cleaned = normalizeWorkspaceData({ ...base, inbox: { code: "bad" } }, "zh");
    expect(cleaned.inbox).toBeUndefined();
  });

  it("getSerializableWorkspace 深拷贝携带 inbox", () => {
    const workspace: WorkspaceData = { ...defaultWorkspace("a"), inbox: validInbox() };
    const serialized = getSerializableWorkspace(workspace);
    expect(serialized.inbox).toEqual(validInbox());
    expect(serialized.inbox).not.toBe(workspace.inbox);
    expect(getSerializableWorkspace(defaultWorkspace("b")).inbox).toBeUndefined();
  });
});
