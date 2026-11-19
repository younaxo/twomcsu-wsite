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
import apolonArt from '../../../../../giveaway/assets/prizes/apolon-art.svg';
import keyboardArt from '../../../../../giveaway/assets/prizes/keyboard-art.svg';
import kratosArt from '../../../../../giveaway/assets/prizes/kratos-art.svg';
import licenseArt from '../../../../../giveaway/assets/prizes/license-art.svg';
import mouseArt from '../../../../../giveaway/assets/prizes/mouse-art.svg';
import polemismArt from '../../../../../giveaway/assets/prizes/polemism-art.svg';
import rubies1000Art from '../../../../../giveaway/assets/prizes/rubies-1000-art.svg';
import rubies500Art from '../../../../../giveaway/assets/prizes/rubies-500-art.svg';
import rublesArt from '../../../../../giveaway/assets/prizes/rubles-art.svg';
import svarogArt from '../../../../../giveaway/assets/prizes/svarog-art.svg';

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
  'apolon-art.svg': apolonArt,
  'keyboard-art.svg': keyboardArt,
  'kratos-art.svg': kratosArt,
  'license-art.svg': licenseArt,
  'mouse-art.svg': mouseArt,
  'polemism-art.svg': polemismArt,
  'rubies-1000-art.svg': rubies1000Art,
  'rubies-500-art.svg': rubies500Art,
  'rubles-art.svg': rublesArt,
  'svarog-art.svg': svarogArt,
};

export function prizeImageSrc(name: string): string | null {
  const m = prizeImages[name];
  if (!m) return null;
  return typeof m === 'string' ? m : m.src;
}
