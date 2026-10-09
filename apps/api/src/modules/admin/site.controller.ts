import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminToolsService } from './admin-tools.service';

/// Публичная часть настроек сайта (без секретов и админских полей) —
/// единый источник для shell frontend: название, соцсети, контактный
/// e-mail, флаги модулей. Редактируется в /admin/settings.
@Controller('site')
export class SiteController {
  constructor(private readonly tools: AdminToolsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('settings')
  async publicSettings() {
    const s = await this.tools.getSiteSettings();
    return {
      siteName: s.siteName,
      siteDescription: s.siteDescription,
      siteLogo: s.siteLogo,
      contactEmail: s.contactEmail,
      socials: {
        discord: s.discordInvite,
        vk: s.vkGroup,
        telegram: s.telegramChannel,
        youtube: s.youtubeChannel,
      },
      registrationEnabled: s.registrationEnabled,
      modules: {
        chat: s.chatEnabled,
        friends: s.friendsEnabled,
        store: s.storeEnabled,
        comments: s.commentsEnabled,
        news: s.newsEnabled,
        reports: s.reportsEnabled,
      },
      meta: {
        title: s.metaTitle,
        description: s.metaDescription,
        keywords: s.metaKeywords,
      },
      updatedAt: s.updatedAt,
    };
  }
}
