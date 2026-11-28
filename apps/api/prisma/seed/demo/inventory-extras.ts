import type { DemoSlot } from './social';

/// Дополнительные демо-предметы demo_ember разной редкости и количества.
/// Редкость показана цветом названия, как в игре: без названия — обычный,
/// жёлтый — необычный, голубой — редкий, фиолетовый — эпический, золотой —
/// легендарный. Иконок предметов на сайте нет (запасная иконка слота), так что
/// ни CDN, ни /api/uploads для них не запрашиваются.
const ench = (id: string, level: number) => ({
  id: `minecraft:${id}`,
  level,
});
const title = (text: string, color: string) => [{ text, color, bold: true }];
const loreLine = (text: string, color = 'gray') => [{ text, color }];

export const DEMO_EMBER_MAIN_EXTRA: readonly DemoSlot[] = [
  {
    area: 'hotbar',
    slot: 0,
    item: {
      id: 'minecraft:diamond_sword',
      count: 1,
      damage: 120,
      maxDamage: 1561,
      enchants: [
        ench('sharpness', 5),
        ench('unbreaking', 3),
        ench('mending', 1),
      ],
      name: title('Клинок Эмбера', 'gold'),
      lore: [
        loreLine('[Демо] Легендарный предмет'),
        loreLine('Редкость: легендарный', 'gold'),
      ],
    },
  },
  {
    area: 'hotbar',
    slot: 3,
    item: {
      id: 'minecraft:diamond_pickaxe',
      count: 1,
      damage: 300,
      maxDamage: 1561,
      enchants: [ench('efficiency', 5), ench('fortune', 3)],
      name: title('Кирка шахтёра', 'aqua'),
      lore: [loreLine('Редкость: редкий', 'aqua')],
    },
  },
  { area: 'hotbar', slot: 4, item: { id: 'minecraft:cooked_beef', count: 48 } },
  {
    area: 'hotbar',
    slot: 5,
    item: {
      id: 'minecraft:potion',
      count: 3,
      potion: 'minecraft:strong_healing',
    },
  },
  { area: 'hotbar', slot: 6, item: { id: 'minecraft:torch', count: 64 } },
  {
    area: 'armor',
    slot: 0,
    item: {
      id: 'minecraft:netherite_helmet',
      count: 1,
      damage: 40,
      maxDamage: 407,
      enchants: [ench('protection', 4), ench('unbreaking', 3)],
      name: title('Шлем бездны', 'dark_purple'),
      lore: [loreLine('Редкость: эпический', 'dark_purple')],
    },
  },
  {
    area: 'armor',
    slot: 1,
    item: {
      id: 'minecraft:netherite_chestplate',
      count: 1,
      damage: 80,
      maxDamage: 592,
      enchants: [ench('protection', 4), ench('mending', 1)],
      name: title('Кираса бездны', 'dark_purple'),
    },
  },
  {
    area: 'armor',
    slot: 2,
    item: {
      id: 'minecraft:netherite_leggings',
      count: 1,
      damage: 60,
      maxDamage: 555,
      enchants: [ench('protection', 3)],
    },
  },
  {
    area: 'armor',
    slot: 3,
    item: {
      id: 'minecraft:diamond_boots',
      count: 1,
      damage: 10,
      maxDamage: 429,
      enchants: [ench('feather_falling', 4)],
    },
  },
  {
    area: 'offhand',
    slot: 0,
    item: {
      id: 'minecraft:shield',
      count: 1,
      damage: 50,
      maxDamage: 336,
      enchants: [ench('unbreaking', 2)],
    },
  },
  {
    area: 'main',
    slot: 0,
    item: {
      id: 'minecraft:elytra',
      count: 1,
      damage: 40,
      maxDamage: 432,
      enchants: [ench('mending', 1), ench('unbreaking', 3)],
      name: title('Крылья ветра', 'light_purple'),
      lore: [loreLine('Редкость: эпический', 'light_purple')],
    },
  },
  {
    area: 'main',
    slot: 1,
    item: { id: 'minecraft:experience_bottle', count: 64 },
  },
  { area: 'main', slot: 2, item: { id: 'minecraft:iron_ingot', count: 99 } },
  {
    area: 'main',
    slot: 3,
    item: {
      id: 'minecraft:enchanted_book',
      count: 1,
      storedEnchants: [ench('mending', 1)],
      name: title('Книга починки', 'yellow'),
    },
  },
  {
    area: 'main',
    slot: 4,
    item: {
      id: 'minecraft:blue_shulker_box',
      count: 1,
      containerItemCount: 14,
    },
  },
  { area: 'main', slot: 5, item: { id: 'minecraft:cobblestone', count: 99 } },
  { area: 'main', slot: 6, item: { id: 'minecraft:oak_planks', count: 37 } },
  { area: 'main', slot: 7, item: { id: 'minecraft:coal', count: 22 } },
];

export const DEMO_EMBER_ENDER_EXTRA: readonly DemoSlot[] = [
  {
    area: 'ender',
    slot: 2,
    item: {
      id: 'minecraft:enchanted_golden_apple',
      count: 5,
      name: title('Золотое яблоко', 'gold'),
    },
  },
  { area: 'ender', slot: 3, item: { id: 'minecraft:diamond', count: 31 } },
  {
    area: 'ender',
    slot: 4,
    item: {
      id: 'minecraft:beacon',
      count: 1,
      name: title('Маяк стенда', 'yellow'),
    },
  },
  {
    area: 'ender',
    slot: 5,
    item: { id: 'minecraft:netherite_scrap', count: 14 },
  },
  {
    area: 'ender',
    slot: 6,
    item: {
      id: 'minecraft:dragon_egg',
      count: 1,
      name: title('Яйцо дракона', 'light_purple'),
      lore: [loreLine('Редкость: уникальный', 'light_purple')],
    },
  },
];
