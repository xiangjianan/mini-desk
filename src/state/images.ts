import { IMAGE_DB_NAME, IMAGE_STORE_NAME } from "./defaults";
import type { StoredImage } from "../types";

export function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 1);

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
  return record?.src;
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
