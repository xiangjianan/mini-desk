/**
 * Storage facade. The implementation lives in `./storage/`:
 * - `shared.ts`   — save option types, id/guard utilities, sync normalization
 * - `serialize.ts`— serializable state shaping + clone helpers + line codecs
 * - `normalize.ts`— imported-state / per-domain normalization (the write barrier
 *                    for untrusted payloads, incl. quick-app scheme filtering)
 * - `persist.ts`  — load/save orchestration with cross-tab conflict merging
 *
 * This module re-exports the public surface so consumers (App.vue, tests,
 * sibling state modules) keep a single stable import path.
 */
export { createId, isPlainObject, clampInteger, normalizeSyncState } from "./storage/shared";
export type { SaveScope, SaveStateStatus, SaveStateOptions, SaveStateResult, ImagePlacementHint, ImageReplacementHint } from "./storage/shared";

export { loadState, saveState, saveStateWithConflictCheck } from "./storage/persist";

export {
  getSerializableState,
  getSerializableWorkspace,
  exportUndoSnapshotState,
  serializeTextLines,
  textLinesToText,
} from "./storage/serialize";

export {
  normalizeImportedState,
  normalizeWorkspaceData,
  normalizeSpaces,
  normalizeLineCollection,
  normalizeImages,
  normalizeQuickTags,
  normalizeQuickButtons,
  normalizeTodos,
  normalizeZoneVisibility,
  normalizeCustomTitles,
  normalizeCustomCompanionGif,
  normalizeCustomCompanionGifStored,
  LEGACY_TODO_TITLE_IDS,
  hasLegacyTodoListState,
} from "./storage/normalize";
