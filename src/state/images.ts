import { IMAGE_DB_NAME, IMAGE_STORE_NAME, LEGACY_IMAGE_DB_NAME } from "./defaults";
import type { CompanionCustomGif, CompanionCustomGifStored, StoredImage } from "../types";

const CUSTOM_COMPANION_GIF_LIGHT_ID = "__custom-companion-gif-light__";
const CUSTOM_COMPANION_GIF_DARK_ID = "__custom-companion-gif-dark__";
type ImagePayloadRecord = { id: string; src?: string };

export interface HydrateStoredImagesOptions {
  persistLegacyPayloads?: boolean;
}

export function openImageDb(name = IMAGE_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeImagePayload(image: StoredImage): Promise<void> {
  if (!image.src || !("indexedDB" in window)) return;
  const db = await openImageDb();
  try {
    await transact(db, "readwrite", (store) => store.put({ id: image.id, src: image.src }));
  } finally {
    db.close();
  }
}

export async function getStoredImagePayload(id: string): Promise<string | undefined> {
  if (!("indexedDB" in window)) return undefined;
  const records = await getStoredImagePayloads([id]);
  const payload = records.get(id);
  if (payload) return payload;
  return getLegacyStoredPayload(id);
}

export async function deleteStoredImage(id: string): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openImageDb();
  await transact(db, "readwrite", (store) => store.delete(id));
  db.close();
}

export async function persistImagePayloads(images: StoredImage[]): Promise<void> {
  if (!("indexedDB" in window)) return;
  const payloads = images.filter((image): image is StoredImage & { src: string } => Boolean(image.src));
  if (payloads.length === 0) return;
  const db = await openImageDb();
  try {
    await transactBatch(db, "readwrite", (store) => {
      payloads.forEach((image) => {
        store.put({ id: image.id, src: image.src });
      });
    });
  } finally {
    db.close();
  }
}

export async function clearStoredImagePayloads(): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openImageDb();
  await transact(db, "readwrite", (store) => store.clear());
  db.close();
  await clearLegacyStoredPayloads();
}

export async function persistCustomCompanionGifPayloads(customGif: CompanionCustomGif): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openImageDb();
  await Promise.all([
    customGif.light
      ? transact(db, "readwrite", (store) => store.put({ id: CUSTOM_COMPANION_GIF_LIGHT_ID, src: customGif.light }))
      : transact(db, "readwrite", (store) => store.delete(CUSTOM_COMPANION_GIF_LIGHT_ID)),
    customGif.dark
      ? transact(db, "readwrite", (store) => store.put({ id: CUSTOM_COMPANION_GIF_DARK_ID, src: customGif.dark }))
      : transact(db, "readwrite", (store) => store.delete(CUSTOM_COMPANION_GIF_DARK_ID)),
  ]);
  db.close();
}

export async function hydrateCustomCompanionGif(
  customGif: CompanionCustomGif,
  stored: CompanionCustomGifStored = {},
): Promise<CompanionCustomGif> {
  if (!("indexedDB" in window)) return customGif;
  const db = await openImageDb();
  const [lightRecord, darkRecord] = await Promise.all([
    stored.light && !customGif.light
      ? transact<{ id: string; src?: string } | undefined>(db, "readonly", (store) => store.get(CUSTOM_COMPANION_GIF_LIGHT_ID))
      : Promise.resolve(undefined),
    stored.dark && !customGif.dark
      ? transact<{ id: string; src?: string } | undefined>(db, "readonly", (store) => store.get(CUSTOM_COMPANION_GIF_DARK_ID))
      : Promise.resolve(undefined),
  ]);
  db.close();
  const [legacyLight, legacyDark] = await Promise.all([
    stored.light && !customGif.light && !lightRecord?.src ? getLegacyStoredPayload(CUSTOM_COMPANION_GIF_LIGHT_ID) : Promise.resolve(undefined),
    stored.dark && !customGif.dark && !darkRecord?.src ? getLegacyStoredPayload(CUSTOM_COMPANION_GIF_DARK_ID) : Promise.resolve(undefined),
  ]);
  return {
    ...(customGif.light || lightRecord?.src || legacyLight ? { light: customGif.light ?? lightRecord?.src ?? legacyLight } : {}),
    ...(customGif.dark || darkRecord?.src || legacyDark ? { dark: customGif.dark ?? darkRecord?.src ?? legacyDark } : {}),
  };
}

export async function hydrateStoredImages(
  images: StoredImage[],
  options: HydrateStoredImagesOptions = {},
): Promise<StoredImage[]> {
  if (!("indexedDB" in window)) return images;
  const missingIds = images.filter((image) => !image.src).map((image) => image.id);
  if (missingIds.length === 0) return images;

  const currentPayloads = await getStoredImagePayloads(missingIds);
  const legacyIds = missingIds.filter((id) => !currentPayloads.has(id));
  const legacyPayloads = await getLegacyStoredPayloads(legacyIds);
  const hydratedImages = images.map((image) => ({
    ...image,
    src: image.src ?? currentPayloads.get(image.id) ?? legacyPayloads.get(image.id),
  }));

  if (options.persistLegacyPayloads && legacyPayloads.size > 0) {
    await persistImagePayloads(
      hydratedImages.filter((image): image is StoredImage & { src: string } => Boolean(image.src && legacyPayloads.has(image.id))),
    );
  }

  return hydratedImages;
}

async function getStoredImagePayloads(ids: string[]): Promise<Map<string, string>> {
  return getStoredImagePayloadsFromDb(IMAGE_DB_NAME, ids);
}

async function getStoredImagePayloadsFromDb(name: string, ids: string[]): Promise<Map<string, string>> {
  const payloads = new Map<string, string>();
  if (ids.length === 0) return payloads;

  const db = await openImageDb(name);
  try {
    await transactBatch(db, "readonly", (store) => {
      ids.forEach((id) => {
        const request = store.get(id) as IDBRequest<ImagePayloadRecord | undefined>;
        request.onsuccess = () => {
          if (request.result?.src) payloads.set(id, request.result.src);
        };
      });
    });
  } finally {
    db.close();
  }

  return payloads;
}

function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest<IDBValidKey> | IDBRequest<undefined>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, mode);
    const request = operation(transaction.objectStore(IMAGE_STORE_NAME)) as IDBRequest<T>;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function transactBatch(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, mode);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    try {
      operation(transaction.objectStore(IMAGE_STORE_NAME));
    } catch (error) {
      reject(error);
    }
  });
}

async function getLegacyStoredPayload(id: string): Promise<string | undefined> {
  try {
    const records = await getStoredImagePayloadsFromDb(LEGACY_IMAGE_DB_NAME, [id]);
    return records.get(id);
  } catch {
    return undefined;
  }
}

async function getLegacyStoredPayloads(ids: string[]): Promise<Map<string, string>> {
  try {
    return await getStoredImagePayloadsFromDb(LEGACY_IMAGE_DB_NAME, ids);
  } catch {
    return new Map();
  }
}

async function clearLegacyStoredPayloads(): Promise<void> {
  try {
    const db = await openImageDb(LEGACY_IMAGE_DB_NAME);
    try {
      await transact(db, "readwrite", (store) => store.clear());
    } finally {
      db.close();
    }
  } catch {
    // Legacy cleanup is best-effort; the active mini-desk database remains authoritative.
  }
}
