import { Module } from '@nestjs/common';
import { MinecraftLinkController } from './minecraft-link.controller';
import { MinecraftLinkService } from './minecraft-link.service';
import { PluginSignatureGuard } from './plugin-signature.guard';

/// Привязка Minecraft-аккаунта (ADR-0072). Зависит только от Prisma/Config,
/// поэтому AuthModule может импортировать её без циклов.
@Module({
  controllers: [MinecraftLinkController],
  providers: [MinecraftLinkService, PluginSignatureGuard],
  exports: [MinecraftLinkService],
})
export class MinecraftLinkModule {}
