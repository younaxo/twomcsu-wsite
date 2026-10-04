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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateStreamChannelDto } from './dto/create-stream-channel.dto';
import { UpdateStreamChannelDto } from './dto/update-stream-channel.dto';
import { StreamingAdminService } from './streaming-admin.service';

@Controller('admin/streams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StreamingAdminController {
  constructor(private readonly admin: StreamingAdminService) {}

  @Get()
  @RequirePermissions('streams.view')
  async list() {
    return this.admin.list();
  }

  @Post()
  @RequirePermissions('streams.create')
  async create(@Body() dto: CreateStreamChannelDto) {
    return this.admin.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('streams.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateStreamChannelDto) {
    return this.admin.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('streams.delete')
  async remove(@Param('id') id: string) {
    await this.admin.remove(id);
    return { success: true };
  }

  @Post('refresh')
  @RequirePermissions('streams.refresh')
  async refresh() {
    return this.admin.refresh();
  }
}
