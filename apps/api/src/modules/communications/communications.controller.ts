import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import {
  assertAdmin2fa,
  PermissionsGuard,
} from '../roles/guards/permissions.guard';
import { PermissionService } from '../roles/permission.service';
import { CommunicationsService } from './communications.service';
import { MailingsService } from './mailings.service';
import {
  BulkSystemMessageDto,
  BulkSystemMessagePreviewDto,
  MailingsQueryDto,
  RecipientsQueryDto,
  SendSystemMessageDto,
} from './dto/system-message.dto';

/// Коммуникации от имени сайта (ADR-0080). Аудит — явный, внутри сервиса
/// (заголовок и размер, без полного текста).
@Controller('admin/communications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationsController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly mailings: MailingsService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {}

  /// Поиск получателей — для личного сообщения или для выбора пользователей
  /// массовой рассылки: достаточно любого из двух прав.
  @Get('recipients')
  async recipients(
    @Query() query: RecipientsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const [send, bulk] = await Promise.all([
      this.permissions.hasPermission(actor.id, 'communications.messages.send'),
      this.permissions.hasPermission(actor.id, 'communications.messages.bulk'),
    ]);
    if (!send && !bulk) {
      throw new ForbiddenException('Недостаточно прав');
    }
    // Нет @RequirePermissions (любое из двух прав) — admin-2FA проверяем явно.
    assertAdmin2fa(actor, this.config);
    return this.communications.searchRecipients(query.q);
  }

  @Post('messages')
  @HttpCode(201)
  @SkipAudit()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('communications.messages.send')
  send(
    @Body() dto: SendSystemMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.communications.send(dto, actor.id);
  }

  @Post('messages/bulk/preview')
  @HttpCode(200)
  @SkipAudit()
  @RequirePermissions('communications.messages.bulk')
  previewBulk(@Body() dto: BulkSystemMessagePreviewDto) {
    return this.communications.previewBulk(dto.audience);
  }

  @Post('messages/bulk')
  @HttpCode(201)
  @SkipAudit()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @RequirePermissions('communications.messages.bulk')
  sendBulk(
    @Body() dto: BulkSystemMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.communications.sendBulk(dto, actor.id);
  }

  /// Фоновая рассылка (J-08-4): ставит задание, доставку ведёт воркер.
  @Post('mailings')
  @HttpCode(202)
  @SkipAudit()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @RequirePermissions('communications.messages.bulk')
  enqueueMailing(
    @Body() dto: BulkSystemMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mailings.enqueue(dto, actor.id);
  }

  @Get('mailings')
  @RequirePermissions('communications.messages.bulk')
  listMailings(@Query() query: MailingsQueryDto) {
    return this.mailings.list(query.limit);
  }

  @Get('mailings/:id')
  @RequirePermissions('communications.messages.bulk')
  getMailing(@Param('id') id: string) {
    return this.mailings.get(id);
  }

  @Post('mailings/:id/cancel')
  @HttpCode(200)
  @SkipAudit()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('communications.messages.bulk')
  cancelMailing(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mailings.cancel(id, actor.id);
  }
}
