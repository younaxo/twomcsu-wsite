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
import { CreateVoteSiteDto } from './dto/create-vote-site.dto';
import { UpdateVoteSiteDto } from './dto/update-vote-site.dto';
import { VotingAdminService } from './voting-admin.service';

@Controller('admin/voting/sites')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VotingAdminController {
  constructor(private readonly admin: VotingAdminService) {}

  @Get()
  @RequirePermissions('voting.sites.view')
  async list() {
    return this.admin.list();
  }

  @Post()
  @RequirePermissions('voting.sites.create')
  async create(@Body() dto: CreateVoteSiteDto) {
    return this.admin.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('voting.sites.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateVoteSiteDto) {
    return this.admin.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('voting.sites.delete')
  async remove(@Param('id') id: string) {
    await this.admin.remove(id);
    return { success: true };
  }

  @Post(':id/rotate-secret')
  @RequirePermissions('voting.sites.rotate_secret')
  async rotateSecret(@Param('id') id: string) {
    return this.admin.rotateSecret(id);
  }
}
