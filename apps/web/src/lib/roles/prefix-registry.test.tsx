import {
  CURRENCY_ASSETS,
  DONATION_PREFIXES,
  MEDIA_PREFIXES,
  ROLE_PREFIX_HEIGHT,
  currencyAsset,
  donationPrefix,
  mediaPrefix,
  prefixRelativePath,
  resolvePrimaryPrefix,
} from '@twomc/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CurrencyIcon } from '@/components/ui/currency-icon';
import { RolePrefix } from '@/components/ui/role-prefix';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UserIdentity } from '@/components/ui/user-identity';
import { identityPrefix } from './primary-role';

/// Реестры ассетов (ADR-0098): префиксы STAFF / MEDIA / DONATION с одним
/// слотом возле ника и иконки валют.

const staff = { slug: 'chief-curator', displayName: 'Chief Curator', priority: 90 };
const player = { slug: 'player', displayName: 'Игрок', priority: 1 };

describe('Реестр префиксов', () => {
  it('один префикс возле ника: STAFF > MEDIA > DONATION', () => {
    expect(
      resolvePrimaryPrefix({
        staffSlug: 'chief-curator',
        mediaBadges: ['YOUTUBE'],
        donationSlug: 'zeus',
      }),
    ).toMatchObject({ category: 'STAFF', slug: 'chief-curator' });
    expect(
      resolvePrimaryPrefix({ staffSlug: 'player', mediaBadges: ['TWITCH'], donationSlug: 'zeus' }),
    ).toMatchObject({ category: 'MEDIA', slug: 'twitch' });
    expect(resolvePrimaryPrefix({ staffSlug: null, donationSlug: 'zeus' })).toMatchObject({
      category: 'DONATION',
      slug: 'zeus',
    });
    expect(resolvePrimaryPrefix({ staffSlug: 'player' })).toBeNull();
  });

  it('медиа: одна площадка — её префикс, несколько — общий «Медиа», нет — ничего', () => {
    expect(mediaPrefix(['YOUTUBE'])?.slug).toBe('youtube');
    expect(mediaPrefix(['TIKTOK', 'TIKTOK'])?.slug).toBe('tiktok');
    expect(mediaPrefix(['YOUTUBE', 'TWITCH'])?.slug).toBe('media');
    expect(mediaPrefix(['UNKNOWN'])?.slug).toBe('media');
    expect(mediaPrefix([])).toBeNull();
    expect(mediaPrefix(null)).toBeNull();
  });

  it('пути на CDN рядом со staff-префиксами; донат — не арты магазина', () => {
    expect(prefixRelativePath({ category: 'STAFF', slug: 'owner' })).toBe(
      'minecraft/resourspack/prefixes/owner.png',
    );
    expect(prefixRelativePath({ category: 'MEDIA', slug: 'youtube' })).toBe(
      'minecraft/resourspack/prefixes/media/youtube.png',
    );
    expect(prefixRelativePath(donationPrefix('zeus')!)).toBe(
      'minecraft/resourspack/prefixes/donations/zeus.png',
    );
    expect(donationPrefix('unknown')).toBeNull();
  });

  it('реальные размеры ассетов: 4 медиа и 7 донат-префиксов высотой 7 px', () => {
    expect(MEDIA_PREFIXES.map((p) => [p.slug, p.width])).toEqual([
      ['media', 35],
      ['youtube', 51],
      ['twitch', 42],
      ['tiktok', 42],
    ]);
    expect(DONATION_PREFIXES.map((p) => p.slug)).toEqual([
      'dionysus',
      'hermes',
      'heracles',
      'apollo',
      'ares',
      'poseidon',
      'zeus',
    ]);
    expect(ROLE_PREFIX_HEIGHT).toBe(7);
  });

  it('identityPrefix: роль без префикса + медиа → медиа-префикс', () => {
    expect(identityPrefix(staff, ['YOUTUBE'])?.category).toBe('STAFF');
    expect(identityPrefix(player, ['YOUTUBE'])?.slug).toBe('youtube');
    expect(identityPrefix(player, [])).toBeNull();
  });
});

describe('Префикс возле ника', () => {
  it('медиа-партнёр без роли команды — медиа-префикс с тултипом «Медиа-партнёр»', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <UserIdentity username="streamer" role={player} mediaBadges={['YOUTUBE']} />
      </TooltipProvider>,
    );
    const image = screen.getByRole('img', { name: 'YouTube' });
    expect(image.getAttribute('src')).toMatch(/prefixes\/media\/youtube\.png$/);
    expect(image).toHaveAttribute('width', String(51 * 2));
    expect(image).toHaveAttribute('height', String(7 * 2));
    expect(image.className).toContain('[image-rendering:pixelated]');
    await user.hover(image);
    expect((await screen.findAllByText('Медиа-партнёр twomc.su')).length).toBeGreaterThan(0);
  });

  it('staff + медиа — только префикс роли, второго префикса нет', () => {
    render(
      <TooltipProvider>
        <UserIdentity username="younaxo_" role={staff} mediaBadges={['YOUTUBE', 'TWITCH']} />
      </TooltipProvider>,
    );
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Chief Curator');
  });

  it('донат-префикс (только ассет) рисуется из своего каталога', () => {
    render(
      <TooltipProvider>
        <RolePrefix prefix={donationPrefix('heracles')} size="sm" />
      </TooltipProvider>,
    );
    const image = screen.getByRole('img', { name: 'Heracles' });
    expect(image.getAttribute('src')).toMatch(/prefixes\/donations\/heracles\.png$/);
    expect(image).toHaveAttribute('width', String(58 * 3));
  });
});

describe('Иконки валют', () => {
  it('рубли баланса — монета, рубины — рубин; pixel-art 16 px, целый масштаб', () => {
    expect(currencyAsset('RUB')).toBe(CURRENCY_ASSETS.MONEY);
    expect(currencyAsset('RUBY')).toBe(CURRENCY_ASSETS.RUBY);
    const { container } = render(
      <>
        <CurrencyIcon currency="RUB" />
        <CurrencyIcon currency="RUBY" scale={2} decorative={false} />
      </>,
    );
    const [money, ruby] = Array.from(container.querySelectorAll('img'));
    expect(money?.getAttribute('src')).toMatch(/minecraft\/resourspack\/currencies\/money\.png$/);
    expect(money).toHaveAttribute('aria-hidden', 'true');
    expect(money).toHaveAttribute('alt', '');
    expect(money).toHaveAttribute('width', '16');
    expect(ruby).toHaveAttribute('alt', 'Рубин');
    expect(ruby).toHaveAttribute('width', '32');
    expect(ruby?.className).toContain('[image-rendering:pixelated]');
  });

  it('не загрузилась — не рисуется, без битой картинки', () => {
    const { container } = render(<CurrencyIcon currency="RUBY" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
  });
});
