import { createId } from "../state/storage/shared";
import { projectLegacySpaceLines } from "../state/workspaces";
import type { LineItem, TodoListId, WorkspaceData } from "../types";
import { INBOX_PLAINTEXT_MAX_CHARS } from "./config";
import { decryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "./crypto";
import { fetchInboxItems } from "./inboxClient";

export interface InboxPullReport {
  workspaceId: string;
  imported: number;
}

/** 待重放补丁：plains 为解密过滤后的新条目，lastSeenAt 为推进后的水位线（纯前进可为空 plains）。 */
export interface InboxPullPatch {
  workspaceId: string;
  plains: InboxPlainItem[];
  lastSeenAt: number;
}

export interface InboxPullResult {
  patches: InboxPullPatch[];
  reports: InboxPullReport[];
  /** 任一工作区有补丁（含纯水位线前进）时为 true；调用方仅在此为 true 时重放并持久化。 */
  changed: boolean;
}

/** 纯合并：todo 追加为未完成条目（落点清单失效则回退第一个清单），note 按 noteTarget 追加一行
 *  indent 0 到目标空间 Tab（落点空间失效则回退第一个空间），并按共享助手 projectLegacySpaceLines
 *  刷新投影字段（workspaceLines/storageLines = 前两个空间的浅拷贝）。
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
    const targetId = next.spaces.some((space) => space.id === inbox.noteTarget) ? inbox.noteTarget : next.spaces[0]?.id;
    if (targetId === undefined) {
      // spaces 意外为空（正常不可达）：note 无落点被丢弃但水位线照常推进，告警留痕避免静默丢条目。
      console.warn("[inbox] 无可用便签落点空间，丢弃本批便签", { workspaceId: next.id });
    } else {
      const spaces = next.spaces.map((space) => (space.id === targetId ? { ...space, lines: [...space.lines, ...appended] } : space));
      const projected = projectLegacySpaceLines(spaces);
      next = { ...next, spaces, workspaceLines: projected.workspaceLines, storageLines: projected.storageLines };
    }
  }
  return next;
}

function resolveTodoListId(workspace: WorkspaceData, preferred: TodoListId): TodoListId {
  return workspace.todoLists.some((list) => list.id === preferred) ? preferred : workspace.todoLists[0]?.id ?? preferred;
}

/** 遍历所有配置了 inbox 的工作区：拉取 → 解密 → 水位线过滤 → 产出待重放补丁。失败静默，不抛异常。
 *  环境级异常（Web Crypto 缺失导致 crypto 抛出）会让该工作区的 promise 被拒，
 *  allSettled 将其视为未变更——水位线不推进，队列留待环境恢复，避免静默丢条目。
 *  非单飞：四个触发点（启动/聚焦/定时/Ctrl+S）可能并发调用，调用方必须用 in-flight 守卫串行化，
 *  否则并发批次会以新 ID 重复导入同一条目。
 *  契约：本函数不做合并（解密仍在内部串行），返回的补丁由调用方在 await 后的同一同步块内
 *  对当前活对象重放（applyInboxItems）——读-合-写之间零宏任务间隙，用户编辑无法插入。 */
export async function pullAllInboxes(workspaces: WorkspaceData[]): Promise<InboxPullResult> {
  // 单工作区内条目解密保持串行：每次解密是一次 600k 迭代的 PBKDF2（约 60-80ms），并行会放大 CPU 峰值。
  // 工作区之间互相独立，用 allSettled 并发互不拖累。
  const results = await Promise.allSettled(
    workspaces.map(async (workspace): Promise<InboxPullPatch | null> => {
      const inbox = workspace.inbox;
      if (!inbox) return null;
      const stored = await fetchInboxItems(await inboxKeyHash(inbox.code));
      if (!stored) return null;
      // createdAt 由 Worker 时钟签发（客户端不可控）；此处信任服务器时钟。若中转被替换为恶意镜像，
      // 远未来时间戳会推爆水位线——该前提已记录在设计文档威胁模型权衡中。
      const maxSeenAt = stored.reduce((max, entry) => Math.max(max, entry.createdAt), inbox.lastSeenAt);
      const plains: InboxPlainItem[] = [];
      for (const entry of stored) {
        if (entry.createdAt <= inbox.lastSeenAt) continue;
        const plain = await decryptInboxPayload(inbox.code, entry.payload);
        if (plain) plains.push(plain);
        else console.warn("[inbox] 跳过无法解密的条目", { workspaceId: workspace.id, itemId: entry.id });
      }
      // 无导入且水位线未动时不产补丁：避免调用方每个轮询周期都空转持久化/跨标签页广播/回滚编辑中内容。
      const dirty = plains.length > 0 || maxSeenAt !== inbox.lastSeenAt;
      return dirty ? { workspaceId: workspace.id, plains, lastSeenAt: maxSeenAt } : null;
    }),
  );
  const patches: InboxPullPatch[] = [];
  const reports: InboxPullReport[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    patches.push(result.value);
    if (result.value.plains.length > 0) reports.push({ workspaceId: result.value.workspaceId, imported: result.value.plains.length });
  }
  return { patches, reports, changed: patches.length > 0 };
}
