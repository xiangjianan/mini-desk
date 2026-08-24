import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData, WorkspaceInbox, WorkspaceSpace } from "../types";

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
import { decryptInboxPayload, type InboxPlainItem } from "../sync/crypto";

const fetchMock = vi.mocked(fetchInboxItems);
const decryptMock = vi.mocked(decryptInboxPayload);

const THREE_SPACES: WorkspaceSpace[] = [
  { id: "workspace", title: "便签", lines: [{ text: "w1", indent: 0 }] },
  { id: "storage", title: "储物", lines: [{ text: "s1", indent: 1 }] },
  { id: "extra", title: "自定义", lines: [{ text: "e1", indent: 0 }] },
];

function workspace(id: string, inbox?: WorkspaceInbox): WorkspaceData {
  const base = defaultWorkspace(id);
  return {
    ...base,
    spaces: THREE_SPACES.map((space) => ({ ...space, lines: space.lines.map((line) => ({ ...line })) })),
    activeSpaceId: THREE_SPACES[0].id,
    ...(inbox ? { inbox } : {}),
  };
}

function inbox(overrides: Partial<WorkspaceInbox> = {}): WorkspaceInbox {
  return { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: "workspace", lastSeenAt: 0, ...overrides };
}

function item(id: string, createdAt: number, payload?: string): { id: string; payload: string; createdAt: number } {
  return { id, payload: payload ?? `todo|条目${id}|${createdAt}`, createdAt };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("applyInboxItems", () => {
  it("todo 追加到落点清单为未完成条目，note 追加到目标空间一行 indent 0，水位线推进", () => {
    const base = workspace("a", inbox({ todoListId: "morning", noteTarget: "workspace" }));
    const plains: InboxPlainItem[] = [
      { kind: "todo", text: "买牛奶", createdAt: 1 },
      { kind: "note", text: "想法", createdAt: 2 },
    ];
    const merged = applyInboxItems(base, plains, 2);
    expect(merged.todos.morning.at(-1)).toMatchObject({ text: "买牛奶", done: false });
    expect(merged.todos.morning.at(-1)?.id).toBeTruthy();
    expect(merged.spaces[0].lines.at(-1)).toEqual({ text: "想法", indent: 0 });
    expect(merged.workspaceLines.at(-1)).toEqual({ text: "想法", indent: 0 }); // 投影字段同步刷新
    expect(merged.inbox?.lastSeenAt).toBe(2);
    // 不改原对象（不可变）
    expect(base.todos.morning.at(-1)?.text).not.toBe("买牛奶");
    expect(base.spaces[0].lines.at(-1)?.text).toBe("w1");
  });

  it("noteTarget 指向第三个空间时追加该空间，投影仍按不变量取前两个空间", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ noteTarget: "extra" })),
      [{ kind: "note", text: "x", createdAt: 1 }],
      1,
    );
    expect(merged.spaces[2].lines).toEqual([{ text: "e1", indent: 0 }, { text: "x", indent: 0 }]);
    expect(merged.spaces[0].lines).toEqual([{ text: "w1", indent: 0 }]);
    expect(merged.workspaceLines).toEqual([{ text: "w1", indent: 0 }]);
    expect(merged.storageLines).toEqual([{ text: "s1", indent: 1 }]);
  });

  it("noteTarget 指向 storage 空间时追加该空间末行，storageLines 投影同步且 workspaceLines 不变", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ noteTarget: "storage" })),
      [{ kind: "note", text: "x", createdAt: 1 }],
      1,
    );
    expect(merged.spaces[1].lines).toEqual([{ text: "s1", indent: 1 }, { text: "x", indent: 0 }]);
    expect(merged.storageLines).toEqual([{ text: "s1", indent: 1 }, { text: "x", indent: 0 }]);
    expect(merged.workspaceLines).toEqual([{ text: "w1", indent: 0 }]);
  });

  it("noteTarget 指向不存在/已删除的空间 id 时回退第一个空间", () => {
    const merged = applyInboxItems(
      workspace("a", inbox({ noteTarget: "ghost" })),
      [{ kind: "note", text: "x", createdAt: 1 }],
      1,
    );
    expect(merged.spaces[0].lines.at(-1)).toEqual({ text: "x", indent: 0 });
    expect(merged.spaces[2].lines).toEqual([{ text: "e1", indent: 0 }]);
    expect(merged.workspaceLines.at(-1)).toEqual({ text: "x", indent: 0 });
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
  it("只拉取配置了 inbox 的工作区，产出补丁与报告且不合并输入对象", async () => {
    const plain = workspace("plain");
    const paired = workspace("paired", inbox());
    fetchMock.mockResolvedValue([item("i1", 10), item("i2", 20), item("i3", 5)]);
    const { patches, reports, changed } = await pullAllInboxes([plain, paired]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("hash-of-AB2CDE4FGHJK");
    expect(patches).toEqual([
      {
        workspaceId: "paired",
        plains: [
          { kind: "todo", text: "条目i1", createdAt: 10 },
          { kind: "todo", text: "条目i2", createdAt: 20 },
          { kind: "todo", text: "条目i3", createdAt: 5 },
        ],
        lastSeenAt: 20,
      },
    ]);
    expect(reports).toEqual([{ workspaceId: "paired", imported: 3 }]);
    expect(changed).toBe(true);
    // 合并责任已移交调用方：pull 不改输入对象，补丁对当前活对象重放。
    expect(paired.todos.morning).toHaveLength(0);
    expect(paired.inbox?.lastSeenAt).toBe(0);
  });

  it("水位线跳过已消费条目；解密失败条目跳过但水位线照常推进", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 5), item("edge", 10), item("bad", 15, "BAD"), item("i3", 20)]);
    const { patches, reports } = await pullAllInboxes([paired]);
    expect(patches[0]?.plains.map((plain) => plain.text)).toEqual(["条目i3"]);
    expect(patches[0]?.lastSeenAt).toBe(20);
    expect(reports).toEqual([{ workspaceId: "paired", imported: 1 }]);
  });

  it("无导入且水位线未动时不产补丁；纯垃圾条目产出空 plains 补丁且标记 changed；拉取失败无补丁", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 5)]);
    const stale = await pullAllInboxes([paired]);
    expect(stale.patches).toEqual([]); // 全过期：不产补丁
    expect(stale.changed).toBe(false);

    fetchMock.mockResolvedValue([item("bad", 15, "BAD")]);
    const garbage = await pullAllInboxes([paired]);
    expect(garbage.changed).toBe(true);
    expect(garbage.patches).toEqual([{ workspaceId: "paired", plains: [], lastSeenAt: 15 }]); // 纯水位线前进：空 plains 补丁照常产出
    expect(garbage.reports).toEqual([]); // 无导入不报告

    fetchMock.mockResolvedValue(null);
    const failed = await pullAllInboxes([paired]);
    expect(failed.patches).toEqual([]);
    expect(failed.changed).toBe(false);
    expect(failed.reports).toEqual([]);
  });

  it("环境级解密异常时无补丁且无报告", async () => {
    const paired = workspace("paired", inbox({ lastSeenAt: 10 }));
    fetchMock.mockResolvedValue([item("i1", 20)]);
    decryptMock.mockRejectedValueOnce(new Error("Web Crypto is unavailable"));
    const { patches, changed, reports } = await pullAllInboxes([paired]);
    expect(patches).toEqual([]);
    expect(changed).toBe(false);
    expect(reports).toEqual([]);
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
