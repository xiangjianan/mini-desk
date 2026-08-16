import { ref } from "vue";
import type { Ref } from "vue";
import { exportUndoSnapshotState, normalizeImportedState } from "../state/storage";
import { hydrateStoredImages } from "../state/images";
import type { BoardState } from "../types";

const UNDO_HISTORY_LIMIT = 50;
// Undo snapshots are full-state JSON strings; a large board would otherwise pin
// 50 × state-size in memory. Evict oldest entries past this byte budget first.
const UNDO_HISTORY_BYTE_BUDGET = 8 * 1024 * 1024;

/**
 * Undo snapshots pair the serialized state with the set of image payload ids it
 * references. Caching the ids at enqueue time lets payload-prune retention checks
 * run without re-parsing every snapshot string (51 × full-state JSON.parse per
 * save would otherwise dominate the post-save budget).
 */
export interface UndoSnapshot {
  text: string;
  retainedImageIds: Set<string>;
}

/** Host-application side effects the undo flow must orchestrate. */
export interface UndoHistoryDeps {
  /** True while the host component is mounted; aborts undo if it unmounted mid-await. */
  isMounted: () => boolean;
  /** Clear debounced edit timers + pending empty-todo removal timers before restoring. */
  cancelPendingEdits: () => void;
  /** Close any open image preview and pending sub-panel edit ids. */
  clearTransientUi: () => void;
  /** Persist the restored state immediately and adopt its generation baseline. */
  persistAfterRestore: () => void;
}

export function useUndoHistory(state: BoardState, deps: UndoHistoryDeps) {
  const undoSnapshots = ref<UndoSnapshot[]>([]);
  const lastUndoSnapshot = ref<UndoSnapshot>(createUndoSnapshot());
  let restoringUndo = false;
  let undoInFlight = false;

  function createUndoSnapshot(): UndoSnapshot {
    const text = exportUndoSnapshotState(state);
    return { text, retainedImageIds: extractRetainedImageIds(JSON.parse(text) as unknown) };
  }

  function recordUndoCheckpoint(): void {
    if (restoringUndo) {
      lastUndoSnapshot.value = createUndoSnapshot();
      return;
    }
    const current = createUndoSnapshot();
    if (current.text === lastUndoSnapshot.value.text) return;
    undoSnapshots.value = capUndoHistory([
      ...undoSnapshots.value,
      lastUndoSnapshot.value,
    ]);
    lastUndoSnapshot.value = current;
  }

  /** Enforce both the entry-count and byte-budget caps, evicting oldest first. */
  function capUndoHistory(snapshots: UndoSnapshot[]): UndoSnapshot[] {
    let capped = snapshots.slice(-UNDO_HISTORY_LIMIT);
    let totalBytes = capped.reduce((sum, snapshot) => sum + snapshot.text.length, 0);
    while (capped.length > 1 && totalBytes > UNDO_HISTORY_BYTE_BUDGET) {
      totalBytes -= capped[0].text.length;
      capped = capped.slice(1);
    }
    return capped;
  }

  async function undoLastBoardChange(): Promise<void> {
    if (undoInFlight || restoringUndo) return;
    const snapshot = undoSnapshots.value.at(-1);
    if (!snapshot) return;
    let nextState: BoardState;
    try {
      nextState = normalizeImportedState(JSON.parse(snapshot.text));
    } catch {
      lastUndoSnapshot.value = createUndoSnapshot();
      return;
    }

    const stateAtStart = createUndoSnapshot();
    undoInFlight = true;
    try {
      const activeUndoWorkspace = nextState.workspaces.find((w) => w.id === nextState.activeWorkspaceId) ?? nextState.workspaces[0];
      if (activeUndoWorkspace) {
        // Drop images whose payload can no longer be hydrated (e.g. reclaimed after the
        // delete grace window) so undo does not resurrect permanent empty "ghost" entries.
        activeUndoWorkspace.images = (await hydrateStoredImages(activeUndoWorkspace.images))
          .filter((image) => Boolean(image.src));
      }
      if (!deps.isMounted() || createUndoSnapshot().text !== stateAtStart.text || undoSnapshots.value.at(-1) !== snapshot) return;
      restoringUndo = true;
      undoSnapshots.value = undoSnapshots.value.slice(0, -1);
      deps.cancelPendingEdits();
      deps.clearTransientUi();
      Object.assign(state, nextState);
      deps.persistAfterRestore();
      lastUndoSnapshot.value = createUndoSnapshot();
    } finally {
      restoringUndo = false;
      undoInFlight = false;
    }
  }

  function resetHistory(): void {
    undoSnapshots.value = [];
  }

  return {
    undoSnapshots,
    lastUndoSnapshot,
    recordUndoCheckpoint,
    createUndoSnapshot,
    undoLastBoardChange,
    resetHistory,
    isRestoring: (): boolean => restoringUndo,
  };
}

/** Image payload ids referenced by a serialized state (payloadId ?? id per image). */
export function extractRetainedImageIds(parsed: unknown): Set<string> {
  const retained = new Set<string>();
  const root = parsed as { images?: unknown; workspaces?: unknown } | null;
  if (!root || typeof root !== "object") return retained;
  const imageLists: unknown[] = [];
  if (Array.isArray(root.images)) imageLists.push(root.images);
  if (Array.isArray(root.workspaces)) {
    for (const workspace of root.workspaces) {
      if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) continue;
      const record = workspace as Record<string, unknown>;
      if (Array.isArray(record.images)) imageLists.push(record.images);
    }
  }
  for (const list of imageLists) {
    (list as unknown[]).forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" && record.id.trim() ? record.id : undefined;
      const payloadId = typeof record.payloadId === "string" && record.payloadId.trim()
        ? record.payloadId
        : undefined;
      if (payloadId ?? id) retained.add((payloadId ?? id)!);
    });
  }
  return retained;
}

export type { Ref };
