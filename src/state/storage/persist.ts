import { LEGACY_STORAGE_KEY, STORAGE_KEY, defaultState } from "../defaults";
import type { BoardState, StoredImage, WorkspaceData } from "../../types";
import { normalizeSyncState, type ImagePlacementHint, type ImageReplacementHint, type SaveStateOptions, type SaveStateResult, type SaveScope, type SaveStateStatus } from "./shared";
import { getSerializableState } from "./serialize";
import { normalizeImportedState } from "./normalize";

export function loadState(storage: Storage = localStorage): BoardState {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeImportedState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function saveState(state: BoardState, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(getSerializableState(state)));
}

function findWorkspace(state: BoardState): WorkspaceData | undefined {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0];
}

function replaceWorkspaceImages(state: BoardState, workspaceId: string, images: StoredImage[]): BoardState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? { ...workspace, images } : workspace,
    ),
  };
}

export function saveStateWithConflictCheck(
  state: BoardState,
  options: SaveStateOptions = {},
): SaveStateResult {
  const storage = options.storage ?? localStorage;
  const scope = options.scope ?? "all";
  const current = loadCurrentPrimaryState(storage);
  const local = getSerializableState(state);
  const localRevision = normalizeSyncState(local.sync).revision;
  const currentRevision = current ? normalizeSyncState(current.sync).revision : 0;

  if (current && currentRevision > localRevision && current.sync.clientId !== options.clientId && !options.force) {
    if (scope === "images") {
      const localWorkspace = findWorkspace(local);
      if (!localWorkspace) {
        return { status: "conflict", state: current };
      }
      const currentWorkspace = current.workspaces.find((workspace) => workspace.id === localWorkspace.id);
      if (
        !currentWorkspace
        || (options.imageReplacement
          && !canMergeImageReplacement(currentWorkspace.images, localWorkspace.images, options.imageReplacement))
      ) {
        return { status: "conflict", state: current };
      }
      const mergedImages = mergeImageAdditions(
        currentWorkspace.images,
        localWorkspace.images,
        options.imagePlacement,
        options.imageReplacement,
      );
      const merged = replaceWorkspaceImages(current, currentWorkspace.id, mergedImages);
      const saved = writeSyncedState(merged, storage, {
        clientId: options.clientId,
        now: options.now,
        revision: currentRevision + 1,
      });
      return { status: "merged", state: saved };
    }
    return { status: "conflict", state: current };
  }

  const nextRevision = current ? currentRevision + 1 : Math.max(1, localRevision);
  const saved = writeSyncedState(local, storage, {
    clientId: options.clientId,
    now: options.now,
    revision: nextRevision,
  });
  return { status: "saved", state: saved };
}

function loadCurrentPrimaryState(storage: Storage): BoardState | undefined {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return normalizeImportedState(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function writeSyncedState(
  state: BoardState,
  storage: Storage,
  options: { clientId?: string; now?: () => number; revision: number },
): BoardState {
  const synced = getSerializableState({
    ...state,
    sync: {
      revision: options.revision,
      updatedAt: options.now?.() ?? Date.now(),
      clientId: options.clientId ?? state.sync.clientId,
    },
  });
  storage.setItem(STORAGE_KEY, JSON.stringify(synced));
  return synced;
}

function mergeImageAdditions(
  currentImages: StoredImage[],
  localImages: StoredImage[],
  placement?: ImagePlacementHint,
  replacement?: ImageReplacementHint,
): StoredImage[] {
  const localById = new Map(localImages.map((image) => [image.id, image]));
  const seen = new Set(currentImages.map((image) => image.id));
  const mergedCurrent = currentImages.map((image) => {
    const local = localById.get(image.id);
    if (local && replacement?.imageId === image.id) {
      return { ...image, ...local, src: local.src ?? image.src };
    }
    return local ? { ...local, ...image, src: image.src ?? local.src } : { ...image };
  });
  const localAdditions = localImages
    .filter((image) => !seen.has(image.id))
    .map((image) => ({ ...image }));
  const merged = [...mergedCurrent, ...localAdditions];
  if (!placement || seen.has(placement.imageId)) return merged;
  const imageIndex = merged.findIndex((image) => image.id === placement.imageId);
  if (imageIndex < 0) return merged;
  const [image] = merged.splice(imageIndex, 1);
  const targetIndex = merged.findIndex((item) => item.id === placement.targetId);
  if (targetIndex < 0) {
    merged.push(image);
    return merged;
  }
  merged.splice(targetIndex + (placement.placement === "after" ? 1 : 0), 0, image);
  return merged;
}

function canMergeImageReplacement(
  currentImages: StoredImage[],
  localImages: StoredImage[],
  replacement: ImageReplacementHint,
): boolean {
  const current = currentImages.find((image) => image.id === replacement.imageId);
  const local = localImages.find((image) => image.id === replacement.imageId);
  return Boolean(
    current
      && local
      && getImagePayloadId(current) === replacement.expectedPayloadId
      && getImagePayloadId(local) === replacement.newPayloadId,
  );
}

function getImagePayloadId(image: StoredImage): string {
  return image.payloadId ?? image.id;
}

export type { SaveScope, SaveStateStatus, SaveStateOptions, SaveStateResult, ImagePlacementHint, ImageReplacementHint };
