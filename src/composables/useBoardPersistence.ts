import { ref } from "vue";
import { saveStateWithConflictCheck } from "../state/storage";
import type { SaveScope, SaveStateOptions } from "../state/storage";
import type { BoardState } from "../types";

export type SaveStatusKind = "saved" | "saving" | "dirty";

export interface PersistOptions {
  force?: boolean;
  imagePlacement?: SaveStateOptions["imagePlacement"];
  imageReplacement?: SaveStateOptions["imageReplacement"];
}

export interface BoardPersistenceDeps {
  state: BoardState;
  clientId: string;
  /** Called before each save attempt (records undo checkpoints). */
  onBeforeSave: () => void;
  /** Conflict path: show the toast + mark dirty. */
  onConflict: () => void;
  /** Save succeeded: merge visible images when the save merged cross-tab state. */
  onMerged: (savedImages: unknown[]) => void;
  /** Save succeeded: broadcast to other tabs. */
  onSaved: () => void;
  /** Schedule IndexedDB payload pruning (skipped for text-only flushes). */
  scheduleImagePayloadPrune: () => void;
  /** Bubble celebration for explicit saves (not debounced auto-saves). */
  showSaveBubble: () => void;
}

/**
 * Board persistence pipeline: the debounced text/todo save channel (generation
 * baseline + two independent timers), immediate full saves with cross-tab
 * conflict handling, and the saved/saving/dirty status indicator.
 */
export function useBoardPersistence(deps: BoardPersistenceDeps) {
  const saveStatus = ref<SaveStatusKind>("saved");
  const textSaveTimer = ref<number | undefined>();
  const todoSaveTimer = ref<number | undefined>();
  const saveStatusTimer = ref<number | undefined>();
  let textEditGeneration = 0;
  let savedTextGeneration = 0;

  function scheduleTextSave(): void {
    window.clearTimeout(textSaveTimer.value);
    textSaveTimer.value = window.setTimeout(() => {
      textSaveTimer.value = undefined;
      void persistPendingText();
    }, 3000);
  }

  // Todo input saves share the text pipeline's generation baseline so a debounced
  // todo edit and a debounced line edit can never overwrite each other, while the
  // separate timer keeps "stop typing in todos" from delaying a pending line save
  // (and vice versa).
  function scheduleTodoSave(): void {
    window.clearTimeout(todoSaveTimer.value);
    todoSaveTimer.value = window.setTimeout(() => {
      todoSaveTimer.value = undefined;
      void persistPendingText();
    }, 1000);
  }

  function flushTodoSave(): void {
    const pending = todoSaveTimer.value !== undefined;
    window.clearTimeout(todoSaveTimer.value);
    todoSaveTimer.value = undefined;
    if (pending) void persistPendingText();
  }

  function flushTextSave(): void {
    window.clearTimeout(textSaveTimer.value);
    textSaveTimer.value = undefined;
    void persistPendingText();
  }

  function resetTextGenerationBaseline(): void {
    window.clearTimeout(textSaveTimer.value);
    textSaveTimer.value = undefined;
    flushTodoSave();
    savedTextGeneration = textEditGeneration;
  }

  function bumpTextGeneration(): void {
    textEditGeneration += 1;
  }

  async function persistPendingText(options: { retryOnce?: boolean } = {}): Promise<void> {
    if (textEditGeneration === savedTextGeneration) return;
    const attemptGeneration = textEditGeneration;
    const persisted = persistNow("text");
    if (!persisted) {
      if (options.retryOnce && textEditGeneration !== savedTextGeneration) scheduleTextSave();
      return;
    }
    savedTextGeneration = Math.max(savedTextGeneration, attemptGeneration);
    if (textEditGeneration !== savedTextGeneration) {
      scheduleTextSave();
      return;
    }
    deps.showSaveBubble();
  }

  function persistNow(scope: SaveScope = "all", options: PersistOptions = {}): boolean {
    deps.onBeforeSave();
    markSaving();
    // A direct save supersedes any pending debounced todo/text save: it persists
    // the whole in-memory state anyway, so retire the timers and adopt the current
    // generation as saved to keep persistPendingText from double-saving (and
    // double-bubbling) right after. Capture the generation BEFORE saving — an
    // edit injected mid-save (e.g. re-entrant from a storage spy) must stay dirty.
    const generationAtSave = textEditGeneration;
    const supersededPendingEdit = generationAtSave !== savedTextGeneration;
    if (supersededPendingEdit) {
      window.clearTimeout(textSaveTimer.value);
      textSaveTimer.value = undefined;
      flushTodoSave();
    }
    const result = saveStateWithConflictCheck(deps.state, {
      clientId: deps.clientId,
      force: options.force,
      scope,
      imagePlacement: options.imagePlacement,
      imageReplacement: options.imageReplacement,
    });
    if (result.status === "conflict") {
      window.clearTimeout(saveStatusTimer.value);
      saveStatus.value = "dirty";
      deps.onConflict();
      return false;
    }
    if (supersededPendingEdit) savedTextGeneration = generationAtSave;
    deps.state.sync = result.state.sync;
    if (result.status === "merged") {
      const savedActive = result.state.workspaces.find((w) => w.id === deps.state.activeWorkspaceId) ?? result.state.workspaces[0];
      deps.onMerged(savedActive?.images ?? []);
    }
    deps.onSaved();
    markSavedSoon();
    // Payload pruning only matters when image sets may have changed; a text/todo
    // debounce flush cannot orphan a payload, so skip the IndexedDB sweep.
    if (scope !== "text") deps.scheduleImagePayloadPrune();
    return true;
  }

  function markDirty(): void {
    deps.onBeforeSave();
    window.clearTimeout(saveStatusTimer.value);
    saveStatus.value = "dirty";
  }

  function markSaving(): void {
    window.clearTimeout(saveStatusTimer.value);
    saveStatus.value = "saving";
  }

  function markSavedNow(): void {
    window.clearTimeout(saveStatusTimer.value);
    saveStatus.value = "saved";
  }

  function markSavedSoon(): void {
    window.clearTimeout(saveStatusTimer.value);
    saveStatusTimer.value = window.setTimeout(() => {
      saveStatus.value = "saved";
    }, 100);
  }

  function hasUnsavedLocalChanges(): boolean {
    return textEditGeneration !== savedTextGeneration || saveStatus.value !== "saved";
  }

  /** True while a debounced edit has not been persisted yet (beforeunload flush). */
  function hasPendingEdits(): boolean {
    return textEditGeneration !== savedTextGeneration;
  }

  function clearTimers(): void {
    window.clearTimeout(textSaveTimer.value);
    window.clearTimeout(todoSaveTimer.value);
    window.clearTimeout(saveStatusTimer.value);
    textSaveTimer.value = undefined;
    todoSaveTimer.value = undefined;
    saveStatusTimer.value = undefined;
  }

  return {
    saveStatus,
    textSaveTimer,
    todoSaveTimer,
    scheduleTextSave,
    scheduleTodoSave,
    flushTodoSave,
    flushTextSave,
    resetTextGenerationBaseline,
    bumpTextGeneration,
    persistPendingText,
    persistNow,
    markDirty,
    markSaving,
    markSavedNow,
    markSavedSoon,
    hasUnsavedLocalChanges,
    hasPendingEdits,
    clearTimers,
  };
}
