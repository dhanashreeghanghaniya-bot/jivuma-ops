import type { PresignedUpload, UploadKind } from '@juma/shared';
import { env } from '../config/env';
import { toIstDateString } from './dates';
import { ApiException } from './http';
import { logger } from './logger';

/**
 * Supabase Storage over its REST API (SPEC 1: private bucket, signed URLs,
 * service-role key on the server only). Plain fetch keeps the Supabase SDK out
 * of the API; the two calls used here are stable parts of the Storage API.
 */

/** SPEC 8: signed read URLs expire in 5 minutes. */
const READ_URL_TTL_SECONDS = 300;
/** Supabase fixes signed upload URLs at two hours; not configurable. */
const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;

export const isStorageConfigured = () =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_STORAGE_BUCKET);

function config() {
  if (!isStorageConfigured()) {
    throw new ApiException(
      503,
      'INTERNAL_ERROR',
      'Photo storage is not set up yet. Your visit is saved; photos will upload once it is.',
    );
  }
  return {
    base: `${env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1`,
    bucket: env.SUPABASE_STORAGE_BUCKET!,
    key: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

function headers(key: string): Record<string, string> {
  // New-style secret keys (`sb_secret_…`) go in `apikey` only; the gateway
  // swaps them for a service-role token. Legacy JWT keys also need the bearer.
  return key.startsWith('sb_secret_')
    ? { apikey: key, 'content-type': 'application/json' }
    : { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function storageFetch<T>(
  url: string,
  body: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const { key } = config();
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers(key), ...extra },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    logger.error('Supabase Storage request failed', {
      status: res.status,
      path: new URL(url).pathname,
    });
    throw new ApiException(
      502,
      'INTERNAL_ERROR',
      'Photo storage is unavailable. Try again shortly.',
    );
  }
  return (await res.json()) as T;
}

/** `visits/<salesmanId>/<yyyy-mm>/<key>.jpg` — the folder layout from SPEC 1. */
export function objectPath(
  kind: UploadKind,
  ownerId: string,
  key: string,
  at = new Date(),
): string {
  return `${kind}/${ownerId}/${toIstDateString(at).slice(0, 7)}/${key}.jpg`;
}

/** A client may only reference files in its own folder. */
export function assertOwnPath(path: string, kind: UploadKind, ownerId: string): void {
  if (!path.startsWith(`${kind}/${ownerId}/`)) {
    throw ApiException.forbidden('That file does not belong to you');
  }
}

export async function presignUpload(
  kind: UploadKind,
  ownerId: string,
  key: string,
): Promise<PresignedUpload> {
  const { base, bucket } = config();
  const path = objectPath(kind, ownerId, key);
  const signed = await storageFetch<{ url: string }>(
    `${base}/object/upload/sign/${bucket}/${encodePath(path)}`,
    {},
    // A retried upload of the same key overwrites rather than failing.
    { 'x-upsert': 'true' },
  );
  return { path, uploadUrl: `${base}${signed.url}`, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
}

export async function signedReadUrls(paths: string[]): Promise<Record<string, string | null>> {
  const { base, bucket } = config();
  const signed = await storageFetch<
    { path: string | null; signedURL: string | null; error: string | null }[]
  >(`${base}/object/sign/${bucket}`, { expiresIn: READ_URL_TTL_SECONDS, paths });
  const out: Record<string, string | null> = {};
  for (const path of paths) out[path] = null;
  for (const item of signed) {
    if (item.path && item.signedURL) out[item.path] = `${base}${item.signedURL}`;
  }
  return out;
}
