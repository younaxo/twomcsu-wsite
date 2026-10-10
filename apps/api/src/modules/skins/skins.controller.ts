import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SiteModule } from '../system/site-module.decorator';
import { SkinsService } from './skins.service';

/// 3D-скин в профиле (ADR-0089): метаданные + сами текстуры (PNG) через сайт.
@SiteModule('profiles')
@Controller('users')
export class SkinsController {
  constructor(private readonly skins: SkinsService) {}

  @Get(':username/skin')
  meta(@Param('username') username: string) {
    return this.skins.meta(username);
  }

  @Get(':username/skin.png')
  async skin(@Param('username') username: string, @Res() res: Response) {
    const skin = await this.skins.getSkin(username);
    if (!skin) throw new NotFoundException('Скин не найден');
    this.sendPng(res, skin.skin);
  }

  @Get(':username/cape.png')
  async cape(@Param('username') username: string, @Res() res: Response) {
    const skin = await this.skins.getSkin(username);
    if (!skin?.cape) throw new NotFoundException('Плаща нет');
    this.sendPng(res, skin.cape);
  }

  /// Текстура для WebGL: сайт — другой origin, поэтому CORP cross-origin
  /// (helmet по умолчанию same-origin); CORS — общий для API (WEB_ORIGIN).
  private sendPng(res: Response, data: Buffer) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(data);
  }
}
