/// Картинка контента (обложка, OG) — только CDN проекта или путь сайта
/// (ADR-0143, события — ADR-0148). Обложки выводит next/image, а он падает на хосте вне
/// remotePatterns (apps/web/next.config.mjs) — чужая ссылка роняла бы блок
/// новостей на главной.
export const SITE_IMAGE_URL =
  /^(https:\/\/cdn-files\.twomc\.su\/\S+|\/(?!\/)\S*)$/;
export const SITE_IMAGE_MESSAGE =
  'Картинка — ссылка на cdn-files.twomc.su или путь сайта (/…)';
