'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';
import type { StoreProduct } from '@/lib/store/catalog';

/// Избранное (`/shop/wishlist`): `GET/PATCH /store/wishlist`,
/// `DELETE /store/wishlist/items/:productId`. Только свой список; товары
/// приходят в публичной форме (без служебных полей).

export interface WishlistItem {
  id: string;
  productId: string;
  product: StoreProduct;
}

export interface WishlistDto {
  id: string;
  isPublic: boolean;
  items: WishlistItem[];
}

export const wishlistKey = ['store', 'wishlist'] as const;

export function useWishlist() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: wishlistKey,
    queryFn: () => api.get<WishlistDto>('/store/wishlist'),
    enabled: authenticated,
  });
}

export function useWishlistMutations() {
  const client = useQueryClient();
  const apply = (data: WishlistDto) => client.setQueryData(wishlistKey, data);
  const remove = useMutation({
    mutationFn: (productId: string) =>
      api.delete<WishlistDto>(`/store/wishlist/items/${encodeURIComponent(productId)}`),
    onSuccess: apply,
  });
  const visibility = useMutation({
    mutationFn: (isPublic: boolean) => api.patch<WishlistDto>('/store/wishlist', { isPublic }),
    onSuccess: apply,
  });
  return { remove, visibility };
}
