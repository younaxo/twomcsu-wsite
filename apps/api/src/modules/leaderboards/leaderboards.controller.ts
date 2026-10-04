import { Controller, Get } from '@nestjs/common';
import { LeaderboardsService } from './leaderboards.service';

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  @Get()
  async list() {
    return this.leaderboards.list();
  }
}
