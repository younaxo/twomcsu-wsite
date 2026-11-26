'use client';

import type { OrderStatus } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Статистика магазина (`/admin/store/stats/*`, `/admin/orders/stats`). У
/// каждого блока свой endpoint и своё право — страница запрашивает только те,
/// что доступны. Суммы приходят Decimal-строками (в JSON), даты — ISO-строками.

export interface StoreStatsOverview {
  totalOrders: number;
  completedOrders: number;
  totalRevenue: string | number;
  activeProducts: number;
}

export interface StoreSalesDay {
  day: string;
  revenue: string | number;
  count: number;
}

export interface StoreSalesCategory {
  category: string;
  revenue: string | number;
}

export interface StoreTopProduct {
  name: string;
  quantity: number;
  revenue: string | number;
}

export interface StoreRevenueWeek {
  week: string;
  revenue: string | number;
}

export interface OrdersStats {
  total: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  totalRevenue: string | number;
}

const keys = {
  overview: ['admin', 'store-stats', 'overview'] as const,
  salesByDay: ['admin', 'store-stats', 'sales-by-day'] as const,
  salesByCategory: ['admin', 'store-stats', 'sales-by-category'] as const,
  topProducts: ['admin', 'store-stats', 'top-products'] as const,
  revenueByWeek: ['admin', 'store-stats', 'revenue-by-week'] as const,
  orders: ['admin', 'store-stats', 'orders'] as const,
};
export const adminStoreStatsKeys = keys;

const BASE = '/admin/store/stats';

export function useStoreStatsOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<StoreStatsOverview>(`${BASE}/overview`),
  });
}

export function useStoreSalesByDay() {
  return useQuery({
    queryKey: keys.salesByDay,
    queryFn: () => api.get<StoreSalesDay[]>(`${BASE}/sales-by-day`),
  });
}

export function useStoreSalesByCategory() {
  return useQuery({
    queryKey: keys.salesByCategory,
    queryFn: () => api.get<StoreSalesCategory[]>(`${BASE}/sales-by-category`),
  });
}

export function useStoreTopProducts() {
  return useQuery({
    queryKey: keys.topProducts,
    queryFn: () => api.get<StoreTopProduct[]>(`${BASE}/top-products`),
  });
}

export function useStoreRevenueByWeek() {
  return useQuery({
    queryKey: keys.revenueByWeek,
    queryFn: () => api.get<StoreRevenueWeek[]>(`${BASE}/revenue-by-week`),
  });
}

export function useOrdersStats() {
  return useQuery({
    queryKey: keys.orders,
    queryFn: () => api.get<OrdersStats>('/admin/orders/stats'),
  });
}

/// Полное окно из `span` дней (UTC): API отдаёт только дни с продажами, дни
/// без продаж — 0 (это отсутствие продаж, а не выдуманные данные).
export function fillSalesDays(rows: StoreSalesDay[], span = 30, now = new Date()) {
  const byDay = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
  return Array.from({ length: span }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (span - 1 - index)),
    );
    const day = date.toISOString().slice(0, 10);
    return { day, revenue: Number(byDay.get(day)?.revenue ?? 0) };
  });
}
