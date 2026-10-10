import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RolePrefix, UserRolesInline } from './role-prefix';
import { TooltipProvider } from './tooltip';

const chiefCurator = { slug: 'chief-curator', priority: 900, displayName: 'Chief Curator' };
const developer = { slug: 'developer', priority: 300, displayName: 'Developer' };
const vip = { slug: 'vip', priority: 50, displayName: 'VIP', color: '#F26A1B' };

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('RolePrefix', () => {
  it('рендерит PNG с CDN, alt = название роли и целочисленный масштаб', () => {
    renderWithProvider(<RolePrefix role={chiefCurator} size="md" tooltip={false} />);
    const img = screen.getByRole('img', { name: 'Chief Curator' });
    expect(img).toHaveAttribute(
      'src',
      'https://cdn-files.twomc.su/minecraft/resourspack/prefixes/chief-curator.png',
    );
    // 89×7 при масштабе 4 (md)
    expect(img).toHaveAttribute('width', '356');
    expect(img).toHaveAttribute('height', '28');
    expect(img).toHaveAttribute('loading', 'lazy');
    // Узкий экран: длинный префикс ужимается в ширину контейнера, не вылезая за край.
    expect(img.parentElement!.className).toMatch(/max-w-full/);
    expect(img.parentElement!.className).toMatch(/shrink-0/);
  });

  it('неизвестная роль → текстовый бейдж, без <img>', () => {
    renderWithProvider(<RolePrefix role={vip} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });

  it('ошибка загрузки PNG → fallback-бейдж вместо битой картинки', () => {
    renderWithProvider(<RolePrefix role={chiefCurator} tooltip={false} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Chief Curator')).toBeInTheDocument();
  });

  it('fallback="none" без префикса не рендерит ничего', () => {
    const { container } = renderWithProvider(
      <RolePrefix slug="unknown" name="Кто-то" fallback="none" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('с tooltip префикс фокусируемый (подсказка доступна с клавиатуры)', () => {
    renderWithProvider(<RolePrefix role={chiefCurator} />);
    const img = screen.getByRole('img', { name: 'Chief Curator' });
    expect(img.closest('[tabindex="0"]')).not.toBeNull();
  });
});

describe('UserRolesInline', () => {
  it('рядом с ником показывается одна основная роль (старшая с префиксом)', () => {
    renderWithProvider(<UserRolesInline roles={[vip, developer, chiefCurator]} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Chief Curator' })).toBeInTheDocument();
    expect(screen.queryByText('Developer')).toBeNull();
  });

  it('showSecondary — остальные роли текстовыми бейджами', () => {
    renderWithProvider(<UserRolesInline roles={[vip, developer, chiefCurator]} showSecondary />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });
});
