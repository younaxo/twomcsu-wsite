import { Controller, Get, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { FaviconService } from './favicon.service';

/// Иконка сайта для подтверждения внешнего перехода (ADR-0102). Публичный
/// (гость тоже переходит по ссылкам), с ограничением частоты. Ответ — только
/// проверенная картинка: Content-Type по сигнатуре, nosniff, CSP без всего.
@Controller('link-preview')
export class LinkPreviewController {
  constructor(private readonly favicons: FaviconService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('favicon')
  async favicon(@Query('url') url: string | undefined, @Res() res: Response) {
    const icon =
      typeof url === 'string' && url.length <= 2048
        ? await this.favicons.favicon(url)
        : null;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    // helmet ставит CORP same-origin — иконку показывает сайт (другой origin).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (!icon) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', icon.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(icon.body);
  }
}
