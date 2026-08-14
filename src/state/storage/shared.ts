import type { BoardSyncState } from "../../types";

export type SaveScope = "all" | "images" | "text";

export type SaveStateStatus = "saved" | "merged" | "conflict";

export interface ImagePlacementHint {
  imageId: string;
  targetId: string;
  placement: "before" | "after";
}

export interface ImageReplacementHint {
  imageId: string;
  expectedPayloadId: string;
  newPayloadId: string;
}

export interface SaveStateOptions {
  storage?: Storage;
  clientId?: string;
  force?: boolean;
  now?: () => number;
  scope?: SaveScope;
  imagePlacement?: ImagePlacementHint;
  imageReplacement?: ImageReplacementHint;
}

export interface SaveStateResult {
  status: SaveStateStatus;
  state: import("../../types").BoardState;
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clampInteger(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export function normalizeSyncState(value: unknown): BoardSyncState {
  if (!isPlainObject(value)) return { revision: 0, updatedAt: 0, clientId: "" };
  const revision = typeof value.revision === "number" && Number.isFinite(value.revision)
    ? Math.max(0, Math.floor(value.revision))
    : 0;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
    ? Math.max(0, Math.floor(value.updatedAt))
    : 0;
  const clientId = typeof value.clientId === "string" ? value.clientId : "";
  return { revision, updatedAt, clientId };
}
