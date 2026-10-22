/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The service worker only makes the app shell available offline (SPEC 5.3).
 * It never touches API or Supabase traffic: those requests match no route
 * below, so they go straight to the network as if there were no worker.
 * Responses carry one salesman's data; the field app keeps its own offline
 * copy and outbox in IndexedDB, which it wipes on logout. A shared HTTP cache
 * could not be.
 *
 * Serwist's defaults include two catch-alls that would cache those requests
 * ("apis" for same-origin /api, "cross-origin" for everything else); both are
 * dropped. The rest only match same-origin pages and static assets.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache.filter((entry) => {
    const name = (entry.handler as { cacheName?: string }).cacheName;
    return name !== 'cross-origin' && name !== 'apis';
  }),
});

serwist.addEventListeners();
