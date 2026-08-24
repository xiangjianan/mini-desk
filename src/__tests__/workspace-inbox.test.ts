import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import { normalizeWorkspaceData, normalizeWorkspaceInbox } from "../state/storage/normalize";
import { getSerializableWorkspace } from "../state/storage/serialize";
import type { TodoListConfig, WorkspaceData, WorkspaceInbox, WorkspaceSpace } from "../types";

const LISTS: TodoListConfig[] = [
  { id: "morning", title: "上午", collapsed: false, compact: false, column: 0 },
  { id: "evening", title: "晚上", collapsed: false, compact: false, column: 1 },
];

const SPACES: WorkspaceSpace[] = [
  { id: "workspace", title: "便签", lines: [{ text: "w", indent: 0 }] },
  { id: "storage", title: "储物", lines: [] },
];

function validInbox(overrides: Partial<WorkspaceInbox> = {}): WorkspaceInbox {
  return { code: "AB2CDE4FGHJK", todoListId: "evening", noteTarget: "storage", lastSeenAt: 100, ...overrides };
}

describe("normalizeWorkspaceInbox", () => {
  it("合法配置原样保留", () => {
    expect(normalizeWorkspaceInbox(validInbox(), LISTS, SPACES)).toEqual(validInbox());
  });

  it("非对象或缺少合法配对码时丢弃整个字段", () => {
    expect(normalizeWorkspaceInbox(undefined, LISTS, SPACES)).toBeUndefined();
    expect(normalizeWorkspaceInbox("x", LISTS, SPACES)).toBeUndefined();
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "short" }, LISTS, SPACES)).toBeUndefined();
    // 字母表排除 I L O U
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "ABCDEFGHIJKL" }, LISTS, SPACES)).toBeUndefined();
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: 123 as unknown as string }, LISTS, SPACES)).toBeUndefined();
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "ab2cde4fghjk" }, LISTS, SPACES)).toBeUndefined();
    expect(normalizeWorkspaceInbox({ ...validInbox(), code: "AB2CDE4FGHJKM" }, LISTS, SPACES)).toBeUndefined();
  });

  it("todoListId 不在清单中时回退第一个清单", () => {
    expect(normalizeWorkspaceInbox(validInbox({ todoListId: "nope" }), LISTS, SPACES)?.todoListId).toBe("morning");
  });

  it("noteTarget 为合法空间 id 时保留，为旧枚举值/未匹配字符串时回退第一个空间；lastSeenAt 非法回退 0", () => {
    expect(normalizeWorkspaceInbox(validInbox({ noteTarget: "workspace" }), LISTS, SPACES)?.noteTarget).toBe("workspace");
    expect(normalizeWorkspaceInbox(validInbox({ noteTarget: "note" }), LISTS, SPACES)?.noteTarget).toBe("workspace");
    expect(normalizeWorkspaceInbox(validInbox({ noteTarget: "whatever" }), LISTS, SPACES)?.noteTarget).toBe("workspace");
    expect(normalizeWorkspaceInbox(validInbox({ lastSeenAt: Number.NaN }), LISTS, SPACES)?.lastSeenAt).toBe(0);
  });
});

describe("WorkspaceData.inbox", () => {
  it("defaultWorkspace 不含 inbox 字段", () => {
    expect("inbox" in defaultWorkspace("a")).toBe(false);
  });

  it("normalizeWorkspaceData 透传并清洗 inbox", () => {
    const base = defaultWorkspace("a");
    const workspace = normalizeWorkspaceData({ ...base, inbox: validInbox() }, "zh");
    // defaultWorkspace 的清单是 morning，且只有一个 id 为 workspace 的空间
    expect(workspace.inbox).toEqual(validInbox({ todoListId: "morning", noteTarget: "workspace" }));
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

  it("todoLists 为空数组时返回 undefined", () => {
    expect(normalizeWorkspaceInbox(validInbox(), [], SPACES)).toBeUndefined();
  });

  it("spaces 为空数组时返回 undefined（防御，normalizeSpaces 正常保证至少一个空间）", () => {
    expect(normalizeWorkspaceInbox(validInbox(), LISTS, [])).toBeUndefined();
  });
});
