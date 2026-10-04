import { Controller, Get } from '@nestjs/common';
import { ServerCategoriesService } from './server-categories.service';

@Controller()
export class ServerCategoriesController {
  constructor(private readonly categories: ServerCategoriesService) {}

  @Get('server-categories')
  async list() {
    return this.categories.listActive();
  }
}
