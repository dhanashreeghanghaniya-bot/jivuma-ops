import type { ApiMeta } from './api';
import type { OrderLevel, OrderStatus, PartyType } from '../enums';

export interface OrderParty {
  type: PartyType;
  /** Null for the company itself. */
  id: string | null;
  name: string;
  town: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  level: OrderLevel;
  status: OrderStatus;
  orderDate: string;
  expectedDelivery: string | null;
  totalAmount: string;
  itemCount: number;
  from: OrderParty;
  to: OrderParty;
  takenBy: { id: string; name: string } | null;
  /** True when the order came from a field visit. */
  fromVisit: boolean;
}

export interface OrderItemDetail {
  id: string;
  product: { id: string; name: string; sku: string; packSize: string; unitsPerCase: number };
  qtyCases: number;
  qtyUnits: number;
  /** Cases × units per case + loose units. */
  totalUnits: number;
  rate: string;
  amount: string;
}

export interface OrderStatusLogItem {
  id: string;
  status: OrderStatus;
  note: string | null;
  at: string;
  by: { id: string; name: string } | null;
}

export interface OrderDetail extends OrderListItem {
  notes: string | null;
  items: OrderItemDetail[];
  timeline: OrderStatusLogItem[];
  visit: { id: string; checkInAt: string; distanceFromShopMeters: number | null } | null;
  /** Statuses an admin may move this order to next. */
  nextStatuses: OrderStatus[];
}

export interface OrderListMeta extends ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Sum of `totalAmount` over every order matching the filters, cancelled excluded. */
  totalValue: string;
}

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  packSize: string;
  unitsPerCase: number;
  mrp: string;
  ssPrice: string;
  distributorPrice: string;
  retailerPrice: string;
  isActive: boolean;
  orderCount: number;
}
