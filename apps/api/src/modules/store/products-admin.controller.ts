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
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

/// PermissionsGuard применяет и admin-2FA персонала (ADR-0109/0169): без
/// включённой 2FA при `requireAdmin2fa` — 403 `admin_2fa_required`.
@Controller('admin/store/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsAdminController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('store.products.view')
  async listAdmin(@Query() query: ListAdminProductsQueryDto) {
    return this.products.listAdmin(query);
  }

  @Post()
  @RequirePermissions('store.products.create')
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('store.products.edit')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, user.id);
  }

  /// `mode`: `deleted` — удалён совсем; `deactivated` — есть заказы, товар
  /// деактивирован вместо удаления.
  @Delete(':id')
  @RequirePermissions('store.products.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { mode } = await this.products.remove(id, user.id);
    return { success: true, mode };
  }

  @Post(':id/variants')
  @RequirePermissions('store.products.variants')
  async createVariant(
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.createVariant(id, dto, user.id);
  }

  @Patch(':id/variants/:variantId')
  @RequirePermissions('store.products.variants')
  async updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.updateVariant(id, variantId, dto, user.id);
  }

  @Delete(':id/variants/:variantId')
  @RequirePermissions('store.products.variants')
  async removeVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { mode } = await this.products.removeVariant(id, variantId, user.id);
    return { success: true, mode };
  }
}
