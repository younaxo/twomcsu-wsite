'use client';

import { Activity, Database, Layers, MessageSquare, TextCursorInput } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataDemos } from './component-lab/data-demos';
import { FloatingDemos } from './component-lab/floating-demos';
import { FormDemos } from './component-lab/form-demos';
import { OverlayDemos } from './component-lab/overlay-demos';
import { StateDemos } from './component-lab/state-demos';

/// Interactions / Component lab — ручная проверка примитивов UI-слоя во всех
/// трёх направлениях. Оформление — только токенами направления (их
/// переключает оболочка /design-lab), здесь — поведение, клавиатура, overlay.
/// Каждая вкладка монтируется только когда активна: таймеры, глобальные
/// хоткеи (⌘K) и fixed-элементы живут только в своей группе.

interface LabGroup {
  id: string;
  label: string;
  icon: ReactNode;
  Demos: ComponentType;
}

const GROUPS: LabGroup[] = [
  { id: 'floating', label: 'Floating', icon: <MessageSquare />, Demos: FloatingDemos },
  { id: 'overlays', label: 'Overlays', icon: <Layers />, Demos: OverlayDemos },
  { id: 'forms', label: 'Формы', icon: <TextCursorInput />, Demos: FormDemos },
  { id: 'data', label: 'Данные', icon: <Database />, Demos: DataDemos },
  { id: 'states', label: 'Состояния', icon: <Activity />, Demos: StateDemos },
];

export const ComponentLab: ComponentType = () => (
  <Tabs variant="line" defaultValue={GROUPS[0]?.id}>
    <TabsList aria-label="Группы компонентов">
      {GROUPS.map((group) => (
        <TabsTrigger key={group.id} value={group.id} icon={group.icon}>
          {group.label}
        </TabsTrigger>
      ))}
    </TabsList>
    {GROUPS.map(({ id, Demos }) => (
      <TabsContent key={id} value={id}>
        <Demos />
      </TabsContent>
    ))}
  </Tabs>
);
