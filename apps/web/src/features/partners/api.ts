import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDistributorInput,
  CreateRetailerInput,
  CreateSuperStockistInput,
  DistributorListItem,
  PartnerStatus,
  RetailerListItem,
  SuperStockistListItem,
  UpdateDistributorInput,
  UpdateRetailerInput,
  UpdateSuperStockistInput,
} from '@juma/shared';
import { api } from '@/lib/api-client';

export type PartnerLevel = 'super-stockists' | 'distributors' | 'retailers';

export const PARTNER_PATHS: Record<PartnerLevel, string> = {
  'super-stockists': '/super-stockists',
  distributors: '/distributors',
  retailers: '/retailers',
};

export interface PartnerFilters {
  page: number;
  search?: string;
  districtId?: string;
  townId?: string;
  status?: PartnerStatus | 'ALL';
  /** Distributors only. */
  superStockistId?: string;
  /** Retailers only. */
  distributorId?: string;
  category?: string;
  isVerified?: 'true' | 'false';
}

function toQuery(filters: PartnerFilters) {
  return {
    page: filters.page,
    limit: 25,
    search: filters.search,
    districtId: filters.districtId,
    townId: filters.townId,
    status: filters.status === 'ALL' ? undefined : filters.status,
    superStockistId: filters.superStockistId,
    distributorId: filters.distributorId,
    category: filters.category === 'ALL' ? undefined : filters.category,
    isVerified: filters.isVerified,
  };
}

/** Invalidates partners and everything derived from them (coverage, map, markers). */
function useInvalidatePartners() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['partners'] });
    void queryClient.invalidateQueries({ queryKey: ['districts'] });
    void queryClient.invalidateQueries({ queryKey: ['geo'] });
  };
}

// --- super stockists ---------------------------------------------------------

export function useSuperStockists(filters: PartnerFilters, enabled = true) {
  return useQuery({
    queryKey: ['partners', 'super-stockists', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<SuperStockistListItem[]>('/super-stockists', {
        query: toQuery(filters),
      });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useSuperStockist(id: string | null) {
  return useQuery({
    queryKey: ['partners', 'super-stockists', 'detail', id],
    queryFn: async () => (await api.get<SuperStockistListItem>(`/super-stockists/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useSaveSuperStockist() {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: CreateSuperStockistInput | UpdateSuperStockistInput;
    }) =>
      id
        ? (await api.patch<SuperStockistListItem>(`/super-stockists/${id}`, input)).data
        : (await api.post<SuperStockistListItem>('/super-stockists', input)).data,
    onSuccess: invalidate,
  });
}

// --- distributors ------------------------------------------------------------

export function useDistributors(filters: PartnerFilters, enabled = true) {
  return useQuery({
    queryKey: ['partners', 'distributors', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<DistributorListItem[]>('/distributors', {
        query: toQuery(filters),
      });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useDistributor(id: string | null) {
  return useQuery({
    queryKey: ['partners', 'distributors', 'detail', id],
    queryFn: async () => (await api.get<DistributorListItem>(`/distributors/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useSaveDistributor() {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: CreateDistributorInput | UpdateDistributorInput;
    }) =>
      id
        ? (await api.patch<DistributorListItem>(`/distributors/${id}`, input)).data
        : (await api.post<DistributorListItem>('/distributors', input)).data,
    onSuccess: invalidate,
  });
}

// --- retailers ---------------------------------------------------------------

export function useRetailers(filters: PartnerFilters, enabled = true) {
  return useQuery({
    queryKey: ['partners', 'retailers', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<RetailerListItem[]>('/retailers', {
        query: toQuery(filters),
      });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** Count for the "To verify" tab badge, independent of the active filters. */
export function useUnverifiedRetailerCount() {
  return useQuery({
    queryKey: ['partners', 'retailers', 'unverified-count'],
    queryFn: async () => {
      const { meta } = await api.get<RetailerListItem[]>('/retailers', {
        query: { page: 1, limit: 1, isVerified: 'false' },
      });
      return Number(meta?.total ?? 0);
    },
  });
}

export function useRetailer(id: string | null) {
  return useQuery({
    queryKey: ['partners', 'retailers', 'detail', id],
    queryFn: async () => (await api.get<RetailerListItem>(`/retailers/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useSaveRetailer() {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: CreateRetailerInput | UpdateRetailerInput;
    }) =>
      id
        ? (await api.patch<RetailerListItem>(`/retailers/${id}`, input)).data
        : (await api.post<RetailerListItem>('/retailers', input)).data,
    onSuccess: invalidate,
  });
}

export function useVerifyRetailer() {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<RetailerListItem>(`/retailers/${id}/verify`)).data,
    onSuccess: invalidate,
  });
}

export function useDeletePartner(level: PartnerLevel) {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${PARTNER_PATHS[level]}/${id}`),
    onSuccess: invalidate,
  });
}

// --- pickers -----------------------------------------------------------------

/** Flat lists for the "parent partner" selects on the create/edit forms. */
export function useSuperStockistOptions() {
  return useQuery({
    queryKey: ['partners', 'super-stockists', 'options'],
    queryFn: async () =>
      (await api.get<SuperStockistListItem[]>('/super-stockists', { query: { limit: 100 } })).data ??
      [],
    staleTime: 5 * 60 * 1000,
  });
}

export function useDistributorOptions() {
  return useQuery({
    queryKey: ['partners', 'distributors', 'options'],
    queryFn: async () =>
      (await api.get<DistributorListItem[]>('/distributors', { query: { limit: 200 } })).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
}
