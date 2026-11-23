import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WalletHistoryQueryDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

/// Свой кошелёк: только владелец, только чтение. `GET /wallet` — балансы
/// (контракт ADR-0094 не менялся); `GET /wallet/history` — журнал рубинов с
/// пагинацией (0.15, ADR-0191), выкл. флаг -> 503 `wallet_disabled`.
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.balances(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WalletHistoryQueryDto,
  ) {
    return this.wallet.history(user.id, query.page ?? 1, query.limit ?? 30);
  }
}
