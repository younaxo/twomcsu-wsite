import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrenciesService } from './currencies.service';
import { CurrencyExchangeDto } from './dto/currency-exchange.dto';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('store')
@Controller('store')
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get('currencies')
  async listActive() {
    return this.currencies.listActive();
  }

  @Get('currency-rates')
  async getGameRates() {
    return this.currencies.getGameCurrencyRates();
  }

  @UseGuards(JwtAuthGuard)
  @Post('exchange')
  async exchange(@Body() dto: CurrencyExchangeDto) {
    return this.currencies.exchange(dto);
  }
}
