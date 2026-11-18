import type { CSSProperties } from 'react';
import type { Player, PlayerColorId } from '../types/game';

export interface PlayerColorOption {
  id: PlayerColorId;
  label: string;
  accentVar: string;
  softVar: string;
}

export const PLAYER_COLORS: ReadonlyArray<PlayerColorOption> = [
  { id: 'red', label: 'Red', accentVar: 'var(--player-red)', softVar: 'var(--player-red-soft)' },
  { id: 'blue', label: 'Blue', accentVar: 'var(--player-blue)', softVar: 'var(--player-blue-soft)' },
  { id: 'green', label: 'Green', accentVar: 'var(--player-green)', softVar: 'var(--player-green-soft)' },
  { id: 'yellow', label: 'Yellow', accentVar: 'var(--player-yellow)', softVar: 'var(--player-yellow-soft)' },
  { id: 'orange', label: 'Orange', accentVar: 'var(--player-orange)', softVar: 'var(--player-orange-soft)' },
  { id: 'purple', label: 'Purple', accentVar: 'var(--player-purple)', softVar: 'var(--player-purple-soft)' },
  { id: 'pink', label: 'Pink', accentVar: 'var(--player-pink)', softVar: 'var(--player-pink-soft)' },
  { id: 'black', label: 'Black', accentVar: 'var(--player-black)', softVar: 'var(--player-black-soft)' },
];

const PLAYER_COLOR_MAP: Record<PlayerColorId, PlayerColorOption> = Object.fromEntries(
  PLAYER_COLORS.map((color) => [color.id, color])
) as Record<PlayerColorId, PlayerColorOption>;

const LEGACY_COLOR_ALIASES: Record<string, PlayerColorId> = {
  crimson: 'red',
  royal: 'blue',
  emerald: 'green',
  amber: 'yellow',
  violet: 'purple',
  teal: 'blue',
  slate: 'black',
};

function resolveColorId(color?: string): PlayerColorId | undefined {
  if (!color) {
    return undefined;
  }
  if (color in PLAYER_COLOR_MAP) {
    return color as PlayerColorId;
  }
  return LEGACY_COLOR_ALIASES[color];
}

export function isValidPlayerColor(value: unknown): value is PlayerColorId {
  return typeof value === 'string' && value in PLAYER_COLOR_MAP;
}

export function getPlayerColorOption(color?: PlayerColorId | string): PlayerColorOption | null {
  const resolved = resolveColorId(color);
  return resolved ? PLAYER_COLOR_MAP[resolved] : null;
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
    const resolved = resolveColorId(player.color);
    if (resolved && !owners[resolved]) {
      owners[resolved] = player;
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

export function getPlayerColorStyle(color?: PlayerColorId | string): CSSProperties | undefined {
  const option = getPlayerColorOption(color);
  if (!option) {
    return undefined;
  }
  return {
    '--seat-accent': option.accentVar,
    '--seat-soft': option.softVar,
  } as CSSProperties;
}
