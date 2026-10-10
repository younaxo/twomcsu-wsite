import { Controller, Get } from '@nestjs/common';
import { LeaderboardsService } from './leaderboards.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('leaderboards')
@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  @Get()
  async list() {
    return this.leaderboards.list();
  }
}
