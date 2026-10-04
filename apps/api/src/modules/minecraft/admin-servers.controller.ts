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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateServerDto } from './dto/create-server.dto';
import { ListServerLogsQueryDto } from './dto/list-server-logs-query.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { ServersService } from './servers.service';

@Controller('admin/servers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  @RequirePermissions('servers.view')
  async list() {
    return this.servers.listAllAdmin();
  }

  @Post()
  @RequirePermissions('servers.create')
  async create(@Body() dto: CreateServerDto) {
    return this.servers.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('servers.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateServerDto) {
    return this.servers.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('servers.delete')
  async remove(@Param('id') id: string) {
    await this.servers.remove(id);
    return { success: true };
  }

  @Get(':id/logs')
  @RequirePermissions('servers.logs')
  async logs(@Param('id') id: string, @Query() query: ListServerLogsQueryDto) {
    return this.servers.logs(id, query);
  }
}
