import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { DeliveryTemplatesService } from './delivery-templates.service';
import {
  ListDeliveryTemplatesQueryDto,
  PreviewDeliveryTemplateDto,
  SetCommandRootsDto,
  UpsertDeliveryTemplateDto,
} from './dto/delivery-template.dto';

/// Админ-API шаблонов игровых команд (0.11, ADR-0189). Всё — только по праву
/// `store.delivery.templates.manage`; запись требует свежую 2FA (код в теле).
@Controller('admin/store/delivery-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeliveryTemplatesAdminController {
  constructor(private readonly templates: DeliveryTemplatesService) {}

  @Get()
  @RequirePermissions('store.delivery.templates.manage')
  async list(@Query() query: ListDeliveryTemplatesQueryDto) {
    return this.templates.list(query.productId);
  }

  /// Итоговая команда без отправки.
  @Post('preview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequirePermissions('store.delivery.templates.manage')
  preview(@Body() dto: PreviewDeliveryTemplateDto) {
    return this.templates.preview(dto);
  }

  @Get('roots')
  @RequirePermissions('store.delivery.templates.manage')
  async roots() {
    return this.templates.getRoots();
  }

  @Put('roots')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('store.delivery.templates.manage')
  async setRoots(
    @Body() dto: SetCommandRootsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.setRoots(dto, user.id);
  }

  @Put('products/:productId')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('store.delivery.templates.manage')
  async upsert(
    @Param('productId') productId: string,
    @Body() dto: UpsertDeliveryTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.upsert(productId, dto, user.id);
  }
}
