import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  OpenLinkDto,
  PluginConfirmDto,
  PluginSiteConnectDto,
} from './dto/minecraft-link.dto';
import { MinecraftLinkService } from './minecraft-link.service';
import { PluginSignatureGuard } from './plugin-signature.guard';

/// Привязка Minecraft при регистрации (ADR-0072). `plugin/*` — только для
/// Minecraft-плагина (подпись HMAC), `site-connect/open` — страница по ссылке.
@Controller('minecraft')
export class MinecraftLinkController {
  constructor(private readonly link: MinecraftLinkService) {}

  /// `/site-connect` в игре → одноразовая ссылка для чата.
  @UseGuards(PluginSignatureGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('plugin/site-connect')
  @HttpCode(HttpStatus.OK)
  siteConnect(@Body() dto: PluginSiteConnectDto) {
    return this.link.createConnectSession(dto);
  }

  /// `/site-connect <код>` в игре → подтверждение 5-символьного кода.
  /// Ответ — статус и текст для чата (без технических деталей).
  @UseGuards(PluginSignatureGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('plugin/site-connect/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: PluginConfirmDto) {
    return this.link.confirmChallenge(dto);
  }

  /// Страница `/site-connect/<token>` → 15-символьный код.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('site-connect/open')
  @HttpCode(HttpStatus.OK)
  open(@Body() dto: OpenLinkDto) {
    return this.link.openLink(dto.token);
  }
}
