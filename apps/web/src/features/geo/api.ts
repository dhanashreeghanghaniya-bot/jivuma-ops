import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTownInput,
  DistrictListItem,
  DistrictSummary,
  DistrictsMapResponse,
  MapMarkersResponse,
  TownListItem,
  UpdateDistrictInput,
  UpdateTownInput,
} from '@juma/shared';
import { api } from '@/lib/api-client';

/** Optional IST date window (`YYYY-MM-DD`); defaults to the current month on the API. */
export interface PeriodRange {
  from?: string;
  to?: string;
}

export function useDistrictsMap(period: PeriodRange = {}) {
  return useQuery({
    queryKey: ['districts', 'map', period],
    queryFn: async () =>
      (await api.get<DistrictsMapResponse>('/geo/districts/map', { query: { ...period } })).data,
    // The map is the landing screen; keep it warm so navigating back is instant.
    staleTime: 60 * 1000,
  });
}

export function useMapMarkers(enabled = true) {
  return useQuery({
    queryKey: ['geo', 'markers'],
    queryFn: async () => (await api.get<MapMarkersResponse>('/geo/markers')).data,
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useDistrictSummary(districtId: string | null, period: PeriodRange = {}) {
  return useQuery({
    queryKey: ['districts', districtId, 'summary', period],
    queryFn: async () =>
      (await api.get<DistrictSummary>(`/geo/districts/${districtId}/summary`, { query: { ...period } }))
        .data,
    enabled: Boolean(districtId),
  });
}

/**
 * All 33 districts in one cached call. They are fixed reference data, so every
 * screen shares this query and filters in memory rather than refetching.
 */
export function useDistricts() {
  return useQuery({
    queryKey: ['districts', 'list'],
    queryFn: async () => (await api.get<DistrictListItem[]>('/geo/districts')).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
}

export interface TownsFilters {
  page: number;
  search?: string;
  districtId?: string | 'ALL';
  type?: string;
}

export function useTownsList(filters: TownsFilters) {
  return useQuery({
    queryKey: ['towns', 'list', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<TownListItem[]>('/geo/towns', {
        query: {
          page: filters.page,
          limit: 25,
          search: filters.search,
          districtId: filters.districtId === 'ALL' ? undefined : filters.districtId,
          type: filters.type === 'ALL' ? undefined : filters.type,
        },
      });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
  });
}

function useInvalidateGeo() {
  const queryClient = useQueryClient();
  // Towns and districts both feed coverage, so refresh the map alongside them.
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['towns'] });
    void queryClient.invalidateQueries({ queryKey: ['districts'] });
    void queryClient.invalidateQueries({ queryKey: ['geo'] });
  };
}

export function useCreateTown() {
  const invalidate = useInvalidateGeo();
  return useMutation({
    mutationFn: async (input: CreateTownInput) =>
      (await api.post<TownListItem>('/geo/towns', input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateTown() {
  const invalidate = useInvalidateGeo();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTownInput }) =>
      (await api.patch<TownListItem>(`/geo/towns/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteTown() {
  const invalidate = useInvalidateGeo();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/geo/towns/${id}`),
    onSuccess: invalidate,
  });
}

export function useUpdateDistrict() {
  const invalidate = useInvalidateGeo();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateDistrictInput }) =>
      (await api.patch<DistrictListItem>(`/geo/districts/${id}`, input)).data,
    onSuccess: invalidate,
  });
}
