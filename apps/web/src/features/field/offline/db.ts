import { clear, createStore, del, entries, get, set, type UseStore } from 'idb-keyval';

/**
 * Two IndexedDB databases (idb-keyval keeps one object store per database):
 * a read cache of server data for offline use, and the outbox of work done
 * offline. Both are per-device and wiped on logout.
 */
let cacheStore: UseStore | null = null;
let queueStore: UseStore | null = null;

const hasIdb = () => typeof indexedDB !== 'undefined';

function cache(): UseStore {
  cacheStore ??= createStore('juma-field-cache', 'cache');
  return cacheStore;
}

function queue(): UseStore {
  queueStore ??= createStore('juma-field-outbox', 'outbox');
  return queueStore;
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  if (!hasIdb()) return undefined;
  try {
    return await get<T>(key, cache());
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  if (!hasIdb()) return;
  try {
    await set(key, value, cache());
  } catch {
    // Storage full or blocked (private mode): the app still works online.
  }
}

export const putOutbox = <T>(id: string, item: T) => set(id, item, queue());
export const deleteOutbox = (id: string) => del(id, queue());
export async function allOutbox<T>(): Promise<T[]> {
  if (!hasIdb()) return [];
  return (await entries<string, T>(queue())).map(([, item]) => item);
}

export async function wipeFieldData(): Promise<void> {
  if (!hasIdb()) return;
  await Promise.all([clear(cache()), clear(queue())]);
}
