import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { crispScale } from '@/lib/use-device-pixel-ratio';
import { RolePrefix } from './role-prefix';
import { UserIdentity, discriminatorOf } from './user-identity';

/// Identity (ADR-0099): `[PREFIX] ник#0000` — всегда одна строка.

const curator = { slug: 'chief-curator', displayName: 'Chief Curator', priority: 90 };
const hunter = { slug: 'head-cheat-hunter', displayName: 'Head Cheat Hunter', priority: 80 };

function wrap(node: React.ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{node}</TooltipProvider>);
}

describe('UserIdentity — одна строка', () => {
  it('префикс и ник в одной строке, discriminator четырьмя цифрами', () => {
    wrap(<UserIdentity username="younaxo_" role={curator} discriminator="0002" />);
    const root = screen.getByTestId('user-identity');
    expect(root.className).toMatch(/flex-nowrap/);
    expect(root.className).not.toMatch(/flex-col/);
    expect(root).toHaveTextContent('younaxo_#0002');
    expect(within(root).getByRole('img', { name: 'Chief Curator' })).toBeInTheDocument();
  });

  it('длинный префикс ужимается (не больше ~45%), а не уносит ник на новую строку', () => {
    wrap(<UserIdentity username="Steve_Mainer" role={hunter} discriminator="4821" />);
    const root = screen.getByTestId('user-identity');
    const slot = within(root)
      .getByRole('img', { name: 'Head Cheat Hunter' })
      .closest('.max-w-\\[45\\%\\]');
    expect(slot).not.toBeNull();
    expect(within(root).getByRole('img').className).toMatch(/max-w-full/);
  });

  it('длинный ник обрезается многоточием, discriminator остаётся видимым', () => {
    wrap(<UserIdentity username="very_long_name16" role={curator} discriminator="0042" />);
    const name = screen.getByText('very_long_name16');
    expect(name.className).toMatch(/truncate/);
    expect(screen.getByText('#0042').className).toMatch(/shrink-0/);
  });

  it('без нативного title и без внутренних номеров', () => {
    const { container } = wrap(
      <UserIdentity username="younaxo_" role={curator} tag="younaxo_#0002" />,
    );
    expect(container.querySelector('[title]')).toBeNull();
    expect(container).not.toHaveTextContent(/ID\s*\d/);
    expect(screen.getByTestId('user-identity')).toHaveTextContent('younaxo_#0002');
  });

  it('discriminator из тега — только четыре цифры (старый hex не показывается)', () => {
    expect(discriminatorOf('younaxo_#0002')).toBe('0002');
    expect(discriminatorOf('name#4a2b')).toBeNull();
    expect(discriminatorOf('qaadmin')).toBeNull();
    expect(discriminatorOf(null)).toBeNull();
  });
});

describe('Тултип префикса', () => {
  it('триггер — по размеру префикса (w-fit), тултип открывается у самого префикса', async () => {
    const user = userEvent.setup();
    wrap(
      <div className="flex w-96 flex-col">
        <RolePrefix role={curator} size="xs" className="self-start" />
      </div>,
    );
    const trigger = screen.getByTestId('role-prefix-trigger');
    expect(trigger.className).toMatch(/w-fit/);
    expect(trigger.className).toMatch(/self-start/);
    await user.hover(trigger);
    expect((await screen.findAllByText('Роль команды twomc.su')).length).toBeGreaterThan(0);
  });
});

describe('crispScale — компактный префикс без «рваных» пикселей', () => {
  it('подбирает масштаб около ×1.5 под DPR экрана', () => {
    expect(crispScale(1.5, 2)).toBe(1.5);
    expect(crispScale(1.5, 1.5)).toBeCloseTo(4 / 3);
    expect(crispScale(1.5, 1.25)).toBeCloseTo(1.6);
    // DPR 1: ближайший целый — ×2 (как раньше, крупно) → остаётся ×1.5 pixelated.
    expect(crispScale(1.5, 1)).toBe(1.5);
    for (const dpr of [1.25, 1.5, 1.75, 2, 2.5, 3]) {
      const scale = crispScale(1.5, dpr);
      expect(Number.isInteger(Math.round(scale * dpr * 1000) / 1000)).toBe(true);
      expect(scale).toBeLessThan(2);
    }
  });
});
