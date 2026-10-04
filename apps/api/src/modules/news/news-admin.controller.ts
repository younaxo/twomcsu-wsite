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
import { CreateNewsDto } from './dto/create-news.dto';
import { ListAdminNewsQueryDto } from './dto/list-admin-news-query.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsAdminService } from './news-admin.service';

@Controller('admin/news')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NewsAdminController {
  constructor(private readonly admin: NewsAdminService) {}

  @Get()
  @RequirePermissions('news.view')
  async list(@Query() query: ListAdminNewsQueryDto) {
    return this.admin.listAdmin(query);
  }

  @Get('stats')
  @RequirePermissions('news.view')
  async stats() {
    return this.admin.stats();
  }

  @Get(':id')
  @RequirePermissions('news.view')
  async getById(@Param('id') id: string) {
    return this.admin.getAdminById(id);
  }

  @Post()
  @RequirePermissions('news.create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNewsDto,
  ) {
    return this.admin.create(user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('news.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateNewsDto) {
    return this.admin.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('news.delete')
  async remove(@Param('id') id: string) {
    await this.admin.archive(id);
    return { success: true };
  }

  @Post(':id/pin')
  @RequirePermissions('news.pin')
  async pin(@Param('id') id: string) {
    return this.admin.setPinned(id, true);
  }

  @Post(':id/unpin')
  @RequirePermissions('news.pin')
  async unpin(@Param('id') id: string) {
    return this.admin.setPinned(id, false);
  }

  @Post(':id/feature')
  @RequirePermissions('news.feature')
  async feature(@Param('id') id: string) {
    return this.admin.setFeatured(id, true);
  }

  @Post(':id/unfeature')
  @RequirePermissions('news.feature')
  async unfeature(@Param('id') id: string) {
    return this.admin.setFeatured(id, false);
  }
}
