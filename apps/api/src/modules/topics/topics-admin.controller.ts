import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateTopicDto } from './dto/create-topic.dto';
import { ReorderTopicsDto } from './dto/reorder-topics.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { TopicsAdminService } from './topics-admin.service';

@Controller('admin/topics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TopicsAdminController {
  constructor(private readonly admin: TopicsAdminService) {}

  @Get()
  @RequirePermissions('topics.view')
  async list() {
    return this.admin.listAdmin();
  }

  @Post('reorder')
  @RequirePermissions('topics.reorder')
  async reorder(@Body() dto: ReorderTopicsDto) {
    await this.admin.reorder(dto);
    return { success: true };
  }

  @Get(':id')
  @RequirePermissions('topics.view')
  async getById(@Param('id') id: string) {
    return this.admin.getAdminById(id);
  }

  @Post()
  @RequirePermissions('topics.create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTopicDto,
  ) {
    return this.admin.create(user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('topics.edit')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.admin.update(id, user.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('topics.delete')
  async remove(@Param('id') id: string) {
    await this.admin.remove(id);
    return { success: true };
  }

  @Post(':id/pin')
  @RequirePermissions('topics.pin')
  async pin(@Param('id') id: string) {
    return this.admin.setPinned(id, true);
  }

  @Post(':id/unpin')
  @RequirePermissions('topics.pin')
  async unpin(@Param('id') id: string) {
    return this.admin.setPinned(id, false);
  }
}
