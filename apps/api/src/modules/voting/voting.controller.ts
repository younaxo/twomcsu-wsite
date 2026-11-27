import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { VoteWebhookDto } from './dto/vote-webhook.dto';
import { VotingService } from './voting.service';
import { SiteModule, SkipSiteModule } from '../system/site-module.decorator';

function viewerOf(req: Request): AuthenticatedUser | null {
  return (req as Request & { user?: AuthenticatedUser | null }).user ?? null;
}

@SiteModule('voting')
@Controller('voting')
export class VotingController {
  constructor(private readonly voting: VotingService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async overview(@Req() req: Request) {
    return this.voting.overview(viewerOf(req)?.id ?? null);
  }

  /// Вебхуки сайтов-рейтингов принимаются всегда — голоса не теряются.
  /// Лимит по IP (трекер — IpSubnetThrottlerGuard) срабатывает до проверки
  /// секрета; лимит по slug — в сервисе.
  @SkipSiteModule()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('webhook/:slug')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('slug') slug: string,
    @Body() dto: VoteWebhookDto,
    @Req() req: Request,
  ) {
    return this.voting.processWebhook(slug, dto, req.ip ?? null);
  }
}
