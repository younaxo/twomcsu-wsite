import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { MentionTextarea } from './mention-textarea';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));

const ITEMS = {
  items: [{ username: 'Steve', tag: null, avatar: null }],
  page: 1,
  limit: 8,
  hasMore: false,
};

function Host() {
  const [value, setValue] = useState('');
  return (
    <Sheet open>
      <SheetContent>
        <SheetTitle>Чат</SheetTitle>
        <SheetDescription className="sr-only">Описание</SheetDescription>
        <MentionTextarea
          aria-label="Поле"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </SheetContent>
    </Sheet>
  );
}

function HostControlled({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [value, setValue] = useState('');
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>Чат</SheetTitle>
        <SheetDescription className="sr-only">Описание</SheetDescription>
        <MentionTextarea
          aria-label="Поле"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </SheetContent>
    </Sheet>
  );
}

async function typeMention(text: string) {
  const field = screen.getByLabelText('Поле') as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: text } });
  field.setSelectionRange(text.length, text.length);
  fireEvent.select(field);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(260);
  });
  return field;
}

describe('MentionTextarea внутри Sheet (Radix Dialog)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.get.mockReset();
    mocks.get.mockResolvedValue(ITEMS);
  });
  afterEach(() => vi.useRealTimers());

  it('Esc при открытом списке закрывает только список, Sheet остаётся', async () => {
    const onOpenChange = vi.fn();
    render(<HostControlled onOpenChange={onOpenChange} />);
    const field = await typeMention('@st');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Esc при закрытом списке закрывает Sheet как раньше', async () => {
    const onOpenChange = vi.fn();
    render(<HostControlled onOpenChange={onOpenChange} />);
    const field = await typeMention('просто текст');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('второй Esc (после закрытия списка) закрывает Sheet', async () => {
    const onOpenChange = vi.fn();
    render(<HostControlled onOpenChange={onOpenChange} />);
    const field = await typeMention('@st');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('рендерится в Sheet без ошибок', () => {
    render(<Host />);
    expect(screen.getByLabelText('Поле')).toBeInTheDocument();
  });
});
