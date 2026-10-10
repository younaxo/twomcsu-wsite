import { Controller, Get, Param, Query } from '@nestjs/common';
import { ServersService } from './servers.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('minecraft')
@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  async list() {
    return this.servers.listActive();
  }

  @Get('overview')
  async overview() {
    return this.servers.getOverview();
  }

  @Get('widget')
  async widget(@Query('slug') slug?: string) {
    return this.servers.widget(slug);
  }

  @Get(':slug')
  async getOne(@Param('slug') slug: string) {
    return this.servers.getBySlug(slug);
  }

  @Get(':slug/status')
  async status(@Param('slug') slug: string) {
    return this.servers.getStatus(slug);
  }

  @Get(':slug/players')
  async players(@Param('slug') slug: string) {
    return this.servers.getPlayers(slug);
  }

  @Get(':slug/history')
  async history(@Param('slug') slug: string) {
    return this.servers.getHistory(slug);
  }
}
