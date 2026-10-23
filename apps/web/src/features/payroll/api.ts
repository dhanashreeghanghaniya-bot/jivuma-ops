import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeReportStatusInput,
  CostReportItem,
  CostReportMonth,
  IncentiveInput,
  IncentiveItem,
  SalaryStructureInput,
  SalaryStructureItem,
  UpdateCostReportInput,
} from '@juma/shared';
import { api } from '@/lib/api-client';

export function useCostReports(month: string) {
  return useQuery({
    queryKey: ['payroll', 'reports', month],
    queryFn: async () =>
      (await api.get<CostReportMonth>('/reports/monthly-cost', { query: { month } })).data,
  });
}

function useSetMonth() {
  const qc = useQueryClient();
  return (data: CostReportMonth) => qc.setQueryData(['payroll', 'reports', data.month], data);
}

export function useGenerateReports() {
  const setMonth = useSetMonth();
  return useMutation({
    mutationFn: async (month: string) =>
      (
        await api.post<CostReportMonth>('/reports/monthly-cost/generate', undefined, {
          query: { month },
        })
      ).data,
    onSuccess: setMonth,
  });
}

export function useUpdateReport() {
  const setMonth = useSetMonth();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateCostReportInput }) =>
      (await api.patch<CostReportMonth>(`/reports/monthly-cost/${id}`, input)).data,
    onSuccess: setMonth,
  });
}

export function useReportStatus() {
  const setMonth = useSetMonth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ChangeReportStatusInput }) =>
      (await api.post<CostReportMonth>(`/reports/monthly-cost/${id}/status`, input)).data,
    onSuccess: (data) => {
      setMonth(data);
      // Incentives lock and unlock with the report.
      void qc.invalidateQueries({ queryKey: ['payroll', 'incentives', data.month] });
    },
  });
}

export function useMyReports() {
  return useQuery({
    queryKey: ['payroll', 'mine'],
    queryFn: async () => (await api.get<CostReportItem[]>('/reports/monthly-cost/mine')).data ?? [],
  });
}

export function useIncentives(month: string) {
  return useQuery({
    queryKey: ['payroll', 'incentives', month],
    queryFn: async () =>
      (await api.get<IncentiveItem[]>('/incentives', { query: { month } })).data ?? [],
  });
}

export function useAddIncentive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IncentiveInput) =>
      (await api.post<IncentiveItem[]>('/incentives', input)).data,
    onSuccess: (data, input) => qc.setQueryData(['payroll', 'incentives', input.month], data),
  });
}

export function useDeleteIncentive(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<IncentiveItem[]>(`/incentives/${id}`)).data,
    onSuccess: (data) => qc.setQueryData(['payroll', 'incentives', month], data),
  });
}

export function useSalaryStructures() {
  return useQuery({
    queryKey: ['payroll', 'salary'],
    queryFn: async () => (await api.get<SalaryStructureItem[]>('/salary-structures')).data ?? [],
  });
}

export function useSaveSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalaryStructureInput) =>
      (await api.put<SalaryStructureItem[]>('/salary-structures', input)).data,
    onSuccess: (data) => qc.setQueryData(['payroll', 'salary'], data),
  });
}

export function useDeleteSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<SalaryStructureItem[]>(`/salary-structures/${id}`)).data,
    onSuccess: (data) => qc.setQueryData(['payroll', 'salary'], data),
  });
}

export const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const istMonth = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7);
