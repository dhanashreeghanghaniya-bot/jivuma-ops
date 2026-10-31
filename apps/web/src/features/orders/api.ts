import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeOrderStatusInput,
  CreateOrderInput,
  UpdateOrderRatesInput,
  CreateProductInput,
  OrderDetail,
  OrderLevel,
  OrderListItem,
  OrderListMeta,
  OrderStatus,
  ProductItem,
} from '@juma/shared';
import { api } from '@/lib/api-client';

export interface OrderFilters {
  page: number;
  limit?: number;
  search?: string;
  level?: OrderLevel;
  status?: OrderStatus;
  superStockistId?: string;
  distributorId?: string;
  retailerId?: string;
  districtId?: string;
  takenBySalesmanId?: string;
  from?: string;
  to?: string;
}

export function useOrders(filters: OrderFilters, enabled = true) {
  return useQuery({
    queryKey: ['orders', 'list', filters],
    queryFn: async () => {
      const { data, meta } = await api.get<OrderListItem[]>('/orders', {
        query: { limit: 25, ...filters },
      });
      return { items: data ?? [], meta: meta as OrderListMeta | null };
    },
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${id}`)).data,
    enabled: Boolean(id),
  });
}

/** Order totals feed the dashboard and district panel, so refresh those too. */
function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['districts'] });
    void queryClient.invalidateQueries({ queryKey: ['geo'] });
  };
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) =>
      (await api.post<OrderDetail>('/orders', input)).data,
    onSuccess: invalidate,
  });
}

export function useChangeOrderStatus() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ChangeOrderStatusInput }) =>
      (await api.post<OrderDetail>(`/orders/${id}/status`, input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateOrderRates() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateOrderRatesInput }) =>
      (await api.post<OrderDetail>(`/orders/${id}/rates`, input)).data,
    onSuccess: invalidate,
  });
}

export function useProducts(includeInactive = false) {
  return useQuery({
    queryKey: ['products', { includeInactive }],
    queryFn: async () =>
      (
        await api.get<ProductItem[]>('/products', {
          query: { includeInactive: includeInactive ? 'true' : undefined },
        })
      ).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CreateProductInput }) =>
      id
        ? (await api.put<ProductItem>(`/products/${id}`, input)).data
        : (await api.post<ProductItem>('/products', input)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}
