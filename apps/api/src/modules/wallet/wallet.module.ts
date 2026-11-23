import { Module } from '@nestjs/common';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { WalletAdminController } from './wallet-admin.controller';
import { WalletAdminService } from './wallet-admin.service';
import { WalletController } from './wallet.controller';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, WalletAdminController],
  providers: [
    WalletService,
    WalletLedgerService,
    WalletAdminService,
    // Свой экземпляр: AuthModule не экспортирует TwoFactorService (как в StoreModule).
    TwoFactorService,
  ],
  exports: [WalletService, WalletLedgerService],
})
export class WalletModule {}
