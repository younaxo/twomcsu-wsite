import { Transform } from 'class-transformer';
import { ValidationOptions, ValidateBy } from 'class-validator';

/// Хосты картинок товара — ровно remotePatterns из apps/web/next.config.mjs
/// (next/image падает на хосте вне списка; S2). При расширении списка в
/// next.config синхронно правится и этот список.
export const PRODUCT_IMAGE_HOSTS: readonly string[] = [
  'cdn-files.twomc.su',
  'mc-heads.net',
  'minotar.net',
];

export const PRODUCT_IMAGE_MESSAGE = `Картинка — https-ссылка на один из хостов: ${PRODUCT_IMAGE_HOSTS.join(', ')}`;

/// Только https, без логина/пароля в URL, без нестандартного порта, хост из
/// белого списка. Разбор через URL, а не regex: `https://cdn-files.twomc.su@evil`
/// и `https://cdn-files.twomc.su.evil.com` не проходят.
export function isAllowedProductImageUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    PRODUCT_IMAGE_HOSTS.includes(url.hostname)
  );
}

export function IsProductImageUrl(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isProductImageUrl',
      validator: {
        validate: (value: unknown) => isAllowedProductImageUrl(value),
        defaultMessage: () => PRODUCT_IMAGE_MESSAGE,
      },
    },
    validationOptions,
  );
}

/// Нормализованная форма ссылки (url.href): регистр хоста, дефолтный порт,
/// путь — в одном виде. Невалидное значение возвращается как есть, чтобы
/// его отклонил IsProductImageUrl (с понятным сообщением).
export function normalizeProductImageUrl(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeProductImageUrl(item));
  }
  if (!isAllowedProductImageUrl(value)) {
    return value;
  }
  return new URL(value as string).href;
}

/// Преобразует значение поля DTO в нормализованную ссылку до валидации
/// (ValidationPipe работает с transform: true), так что в БД попадает href.
export function NormalizeProductImageUrl(): PropertyDecorator {
  return Transform(({ value }) => normalizeProductImageUrl(value));
}
