import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeaderboardsService } from './leaderboards.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('leaderboards')
@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  /// Публичные рейтинги (без «Покупок», Q66). Ответ кэшируется на сервере;
  /// лимит — 60 запросов в минуту с адреса (подсеть, как у остальных).
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async list() {
    return this.leaderboards.list();
  }
}
