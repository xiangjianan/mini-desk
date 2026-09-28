import { describe, expect, it } from "vitest";
import { useUndoHistory } from "../composables/useUndoHistory";
import { exportUndoSnapshotState, normalizeImportedState } from "../state/storage";
import type { BoardState } from "../types";

/** 扁平 payload 走 legacy 归一化路径即得完整 BoardState（state.test.ts 同款做法）。 */
function createState(): BoardState {
  return normalizeImportedState({
    quickTags: [{ id: "tag-1", title: "常用", clicks: 3 }],
    noteLines: [{ text: "旧内容", indent: 0 }],
  });
}

function createHistory(state: BoardState) {
  return useUndoHistory(state, {
    isMounted: () => true,
    cancelPendingEdits: () => {},
    clearTransientUi: () => {},
    persistAfterRestore: () => {},
  });
}

describe("undo history vs quick-tag clicks", () => {
  it("计数点击不产生撤销快照", () => {
    const state = createState();
    const history = createHistory(state);
    history.recordUndoCheckpoint();
    state.workspaces[0].quickTags[0].clicks = 4;
    history.recordUndoCheckpoint();
    expect(history.undoSnapshots.value).toHaveLength(0);
  });

  it("文本编辑仍产生快照", () => {
    const state = createState();
    const history = createHistory(state);
    history.recordUndoCheckpoint();
    state.workspaces[0].quickTags[0].clicks = 4;
    history.recordUndoCheckpoint();
    expect(history.undoSnapshots.value).toHaveLength(0);
    state.workspaces[0].noteLines = [{ text: "新内容", indent: 0 }];
    history.recordUndoCheckpoint();
    expect(history.undoSnapshots.value).toHaveLength(1);
  });

  it("撤销恢复文本但保留现行计数", async () => {
    const state = createState();
    const history = createHistory(state);
    history.recordUndoCheckpoint();
    state.workspaces[0].noteLines = [{ text: "新内容", indent: 0 }];
    history.recordUndoCheckpoint();
    expect(history.undoSnapshots.value).toHaveLength(1);
    state.workspaces[0].quickTags[0].clicks = 9;
    await history.undoLastBoardChange();
    expect(state.workspaces[0].noteLines).toEqual([{ text: "旧内容", indent: 0 }]);
    expect(state.workspaces[0].quickTags[0].clicks).toBe(9);
  });

  it("撤销快照序列化剥除 clicks", () => {
    const state = createState();
    expect(JSON.parse(exportUndoSnapshotState(state)).workspaces[0].quickTags[0].clicks).toBe(3);
    const stripped = JSON.parse(exportUndoSnapshotState(state, { omitQuickTagClicks: true }));
    expect("clicks" in stripped.workspaces[0].quickTags[0]).toBe(false);
  });
});
