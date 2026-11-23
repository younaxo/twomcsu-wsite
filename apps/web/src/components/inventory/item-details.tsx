import type { InventoryItemDto } from '@twomc/shared';
import { itemTitle, prettyItemId, runsToText } from '@/lib/inventory/inventory';

/// Карточка выбранного предмета. Всё — plain text (имя и лор приходят как
/// данные игрока, HTML не рендерим).
export function ItemDetails({ item }: { item: InventoryItemDto | null }) {
  if (!item) {
    return (
      <p className="text-sm text-muted-foreground">
        Выберите слот, чтобы увидеть описание предмета.
      </p>
    );
  }
  const enchants = [...item.enchants, ...item.storedEnchants];
  const durability =
    item.maxDamage !== null && item.damage !== null ? item.maxDamage - item.damage : null;
  return (
    <div className="flex flex-col gap-2" data-testid="item-details">
      <h4 className="break-words text-base font-semibold">{itemTitle(item)}</h4>
      <p className="font-mono text-xs text-muted-foreground">
        {prettyItemId(item.id)} · {item.count} шт.
      </p>
      {durability !== null && item.maxDamage !== null ? (
        <p className="text-sm">
          Прочность: {durability} из {item.maxDamage}
        </p>
      ) : null}
      {item.unbreakable ? <p className="text-sm">Неразрушаемый</p> : null}
      {enchants.length > 0 ? (
        <ul className="text-sm" aria-label="Зачарования">
          {enchants.map((enchant) => (
            <li key={`${enchant.id}:${enchant.level}`}>
              {prettyItemId(enchant.id)} {enchant.level}
            </li>
          ))}
        </ul>
      ) : null}
      {item.lore.length > 0 ? (
        <div className="text-sm text-muted-foreground" aria-label="Описание">
          {item.lore.map((line, index) => (
            <p key={index} className="break-words">
              {runsToText(line)}
            </p>
          ))}
          {item.loreTruncated ? <p>…описание сокращено</p> : null}
        </div>
      ) : null}
      {item.containerItemCount !== null ? (
        <p className="text-sm">Предметов внутри: {item.containerItemCount}</p>
      ) : null}
    </div>
  );
}
