import { Controller, Get, Param } from '@nestjs/common';
import { BundlesService } from './bundles.service';

@Controller('store/bundles')
export class BundlesController {
  constructor(private readonly bundles: BundlesService) {}

  @Get()
  async list() {
    return this.bundles.list();
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.bundles.getBySlug(slug);
  }
}
