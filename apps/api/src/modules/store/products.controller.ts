import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductsService } from './products.service';

@Controller('store/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async list(@Query() query: ListProductsQueryDto) {
    return this.products.list(query);
  }

  @Get(':slug/bought-together')
  async getBoughtTogether(@Param('slug') slug: string) {
    return this.products.getBoughtTogether(slug);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    return this.products.getBySlug(slug, viewer?.id ?? null);
  }
}
