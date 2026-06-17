import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";
import ImagePanel from "../components/ImagePanel.vue";
import { IMAGE_DB_NAME, IMAGE_STORE_NAME, STORAGE_KEY } from "../state/defaults";
import { hydrateStoredImages, persistImagePayloads } from "../state/images";

type ImageRecord = { id: string; src?: string };

interface FakeIndexedDb {
  open: ReturnType<typeof vi.fn>;
  putRecords: ImageRecord[];
}

function createAsyncRequest<T>(result: T, onSettled?: () => void): IDBRequest<T> {
  const request = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest<T>;

  queueMicrotask(() => {
    request.onsuccess?.(new Event("success"));
    onSettled?.();
  });

  return request;
}

function installFakeIndexedDb(seed: Record<string, ImageRecord[]>): FakeIndexedDb {
  const stores = new Map<string, Map<string, ImageRecord>>(
    Object.entries(seed).map(([name, records]) => [name, new Map(records.map((record) => [record.id, { ...record }]))]),
  );
  const putRecords: ImageRecord[] = [];

  const open = vi.fn((name = IMAGE_DB_NAME) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const records = stores.get(name)!;
    const db = {
      objectStoreNames: { contains: vi.fn(() => true) },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => {
        let pendingRequests = 0;
        let completed = false;
        const transaction = {
          objectStore: vi.fn(() => store),
          oncomplete: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          error: null,
        };
        const finishIfIdle = () => {
          queueMicrotask(() => {
            if (!completed && pendingRequests === 0) {
              completed = true;
              transaction.oncomplete?.(new Event("complete"));
            }
          });
        };
        const settleRequest = () => {
          pendingRequests -= 1;
          finishIfIdle();
        };
        const store = {
          get: vi.fn((id: string) => {
            pendingRequests += 1;
            return createAsyncRequest(records.get(id), settleRequest);
          }),
          put: vi.fn((record: ImageRecord) => {
            pendingRequests += 1;
            const nextRecord = { ...record };
            records.set(record.id, nextRecord);
            putRecords.push(nextRecord);
            return createAsyncRequest(record.id, settleRequest);
          }),
          delete: vi.fn((id: string) => {
            pendingRequests += 1;
            records.delete(id);
            return createAsyncRequest(undefined, settleRequest);
          }),
          clear: vi.fn(() => {
            pendingRequests += 1;
            records.clear();
            return createAsyncRequest(undefined, settleRequest);
          }),
        };
        finishIfIdle();
        return transaction;
      }),
      close: vi.fn(),
    };
    const request = {
      result: db,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    } as unknown as IDBOpenDBRequest;
    queueMicrotask(() => request.onsuccess?.(new Event("success")));
    return request;
  });

  vi.stubGlobal("indexedDB", { open });
  return { open, putRecords };
}

const dropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: "<div><slot /></div>",
};

const popoverStub = {
  props: ["show"],
  template: '<div v-bind="$attrs"><slot name="trigger" /><div v-if="show"><slot /></div></div>',
};

function mountApp() {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        NDropdown: dropdownStub,
        NPopover: popoverStub,
        NTooltip: { template: "<span><slot name=\"trigger\" /><slot /></span>" },
        NModal: { props: ["show", "title"], template: "<section v-if=\"show\"><slot /></section>" },
      },
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("image storage startup performance", () => {
  it("hydrates multiple stored image payloads with one active IndexedDB open", async () => {
    const fakeIndexedDb = installFakeIndexedDb({
      [IMAGE_DB_NAME]: [
        { id: "img-1", src: "data:image/png;base64,one" },
        { id: "img-2", src: "data:image/png;base64,two" },
      ],
    });

    const images = await hydrateStoredImages([
      { id: "img-1", createdAt: 1 },
      { id: "img-2", createdAt: 2 },
    ]);

    expect(images.map((image) => image.src)).toEqual([
      "data:image/png;base64,one",
      "data:image/png;base64,two",
    ]);
    expect(fakeIndexedDb.open).toHaveBeenCalledTimes(1);
    expect(fakeIndexedDb.open).toHaveBeenCalledWith(IMAGE_DB_NAME, 1);
  });

  it("persists multiple image payloads with one active IndexedDB open", async () => {
    const fakeIndexedDb = installFakeIndexedDb({ [IMAGE_DB_NAME]: [] });

    await persistImagePayloads([
      { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
      { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
    ]);

    expect(fakeIndexedDb.open).toHaveBeenCalledTimes(1);
    expect(fakeIndexedDb.putRecords.map((record) => record.id)).toEqual(["img-1", "img-2"]);
  });

  it("does not rewrite image payloads that were hydrated from the current image database on app startup", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        companionGifTheme: "none",
        images: [
          { id: "img-1", createdAt: 1 },
          { id: "img-2", createdAt: 2 },
        ],
      }),
    );
    const fakeIndexedDb = installFakeIndexedDb({
      [IMAGE_DB_NAME]: [
        { id: "img-1", src: "data:image/png;base64,one" },
        { id: "img-2", src: "data:image/png;base64,two" },
      ],
    });
    const wrapper = mountApp();

    try {
      await vi.waitFor(() => {
        expect((wrapper.getComponent(ImagePanel).props("images") as ImageRecord[]).map((image) => image.src)).toEqual([
          "data:image/png;base64,one",
          "data:image/png;base64,two",
        ]);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fakeIndexedDb.putRecords).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not serialize image payloads when recording board undo checkpoints", async () => {
    const originalIndexedDB = window.indexedDB;
    Reflect.deleteProperty(window, "indexedDB");
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        companionGifTheme: "none",
        images: [
          { id: "img-1", createdAt: 1, src: "data:image/png;base64,large-image-payload" },
        ],
      }),
    );
    const wrapper = mountApp();

    try {
      await wrapper.vm.$nextTick();
      const serialized: string[] = [];
      const stringify = JSON.stringify;
      vi.spyOn(JSON, "stringify").mockImplementation((value: unknown, replacer?: Parameters<typeof JSON.stringify>[1], space?: Parameters<typeof JSON.stringify>[2]) => {
        const result = stringify(value, replacer, space);
        serialized.push(result);
        return result;
      });

      await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(serialized.some((value) => value.includes("large-image-payload"))).toBe(false);
    } finally {
      if (originalIndexedDB) vi.stubGlobal("indexedDB", originalIndexedDB);
      wrapper.unmount();
    }
  });
});
