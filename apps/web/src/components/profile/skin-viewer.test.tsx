import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SkinViewer } from './skin-viewer';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  created: [] as {
    options: Record<string, unknown>;
    skin: [string, unknown] | null;
    cape: string | null;
    animation: unknown;
  }[],
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));

// Настоящий three.js в jsdom не работает — проверяем, как компонент им
// управляет, через подменённый skinview3d.
vi.mock('skinview3d', () => {
  class SkinViewer {
    controls = { enablePan: true, enableZoom: false, minDistance: 0, maxDistance: 0 };
    playerObject = { rotation: { y: 0 } };
    autoRotate = true;
    record: (typeof mocks.created)[number];
    constructor(options: Record<string, unknown>) {
      this.record = { options, skin: null, cape: null, animation: null };
      mocks.created.push(this.record);
    }
    set animation(value: unknown) {
      this.record.animation = value;
    }
    get animation() {
      return this.record.animation as { paused: boolean } | null;
    }
    async loadSkin(url: string, options: unknown) {
      this.record.skin = [url, options];
    }
    async loadCape(url: string) {
      this.record.cape = url;
    }
    setSize() {}
    resetCameraPose() {}
    dispose() {}
  }
  class IdleAnimation {
    paused = false;
  }
  return { SkinViewer, IdleAnimation };
});

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const available = { available: true, model: 'slim', cape: true, version: 'abc123' };
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalMatchMedia = window.matchMedia;

function withWebGL() {
  HTMLCanvasElement.prototype.getContext = vi.fn((kind: string) =>
    kind.startsWith('webgl') ? ({} as never) : null,
  ) as never;
}

function setCores(cores: number) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: cores });
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.created.length = 0;
  setCores(8);
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  window.matchMedia = originalMatchMedia;
});

describe('3D-скин в профиле (ADR-0089)', () => {
  it('скина нет — честное пустое состояние, без выдуманной модели', async () => {
    mocks.get.mockResolvedValue({ available: false, model: null, cape: false, version: null });
    render(<SkinViewer username="Steve" />, { wrapper: Providers });
    expect(await screen.findByText('Для этого ника нет скина в Minecraft.')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/users/Steve/skin', { retryOn401: false });
    expect(mocks.created).toHaveLength(0);
  });

  it('нет WebGL — плоская текстура со своего API, three.js не загружается', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    mocks.get.mockResolvedValue(available);
    render(<SkinViewer username="Steve" />, { wrapper: Providers });
    const img = await screen.findByRole('img', { name: 'Текстура скина Steve' });
    expect(img.getAttribute('src')).toMatch(/\/users\/Steve\/skin\.png\?v=abc123$/);
    expect(screen.getByText('3D недоступно на этом устройстве')).toBeInTheDocument();
    expect(mocks.created).toHaveLength(0);
  });

  it('WebGL есть — 3D со скином, плащом, моделью slim, zoom в пределах и idle-анимацией', async () => {
    withWebGL();
    mocks.get.mockResolvedValue(available);
    render(<SkinViewer username="Steve" />, { wrapper: Providers });
    await waitFor(() => expect(mocks.created).toHaveLength(1));
    const viewer = mocks.created[0]!;
    await waitFor(() => expect(viewer.cape).toMatch(/\/users\/Steve\/cape\.png\?v=abc123$/));
    expect(viewer.skin?.[0]).toMatch(/\/users\/Steve\/skin\.png\?v=abc123$/);
    expect(viewer.skin?.[1]).toEqual({ model: 'slim' });
    expect(viewer.animation).not.toBeNull();
    expect(
      await screen.findByRole('toolbar', { name: 'Управление 3D-скином' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /3D-модель скина Steve/ })).toBeInTheDocument();
  });

  it('reduced motion — без idle-анимации и без кнопки паузы', async () => {
    withWebGL();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    mocks.get.mockResolvedValue(available);
    render(<SkinViewer username="Steve" />, { wrapper: Providers });
    await screen.findByRole('toolbar', { name: 'Управление 3D-скином' });
    expect(mocks.created[0]!.animation).toBeNull();
    expect(screen.queryByRole('button', { name: /анимацию/ })).toBeNull();
  });

  it('слабое устройство — 3D только по кнопке', async () => {
    withWebGL();
    setCores(2);
    mocks.get.mockResolvedValue(available);
    const user = userEvent.setup();
    render(<SkinViewer username="Steve" />, { wrapper: Providers });
    const show = await screen.findByRole('button', { name: 'Показать 3D-скин' });
    expect(mocks.created).toHaveLength(0);
    await user.click(show);
    await waitFor(() => expect(mocks.created).toHaveLength(1));
  });
});
