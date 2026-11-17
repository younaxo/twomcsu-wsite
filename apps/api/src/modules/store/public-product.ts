import type { Prisma } from '@prisma/client';

/// Белый список полей товара для публичных и покупательских ответов
/// (каталог, набор, список желаний, заказ). Служебные поля — gameCommands,
/// server, currencyType/currencyAmount, positionId, decorationId, createdAt/
/// updatedAt, order, isActive — сюда НЕ добавлять: они нужны только выдаче
/// и админке. Новые поля модели Product по умолчанию наружу не попадают.
export const PUBLIC_VARIANT_SELECT = {
  id: true,
  duration: true,
  price: true,
  oldPrice: true,
  isActive: true,
} satisfies Prisma.ProductVariantSelect;

export const PUBLIC_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  icon: true,
  image: true,
  parentId: true,
} satisfies Prisma.CategorySelect;

export const PUBLIC_PRODUCT_SCALARS = {
  id: true,
  name: true,
  slug: true,
  description: true,
  fullDescription: true,
  type: true,
  image: true,
  images: true,
  isGiftable: true,
  isSelfOnly: true,
  isUnique: true,
  isSeasonalOnly: true,
  maxPerPurchase: true,
  isFeatured: true,
  isNew: true,
  isPopular: true,
} satisfies Prisma.ProductSelect;

/// Товар с активными вариантами, дешёвые первыми.
export const PUBLIC_PRODUCT_SELECT = {
  ...PUBLIC_PRODUCT_SCALARS,
  category: { select: PUBLIC_CATEGORY_SELECT },
  variants: {
    where: { isActive: true },
    orderBy: { price: 'asc' },
    select: PUBLIC_VARIANT_SELECT,
  },
} satisfies Prisma.ProductSelect;

/// Только для вложений (набор, заказ), где варианты не нужны.
export const PUBLIC_PRODUCT_BRIEF_SELECT =
  PUBLIC_PRODUCT_SCALARS satisfies Prisma.ProductSelect;
