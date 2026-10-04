/// Минимальная стартовая позиция для регистрации (User.positionId обязателен,
/// AuthService.register требует существования Position с isDefault=true —
/// без неё регистрация в свежей БД падает). Остальные позиции (донатные
/// тиры, staff-титулы) добавляются через admin API (PHASE 07) или в PHASE 32
/// вместе с bootstrap-аккаунтами.
export interface PositionSeedDefinition {
  name: string;
  slug: string;
  displayName: string;
  group: string;
  color: string;
  isDefault: boolean;
}

export const DEFAULT_POSITIONS: PositionSeedDefinition[] = [
  {
    name: 'Default',
    slug: 'default',
    displayName: 'Игрок',
    group: 'default',
    color: '#9ca3af',
    isDefault: true,
  },
];
