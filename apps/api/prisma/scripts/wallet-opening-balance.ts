/// СЛУЖЕБНЫЙ СКРИПТ ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА (0.15, ADR-0191). Агенты его не
/// запускают. Сводит уже существующие балансы wallets (RUBY) с журналом
/// проводкой OPENING_BALANCE ДО включения WALLET_LEDGER_ENABLED.
///
///   ts-node prisma/scripts/wallet-opening-balance.ts           # только отчёт
///   ts-node prisma/scripts/wallet-opening-balance.ts --apply   # записать
///
/// Подключение к БД берёт из окружения (DATABASE_URL), как остальные скрипты.
/// Перед --apply сделайте резервную копию (docs/runbooks/backup-restore.md).
/// Идемпотентно: ключ `opening-balance:<userId>`; повторный запуск ничего не
/// меняет. Журнал выше баланса не исправляется (нужен ручной разбор).
import { PrismaClient } from '@prisma/client';
import { WalletLedgerService } from '../../src/modules/wallet/wallet-ledger.service';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const ledger = new WalletLedgerService(
    prisma as never,
    {
      get: () => undefined,
    } as never,
  );
  try {
    const bad = await ledger.findInconsistentWallets(1_000_000);
    console.log(`Расходящихся кошельков RUBY: ${bad.length}`);
    let fixed = 0;
    let manual = 0;
    for (const w of bad) {
      if (w.balance < w.ledger) {
        manual += 1;
        console.log(
          `РУЧНОЙ РАЗБОР ${w.userId}: журнал ${w.ledger} > баланс ${w.balance}`,
        );
        continue;
      }
      console.log(
        `${apply ? 'сводим' : 'свели бы'} ${w.userId}: +${w.balance - w.ledger}`,
      );
      if (!apply) continue;
      await prisma.$transaction((tx) =>
        ledger.postOpeningBalance(tx, w.userId),
      );
      fixed += 1;
    }
    console.log(
      `Итого: сведено ${fixed}, ручной разбор ${manual}${apply ? '' : ' (режим отчёта, ничего не записано)'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
