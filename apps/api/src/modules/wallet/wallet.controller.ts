import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WalletService } from './wallet.service';

/// Свой баланс (ADR-0094): только владелец, только чтение.
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.balances(user.id);
  }
}
