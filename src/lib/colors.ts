import type { CSSProperties } from 'react';
import type { Player, PlayerColorId } from '../types/game';

export interface PlayerColorOption {
  id: PlayerColorId;
  label: string;
  accentVar: string;
  softVar: string;
}

export const PLAYER_COLORS: ReadonlyArray<PlayerColorOption> = [
  { id: 'crimson', label: 'Red', accentVar: 'var(--player-crimson)', softVar: 'var(--player-crimson-soft)' },
  { id: 'royal', label: 'Blue', accentVar: 'var(--player-royal)', softVar: 'var(--player-royal-soft)' },
  { id: 'emerald', label: 'Green', accentVar: 'var(--player-emerald)', softVar: 'var(--player-emerald-soft)' },
  { id: 'amber', label: 'Gold', accentVar: 'var(--player-amber)', softVar: 'var(--player-amber-soft)' },
  { id: 'violet', label: 'Violet', accentVar: 'var(--player-violet)', softVar: 'var(--player-violet-soft)' },
  { id: 'orange', label: 'Orange', accentVar: 'var(--player-orange)', softVar: 'var(--player-orange-soft)' },
  { id: 'teal', label: 'Teal', accentVar: 'var(--player-teal)', softVar: 'var(--player-teal-soft)' },
  { id: 'slate', label: 'Slate', accentVar: 'var(--player-slate)', softVar: 'var(--player-slate-soft)' },
];

const PLAYER_COLOR_MAP: Record<PlayerColorId, PlayerColorOption> = Object.fromEntries(
  PLAYER_COLORS.map((color) => [color.id, color])
) as Record<PlayerColorId, PlayerColorOption>;

export function isValidPlayerColor(value: unknown): value is PlayerColorId {
  return typeof value === 'string' && value in PLAYER_COLOR_MAP;
}

export function getPlayerColorOption(color?: PlayerColorId): PlayerColorOption | null {
  return color && color in PLAYER_COLOR_MAP ? PLAYER_COLOR_MAP[color] : null;
}

export function getTakenColorOwners(
  players: Record<string, Player> | undefined
): Partial<Record<PlayerColorId, Player>> {
  const owners: Partial<Record<PlayerColorId, Player>> = {};
  if (!players) {
    return owners;
  }
  const ordered = Object.values(players)
    .filter((player) => player.status !== 'removed')
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

  for (const player of ordered) {
    if (player.color && isValidPlayerColor(player.color) && !owners[player.color]) {
      owners[player.color] = player;
    }
  }
  return owners;
}

export function getFirstAvailableColor(
  players: Record<string, Player> | undefined
): PlayerColorId {
  const taken = getTakenColorOwners(players);
  const free = PLAYER_COLORS.find((color) => !taken[color.id]);
  return free ? free.id : PLAYER_COLORS[0].id;
}

export function getPlayerColorStyle(color?: PlayerColorId): CSSProperties | undefined {
  const option = getPlayerColorOption(color);
  if (!option) {
    return undefined;
  }
  return {
    '--seat-accent': option.accentVar,
    '--seat-soft': option.softVar,
  } as CSSProperties;
}
