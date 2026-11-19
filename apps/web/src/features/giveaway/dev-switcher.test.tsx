import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DevSwitcher from './dev-switcher';
import { MOCK_SCENARIOS } from './mock-api';

// Каркас (шапка/футер) тянет QueryClient и next/image - здесь проверяется только панель.
vi.mock('@/components/shell/site-header', () => ({ SiteHeader: () => null }));
vi.mock('@/components/shell/site-footer', () => ({ SiteFooter: () => null }));

describe('dev-переключатель состояний', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('меню открывается кнопкой, содержит все сценарии и закрывается по Escape', () => {
    render(<DevSwitcher current="running" onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Состояния \(dev\)/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    for (const label of [
      'До старта',
      'Идёт (кода нет)',
      'Ожидание кода',
      'Время не набрано',
      'Билет (с анимацией)',
      'Билет уже получен',
      'Код истёк',
      'Много попыток',
      'Ошибка сети',
      'Завершён',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Идёт (кода нет)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('выбор сценария вызывает onSelect и закрывает меню', () => {
    const onSelect = vi.fn();
    render(<DevSwitcher current={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Состояния \(dev\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Время не набрано' }));
    expect(onSelect).toHaveBeenCalledWith('not_enough');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('в списке панели есть все сценарии мока', () => {
    render(<DevSwitcher current={null} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Состояния \(dev\)/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(MOCK_SCENARIOS.length);
  });

  it('GiveawayApp: в dev с флагом панель есть, переключение меняет сценарий и URL', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_MOCK', '1');
    vi.resetModules();
    const { GiveawayApp } = await import('./giveaway-app');
    render(<GiveawayApp />);
    const trigger = await screen.findByRole('button', { name: /Состояния \(dev\)/ });
    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Завершён' }));
    });
    expect(window.location.search).toBe('?mock=finished');
    expect(await screen.findByText('Розыгрыш завершён')).toBeInTheDocument();
  });

  it('GiveawayApp: в production панели нет, даже если флаг моков выставлен', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_MOCK', '1');
    vi.resetModules();
    const { GiveawayApp } = await import('./giveaway-app');
    render(<GiveawayApp />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /Состояния/ })).toBeNull();
  });

  it('без флага моков панели нет даже в dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_MOCK', '');
    vi.resetModules();
    const { GiveawayApp } = await import('./giveaway-app');
    render(<GiveawayApp />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /Состояния/ })).toBeNull();
  });

  it('исходник: import() панели стоит только за литералами process.env (условие вырезается бандлером)', () => {
    const source = readFileSync(path.join(__dirname, 'giveaway-app.tsx'), 'utf8');
    expect(source.match(/import\('\.\/dev-switcher'\)/g)).toHaveLength(1);
    // Статического импорта панели нет: иначе она попала бы в production-чанк.
    expect(source).not.toMatch(/^import .* from '\.\/dev-switcher'/m);
    expect(source).toMatch(
      /process\.env\.NODE_ENV !== 'production' && process\.env\.NEXT_PUBLIC_GIVEAWAY_MOCK === '1'\s*\?\s*dynamic\(\(\) => import\('\.\/dev-switcher'\)/,
    );
  });
});
