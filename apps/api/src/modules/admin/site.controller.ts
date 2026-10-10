import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SiteStatusService } from '../system/site-status.service';
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
    private readonly siteStatus: SiteStatusService,
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('settings')
  async publicSettings() {
    const [s, alert, socialLinks, seasonal, status] = await Promise.all([
      this.tools.getSiteSettings(),
      this.tools.getPublicSiteAlert(),
      this.socialLinks.listPublic(),
      this.tools.getPublicSeasonal(),
      this.siteStatus.snapshot(),
    ]);
    // Флаги модулей — из реестра модулей (ADR-0082), а не из старых полей.
    const on = (key: string) => !status.disabled.has(key);
    return {
      siteName: s.siteName,
      siteDescription: s.siteDescription,
      siteLogo: s.siteLogo,
      contactEmail: s.contactEmail,
      socialLinks,
      registrationEnabled: s.registrationEnabled,
      modules: {
        chat: on('chat'),
        friends: on('friends'),
        store: on('store'),
        comments: on('comments'),
        news: on('news'),
        reports: on('reports'),
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
