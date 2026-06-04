import { IMAGE_DB_NAME, IMAGE_STORE_NAME, LEGACY_IMAGE_DB_NAME } from "./defaults";
import type { CompanionCustomGif, CompanionCustomGifStored, StoredImage } from "../types";

const CUSTOM_COMPANION_GIF_LIGHT_ID = "__custom-companion-gif-light__";
const CUSTOM_COMPANION_GIF_DARK_ID = "__custom-companion-gif-dark__";

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
  await transact(db, "readwrite", (store) => store.put({ id: image.id, src: image.src }));
  db.close();
}

export async function getStoredImagePayload(id: string): Promise<string | undefined> {
  if (!("indexedDB" in window)) return undefined;
  const db = await openImageDb();
  const record = await transact<{ id: string; src?: string } | undefined>(db, "readonly", (store) =>
    store.get(id),
  );
  db.close();
  if (record?.src) return record.src;
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
  await Promise.all(images.map((image) => storeImagePayload(image)));
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

export async function hydrateStoredImages(images: StoredImage[]): Promise<StoredImage[]> {
  if (!("indexedDB" in window)) return images;
  return Promise.all(
    images.map(async (image) => ({
      ...image,
      src: image.src ?? (await getStoredImagePayload(image.id)),
    })),
  );
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

async function getLegacyStoredPayload(id: string): Promise<string | undefined> {
  try {
    const db = await openImageDb(LEGACY_IMAGE_DB_NAME);
    const record = await transact<{ id: string; src?: string } | undefined>(db, "readonly", (store) =>
      store.get(id),
    );
    db.close();
    return record?.src;
  } catch {
    return undefined;
  }
}

async function clearLegacyStoredPayloads(): Promise<void> {
  try {
    const db = await openImageDb(LEGACY_IMAGE_DB_NAME);
    await transact(db, "readwrite", (store) => store.clear());
    db.close();
  } catch {
    // Legacy cleanup is best-effort; the active mini-desk database remains authoritative.
  }
}
