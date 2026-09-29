// e2e helpers that read and write the app's IndexedDB directly. Call them only after the app has loaded once
// (the app creates the database; opening it here first would create it without its object store).
import type { Page } from '@playwright/test';

const DB = 'moving-sequencer';
const STORE = 'data';

/** Runs one request on the app's store and resolves with its result. */
function onStore<T>(
  page: Page,
  mode: IDBTransactionMode,
  op: 'get' | 'put' | 'keys',
  key?: string,
  value?: unknown,
) {
  return page.evaluate(
    ({ db: name, store, mode, op, key, value }) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const objects = db.transaction(store, mode).objectStore(store);
          const request =
            op === 'get'
              ? objects.get(key ?? '')
              : op === 'put'
                ? objects.put(value, key)
                : objects.getAllKeys();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            resolve(request.result);
            db.close();
          };
        };
      }),
    { db: DB, store: STORE, mode, op, key, value },
  ) as Promise<T>;
}

export const storedSong = (page: Page) =>
  onStore<{ bpm: number; tracks: unknown[] } | undefined>(page, 'readonly', 'get', 'song');
export const storedKeys = (page: Page) => onStore<string[]>(page, 'readonly', 'keys');
export const storeValue = (page: Page, key: string, value: unknown) =>
  onStore<unknown>(page, 'readwrite', 'put', key, value);
