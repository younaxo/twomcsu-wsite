import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminToolsService } from './admin-tools.service';
import { SiteSocialLinksService } from './site-social-links.service';

/// Публичная часть настроек сайта (без секретов и админских полей) —
/// единый источник для shell frontend: название, соцсети, контактный
/// e-mail, флаги модулей. Редактируется в /admin/settings.
@Controller('site')
export class SiteController {
  constructor(
    private readonly tools: AdminToolsService,
    private readonly socialLinks: SiteSocialLinksService,
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('settings')
  async publicSettings() {
    const [s, alert, socialLinks, seasonal] = await Promise.all([
      this.tools.getSiteSettings(),
      this.tools.getPublicSiteAlert(),
      this.socialLinks.listPublic(),
      this.tools.getPublicSeasonal(),
    ]);
    return {
      siteName: s.siteName,
      siteDescription: s.siteDescription,
      siteLogo: s.siteLogo,
      contactEmail: s.contactEmail,
      socialLinks,
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
      alert,
      seasonal,
      updatedAt: s.updatedAt,
    };
  }
}
