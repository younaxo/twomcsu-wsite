import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { DeliveryService } from './delivery.service';
import {
  MarkManualDoneDto,
  RetryDeliveryTaskDto,
} from './dto/delivery-task-actions.dto';
import { ListDeliveryTasksQueryDto } from './dto/list-delivery-tasks-query.dto';

/// Админка выдачи (0.7): права и 2FA персонала — общий PermissionsGuard
/// (по образцу `admin/orders`), аудит ручных действий строгий и в транзакции.
@Controller('admin/delivery/tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeliveryAdminController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  @RequirePermissions('store.delivery.view')
  async list(@Query() query: ListDeliveryTasksQueryDto) {
    return this.delivery.listTasks(query);
  }

  @Get(':id')
  @RequirePermissions('store.delivery.view')
  async card(@Param('id') id: string) {
    return this.delivery.getTask(id);
  }

  @Post(':id/manual-done')
  @HttpCode(200)
  @RequirePermissions('store.delivery.manage')
  async manualDone(
    @Param('id') id: string,
    @Body() dto: MarkManualDoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.delivery.markManualDone(id, user.id, dto.reason);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @RequirePermissions('store.delivery.manage')
  async retry(
    @Param('id') id: string,
    @Body() dto: RetryDeliveryTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.delivery.retryTask(id, user.id, dto);
  }
}
