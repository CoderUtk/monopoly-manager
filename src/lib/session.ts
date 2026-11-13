import type { LocalSession } from '../types/game';

const SESSION_STORAGE_KEY = 'monopoly-manager.session.v1';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

function getDefaultStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Load the persisted player session from localStorage, returning null if missing or invalid.
 */
export function loadSession(storage?: Storage): LocalSession | null {
  const target = storage ?? getDefaultStorage();
  if (!target) {
    return null;
  }

  try {
    const raw = target.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const candidate = parsed as Partial<LocalSession>;
    if (
      typeof candidate.roomCode !== 'string' ||
      typeof candidate.playerId !== 'string' ||
      typeof candidate.playerName !== 'string'
    ) {
      return null;
    }

    const roomCode = candidate.roomCode.trim().toUpperCase();
    const playerId = candidate.playerId.trim();
    const playerName = candidate.playerName.trim();

    if (!ROOM_CODE_PATTERN.test(roomCode) || !playerId || !playerName) {
      return null;
    }

    return { roomCode, playerId, playerName };
  } catch {
    return null;
  }
}

/**
 * Persist the active player's room session to localStorage.
 */
export function saveSession(session: LocalSession, storage?: Storage): void {
  const target = storage ?? getDefaultStorage();
  if (!target) {
    return;
  }

  const normalized: LocalSession = {
    roomCode: session.roomCode.trim().toUpperCase(),
    playerId: session.playerId.trim(),
    playerName: session.playerName.trim(),
  };

  try {
    target.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota or private-browsing errors so gameplay can continue.
  }
}

/**
 * Remove any persisted room session from localStorage.
 */
export function clearSession(storage?: Storage): void {
  const target = storage ?? getDefaultStorage();
  if (!target) {
    return;
  }

  try {
    target.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

/**
 * Extract and normalize a 6-character room code from a URL query string.
 */
export function getRoomCodeFromUrl(search?: string): string | null {
  const query =
    search !== undefined
      ? search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';

  if (!query) {
    return null;
  }

  const params = new URLSearchParams(query.startsWith('?') ? query : `?${query}`);
  const raw = params.get('room');
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Generate a unique local player ID stored in the browser session.
 */
export function createLocalPlayerId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
