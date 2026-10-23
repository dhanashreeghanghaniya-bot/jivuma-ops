import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BeatInput,
  CalendarMonth,
  DayDetail,
  FieldFlag,
  RangeReport,
  SalesmanProfile,
  SalesmanToday,
  TerritoryInput,
} from '@juma/shared';
import { api } from '@/lib/api-client';

export function useTeamToday() {
  return useQuery({
    queryKey: ['sales-team', 'today'],
    queryFn: async () => (await api.get<SalesmanToday[]>('/sales-team/today')).data ?? [],
    // A live view: refresh every minute while it is open.
    refetchInterval: 60_000,
  });
}

export function useFieldFlags(from: string, to: string, salesmanId?: string) {
  return useQuery({
    queryKey: ['sales-team', 'flags', from, to, salesmanId],
    queryFn: async () =>
      (await api.get<FieldFlag[]>('/sales-team/flags', { query: { from, to, salesmanId } })).data ??
      [],
  });
}

export function useSalesmanProfile(id: string) {
  return useQuery({
    queryKey: ['sales-team', 'profile', id],
    queryFn: async () => (await api.get<SalesmanProfile>(`/sales-team/${id}`)).data,
  });
}

export function useCalendar(id: string, month: string) {
  return useQuery({
    queryKey: ['sales-team', 'calendar', id, month],
    queryFn: async () =>
      (await api.get<CalendarMonth>(`/sales-team/${id}/calendar`, { query: { month } })).data,
    placeholderData: (previous) => previous,
  });
}

export function useRange(id: string, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['sales-team', 'range', id, from, to],
    queryFn: async () =>
      (await api.get<RangeReport>(`/sales-team/${id}/range`, { query: { from, to } })).data,
    enabled,
  });
}

export function useDayDetail(workDayId: string) {
  return useQuery({
    queryKey: ['sales-team', 'day', workDayId],
    queryFn: async () => (await api.get<DayDetail>(`/sales-team/days/${workDayId}`)).data,
  });
}

function useSetProfile(id: string) {
  const qc = useQueryClient();
  return (data: SalesmanProfile) => qc.setQueryData(['sales-team', 'profile', id], data);
}

export function useSaveTerritory(id: string) {
  const set = useSetProfile(id);
  return useMutation({
    mutationFn: async (input: TerritoryInput) =>
      (await api.put<SalesmanProfile>(`/sales-team/${id}/territory`, input)).data,
    onSuccess: set,
  });
}

export function useSaveBeat(salesmanId: string) {
  const set = useSetProfile(salesmanId);
  return useMutation({
    mutationFn: async ({ beatId, input }: { beatId?: string; input: BeatInput }) =>
      beatId
        ? (await api.put<SalesmanProfile>(`/sales-team/beats/${beatId}`, input)).data
        : (await api.post<SalesmanProfile>(`/sales-team/${salesmanId}/beats`, input)).data,
    onSuccess: set,
  });
}

export function useRetireBeat(salesmanId: string) {
  const set = useSetProfile(salesmanId);
  return useMutation({
    mutationFn: async (beatId: string) =>
      (await api.delete<SalesmanProfile>(`/sales-team/beats/${beatId}`)).data,
    onSuccess: set,
  });
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
