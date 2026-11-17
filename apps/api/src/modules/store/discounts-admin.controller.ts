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
import { CreateBulkDiscountDto } from './dto/create-bulk-discount.dto';
import { CreateLoyaltyDiscountDto } from './dto/create-loyalty-discount.dto';
import { UpdateBulkDiscountDto } from './dto/update-bulk-discount.dto';
import { UpdateLoyaltyDiscountDto } from './dto/update-loyalty-discount.dto';
import { DiscountsService } from './discounts.service';

/// PermissionsGuard применяет и admin-2FA персонала (ADR-0109/0169).
@Controller('admin/store/discounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DiscountsAdminController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get('bulk')
  @RequirePermissions('store.discounts.view')
  async listBulk() {
    return this.discounts.listBulkAdmin();
  }

  @Get('loyalty')
  @RequirePermissions('store.discounts.view')
  async listLoyalty() {
    return this.discounts.listLoyaltyAdmin();
  }

  @Post('bulk')
  @RequirePermissions('store.discounts.bulk.create')
  async createBulk(
    @Body() dto: CreateBulkDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discounts.createBulk(dto, user.id);
  }

  @Patch('bulk/:id')
  @RequirePermissions('store.discounts.bulk.edit')
  async updateBulk(
    @Param('id') id: string,
    @Body() dto: UpdateBulkDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discounts.updateBulk(id, dto, user.id);
  }

  @Delete('bulk/:id')
  @RequirePermissions('store.discounts.bulk.delete')
  async removeBulk(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.discounts.removeBulk(id, user.id);
    return { success: true };
  }

  @Post('loyalty')
  @RequirePermissions('store.discounts.loyalty.create')
  async createLoyalty(
    @Body() dto: CreateLoyaltyDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discounts.createLoyalty(dto, user.id);
  }

  @Patch('loyalty/:id')
  @RequirePermissions('store.discounts.loyalty.edit')
  async updateLoyalty(
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discounts.updateLoyalty(id, dto, user.id);
  }

  @Delete('loyalty/:id')
  @RequirePermissions('store.discounts.loyalty.delete')
  async removeLoyalty(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.discounts.removeLoyalty(id, user.id);
    return { success: true };
  }
}
