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
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { ApplyPromoDto } from './dto/apply-promo.dto';
import { CalculateCartDto } from './dto/calculate-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('store')
@Controller('store/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  async getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.getCart(user.id);
  }

  @Post('items')
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(user.id, dto);
  }

  @Patch('items/:id')
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(user.id, id, dto);
  }

  @Delete('items/:id')
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.cart.removeItem(user.id, id);
  }

  @Delete()
  async clear(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.clear(user.id);
  }

  @Post('apply-promo')
  async applyPromo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyPromoDto,
  ) {
    return this.cart.applyPromo(user.id, dto.code);
  }

  @Delete('promo')
  async removePromo(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.removePromo(user.id);
  }

  @Post('calculate')
  async calculate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalculateCartDto,
  ) {
    return this.cart.calculate(user.id, dto);
  }
}
