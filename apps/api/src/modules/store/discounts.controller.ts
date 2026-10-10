import { Controller, Get } from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('store')
@Controller('store/discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get('bulk')
  async listBulk() {
    return this.discounts.listBulk();
  }

  @Get('loyalty')
  async listLoyalty() {
    return this.discounts.listLoyalty();
  }
}
