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
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

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
  async create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('store.products.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('store.products.delete')
  async remove(@Param('id') id: string) {
    await this.products.remove(id);
    return { success: true };
  }

  @Post(':id/variants')
  @RequirePermissions('store.products.variants')
  async createVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.products.createVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  @RequirePermissions('store.products.variants')
  async updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @RequirePermissions('store.products.variants')
  async removeVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    await this.products.removeVariant(id, variantId);
    return { success: true };
  }
}
