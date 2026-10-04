import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { ListAdminEventsQueryDto } from './dto/list-admin-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsAdminService } from './events-admin.service';

@Controller('admin/events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventsAdminController {
  constructor(private readonly admin: EventsAdminService) {}

  @Get()
  @RequirePermissions('events.view')
  async list(@Query() query: ListAdminEventsQueryDto) {
    return this.admin.list(query);
  }

  @Post()
  @RequirePermissions('events.create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.admin.create(user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('events.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.admin.update(id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions('events.publish')
  async publish(@Param('id') id: string) {
    return this.admin.setStatus(id, 'PUBLISHED');
  }

  @Post(':id/cancel')
  @RequirePermissions('events.cancel')
  async cancel(@Param('id') id: string) {
    return this.admin.setStatus(id, 'CANCELLED');
  }

  @Delete(':id')
  @RequirePermissions('events.delete')
  async remove(@Param('id') id: string) {
    await this.admin.remove(id);
    return { success: true };
  }
}
