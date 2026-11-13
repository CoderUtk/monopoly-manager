import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  getRoomCodeFromUrl,
  createLocalPlayerId,
} from './session';
import { applyRoomTransactionCallback } from './roomStore';
import { applyPayment, createInitialRoom, joinOrReclaimPlayer, startGame } from './ledger';
import type { RoomState } from '../types/game';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function makeRoom(): RoomState {
  return createInitialRoom({
    creatorId: 'p-creator',
    creatorName: 'Aarav',
    currencySymbol: '₹',
    currencyLocale: 'en-IN',
    startingCash: 15000,
    bankStartingCash: 100000,
    negativeLimit: 5000,
    passStartAmount: 2000,
    mortgageInterestPct: 10,
    code: 'AB34CD',
  });
}

describe('session persistence', () => {
  it('saves, loads, and clears LocalSession round-trip', () => {
    const storage = createMemoryStorage();
    expect(loadSession(storage)).toBeNull();

    saveSession(
      {
        roomCode: 'ab34cd',
        playerId: 'p-123',
        playerName: 'Aarav',
      },
      storage
    );

    expect(loadSession(storage)).toEqual({
      roomCode: 'AB34CD',
      playerId: 'p-123',
      playerName: 'Aarav',
    });

    clearSession(storage);
    expect(loadSession(storage)).toBeNull();
  });

  it('returns null safely when stored JSON is corrupted or malformed', () => {
    const storage = createMemoryStorage();
    storage.setItem('monopoly-manager.session.v1', '{not-valid-json');
    expect(loadSession(storage)).toBeNull();

    storage.setItem(
      'monopoly-manager.session.v1',
      JSON.stringify({ roomCode: 'AB34CD', playerId: '' })
    );
    expect(loadSession(storage)).toBeNull();
  });

  it('generates distinct local player IDs', () => {
    const id1 = createLocalPlayerId();
    const id2 = createLocalPlayerId();
    expect(id1.length).toBeGreaterThan(8);
    expect(id2).not.toBe(id1);
  });
});

describe('getRoomCodeFromUrl', () => {
  it('normalizes valid 6-character room query param to uppercase', () => {
    expect(getRoomCodeFromUrl('?room=ab34cd')).toBe('AB34CD');
    expect(getRoomCodeFromUrl('?tab=table&room=%20xy78zw%20')).toBe('XY78ZW');
  });

  it('returns null for missing or invalid room query params', () => {
    expect(getRoomCodeFromUrl('')).toBeNull();
    expect(getRoomCodeFromUrl('?foo=bar')).toBeNull();
    expect(getRoomCodeFromUrl('?room=')).toBeNull();
    expect(getRoomCodeFromUrl('?room=ab34')).toBeNull();
    expect(getRoomCodeFromUrl('?room=ab34cdef')).toBeNull();
    expect(getRoomCodeFromUrl('?room=ab$4cd')).toBeNull();
  });
});

describe('applyRoomTransactionCallback', () => {
  it('aborts cleanly with Room not found when currentData is null, undefined, or missing meta', () => {
    const resNull = applyRoomTransactionCallback(null, (room) => room);
    expect(resNull).toEqual({ commit: false, error: 'Room not found' });

    const resUndefined = applyRoomTransactionCallback(undefined, (room) => room);
    expect(resUndefined).toEqual({ commit: false, error: 'Room not found' });

    const resEmptyObj = applyRoomTransactionCallback({}, (room) => room);
    expect(resEmptyObj).toEqual({ commit: false, error: 'Room not found' });
  });

  it('catches LedgerError cleanly and aborts without committing', () => {
    const room = startGame(makeRoom(), { actorId: 'p-creator', bankerId: 'p-creator' });
    const res = applyRoomTransactionCallback(room, (current) =>
      applyPayment(current, {
        fromId: 'p-creator',
        toId: 'BANK',
        amount: 999999,
        actorId: 'p-creator',
      })
    );

    expect(res.commit).toBe(false);
    expect(res.value).toBeUndefined();
    expect(res.error).toContain('does not have enough balance');
  });

  it('normalizes missing mortgages and transactions maps from RTDB and commits valid mutations', () => {
    const fullRoom = makeRoom();
    const strippedSnapshot = {
      meta: fullRoom.meta,
      players: fullRoom.players,
      // Firebase RTDB omits empty objects ({}) on read
    };

    const res = applyRoomTransactionCallback(strippedSnapshot, (current) => {
      expect(current.mortgages).toEqual({});
      expect(current.transactions).toEqual({});
      return joinOrReclaimPlayer(current, {
        playerId: 'p-raj',
        name: 'Raj',
      }).room;
    });

    expect(res.commit).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.value?.players['p-raj']).toMatchObject({
      id: 'p-raj',
      name: 'Raj',
      balance: 15000,
      status: 'active',
    });
    expect(res.value?.mortgages).toEqual({});
    expect(res.value?.transactions).toEqual({});
  });

  it('normalizes an omitted players map ({ meta } without players) and non-record arrays', () => {
    const fullRoom = makeRoom();
    const snapshotWithoutPlayers = {
      meta: fullRoom.meta,
    };

    const res = applyRoomTransactionCallback(snapshotWithoutPlayers, (current) => {
      expect(current.players).toEqual({});
      expect(current.mortgages).toEqual({});
      expect(current.transactions).toEqual({});
      return joinOrReclaimPlayer(current, {
        playerId: 'p-raj',
        name: 'Raj',
      }).room;
    });

    expect(res.commit).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.value?.players['p-raj']).toMatchObject({
      id: 'p-raj',
      name: 'Raj',
      balance: 15000,
      status: 'active',
    });

    const snapshotWithArrays = {
      meta: fullRoom.meta,
      players: [],
      mortgages: [],
      transactions: [],
    };
    const arrayRes = applyRoomTransactionCallback(snapshotWithArrays, (current) => {
      expect(current.players).toEqual({});
      expect(current.mortgages).toEqual({});
      expect(current.transactions).toEqual({});
      return current;
    });
    expect(arrayRes.commit).toBe(true);
  });

  it('defaults missing meta.status/bank fields on legacy snapshots while preserving explicit lobby and 0 values', () => {
    const legacySnapshot = {
      meta: {
        code: 'AB34CD',
        createdAt: 1000,
        creatorId: 'p-creator',
        bankerId: 'p-creator',
        currencySymbol: '₹',
        currencyLocale: 'en-IN',
        startingCash: 15000,
        negativeLimit: 5000,
        passStartAmount: 2000,
        mortgageInterestPct: 10,
      },
      players: {
        'p-creator': { id: 'p-creator', name: 'Aarav', balance: 15000, status: 'active', joinedAt: 1000 },
      },
    };
    const legacyRes = applyRoomTransactionCallback(legacySnapshot, (current) => {
      expect(current.meta.status).toBe('active');
      expect(current.meta.bankStartingCash).toBe(0);
      expect(current.meta.bankBalance).toBe(0);
      return current;
    });
    expect(legacyRes.commit).toBe(true);

    const zeroBankLobby = makeRoom();
    zeroBankLobby.meta.bankStartingCash = 0;
    zeroBankLobby.meta.bankBalance = 0;
    const lobbyRes = applyRoomTransactionCallback(zeroBankLobby, (current) => {
      expect(current.meta.status).toBe('lobby');
      expect(current.meta.bankStartingCash).toBe(0);
      expect(current.meta.bankBalance).toBe(0);
      return current;
    });
    expect(lobbyRes.commit).toBe(true);
  });
});

describe('firebase config & unconfigured store guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reports isFirebaseConfigured() === false when env vars are absent', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '');
    vi.resetModules();
    const unconfiguredStore = await import('./roomStore');
    expect(unconfiguredStore.isFirebaseConfigured()).toBe(false);
  });

  it('returns clean error results when mutating without Firebase configured', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '');
    vi.resetModules();
    const unconfiguredStore = await import('./roomStore');

    const mutationRes = await unconfiguredStore.runRoomMutation('AB34CD', (room) => room);
    expect(mutationRes).toEqual({ ok: false, error: 'Firebase is not configured.' });

    const joinRes = await unconfiguredStore.joinRoom('AB34CD', { playerId: 'p-1', name: 'Raj' });
    expect(joinRes).toEqual({ ok: false, error: 'Firebase is not configured.' });

    const reclaimRes = await unconfiguredStore.reclaimSeat('AB34CD', 'p-1');
    expect(reclaimRes).toEqual({ ok: false, error: 'Firebase is not configured.' });
  });
});
