import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllowancePolicyInput,
  AllowancePolicyItem,
  BulkApproveInput,
  ExpenseCategory,
  ExpenseItem,
  ExpenseListResult,
  ExpenseStatus,
  NotificationList,
  ReviewExpenseInput,
  ReviewWorkDayInput,
  WorkDayQueueItem,
  WorkDaySummary,
} from '@juma/shared';
import { api } from '@/lib/api-client';

export interface ExpenseFilters {
  month?: string;
  status?: ExpenseStatus;
  salesmanId?: string;
  category?: ExpenseCategory;
  workDayId?: string;
  flaggedOnly?: boolean;
}

export function useExpenses(filters: ExpenseFilters, enabled = true) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: async () =>
      (
        await api.get<ExpenseListResult>('/expenses', {
          query: { ...filters, flaggedOnly: filters.flaggedOnly ? 'true' : undefined },
        })
      ).data,
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useWorkDayQueue() {
  return useQuery({
    queryKey: ['expenses', 'workday-queue'],
    queryFn: async () => (await api.get<WorkDayQueueItem[]>('/workdays/queue')).data ?? [],
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['expenses'] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useReviewExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ReviewExpenseInput }) =>
      (await api.post<ExpenseItem>(`/expenses/${id}/review`, input)).data,
    onSuccess: invalidate,
  });
}

export function useBulkApprove() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: BulkApproveInput) =>
      (await api.post<{ approved: number; skipped: number }>('/expenses/bulk-approve', input)).data,
    onSuccess: invalidate,
  });
}

export function useReviewWorkDay() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ReviewWorkDayInput }) =>
      (await api.post<WorkDaySummary>(`/workdays/${id}/review`, input)).data,
    onSuccess: invalidate,
  });
}

export function usePolicy() {
  return useQuery({
    queryKey: ['allowance-policy'],
    queryFn: async () =>
      (
        await api.get<{ current: AllowancePolicyItem | null; versions: AllowancePolicyItem[] }>(
          '/settings/allowance-policy',
        )
      ).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSavePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AllowancePolicyInput) =>
      (await api.put('/settings/allowance-policy', input)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['allowance-policy'] }),
  });
}

/** Short-lived (5 min) read links for bill photos; refetched before they expire. */
export function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ['signed-read', paths],
    queryFn: async () =>
      (await api.post<Record<string, string | null>>('/uploads/signed-read', { paths })).data,
    enabled: paths.length > 0,
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<NotificationList>('/notifications')).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | 'all') =>
      (
        await api.post<NotificationList>(
          id === 'all' ? '/notifications/read-all' : `/notifications/${id}/read`,
        )
      ).data,
    onSuccess: (data) => qc.setQueryData(['notifications'], data),
  });
}
