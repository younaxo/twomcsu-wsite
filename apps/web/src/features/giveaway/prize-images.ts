import type { StaticImageData } from 'next/image';
import apolon from '../../../../../giveaway/assets/prizes/apolon.svg';
import keyboard from '../../../../../giveaway/assets/prizes/keyboard.svg';
import kratos from '../../../../../giveaway/assets/prizes/kratos.svg';
import license from '../../../../../giveaway/assets/prizes/license.svg';
import mouse from '../../../../../giveaway/assets/prizes/mouse.svg';
import polemism from '../../../../../giveaway/assets/prizes/polemism.svg';
import rubies1000 from '../../../../../giveaway/assets/prizes/rubies-1000.svg';
import rubies500 from '../../../../../giveaway/assets/prizes/rubies-500.svg';
import rubles from '../../../../../giveaway/assets/prizes/rubles.svg';
import svarog from '../../../../../giveaway/assets/prizes/svarog.svg';

type Img = StaticImageData | string;

/// Картинки лежат только в `giveaway/assets/prizes/` и подключаются статическим
/// импортом (бандлер кладёт их в сборку; копий в public нет). Ключ - поле `image`
/// из prizes.json; тест проверяет, что для каждого приза есть запись.
export const prizeImages: Record<string, Img> = {
  'keyboard.svg': keyboard,
  'mouse.svg': mouse,
  'license.svg': license,
  'polemism.svg': polemism,
  'rubles.svg': rubles,
  'svarog.svg': svarog,
  'kratos.svg': kratos,
  'apolon.svg': apolon,
  'rubies-1000.svg': rubies1000,
  'rubies-500.svg': rubies500,
};

export function prizeImageSrc(name: string): string | null {
  const m = prizeImages[name];
  if (!m) return null;
  return typeof m === 'string' ? m : m.src;
}
