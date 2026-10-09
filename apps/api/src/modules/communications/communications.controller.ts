import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { PermissionService } from '../roles/permission.service';
import { CommunicationsService } from './communications.service';
import {
  BulkSystemMessageDto,
  BulkSystemMessagePreviewDto,
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
    private readonly permissions: PermissionService,
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
}
