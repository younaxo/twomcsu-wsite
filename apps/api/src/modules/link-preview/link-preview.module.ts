import { Module } from '@nestjs/common';
import { FaviconService } from './favicon.service';
import { LinkPreviewController } from './link-preview.controller';

/// Безопасный предпросмотр внешних ссылок (ADR-0102): пока — иконка сайта.
@Module({
  controllers: [LinkPreviewController],
  providers: [FaviconService],
})
export class LinkPreviewModule {}
