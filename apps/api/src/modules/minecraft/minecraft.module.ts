import { Module } from '@nestjs/common';
import { AdminServerCategoriesController } from './admin-server-categories.controller';
import { AdminServersController } from './admin-servers.controller';
import { MinecraftStatusService } from './minecraft-status.service';
import { ServerStatusCollector } from './server-status.collector';
import { ServerCategoriesController } from './server-categories.controller';
import { ServerCategoriesService } from './server-categories.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  controllers: [
    ServerCategoriesController,
    AdminServerCategoriesController,
    ServersController,
    AdminServersController,
  ],
  providers: [
    ServerCategoriesService,
    ServersService,
    MinecraftStatusService,
    ServerStatusCollector,
  ],
})
export class MinecraftModule {}
