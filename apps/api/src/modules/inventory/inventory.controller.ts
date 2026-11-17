import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import type {
  InventoryMeResponseDto,
  InventoryPrivacyDto,
} from '@twomc/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { InventoryMeQueryDto } from './dto/inventory-query.dto';
import { UpdateInventoryPrivacyBody } from './dto/update-inventory-privacy.dto';
import { InventoryEnabledGuard } from './inventory-enabled.guard';
import { canonicalJson } from './inventory-normalize';
import { InventoryPrivacyService } from './inventory-privacy.service';
import { InventoryService } from './inventory.service';

/// ETag по телу ответа: любое изменение содержимого, времени, `playerOnline`,
/// `isFresh` или названия сервера меняет тег. Доступ проверяется ДО сравнения
/// `If-None-Match` (ADR-0168, раздел 5.3).
export function etagFor(body: unknown): string {
  const hash = createHash('sha256').update(canonicalJson(body)).digest('hex');
  return `"${hash.slice(0, 32)}"`;
}

export function matchesIfNoneMatch(
  header: string | undefined,
  etag: string,
): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((part) => part.trim().replace(/^W\//, ''))
    .some((candidate) => candidate === etag || candidate === '*');
}

function setPrivateHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('Vary', 'Cookie');
}

/// Свой инвентарь и его приватность (ADR-0168, ADR-0179, срез 2). Чужой
/// инвентарь и админ-маршруты в этот срез не входят.
@Controller('inventory')
@UseGuards(JwtAuthGuard, InventoryEnabledGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly privacy: InventoryPrivacyService,
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('me')
  async getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InventoryMeQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InventoryMeResponseDto | undefined> {
    const body = await this.inventory.getMine(user.id, query.server);
    const etag = etagFor(body);
    setPrivateHeaders(res);
    res.setHeader('ETag', etag);
    if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
      res.status(304);
      return undefined;
    }
    return body;
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('me/privacy')
  async getPrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InventoryPrivacyDto> {
    setPrivateHeaders(res);
    return this.privacy.get(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('me/privacy')
  async updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateInventoryPrivacyBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InventoryPrivacyDto> {
    setPrivateHeaders(res);
    return this.privacy.update(user.id, dto);
  }
}
