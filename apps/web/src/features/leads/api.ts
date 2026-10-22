import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeLeadStageInput,
  ConvertLeadInput,
  CreateLeadActivityInput,
  CreateLeadInput,
  LeadConversionResult,
  LeadDetail,
  LeadFunnel,
  LeadListItem,
  LeadPipeline,
  LeadSource,
  LeadStage,
  LeadType,
  UpdateLeadInput,
  UserListItem,
} from '@juma/shared';
import { api } from '@/lib/api-client';

export interface LeadFilters {
  page?: number;
  search?: string;
  type?: LeadType | 'ALL';
  stage?: LeadStage | 'ALL';
  districtId?: string | 'ALL';
  assignedToId?: string | 'ALL';
  source?: LeadSource | 'ALL';
  overdue?: boolean;
  openOnly?: boolean;
}

const clean = (value: string | undefined) => (value === 'ALL' ? undefined : value);

function toQuery(filters: LeadFilters) {
  return {
    page: filters.page,
    limit: filters.page ? 25 : undefined,
    search: filters.search,
    type: clean(filters.type),
    stage: clean(filters.stage),
    districtId: clean(filters.districtId),
    assignedToId: clean(filters.assignedToId),
    source: clean(filters.source),
    overdue: filters.overdue ? 'true' : undefined,
    openOnly: filters.openOnly ? 'true' : undefined,
  };
}

export function useLeadPipeline(filters: LeadFilters, enabled = true) {
  return useQuery({
    queryKey: ['leads', 'pipeline', filters],
    queryFn: async () =>
      (await api.get<LeadPipeline>('/leads/pipeline', { query: toQuery(filters) })).data,
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useLeadsList(filters: LeadFilters, enabled = true) {
  return useQuery({
    queryKey: ['leads', 'list', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<LeadListItem[]>('/leads', { query: toQuery(filters) });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useLeadFunnel(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: ['leads', 'funnel', filters],
    queryFn: async () =>
      (await api.get<LeadFunnel>('/leads/funnel', { query: toQuery(filters) })).data,
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: ['leads', 'detail', id],
    queryFn: async () => (await api.get<LeadDetail>(`/leads/${id}`)).data,
    enabled: Boolean(id),
  });
}

/** Leads feed coverage, so a write refreshes the map and district data too. */
function useInvalidateLeads() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['leads'] });
    void queryClient.invalidateQueries({ queryKey: ['districts'] });
    void queryClient.invalidateQueries({ queryKey: ['geo'] });
  };
}

export function useSaveLead() {
  const invalidate = useInvalidateLeads();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateLeadInput | UpdateLeadInput }) =>
      id
        ? (await api.patch<LeadDetail>(`/leads/${id}`, input)).data
        : (await api.post<LeadDetail>('/leads', input)).data,
    onSuccess: invalidate,
  });
}

export function useChangeLeadStage() {
  const invalidate = useInvalidateLeads();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ChangeLeadStageInput }) =>
      (await api.post<LeadDetail>(`/leads/${id}/stage`, input)).data,
    onSuccess: invalidate,
  });
}

export function useAddLeadActivity() {
  const invalidate = useInvalidateLeads();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreateLeadActivityInput }) =>
      (await api.post<LeadDetail>(`/leads/${id}/activities`, input)).data,
    onSuccess: invalidate,
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ConvertLeadInput }) =>
      (await api.post<LeadConversionResult>(`/leads/${id}/convert`, input)).data,
    // A conversion creates a partner, so partners and coverage both move.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useDeleteLead() {
  const invalidate = useInvalidateLeads();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/leads/${id}`),
    onSuccess: invalidate,
  });
}

/** Active salesmen, for the "assigned to" picker and filter. */
export function useSalesmenOptions() {
  return useQuery({
    queryKey: ['users', 'salesmen-options'],
    queryFn: async () =>
      (await api.get<UserListItem[]>('/users', { query: { limit: 100, isActive: 'true' } })).data ??
      [],
    staleTime: 5 * 60 * 1000,
  });
}
