import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyRateDto } from './dto/create-currency-rate.dto';
import { UpdateCurrencyRateDto } from './dto/update-currency-rate.dto';

@Controller('admin/store/currencies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CurrenciesAdminController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  @RequirePermissions('store.currencies.view')
  async listAdmin() {
    return this.currencies.listAdmin();
  }

  @Post()
  @RequirePermissions('store.currencies.create')
  async create(@Body() dto: CreateCurrencyRateDto) {
    return this.currencies.create(dto);
  }

  @Patch(':currency')
  @RequirePermissions('store.currencies.edit')
  async update(
    @Param('currency') currency: string,
    @Body() dto: UpdateCurrencyRateDto,
  ) {
    return this.currencies.update(currency, dto);
  }
}
