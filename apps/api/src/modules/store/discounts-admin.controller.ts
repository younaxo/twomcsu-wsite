import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateBulkDiscountDto } from './dto/create-bulk-discount.dto';
import { CreateLoyaltyDiscountDto } from './dto/create-loyalty-discount.dto';
import { UpdateBulkDiscountDto } from './dto/update-bulk-discount.dto';
import { UpdateLoyaltyDiscountDto } from './dto/update-loyalty-discount.dto';
import { DiscountsService } from './discounts.service';

@Controller('admin/store/discounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DiscountsAdminController {
  constructor(private readonly discounts: DiscountsService) {}

  @Post('bulk')
  @RequirePermissions('store.discounts.bulk.create')
  async createBulk(@Body() dto: CreateBulkDiscountDto) {
    return this.discounts.createBulk(dto);
  }

  @Patch('bulk/:id')
  @RequirePermissions('store.discounts.bulk.edit')
  async updateBulk(
    @Param('id') id: string,
    @Body() dto: UpdateBulkDiscountDto,
  ) {
    return this.discounts.updateBulk(id, dto);
  }

  @Delete('bulk/:id')
  @RequirePermissions('store.discounts.bulk.delete')
  async removeBulk(@Param('id') id: string) {
    await this.discounts.removeBulk(id);
    return { success: true };
  }

  @Post('loyalty')
  @RequirePermissions('store.discounts.loyalty.create')
  async createLoyalty(@Body() dto: CreateLoyaltyDiscountDto) {
    return this.discounts.createLoyalty(dto);
  }

  @Patch('loyalty/:id')
  @RequirePermissions('store.discounts.loyalty.edit')
  async updateLoyalty(
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyDiscountDto,
  ) {
    return this.discounts.updateLoyalty(id, dto);
  }

  @Delete('loyalty/:id')
  @RequirePermissions('store.discounts.loyalty.delete')
  async removeLoyalty(@Param('id') id: string) {
    await this.discounts.removeLoyalty(id);
    return { success: true };
  }
}
