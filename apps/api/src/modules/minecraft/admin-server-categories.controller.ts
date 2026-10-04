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
import { CreateServerCategoryDto } from './dto/create-server-category.dto';
import { UpdateServerCategoryDto } from './dto/update-server-category.dto';
import { ServerCategoriesService } from './server-categories.service';

@Controller('admin/server-categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminServerCategoriesController {
  constructor(private readonly categories: ServerCategoriesService) {}

  @Get()
  @RequirePermissions('server_categories.view')
  async listAdmin() {
    return this.categories.listAllAdmin();
  }

  @Post()
  @RequirePermissions('server_categories.create')
  async create(@Body() dto: CreateServerCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('server_categories.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateServerCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('server_categories.delete')
  async remove(@Param('id') id: string) {
    await this.categories.remove(id);
    return { success: true };
  }
}
