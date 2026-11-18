import {
  get,
  onValue,
  ref,
  runTransaction,
  type DatabaseReference,
} from 'firebase/database';
import type { CreateRoomInput, PlayerColorId, RoomState } from '../types/game';
import { getFirebaseDatabase, isFirebaseConfigured } from './firebase';
import {
  createInitialRoom,
  DEFAULT_CLUB_AMOUNT,
  DEFAULT_JAIL_AMOUNT,
  DEFAULT_REST_HOUSE_AMOUNT,
  joinOrReclaimPlayer,
  LedgerError,
} from './ledger';

export { isFirebaseConfigured };

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const TRANSACTION_PRIME_TIMEOUT_MS = 8000;

function normalizeRoomCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

function normalizeRecordMap<T>(value: unknown): Record<string, T> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, T>;
  }
  return {};
}

function normalizeRoomState(raw: unknown): RoomState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<RoomState>;
  if (!candidate.meta || typeof candidate.meta !== 'object' || Array.isArray(candidate.meta)) {
    return null;
  }

  return {
    meta: {
      ...candidate.meta,
      status: candidate.meta.status ?? 'active',
      bankStartingCash: candidate.meta.bankStartingCash ?? 0,
      bankBalance: candidate.meta.bankBalance ?? 0,
      clubAmount: candidate.meta.clubAmount ?? DEFAULT_CLUB_AMOUNT,
      restHouseAmount: candidate.meta.restHouseAmount ?? DEFAULT_REST_HOUSE_AMOUNT,
      jailAmount: candidate.meta.jailAmount ?? DEFAULT_JAIL_AMOUNT,
    },
    players: normalizeRecordMap(candidate.players),
    mortgages: normalizeRecordMap(candidate.mortgages),
    transactions: normalizeRecordMap(candidate.transactions),
  };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

/**
 * Pure wrapper around an RTDB transaction updater that normalizes empty maps and catches LedgerError.
 */
export function applyRoomTransactionCallback(
  currentData: unknown,
  mutator: (room: RoomState) => RoomState
): { commit: boolean; value?: RoomState; error?: string } {
  const normalized = normalizeRoomState(currentData);
  if (!normalized) {
    return { commit: false, error: 'Room not found' };
  }

  try {
    const nextRoom = mutator(normalized);
    return { commit: true, value: nextRoom };
  } catch (err) {
    if (err instanceof LedgerError) {
      return { commit: false, error: err.message };
    }
    return { commit: false, error: getErrorMessage(err, 'Unable to update room.') };
  }
}

/**
 * Prime RTDB's local sync tree with an active listener so runTransaction does not abort
 * prematurely on a cold cache when currentData starts as null.
 */
function primeRoomSyncTree(
  roomRef: DatabaseReference
): Promise<{ exists: boolean; unsubscribe: () => void }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      reject(new Error('Timed out connecting to room.'));
    }, TRANSACTION_PRIME_TIMEOUT_MS);

    unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ exists: snapshot.exists(), unsubscribe: () => unsubscribe() });
      },
      (err) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        reject(err);
      }
    );
  });
}

/**
 * Create a new room atomically in Firebase RTDB.
 */
export async function createRoom(
  input: CreateRoomInput
): Promise<{ ok: true; room: RoomState } | { ok: false; error: string }> {
  const db = getFirebaseDatabase();
  if (!db) {
    return { ok: false, error: 'Firebase is not configured.' };
  }

  const maxAttempts = input.code ? 1 : 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let initialRoom: RoomState;
    try {
      initialRoom = createInitialRoom(input);
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Invalid room settings.') };
    }

    const roomRef = ref(db, `rooms/${initialRoom.meta.code}`);
    try {
      const txResult = await runTransaction(roomRef, (currentData) => {
        if (currentData !== null) {
          return undefined;
        }
        return initialRoom;
      });

      if (txResult.committed) {
        const committedRoom = normalizeRoomState(txResult.snapshot.val()) ?? initialRoom;
        return { ok: true, room: committedRoom };
      }

      if (input.code) {
        return { ok: false, error: 'A room with this code already exists.' };
      }
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Unable to create room.') };
    }
  }

  return { ok: false, error: 'Could not allocate a unique room code. Please try again.' };
}

/**
 * Fetch a room snapshot once from Firebase RTDB.
 */
export async function fetchRoomOnce(code: string): Promise<RoomState | null> {
  const roomCode = normalizeRoomCode(code);
  if (!roomCode) {
    return null;
  }

  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }

  const snapshot = await get(ref(db, `rooms/${roomCode}`));
  if (!snapshot.exists()) {
    return null;
  }

  return normalizeRoomState(snapshot.val());
}

/**
 * Subscribe to live room updates from Firebase RTDB.
 */
export function subscribeRoom(
  code: string,
  onRoom: (room: RoomState | null) => void,
  onError: (error: string) => void
): () => void {
  const roomCode = normalizeRoomCode(code);
  if (!roomCode) {
    onError('Room code must be 6 characters.');
    return () => {};
  }

  const db = getFirebaseDatabase();
  if (!db) {
    onError('Firebase is not configured.');
    return () => {};
  }

  const roomRef = ref(db, `rooms/${roomCode}`);
  return onValue(
    roomRef,
    (snapshot) => {
      onRoom(snapshot.exists() ? normalizeRoomState(snapshot.val()) : null);
    },
    (err) => {
      onError(getErrorMessage(err, 'Lost connection to room.'));
    }
  );
}

/**
 * Execute an atomic ledger mutation against a room in Firebase RTDB.
 */
export async function runRoomMutation(
  code: string,
  mutator: (room: RoomState) => RoomState
): Promise<{ ok: true; room: RoomState } | { ok: false; error: string }> {
  const db = getFirebaseDatabase();
  if (!db) {
    return { ok: false, error: 'Firebase is not configured.' };
  }

  const roomCode = normalizeRoomCode(code);
  if (!roomCode) {
    return { ok: false, error: 'Room code must be 6 characters.' };
  }

  const roomRef = ref(db, `rooms/${roomCode}`);
  let unsubscribe = () => {};

  try {
    const primed = await primeRoomSyncTree(roomRef);
    unsubscribe = primed.unsubscribe;
    if (!primed.exists) {
      return { ok: false, error: 'Room not found' };
    }

    let txError: string | undefined;
    const txResult = await runTransaction(roomRef, (currentData) => {
      txError = undefined;
      const result = applyRoomTransactionCallback(currentData, mutator);
      if (!result.commit) {
        txError = result.error ?? 'Unable to update room.';
        return undefined;
      }
      return result.value;
    });

    if (!txResult.committed) {
      return {
        ok: false,
        error: txError ?? 'Transaction could not be completed. Please try again.',
      };
    }

    const updatedRoom = normalizeRoomState(txResult.snapshot.val());
    if (!updatedRoom) {
      return { ok: false, error: 'Room not found' };
    }

    return { ok: true, room: updatedRoom };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, 'Unable to sync with server.') };
  } finally {
    unsubscribe();
  }
}

/**
 * Join an existing room as a new active player via an atomic RTDB transaction.
 */
export async function joinRoom(
  code: string,
  input: { playerId: string; name: string; color?: PlayerColorId }
): Promise<{ ok: true; room: RoomState; playerId: string } | { ok: false; error: string }> {
  let joinedPlayerId = input.playerId.trim();
  const result = await runRoomMutation(code, (room) => {
    const joined = joinOrReclaimPlayer(room, {
      playerId: input.playerId,
      name: input.name,
      color: input.color,
    });
    joinedPlayerId = joined.playerId;
    return joined.room;
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, room: result.room, playerId: joinedPlayerId };
}

/**
 * Reclaim an existing non-removed player seat in a room via an atomic RTDB transaction.
 */
export async function reclaimSeat(
  code: string,
  reclaimPlayerId: string
): Promise<{ ok: true; room: RoomState; playerId: string } | { ok: false; error: string }> {
  const trimmedId = reclaimPlayerId.trim();
  if (!trimmedId) {
    return { ok: false, error: 'Player ID is required to reclaim a seat.' };
  }

  let reclaimedId = trimmedId;
  const result = await runRoomMutation(code, (room) => {
    const reclaimed = joinOrReclaimPlayer(room, {
      playerId: trimmedId,
      name: '',
      reclaimPlayerId: trimmedId,
    });
    reclaimedId = reclaimed.playerId;
    return reclaimed.room;
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, room: result.room, playerId: reclaimedId };
}
