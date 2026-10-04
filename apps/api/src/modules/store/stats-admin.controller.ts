import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { StoreStatsService } from './stats.service';

@Controller('admin/store/stats')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StoreStatsAdminController {
  constructor(private readonly stats: StoreStatsService) {}

  @Get()
  @RequirePermissions('store.stats')
  async getAll() {
    return this.stats.getAll();
  }

  @Get('overview')
  @RequirePermissions('store.stats.overview.view')
  async overview() {
    return this.stats.overview();
  }

  @Get('sales-by-day')
  @RequirePermissions('store.stats.sales_by_day.view')
  async salesByDay() {
    return this.stats.salesByDay();
  }

  @Get('sales-by-category')
  @RequirePermissions('store.stats.sales_by_category.view')
  async salesByCategory() {
    return this.stats.salesByCategory();
  }

  @Get('top-products')
  @RequirePermissions('store.stats.top_products.view')
  async topProducts() {
    return this.stats.topProducts();
  }

  @Get('revenue-by-week')
  @RequirePermissions('store.stats.revenue_by_week.view')
  async revenueByWeek() {
    return this.stats.revenueByWeek();
  }
}
