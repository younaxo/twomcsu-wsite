import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('store/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list() {
    return this.categories.listTree();
  }
}
