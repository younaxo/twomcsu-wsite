import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GIVEAWAY_CONFIG, GiveawayConfig } from './giveaway.config';
import { ADMIN_IDLE_MS } from './giveaway.constants';
import { AdminRequest, GiveawayAdminGuard } from './giveaway-admin.guard';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import {
  parseCalculate,
  parseDisqualify,
  parseEmpty,
  parseMode,
  parsePage,
  parseQuery,
  parseSettingsPatch,
  parseTestSeed,
  parseTestTicket,
  parseTestTime,
  parseUuid,
} from './giveaway-admin-bodies';
import { GiveawayAdminSettingsService } from './giveaway-admin-settings.service';
import { GiveawayDataService, GiveawayMode } from './giveaway-data.service';
import { GiveawayDrawService } from './giveaway-draw.service';
import { conflict, notFound } from './giveaway-errors';
import { GiveawayPrizesService } from './giveaway-prizes.service';
import { GiveawayTestService } from './giveaway-test.service';

function actorOf(req: AdminRequest): string {
  return (req.giveawayAdmin as { discordId: string }).discordId;
}

/// Админ-API (ADR-G003 п. 5). Все пути под `GiveawayAdminGuard`: сессия,
/// для изменяющих запросов Origin и CSRF. Создания новых розыгрышей нет.
@Controller(['api/giveaway/v1/admin', 'giveaway/v1/admin'])
@UseGuards(GiveawayAdminGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class GiveawayAdminController {
  constructor(
    private readonly auth: GiveawayAdminAuthService,
    private readonly audit: GiveawayAdminAuditService,
    private readonly data: GiveawayDataService,
    private readonly settings: GiveawayAdminSettingsService,
    private readonly prizes: GiveawayPrizesService,
    private readonly draw: GiveawayDrawService,
    private readonly test: GiveawayTestService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  /// Режим из `?mode`; тест - только при включённом флаге.
  private mode(raw: unknown): GiveawayMode {
    const mode = parseMode(raw);
    if (mode === 'test' && !this.config.admin.testModeEnabled) {
      throw notFound('test_mode_disabled');
    }
    return mode;
  }

  private requireTest(): void {
    if (!this.config.admin.testModeEnabled)
      throw notFound('test_mode_disabled');
  }

  @Get('session')
  session(@Req() req: AdminRequest) {
    const p = req.giveawayAdmin as NonNullable<AdminRequest['giveawayAdmin']>;
    return {
      discordId: p.discordId,
      discordName: p.discordName,
      csrfToken: this.auth.csrfFor(req.giveawayAdminToken as string),
      expiresAt: p.expiresAt.toISOString(),
      idleTimeoutS: ADMIN_IDLE_MS / 1000,
      testModeEnabled: this.config.admin.testModeEnabled,
    };
  }

  @Get('tickets')
  tickets(
    @Query('mode') mode?: unknown,
    @Query('q') q?: unknown,
    @Query('page') page?: unknown,
    @Query('pageSize') pageSize?: unknown,
  ) {
    const m = this.mode(mode);
    const p = parsePage(page, pageSize);
    return this.data.tickets(m, parseQuery(q), p.page, p.pageSize);
  }

  @Get('players/:uuid')
  player(@Param('uuid') uuid: string, @Query('mode') mode?: unknown) {
    return this.data.profile(this.mode(mode), parseUuid(uuid));
  }

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  patchSettings(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.settings.patch(parseSettingsPatch(body), actorOf(req));
  }

  /// Картинки призов - из конфига (ADR-G003 п. 5.5, Q97).
  @Get('prize-images')
  images() {
    return {
      items: this.prizes.configList().items.map((p) => p.imageFile as string),
    };
  }

  @Get('prizes')
  listPrizes() {
    return this.prizes.configList();
  }

  /// Админ-CRUD призов отключён: единственный источник - giveaway/config/prizes.json.
  /// Методы GiveawayPrizesService.create/update/remove сохранены, но не вызываются.
  @Post('prizes')
  @HttpCode(200)
  createPrize(): never {
    throw conflict('prizes_config_managed');
  }

  @Patch('prizes/:id')
  updatePrize(): never {
    throw conflict('prizes_config_managed');
  }

  @Delete('prizes/:id')
  deletePrize(): never {
    throw conflict('prizes_config_managed');
  }

  @Get('draw')
  drawState(@Query('mode') mode?: unknown) {
    return this.draw.state(this.mode(mode));
  }

  @Post('draw/freeze')
  @HttpCode(200)
  freeze(
    @Req() req: AdminRequest,
    @Body() body: unknown,
    @Query('mode') mode?: unknown,
  ) {
    parseEmpty(body);
    return this.draw.freeze(this.mode(mode), actorOf(req));
  }

  @Post('draw/calculate')
  @HttpCode(200)
  calculate(
    @Req() req: AdminRequest,
    @Body() body: unknown,
    @Query('mode') mode?: unknown,
  ) {
    const b = parseCalculate(body);
    return this.draw.calculate(
      this.mode(mode),
      b.snapshotHash,
      b.confirm,
      actorOf(req),
    );
  }

  @Post('draw/broadcast')
  @HttpCode(200)
  broadcast(
    @Req() req: AdminRequest,
    @Body() body: unknown,
    @Query('mode') mode?: unknown,
  ) {
    parseEmpty(body);
    return this.draw.broadcast(this.mode(mode), actorOf(req));
  }

  @Post('draw/winners/:id/disqualify')
  @HttpCode(200)
  disqualify(
    @Req() req: AdminRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query('mode') mode?: unknown,
  ) {
    return this.draw.disqualify(
      this.mode(mode),
      id,
      parseDisqualify(body),
      actorOf(req),
    );
  }

  @Post('test/time')
  @HttpCode(200)
  async testTime(@Req() req: AdminRequest, @Body() body: unknown) {
    this.requireTest();
    const b = parseTestTime(body);
    const r = await this.test.grantTime(
      'test',
      b.playerName,
      b.minutes,
      b.day,
      actorOf(req),
    );
    await this.audit.record({
      actor: actorOf(req),
      action: 'test_time',
      objectType: 'test_player',
      objectId: b.playerName,
      mode: 'test',
      detail: `minutes=${b.minutes}`,
    });
    return { playerName: r.playerName, totalMinutes: r.totalMinutes };
  }

  @Post('test/tickets')
  @HttpCode(200)
  async testTicket(@Req() req: AdminRequest, @Body() body: unknown) {
    this.requireTest();
    const name = parseTestTicket(body);
    const r = await this.test.issueTicket(name);
    await this.audit.record({
      actor: actorOf(req),
      action: 'test_ticket',
      objectType: 'test_player',
      objectId: name,
      mode: 'test',
      detail: r.ticket,
    });
    return r;
  }

  @Post('test/seed')
  @HttpCode(200)
  async testSeed(@Req() req: AdminRequest, @Body() body: unknown) {
    this.requireTest();
    const count = parseTestSeed(body);
    const r = await this.test.seed(count, actorOf(req));
    await this.audit.record({
      actor: actorOf(req),
      action: 'test_seed',
      mode: 'test',
      detail: `count=${count} created=${r.created}`,
    });
    return r;
  }

  @Post('test/reset')
  @HttpCode(200)
  async testReset(@Req() req: AdminRequest, @Body() body: unknown) {
    this.requireTest();
    parseEmpty(body);
    await this.test.reset();
    await this.audit.record({
      actor: actorOf(req),
      action: 'test_reset',
      mode: 'test',
    });
    return { reset: true };
  }

  @Get('audit')
  auditList(@Query('page') page?: unknown, @Query('pageSize') size?: unknown) {
    const p = parsePage(page, size);
    return this.audit.list(p.page, p.pageSize);
  }
}
