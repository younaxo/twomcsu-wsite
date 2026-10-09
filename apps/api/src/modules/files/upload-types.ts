/// Типы загрузок (ADR-0008, docs/technical/26-CDN-FILES.md §B). Клиент
/// передаёт только `uploadType`; префикс ключа, обработка и лимит — здесь.
/// Произвольный путь от клиента не принимается никогда.

export const UPLOAD_TYPES = [
  'avatar',
  'banner',
  'news_cover',
  'news_attachment',
  'product_image',
  'category_image',
  'bundle_image',
  'server_icon',
  'achievement_icon',
  'award_icon',
  'badge_icon',
  'decoration',
  'event_cover',
  'emoji',
  'topic_attachment',
  'report_attachment',
  'form_upload',
  'message_attachment',
  'chat_attachment',
  'system',
] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export interface ImagePreset {
  width: number;
  height?: number;
  /// cover — обрезать до пропорции; inside — вписать без обрезки.
  fit: 'cover' | 'inside';
  quality: number;
}

export interface UploadPreset {
  /// Префикс ключа; {userId} / {ownerId} подставляются сервером.
  keyPrefix: string;
  maxBytes: number;
  /// Разрешённые MIME по magic bytes (не по заголовку клиента).
  mimes: readonly string[];
  /// Для изображений — пресет обработки (AVIF). Без него файл хранится как есть.
  image?: ImagePreset;
  /// Permission, нужный для загрузки (undefined — любой авторизованный пользователь).
  permission?: string;
  /// Разрешить анонимную загрузку (формы для гостей).
  allowAnonymous?: boolean;
}

const MB = 1024 * 1024;
const IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;
const DOCUMENT_MIMES = [
  ...IMAGE_MIMES,
  'application/pdf',
  'application/zip',
  'text/plain',
] as const;

export const UPLOAD_PRESETS: Record<UploadType, UploadPreset> = {
  avatar: {
    keyPrefix: 'users/{userId}/avatar',
    maxBytes: 5 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 512, height: 512, fit: 'cover', quality: 60 },
  },
  banner: {
    keyPrefix: 'users/{userId}/banner',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 1920, height: 480, fit: 'cover', quality: 58 },
  },
  news_cover: {
    keyPrefix: 'news/covers',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 1600, height: 900, fit: 'cover', quality: 58 },
    permission: 'news.create',
  },
  news_attachment: {
    keyPrefix: 'news/attachments',
    maxBytes: 20 * MB,
    mimes: DOCUMENT_MIMES,
    permission: 'news.create',
  },
  product_image: {
    keyPrefix: 'store/products',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 800, height: 800, fit: 'cover', quality: 60 },
    permission: 'store.products.edit',
  },
  category_image: {
    keyPrefix: 'store/categories',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 800, height: 800, fit: 'cover', quality: 60 },
    permission: 'store.categories.edit',
  },
  bundle_image: {
    keyPrefix: 'store/bundles',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 800, height: 800, fit: 'cover', quality: 60 },
    permission: 'store.bundles.edit',
  },
  server_icon: {
    keyPrefix: 'servers/icons',
    maxBytes: 2 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 256, height: 256, fit: 'cover', quality: 65 },
    permission: 'servers.edit',
  },
  achievement_icon: {
    keyPrefix: 'achievements',
    maxBytes: 2 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 256, height: 256, fit: 'cover', quality: 65 },
    permission: 'achievements.edit',
  },
  award_icon: {
    keyPrefix: 'awards',
    maxBytes: 2 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 256, height: 256, fit: 'cover', quality: 65 },
    permission: 'awards.edit',
  },
  badge_icon: {
    keyPrefix: 'badges',
    maxBytes: 2 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 256, height: 256, fit: 'cover', quality: 65 },
    permission: 'awards.edit',
  },
  decoration: {
    keyPrefix: 'decorations',
    maxBytes: 2 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 512, height: 512, fit: 'inside', quality: 65 },
    permission: 'awards.edit',
  },
  event_cover: {
    keyPrefix: 'events',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 1600, height: 900, fit: 'cover', quality: 58 },
    permission: 'events.edit',
  },
  emoji: {
    keyPrefix: 'emojis',
    maxBytes: 1 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 128, height: 128, fit: 'inside', quality: 70 },
    permission: 'chat.channels.edit',
  },
  topic_attachment: {
    keyPrefix: 'topics/{ownerId}',
    maxBytes: 20 * MB,
    mimes: DOCUMENT_MIMES,
    permission: 'topics.edit',
  },
  report_attachment: {
    keyPrefix: 'reports/{ownerId}',
    maxBytes: 10 * MB,
    mimes: DOCUMENT_MIMES,
  },
  form_upload: {
    keyPrefix: 'forms/{ownerId}/uploads',
    maxBytes: 10 * MB,
    mimes: DOCUMENT_MIMES,
    allowAnonymous: true,
  },
  message_attachment: {
    keyPrefix: 'messages/{ownerId}',
    maxBytes: 10 * MB,
    mimes: DOCUMENT_MIMES,
  },
  chat_attachment: {
    keyPrefix: 'chat/attachments',
    maxBytes: 10 * MB,
    mimes: IMAGE_MIMES,
    image: { width: 1600, fit: 'inside', quality: 58 },
  },
  system: {
    keyPrefix: 'system',
    maxBytes: 20 * MB,
    mimes: DOCUMENT_MIMES,
    permission: 'settings.site.edit',
  },
};

export function isUploadType(value: string): value is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(value);
}

/// Расширение по MIME — только из allowlist, никогда из имени файла клиента.
export const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
};
