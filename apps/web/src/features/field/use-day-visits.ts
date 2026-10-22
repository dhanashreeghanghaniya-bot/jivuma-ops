'use client';

import { useMemo } from 'react';
import type { VisitOutcome } from '@juma/shared';
import { useVisits } from './api';
import { useOutbox } from './offline/outbox';

export interface DayVisitRow {
  key: string;
  retailerId: string | null;
  shopName: string;
  townName: string;
  outcome: VisitOutcome;
  checkInAt: string;
  orderTotal: string | null;
  orderNumber: string | null;
  photoCount: number;
  isFarFromShop: boolean;
  distanceFromShopMeters: number | null;
  isNewShop: boolean;
  /** Recorded on the phone, not yet on the server. */
  pending: boolean;
  /** Photos still uploading (the visit itself is stored). */
  photosPending: boolean;
  error: string | null;
  dead: boolean;
}

/**
 * One day's visits as the salesman sees them: what the server has, plus what
 * is still in the outbox. A visit moves from one list to the other without
 * appearing twice, matched on its client UUID.
 */
export function useDayVisits(date: string) {
  const query = useVisits(date);
  const { items } = useOutbox();

  const rows = useMemo<DayVisitRow[]>(() => {
    const server = query.data?.items ?? [];
    const queued = items.filter(
      (i): i is Extract<typeof i, { kind: 'visit' }> => i.kind === 'visit',
    );
    const queuedByUuid = new Map(queued.map((q) => [q.payload.clientUuid, q]));

    const fromServer: DayVisitRow[] = server.map((v) => {
      const q = v.clientUuid ? queuedByUuid.get(v.clientUuid) : undefined;
      return {
        key: v.id,
        retailerId: v.shop.id,
        shopName: v.shop.name,
        townName: v.town.name,
        outcome: v.outcome,
        checkInAt: v.checkInAt,
        orderTotal: v.order?.totalAmount ?? null,
        orderNumber: v.order?.orderNumber ?? null,
        photoCount: v.photos.length + (q ? q.photos.filter((p) => !p.path).length : 0),
        isFarFromShop: v.isFarFromShop,
        distanceFromShopMeters: v.distanceFromShopMeters,
        isNewShop: v.shop.isNew,
        pending: false,
        photosPending: Boolean(q && q.photos.length > 0),
        error: q?.error ?? null,
        dead: Boolean(q?.dead),
      };
    });

    const serverUuids = new Set(server.map((v) => v.clientUuid));
    const ist = (iso: string) =>
      new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const fromQueue: DayVisitRow[] = queued
      .filter(
        (q) => !serverUuids.has(q.payload.clientUuid) && ist(q.payload.checkIn.capturedAt) === date,
      )
      .map((q) => ({
        key: q.id,
        retailerId: q.payload.retailerId ?? null,
        shopName: q.summary.shopName,
        townName: q.summary.townName,
        outcome: q.payload.outcome,
        checkInAt: q.payload.checkIn.capturedAt,
        orderTotal: q.summary.orderTotal,
        orderNumber: null,
        photoCount: q.photos.length,
        isFarFromShop: false,
        distanceFromShopMeters: null,
        isNewShop: Boolean(q.payload.newShop),
        pending: !q.visitId,
        photosPending: q.photos.length > 0,
        error: q.error ?? null,
        dead: Boolean(q.dead),
      }));

    return [...fromQueue, ...fromServer].sort((a, b) => b.checkInAt.localeCompare(a.checkInAt));
  }, [query.data, items, date]);

  const totals = useMemo(() => {
    const orders = rows.filter((r) => r.orderTotal !== null);
    return {
      visits: rows.length,
      orders: orders.length,
      orderValue: orders.reduce((sum, r) => sum + Number(r.orderTotal), 0),
      visitedRetailerIds: new Set(rows.map((r) => r.retailerId).filter(Boolean) as string[]),
    };
  }, [rows]);

  return { ...query, rows, totals };
}
