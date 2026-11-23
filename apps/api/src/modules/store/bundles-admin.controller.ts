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
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { ListAdminBundlesQueryDto } from './dto/list-admin-bundles-query.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

@Controller('admin/store/bundles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BundlesAdminController {
  constructor(private readonly bundles: BundlesService) {}

  /// Все наборы, включая выключенные и просроченные (публичный список их скрывает).
  @Get()
  @RequirePermissions('store.bundles.view')
  async listAdmin(@Query() query: ListAdminBundlesQueryDto) {
    return this.bundles.listAdmin(query);
  }

  @Post()
  @RequirePermissions('store.bundles.create')
  async create(@Body() dto: CreateBundleDto) {
    return this.bundles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('store.bundles.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateBundleDto) {
    return this.bundles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('store.bundles.delete')
  async remove(@Param('id') id: string) {
    await this.bundles.remove(id);
    return { success: true };
  }
}
