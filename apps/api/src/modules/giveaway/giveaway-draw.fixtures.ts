import { SnapshotEntry } from './giveaway-draw';

/// Входные данные тестового вектора ADR-G003 (только для тестов).
const NAMES = [
  'Alex',
  'Bob_1',
  'Cat',
  'Dave',
  'Eve',
  'Finn',
  'Gus',
  'Hana',
  'Ivy',
  'Jack',
];
const TICKETS = [
  'K417',
  'A001',
  'M250',
  'Z999',
  'B002',
  'C333',
  'P777',
  'T100',
  'H808',
  'W640',
];
export const VECTOR_ENTRIES: SnapshotEntry[] = TICKETS.map((t, i) => ({
  ticket: t,
  playerUuid: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
  playerName: NAMES[i],
}));
export const VECTOR_SEED = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
