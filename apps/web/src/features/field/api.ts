import type { BeatInput } from '@juma/shared';
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CurrentWorkDay,
  EndWorkDayInput,
  FieldBootstrap,
  PresignedUpload,
  StartWorkDayInput,
  VisitListItem,
  WorkDaySummary,
} from '@juma/shared';
import { api, ApiRequestError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { readCache, writeCache } from './offline/db';

/** Past this, a read on a weak connection gives way to the phone's copy. */
const READ_TIMEOUT_MS = 8_000;

class ReadTimeout extends Error {}

/**
 * Network first, phone copy second. A successful read refreshes the copy; a
 * failed or slow one (no signal, a 3G stall) serves it, so the field app keeps
 * working offline. Server errors (4xx/5xx) are real answers and are not
 * papered over. With the device reporting no connection, skip the wait.
 */
export async function withOfflineCopy<T extends object>(
  key: string,
  load: () => Promise<T>,
): Promise<T & { fromCache?: boolean }> {
  const fromCopy = async (cause: unknown) => {
    const cached = await readCache<T>(key);
    if (cached === undefined) throw cause;
    return { ...cached, fromCache: true };
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fromCopy(new Error('Offline and nothing saved on this phone yet'));
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fresh: T = await Promise.race([
      load(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ReadTimeout('Network too slow')), READ_TIMEOUT_MS);
      }),
    ]);
    await writeCache(key, fresh);
    return fresh as T & { fromCache?: boolean };
  } catch (err) {
    if (err instanceof ApiRequestError) throw err;
    return fromCopy(err);
  } finally {
    clearTimeout(timer);
  }
}

export const fieldKeys = {
  bootstrap: ['field', 'bootstrap'] as const,
  current: ['field', 'current'] as const,
  visits: (date: string) => ['field', 'visits', date] as const,
  storage: ['field', 'storage'] as const,
};

export function useFieldBootstrap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: fieldKeys.bootstrap,
    queryFn: () =>
      withOfflineCopy(
        `bootstrap:${user?.id}`,
        async () => (await api.get<FieldBootstrap>('/field/bootstrap')).data,
      ),
    enabled: Boolean(user),
    staleTime: 10 * 60_000,
  });
}

export function useCurrentDay() {
  const { user } = useAuth();
  return useQuery({
    queryKey: fieldKeys.current,
    queryFn: () =>
      withOfflineCopy(
        `current:${user?.id}`,
        async () => (await api.get<CurrentWorkDay>('/workdays/current')).data,
      ),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
}

export function useVisits(date: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: fieldKeys.visits(date),
    queryFn: () =>
      withOfflineCopy(`visits:${user?.id}:${date}`, async () => ({
        items: (await api.get<VisitListItem[]>('/visits', { query: { date } })).data,
      })),
    enabled: Boolean(user),
  });
}

export function useStorageStatus() {
  return useQuery({
    queryKey: fieldKeys.storage,
    queryFn: async () => (await api.get<{ configured: boolean }>('/uploads/status')).data,
    staleTime: 5 * 60_000,
  });
}

export function useAddBeatStop(beatId?: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (retailerId: string) =>
      (
        await api.post<FieldBootstrap['beats'][number]>(`/field/beats/${beatId}/stops`, {
          retailerId,
        })
      ).data,
    onSuccess: (updatedBeat) => {
      qc.setQueryData<FieldBootstrap & { fromCache?: boolean }>(fieldKeys.bootstrap, (prev) => {
        if (!prev) return prev;
        const updatedBeats = prev.beats.map((b) => (b.id === updatedBeat.id ? updatedBeat : b));
        const next = { ...prev, beats: updatedBeats };
        if (user?.id) void writeCache(`bootstrap:${user.id}`, next);
        return next;
      });
    },
  });
}

export function useCreateBeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BeatInput) => (await api.post('/field/beats', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldKeys.bootstrap }),
  });
}

function useInvalidateDay() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: fieldKeys.current });
    void qc.invalidateQueries({ queryKey: ['field', 'visits'] });
    // End Day drafts TA/DA; Submit moves the claims along with the day.
    void qc.invalidateQueries({ queryKey: ['expenses'] });
  };
}

export function useStartDay() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: async (input: StartWorkDayInput) =>
      (await api.post<WorkDaySummary>('/workdays/start', input)).data,
    onSuccess: invalidate,
  });
}

export function useEndDay() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: EndWorkDayInput }) =>
      (await api.post<WorkDaySummary>(`/workdays/${id}/end`, input)).data,
    onSuccess: invalidate,
  });
}

export function useSubmitDay() {
  const invalidate = useInvalidateDay();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<WorkDaySummary>(`/workdays/${id}/submit`)).data,
    onSuccess: invalidate,
  });
}

/**
 * Uploads one photo straight away (used for odometer photos, which travel with
 * Start/End Day and therefore need signal anyway). Returns the storage path.
 */
export async function uploadNow(kind: 'odometer', key: string, blob: Blob): Promise<string> {
  const { data } = await api.post<PresignedUpload>('/uploads/presign', { kind, key });
  const res = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': blob.type || 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  if (!res.ok) throw new Error('Photo upload failed');
  return data.path;
}

/** Today's date in IST as `YYYY-MM-DD`, matching the server's day boundary. */
export const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
