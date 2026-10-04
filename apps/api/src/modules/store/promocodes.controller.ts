import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CartService } from './cart.service';
import { ValidatePromoDto } from './dto/validate-promo.dto';

@Controller('store/promocodes')
export class PromocodesController {
  constructor(private readonly cart: CartService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('validate')
  async validate(@Body() dto: ValidatePromoDto, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    return this.cart.validatePromo(viewer?.id ?? null, dto.code);
  }
}
