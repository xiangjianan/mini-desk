import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData, WorkspaceInbox } from "../types";

vi.mock("../sync/inboxClient", () => ({
  fetchInboxItems: vi.fn(),
}));
vi.mock("../sync/crypto", () => ({
  inboxKeyHash: vi.fn(async (code: string) => `hash-of-${code}`),
  decryptInboxPayload: vi.fn(async (code: string, payload: string) => {
    if (payload === "BAD") return null;
    const [kind, text, createdAt] = payload.split("|");
    return { kind, text, createdAt: Number(createdAt) };
  }),
}));

import { fetchInboxItems } from "../sync/inboxClient";
import { applyInboxItems, pullAllInboxes } from "../sync/pull";
import type { InboxPlainItem } from "../sync/crypto";

const fetchMock = vi.mocked(fetchInboxItems);

function workspace(id: string, inbox?: WorkspaceInbox): WorkspaceData {
  return { ...defaultWorkspace(id), ...(inbox ? { inbox } : {}) };
}

function inbox(overrides: Partial<WorkspaceInbox> = {}): WorkspaceInbox {
  return { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "note", lastSeenAt: 0, ...overrides };
}

function item(id: string, createdAt: number, payload?: string): { id: string; payload: string; createdAt: number } {
  return { id, payload: payload ?? `todo|条目${id}|${createdAt}`, createdAt };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("applyInboxItems", () => {
  it("todo 追加到落点清单为未完成条目，note 追加一行 indent 0，水位线推进", () => {
    const base = workspace("a", inbox({ todoListId: "morning", noteTarget: "note" }));
    const plains: InboxPlainItem[] = [
      { kind: "todo", text: "买牛奶", createdAt: 1 },
      { kind: "note", text: "想法", createdAt: 2 },
    ];
    const merged = applyInboxItems(base, plains, 2);
    expect(merged.todos.morning.at(-1)).toMatchObject({ text: "买牛奶", done: false });
    expect(merged.todos.morning.at(-1)?.id).toBeTruthy();
    expect(merged.noteLines.at(-1)).toEqual({ text: "想法", indent: 0 });
    expect(merged.inbox?.lastSeenAt).toBe(2);
    // 不改原对象（不可变）
    expect(base.todos.morning.at(-1)?.text).not.toBe("买牛奶");
  });

  it("noteTarget 路由到 workspaceLines/storageLines", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ noteTarget: "storage" })),
      [{ kind: "note", text: "x", createdAt: 1 }],
      1,
    );
    expect(merged.storageLines).toEqual([{ text: "x", indent: 0 }]);
    expect(merged.noteLines).toEqual([]);
  });

  it("todoListId 失效时回退第一个清单；文本裁剪 500 字", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ todoListId: "ghost" })),
      [{ kind: "todo", text: "y".repeat(600), createdAt: 1 }],
      1,
    );
    expect(merged.todos.morning.at(-1)?.text).toHaveLength(500);
  });
});

describe("pullAllInboxes", () => {
  it("只拉取配置了 inbox 的工作区，解密过滤后合并并出报告", async () => {
    const plain = workspace("plain");
    const paired = workspace("paired", inbox());
    fetchMock.mockResolvedValue([item("i1", 10), item("i2", 20), item("i3", 5)]);
    const { workspaces, reports } = await pullAllInboxes([plain, paired]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("hash-of-AB2CDE4FGHJK");
    expect(workspaces[0]).toBe(plain);
    expect(workspaces[1].todos.morning).toHaveLength(3);
    expect(workspaces[1].inbox?.lastSeenAt).toBe(20);
    expect(reports).toEqual([{ workspaceId: "paired", imported: 3 }]);
  });

  it("水位线跳过已消费条目；解密失败条目跳过但水位线照常推进", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 5), item("bad", 15, "BAD"), item("i3", 20)]);
    const { workspaces, reports } = await pullAllInboxes([paired]);
    expect(workspaces[0].todos.morning.map((todo) => todo.text)).toEqual(["条目i3"]);
    expect(workspaces[0].inbox?.lastSeenAt).toBe(20);
    expect(reports).toEqual([{ workspaceId: "paired", imported: 1 }]);
  });

  it("无新条目时只推水位线；拉取失败时原样返回且无报告", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 5)]);
    const advanced = await pullAllInboxes([paired]);
    expect(advanced.workspaces[0].inbox?.lastSeenAt).toBe(10); // max(10,5)=10 不变
    expect(advanced.workspaces[0]).not.toBe(paired); // 返回了新数组但内容相同

    fetchMock.mockResolvedValue(null);
    const failed = await pullAllInboxes([paired]);
    expect(failed.workspaces[0]).toBe(paired);
    expect(failed.reports).toEqual([]);
  });

  it("多工作区并发互不影响", async () => {
    const a = workspace("a", inbox({ code: "AAAAAAAAAAAA" }));
    const b = workspace("b", inbox({ code: "BBBBBBBBBBBB" }));
    fetchMock.mockImplementation(async (keyHash: string) =>
      keyHash === "hash-of-AAAAAAAAAAAA" ? [item("i1", 10)] : [item("j1", 10), item("j2", 12)],
    );
    const { reports } = await pullAllInboxes([a, b]);
    expect(reports).toEqual([
      { workspaceId: "a", imported: 1 },
      { workspaceId: "b", imported: 2 },
    ]);
  });
});
