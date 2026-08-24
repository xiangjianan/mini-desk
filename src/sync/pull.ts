import { createId } from "../state/storage/shared";
import type { LineItem, TodoListId, WorkspaceData } from "../types";
import { INBOX_PLAINTEXT_MAX_CHARS } from "./config";
import { decryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "./crypto";
import { fetchInboxItems } from "./inboxClient";

export interface InboxPullReport {
  workspaceId: string;
  imported: number;
}

export interface InboxPullResult {
  workspaces: WorkspaceData[];
  reports: InboxPullReport[];
}

/** 纯合并：todo 追加为未完成条目（落点清单失效则回退第一个清单），note 按 noteTarget 追加一行 indent 0。
 *  不做任何拉取/解密，输入对象不被修改，水位线直接取调用方计算好的 lastSeenAt。 */
export function applyInboxItems(workspace: WorkspaceData, plains: InboxPlainItem[], lastSeenAt: number): WorkspaceData {
  const inbox = workspace.inbox;
  if (!inbox) return workspace;
  const todos = plains.filter((plain) => plain.kind === "todo");
  const notes = plains.filter((plain) => plain.kind === "note");
  let next: WorkspaceData = { ...workspace, inbox: { ...inbox, lastSeenAt } };
  if (todos.length > 0) {
    const listId = resolveTodoListId(next, inbox.todoListId);
    next = {
      ...next,
      todos: {
        ...next.todos,
        [listId]: [
          ...(next.todos[listId] ?? []),
          ...todos.map((plain) => ({
            id: createId(),
            text: plain.text.slice(0, INBOX_PLAINTEXT_MAX_CHARS),
            done: false,
          })),
        ],
      },
    };
  }
  if (notes.length > 0) {
    const appended: LineItem[] = notes.map((plain) => ({ text: plain.text.slice(0, INBOX_PLAINTEXT_MAX_CHARS), indent: 0 }));
    if (inbox.noteTarget === "workspace") next = { ...next, workspaceLines: [...next.workspaceLines, ...appended] };
    else if (inbox.noteTarget === "storage") next = { ...next, storageLines: [...next.storageLines, ...appended] };
    else next = { ...next, noteLines: [...next.noteLines, ...appended] };
  }
  return next;
}

function resolveTodoListId(workspace: WorkspaceData, preferred: TodoListId): TodoListId {
  return workspace.todoLists.some((list) => list.id === preferred) ? preferred : workspace.todoLists[0]?.id ?? preferred;
}

/** 遍历所有配置了 inbox 的工作区：拉取 → 解密 → 水位线过滤 → 返回合并后的新数组。失败静默，不抛异常。
 *  环境级异常（Web Crypto 缺失导致 crypto 抛出）会让该工作区的 promise 被拒，
 *  allSettled 将其视为未变更——水位线不推进，队列留待环境恢复，避免静默丢条目。 */
export async function pullAllInboxes(workspaces: WorkspaceData[]): Promise<InboxPullResult> {
  // 单工作区内条目解密保持串行：每次解密是一次 600k 迭代的 PBKDF2（约 60-80ms），并行会放大 CPU 峰值。
  // 工作区之间互相独立，用 allSettled 并发互不拖累。
  const results = await Promise.allSettled(
    workspaces.map(async (workspace): Promise<{ workspace: WorkspaceData; imported: number } | null> => {
      const inbox = workspace.inbox;
      if (!inbox) return null;
      const stored = await fetchInboxItems(await inboxKeyHash(inbox.code));
      if (!stored) return null;
      const maxSeenAt = stored.reduce((max, entry) => Math.max(max, entry.createdAt), inbox.lastSeenAt);
      const plains: InboxPlainItem[] = [];
      for (const entry of stored) {
        if (entry.createdAt <= inbox.lastSeenAt) continue;
        const plain = await decryptInboxPayload(inbox.code, entry.payload);
        if (plain) plains.push(plain);
        else console.warn("[inbox] 跳过无法解密的条目", { workspaceId: workspace.id, itemId: entry.id });
      }
      return { workspace: applyInboxItems(workspace, plains, maxSeenAt), imported: plains.length };
    }),
  );
  const reports: InboxPullReport[] = [];
  let changed = false;
  const nextWorkspaces = workspaces.map((workspace, index) => {
    const result = results[index];
    if (result.status !== "fulfilled" || !result.value) return workspace;
    changed = true;
    if (result.value.imported > 0) reports.push({ workspaceId: workspace.id, imported: result.value.imported });
    return result.value.workspace;
  });
  return { workspaces: changed ? nextWorkspaces : workspaces, reports };
}
