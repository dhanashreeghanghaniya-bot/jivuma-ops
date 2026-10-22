'use client';

import { useSyncExternalStore } from 'react';
import type {
  CreateExpenseInput,
  ExpenseItem,
  CreateVisitInput,
  FieldLeadInput,
  PingInput,
  PresignedUpload,
  VisitListItem,
  VisitPhotoType,
} from '@juma/shared';
import { api, ApiRequestError } from '@/lib/api-client';
import { allOutbox, deleteOutbox, putOutbox } from './db';

/**
 * The outbox (SPEC 5.3). Everything the salesman records goes here first and
 * is sent from here, online or not, so there is exactly one code path and an
 * item is only removed once the server has it. Every item carries the client
 * UUID the API uses as an idempotency key, so a send that times out after the
 * server committed is harmless to repeat.
 */

export interface QueuedPhoto {
  /** Becomes the storage object name, so a retried upload overwrites itself. */
  key: string;
  blob: Blob;
  type: VisitPhotoType;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  /** Set once uploaded. */
  path?: string;
}

export interface QueuedBill {
  key: string;
  blob: Blob;
  path?: string;
}

interface Base {
  id: string;
  createdAt: string;
  attempts: number;
  /** Last failure the salesman should see. */
  error?: string;
  /** Rejected by the server for a reason a retry will not fix. */
  dead?: boolean;
}

export type OutboxItem =
  | (Base & {
      kind: 'visit';
      payload: CreateVisitInput;
      /** Display data for lists while the visit is unsynced. */
      summary: { shopName: string; townName: string; orderTotal: string | null };
      photos: QueuedPhoto[];
      /** Server id once the visit itself is stored; photos may still be pending. */
      visitId?: string;
      /** Photos are waiting for storage to be configured on the server. */
      photosBlocked?: boolean;
    })
  | (Base & { kind: 'lead'; payload: FieldLeadInput; summary: { name: string; townName: string } })
  | (Base & {
      kind: 'expense';
      payload: CreateExpenseInput;
      /** Bill photos; uploaded once the claim exists, like visit photos. */
      photos: QueuedBill[];
      /** Server id once the claim itself is stored. */
      expenseId?: string;
      photosBlocked?: boolean;
    })
  | (Base & { kind: 'ping'; payload: PingInput & { workDayId: string } });

/** `Omit` that keeps the union apart, so each kind keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = DistributiveOmit<OutboxItem, 'id' | 'createdAt' | 'attempts'> & { id?: string };

// --- snapshot for React -----------------------------------------------------

export interface OutboxState {
  items: OutboxItem[];
  syncing: boolean;
  online: boolean;
  lastSyncedAt: string | null;
  /** Changes whenever the server accepted something, so screens can refetch. */
  lastDeliveredAt: string | null;
}

let state: OutboxState = {
  items: [],
  syncing: false,
  online: true,
  lastSyncedAt: null,
  lastDeliveredAt: null,
};
let deliveredThisRun = false;
const listeners = new Set<() => void>();

function publish(patch: Partial<OutboxState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

async function reload() {
  const items = await allOutbox<OutboxItem>();
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  publish({ items });
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** Items the salesman cares about: pings are bookkeeping, not "his" work. */
export const visibleItems = (items: OutboxItem[]) => items.filter((i) => i.kind !== 'ping');

// --- ids --------------------------------------------------------------------

export function newUuid(): string {
  // `randomUUID` only exists in secure contexts (https or localhost).
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC 4122 v4 fallback, e.g. a phone testing against a LAN IP over http.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// --- enqueue ----------------------------------------------------------------

export async function enqueue(item: NewItem): Promise<void> {
  const full = {
    ...item,
    id: item.id ?? newUuid(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  } as OutboxItem;
  await putOutbox(full.id, full);
  await reload();
  void syncNow();
}

export async function discard(id: string): Promise<void> {
  await deleteOutbox(id);
  await reload();
}

// --- sync -------------------------------------------------------------------

const isNetworkError = (err: unknown) => !(err instanceof ApiRequestError);

/** A 4xx other than auth/rate-limit means the payload itself is unacceptable. */
const isPermanent = (err: unknown) =>
  err instanceof ApiRequestError &&
  err.status >= 400 &&
  err.status < 500 &&
  ![401, 408, 429].includes(err.status);

const describe = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'No network. Will retry automatically.';

class StopSync extends Error {}

async function save(item: OutboxItem) {
  await putOutbox(item.id, item);
}

async function uploadPhotos(
  item: Extract<OutboxItem, { kind: 'visit' | 'expense' }>,
  kind: 'visits' | 'bills',
) {
  for (const photo of item.photos) {
    if (photo.path) continue;
    let signed: PresignedUpload;
    try {
      signed = (await api.post<PresignedUpload>('/uploads/presign', { kind, key: photo.key })).data;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        item.photosBlocked = true;
        item.error = err.message;
        await save(item);
        return false;
      }
      throw err;
    }
    const res = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': photo.blob.type || 'image/jpeg', 'x-upsert': 'true' },
      body: photo.blob,
    });
    if (!res.ok)
      throw new ApiRequestError(res.status, {
        code: 'INTERNAL_ERROR',
        message: 'Photo upload failed',
      });
    photo.path = signed.path;
    await save(item);
  }
  item.photosBlocked = false;
  return true;
}

/**
 * A claim, then its bills, then (for a claim not tied to a day) its
 * submission. Claims tied to a day are submitted with the day.
 */
async function sendExpense(item: Extract<OutboxItem, { kind: 'expense' }>) {
  if (!item.expenseId) {
    const { data } = await api.post<ExpenseItem>('/expenses', item.payload);
    deliveredThisRun = true;
    item.expenseId = data.id;
    item.error = undefined;
    await save(item);
  }
  if (item.photos.length > 0) {
    const uploaded = await uploadPhotos(item, 'bills');
    if (!uploaded) return false;
    await api.post(`/expenses/${item.expenseId}/bills`, {
      paths: item.photos.map((p) => p.path),
    });
  }
  if (!item.payload.workDayId) await api.post(`/expenses/${item.expenseId}/submit`);
  return true;
}

async function sendVisit(item: Extract<OutboxItem, { kind: 'visit' }>) {
  if (!item.visitId) {
    const { data } = await api.post<VisitListItem>('/visits', item.payload);
    deliveredThisRun = true;
    item.visitId = data.id;
    item.error = undefined;
    await save(item);
  }
  if (item.photos.length === 0) return true;

  const uploaded = await uploadPhotos(item, 'visits');
  if (!uploaded) return false;
  await api.post(`/visits/${item.visitId}/photos`, {
    photos: item.photos.map((p) => ({
      path: p.path,
      type: p.type,
      capturedAt: p.capturedAt,
      lat: p.lat,
      lng: p.lng,
    })),
  });
  return true;
}

async function sendPings(batch: Extract<OutboxItem, { kind: 'ping' }>[]) {
  const workDayId = batch[0]!.payload.workDayId;
  await api.post('/field/pings', {
    workDayId,
    pings: batch.map(({ payload: { workDayId: _w, ...ping } }) => ping),
  });
}

async function runOnce(): Promise<void> {
  const items = await allOutbox<OutboxItem>();
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handle = async (item: OutboxItem, send: () => Promise<boolean | void>) => {
    try {
      const done = await send();
      if (done === false) return;
      deliveredThisRun = true;
      await deleteOutbox(item.id);
    } catch (err) {
      item.attempts += 1;
      item.error = describe(err);
      if (isPermanent(err)) item.dead = true;
      await save(item);
      // Offline: stop here and keep the order; the next attempt picks it up.
      if (isNetworkError(err)) throw new StopSync();
    }
  };

  // Pings go in batches per day, everything else in the order it was recorded.
  const pings = items.filter(
    (i): i is Extract<OutboxItem, { kind: 'ping' }> => i.kind === 'ping' && !i.dead,
  );
  const byDay = new Map<string, Extract<OutboxItem, { kind: 'ping' }>[]>();
  for (const ping of pings) {
    const list = byDay.get(ping.payload.workDayId) ?? [];
    list.push(ping);
    byDay.set(ping.payload.workDayId, list);
  }

  for (const item of items) {
    if (item.dead || item.kind === 'ping') continue;
    if (item.kind === 'visit') await handle(item, () => sendVisit(item));
    else if (item.kind === 'expense') await handle(item, () => sendExpense(item));
    else await handle(item, () => api.post('/field/leads', item.payload).then(() => true));
  }

  for (const batch of byDay.values()) {
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200);
      try {
        await sendPings(chunk);
        await Promise.all(chunk.map((p) => deleteOutbox(p.id)));
      } catch (err) {
        if (isNetworkError(err)) throw new StopSync();
        // A locked or unknown day will never accept these; drop them.
        if (isPermanent(err)) await Promise.all(chunk.map((p) => deleteOutbox(p.id)));
      }
    }
  }
}

let inFlight: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    publish({ syncing: true });
    deliveredThisRun = false;
    try {
      await runOnce();
      publish({ lastSyncedAt: new Date().toISOString() });
    } catch (err) {
      if (!(err instanceof StopSync)) console.error('Outbox sync failed', err);
    } finally {
      await reload();
      publish({
        syncing: false,
        ...(deliveredThisRun ? { lastDeliveredAt: new Date().toISOString() } : {}),
      });
      inFlight = null;
    }
  })();
  return inFlight;
}

let started = false;

/** Starts background syncing once per page load: on reconnect and every 30 s. */
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  publish({ online: navigator.onLine });
  window.addEventListener('online', () => {
    publish({ online: true });
    void syncNow();
  });
  window.addEventListener('offline', () => publish({ online: false }));
  window.setInterval(() => {
    if (navigator.onLine) void syncNow();
  }, 30_000);
  void reload().then(() => syncNow());
}
