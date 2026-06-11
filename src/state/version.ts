export const APP_VERSION_STORAGE_KEY = "mini-desk-app-version";
export const LEGACY_APP_VERSION_STORAGE_KEY = "todo-board-app-version";
export const FALLBACK_APP_VERSION = "1.0.59";

export function getIndexAppVersion(doc: Document = document): string {
  return doc.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || FALLBACK_APP_VERSION;
}

export function getStoredAppVersion(storage: Storage = localStorage): string | null {
  return storage.getItem(APP_VERSION_STORAGE_KEY) ?? storage.getItem(LEGACY_APP_VERSION_STORAGE_KEY);
}

export function markAppVersionSeen(version: string, storage: Storage = localStorage): void {
  storage.setItem(APP_VERSION_STORAGE_KEY, version);
}

export async function clearStaticCaches(): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await window.caches.keys();
  await Promise.all(keys.map((key) => window.caches.delete(key)));
}
