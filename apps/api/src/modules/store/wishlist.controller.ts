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
import { GiftWishlistItemDto } from './dto/gift-wishlist-item.dto';
import { UpdateWishlistDto } from './dto/update-wishlist.dto';
import { WishlistService } from './wishlist.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('store')
@Controller('store/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getWishlist(@CurrentUser() user: AuthenticatedUser) {
    return this.wishlist.getWishlist(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items/:productId')
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.addItem(user.id, productId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('items/:productId')
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.removeItem(user.id, productId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWishlistDto,
  ) {
    return this.wishlist.updateVisibility(user.id, dto.isPublic);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items/:productId/gift')
  async giftItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: GiftWishlistItemDto,
  ) {
    return this.wishlist.giftItem(user.id, productId, dto);
  }

  @Get(':username')
  async getPublic(@Param('username') username: string) {
    return this.wishlist.getPublicByUsername(username);
  }
}
