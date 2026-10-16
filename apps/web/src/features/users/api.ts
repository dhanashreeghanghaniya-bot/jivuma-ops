import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, Role, UpdateUserInput, UserListItem } from '@juma/shared';
import { api } from '@/lib/api-client';

export interface UsersFilters {
  page: number;
  search?: string;
  role?: Role | 'ALL';
  isActive?: 'true' | 'false' | 'ALL';
}

export interface TownOption {
  id: string;
  name: string;
  type: string;
  district: { id: string; name: string; code: string };
}

const usersKey = (filters: UsersFilters) => ['users', filters] as const;

export function useUsers(filters: UsersFilters) {
  return useQuery({
    queryKey: usersKey(filters),
    queryFn: async () => {
      const { data, meta } = await api.get<UserListItem[]>('/users', {
        query: {
          page: filters.page,
          limit: 25,
          search: filters.search,
          role: filters.role === 'ALL' ? undefined : filters.role,
          isActive: filters.isActive === 'ALL' ? undefined : filters.isActive,
        },
      });
      return { items: data ?? [], meta };
    },
    placeholderData: (previous) => previous,
  });
}

export function useTowns() {
  return useQuery({
    queryKey: ['towns'],
    queryFn: async () => (await api.get<TownOption[]>('/geo/towns')).data ?? [],
    staleTime: 10 * 60 * 1000,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['users'] });
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (input: CreateUserInput) =>
      (await api.post<UserListItem>('/users', input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateUserInput }) =>
      (await api.patch<UserListItem>(`/users/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/users/${id}/reset-password`, { newPassword }),
  });
}

export function useSetUserActive() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.post<UserListItem>(`/users/${id}/${isActive ? 'activate' : 'deactivate'}`),
    onSuccess: invalidate,
  });
}
