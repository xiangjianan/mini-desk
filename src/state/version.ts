export const APP_VERSION_STORAGE_KEY = "mini-desk-app-version";
export const LEGACY_APP_VERSION_STORAGE_KEY = "todo-board-app-version";
export const FALLBACK_APP_VERSION = "1.0.67";
export const APP_VERSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function getIndexAppVersion(doc: Document = document): string {
  return getAppVersionFromDocument(doc) ?? FALLBACK_APP_VERSION;
}

function getAppVersionFromDocument(doc: Document): string | null {
  return doc.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || null;
}

export function getAppVersionFromHtml(html: string): string | null {
  if (typeof DOMParser !== "undefined") {
    return getAppVersionFromDocument(new DOMParser().parseFromString(html, "text/html"));
  }
  if (typeof document === "undefined") return null;
  const doc = document.implementation.createHTMLDocument("");
  doc.documentElement.innerHTML = html;
  return getAppVersionFromDocument(doc);
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

export async function fetchLatestAppVersion(
  fetcher: typeof fetch = fetch,
  currentHref: string = window.location.href,
): Promise<string | null> {
  if (typeof fetcher !== "function") return null;
  const indexUrl = new URL(import.meta.env.BASE_URL || "/", currentHref);
  indexUrl.searchParams.set("_mini_desk_version", String(Date.now()));

  try {
    const response = await fetcher(indexUrl.toString(), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    return getAppVersionFromHtml(await response.text());
  } catch {
    return null;
  }
}
