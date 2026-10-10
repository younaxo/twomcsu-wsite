import { Module } from '@nestjs/common';
import { MojangSkinSource, SKIN_SOURCE } from './skin-source';
import { SkinsController } from './skins.controller';
import { SkinsService } from './skins.service';

@Module({
  controllers: [SkinsController],
  providers: [SkinsService, { provide: SKIN_SOURCE, useClass: MojangSkinSource }],
})
export class SkinsModule {}
