import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('store')
@Controller('store/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list() {
    return this.categories.listTree();
  }
}
