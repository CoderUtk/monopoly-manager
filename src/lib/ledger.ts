import type {
  CreateRoomInput,
  Mortgage,
  Player,
  RoomState,
  Transaction,
  TransactionType,
} from '../types/game';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 4;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_PROPERTY_NAME_LENGTH = 40;
const UNDOABLE_TYPES: ReadonlySet<TransactionType> = new Set([
  'transfer',
  'bank_pay',
  'pass_start',
  'mortgage',
  'unmortgage',
]);

/**
 * Domain error carrying a machine-readable code and user-facing message.
 */
export class LedgerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
    Object.setPrototypeOf(this, LedgerError.prototype);
  }
}

function generateId(): string {
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

/**
 * Generate an unambiguous 6-character uppercase room code excluding O, 0, I, and 1.
 */
export function generateRoomCode(): string {
  const cryptoObj = globalThis.crypto;
  let code = '';
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(ROOM_CODE_LENGTH);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
    }
    return code;
  }
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

function assertNonNegativeInteger(value: number, code: string, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new LedgerError(code, `${label} must be a whole number of 0 or more.`);
  }
  return value;
}

function assertPositiveInteger(value: number, code: string, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new LedgerError(code, `${label} must be a whole number greater than 0.`);
  }
  return value;
}

function normalizePlayerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    throw new LedgerError(
      'INVALID_NAME',
      `Player name must be between 1 and ${MAX_PLAYER_NAME_LENGTH} characters.`
    );
  }
  return trimmed;
}

function getPlayersMap(room: RoomState): Record<string, Player> {
  return room.players ?? {};
}

function getMortgagesMap(room: RoomState): Record<string, Mortgage> {
  return room.mortgages ?? {};
}

function getTransactionsMap(room: RoomState): Record<string, Transaction> {
  return room.transactions ?? {};
}

function requireActivePlayer(
  players: Record<string, Player>,
  playerId: string,
  roleLabel: string
): Player {
  const player = players[playerId];
  if (!player) {
    throw new LedgerError('PLAYER_NOT_FOUND', `${roleLabel} was not found in this room.`);
  }
  if (player.status !== 'active') {
    throw new LedgerError('PLAYER_NOT_ACTIVE', `${player.name} is no longer active in this game.`);
  }
  return player;
}

function requireBanker(room: RoomState, actorId: string): Player {
  if (actorId !== room.meta.bankerId) {
    throw new LedgerError('BANKER_REQUIRED', 'Only the current Banker can perform this action.');
  }
  return requireActivePlayer(getPlayersMap(room), actorId, 'Banker');
}

function nextTimestamp(room: RoomState): number {
  let maxTs = room.meta.createdAt ?? 0;
  for (const tx of Object.values(getTransactionsMap(room))) {
    if (tx.createdAt > maxTs) {
      maxTs = tx.createdAt;
    }
  }
  for (const mortgage of Object.values(getMortgagesMap(room))) {
    if (mortgage.createdAt > maxTs) {
      maxTs = mortgage.createdAt;
    }
  }
  return Math.max(Date.now(), maxTs + 1);
}

function createTransactionRecord(params: {
  type: TransactionType;
  fromId: string;
  toId: string;
  amount: number;
  actorId: string;
  createdAt: number;
  note?: string;
  mortgageId?: string;
  reversesTxId?: string | null;
}): Transaction {
  const tx: Transaction = {
    id: generateId(),
    type: params.type,
    fromId: params.fromId,
    toId: params.toId,
    amount: params.amount,
    actorId: params.actorId,
    createdAt: params.createdAt,
    undone: false,
    reversesTxId: params.reversesTxId ?? null,
  };
  const trimmedNote = params.note?.trim();
  if (trimmedNote) {
    tx.note = trimmedNote;
  }
  if (params.mortgageId) {
    tx.mortgageId = params.mortgageId;
  }
  return tx;
}

function assertWithinNegativeLimit(
  player: Player,
  nextBalance: number,
  negativeLimit: number
): void {
  if (nextBalance < -negativeLimit) {
    throw new LedgerError(
      'INSUFFICIENT_FUNDS',
      `${player.name} does not have enough balance or debt limit for this transaction.`
    );
  }
}

function assertBankHasFunds(room: RoomState, amount: number): void {
  if (room.meta.bankBalance < amount) {
    throw new LedgerError(
      'BANK_INSUFFICIENT_FUNDS',
      'Bank does not have enough balance for this payout.'
    );
  }
}

function requireActiveGame(room: RoomState): void {
  if (room.meta.status !== 'active') {
    throw new LedgerError('GAME_NOT_STARTED', 'Choose a Banker and start the game first.');
  }
}

/**
 * Create a brand-new room in lobby state (awaiting players and Banker selection).
 */
export function createInitialRoom(input: CreateRoomInput): RoomState {
  const creatorName = normalizePlayerName(input.creatorName);
  const currencySymbol = input.currencySymbol.trim();
  if (!currencySymbol) {
    throw new LedgerError('INVALID_CURRENCY', 'Currency symbol is required.');
  }

  const startingCash = assertNonNegativeInteger(
    input.startingCash,
    'INVALID_STARTING_CASH',
    'Starting cash'
  );
  const bankStartingCash = assertNonNegativeInteger(
    input.bankStartingCash,
    'INVALID_BANK_STARTING_CASH',
    'Bank starting balance'
  );
  const negativeLimit = assertNonNegativeInteger(
    input.negativeLimit,
    'INVALID_NEGATIVE_LIMIT',
    'Negative limit'
  );
  const passStartAmount = assertNonNegativeInteger(
    input.passStartAmount,
    'INVALID_PASS_START',
    'Pass Start amount'
  );

  if (input.mortgageInterestPct !== 0 && input.mortgageInterestPct !== 10) {
    throw new LedgerError('INVALID_INTEREST', 'Mortgage interest must be 0% or 10%.');
  }

  const code = (input.code ? input.code.trim().toUpperCase() : generateRoomCode());
  if (code.length !== ROOM_CODE_LENGTH) {
    throw new LedgerError('INVALID_ROOM_CODE', 'Room code must be 6 characters.');
  }

  const creatorId = input.creatorId?.trim() || generateId();
  const currencyLocale = input.currencyLocale?.trim() || (currencySymbol === '₹' ? 'en-IN' : 'en-US');
  const now = Date.now();

  return {
    meta: {
      code,
      createdAt: now,
      creatorId,
      bankerId: '',
      status: 'lobby',
      currencySymbol,
      currencyLocale,
      startingCash,
      bankStartingCash,
      bankBalance: bankStartingCash,
      negativeLimit,
      passStartAmount,
      mortgageInterestPct: input.mortgageInterestPct,
    },
    players: {
      [creatorId]: {
        id: creatorId,
        name: creatorName,
        balance: startingCash,
        status: 'active',
        joinedAt: now,
      },
    },
    mortgages: {},
    transactions: {},
  };
}

/**
 * Add a new player seat (lobby only, up to 4 players) or reclaim an existing seat.
 */
export function joinOrReclaimPlayer(
  room: RoomState,
  input: { playerId: string; name: string; reclaimPlayerId?: string }
): { room: RoomState; playerId: string } {
  const players = getPlayersMap(room);

  if (input.reclaimPlayerId) {
    const existing = players[input.reclaimPlayerId];
    if (!existing) {
      throw new LedgerError('PLAYER_NOT_FOUND', 'That seat could not be found in this room.');
    }
    if (existing.status === 'removed') {
      throw new LedgerError('PLAYER_REMOVED', `${existing.name} was removed and cannot be reclaimed.`);
    }
    return { room, playerId: existing.id };
  }

  if (room.meta.status !== 'lobby') {
    throw new LedgerError(
      'GAME_ALREADY_STARTED',
      'This game has already started. Use Reclaim Seat to resume an existing player.'
    );
  }

  const activeSeatCount = Object.values(players).filter((p) => p.status !== 'removed').length;
  if (activeSeatCount >= MAX_PLAYERS) {
    throw new LedgerError('ROOM_FULL', `Room is full (maximum ${MAX_PLAYERS} players).`);
  }

  const trimmedName = normalizePlayerName(input.name);
  const normalizedKey = trimmedName.toLowerCase();
  const playerId = input.playerId.trim();
  if (!playerId) {
    throw new LedgerError('INVALID_PLAYER_ID', 'Player ID is required.');
  }
  if (players[playerId]) {
    throw new LedgerError('DUPLICATE_PLAYER_ID', 'This player ID is already seated in the room.');
  }

  for (const existing of Object.values(players)) {
    if (existing.status !== 'removed' && existing.name.trim().toLowerCase() === normalizedKey) {
      throw new LedgerError(
        'DUPLICATE_NAME',
        `"${existing.name}" is already in this room. Use Reclaim Seat to resume their wallet.`
      );
    }
  }

  const now = nextTimestamp(room);
  const newPlayer: Player = {
    id: playerId,
    name: trimmedName,
    balance: room.meta.startingCash,
    status: 'active',
    joinedAt: now,
  };

  return {
    playerId,
    room: {
      ...room,
      players: {
        ...players,
        [playerId]: newPlayer,
      },
    },
  };
}

/**
 * Select which joined active player will be Banker while still in lobby (any active player).
 */
export function selectLobbyBanker(
  room: RoomState,
  input: { bankerId: string; actorId: string }
): RoomState {
  if (room.meta.status !== 'lobby') {
    throw new LedgerError('GAME_ALREADY_STARTED', 'Use Reassign Banker once the game has started.');
  }
  const players = getPlayersMap(room);
  requireActivePlayer(players, input.actorId, 'Actor');
  const chosen = requireActivePlayer(players, input.bankerId, 'Selected Banker');

  return {
    ...room,
    meta: {
      ...room.meta,
      bankerId: chosen.id,
    },
  };
}

/**
 * Lock in Banker (optional override) and transition room from lobby to active play (any active player).
 */
export function startGame(
  room: RoomState,
  input: { actorId: string; bankerId?: string }
): RoomState {
  if (room.meta.status !== 'lobby') {
    throw new LedgerError('GAME_ALREADY_STARTED', 'Game has already started.');
  }
  const players = getPlayersMap(room);
  requireActivePlayer(players, input.actorId, 'Actor');
  const chosenBankerId = input.bankerId?.trim() || room.meta.bankerId;
  if (!chosenBankerId) {
    throw new LedgerError('BANKER_REQUIRED', 'Choose a Banker before starting the game.');
  }
  const banker = requireActivePlayer(players, chosenBankerId, 'Banker');

  return {
    ...room,
    meta: {
      ...room.meta,
      bankerId: banker.id,
      status: 'active',
    },
  };
}

/**
 * Execute a direct player transfer, Bank payment, or Pass Start credit.
 */
export function applyPayment(
  room: RoomState,
  input: {
    fromId: string;
    toId: string;
    amount: number;
    actorId: string;
    note?: string;
    type?: 'transfer' | 'bank_pay' | 'pass_start';
  }
): RoomState {
  requireActiveGame(room);
  const type = input.type ?? 'transfer';
  const amount = assertPositiveInteger(input.amount, 'INVALID_AMOUNT', 'Payment amount');

  if (input.fromId === input.toId) {
    throw new LedgerError('SELF_PAY', 'Sender and recipient cannot be the same.');
  }

  const players = getPlayersMap(room);
  const transactions = getTransactionsMap(room);
  const now = nextTimestamp(room);

  if (type === 'bank_pay' || type === 'pass_start') {
    requireBanker(room, input.actorId);
    if (input.fromId !== 'BANK' || input.toId === 'BANK') {
      throw new LedgerError('INVALID_BANK_PAYOUT', 'Bank payouts must go from Bank to an active player.');
    }
    assertBankHasFunds(room, amount);
    const recipient = requireActivePlayer(players, input.toId, 'Recipient');
    const tx = createTransactionRecord({
      type,
      fromId: 'BANK',
      toId: recipient.id,
      amount,
      actorId: input.actorId,
      createdAt: now,
      note: input.note,
    });

    return {
      ...room,
      meta: {
        ...room.meta,
        bankBalance: room.meta.bankBalance - amount,
      },
      players: {
        ...players,
        [recipient.id]: {
          ...recipient,
          balance: recipient.balance + amount,
        },
      },
      transactions: {
        ...transactions,
        [tx.id]: tx,
      },
    };
  }

  if (input.fromId === 'BANK') {
    throw new LedgerError('BANKER_REQUIRED', 'Bank payouts must use bank_pay or pass_start.');
  }
  if (input.actorId !== input.fromId) {
    throw new LedgerError('UNAUTHORIZED', 'You can only send payments from your own wallet.');
  }

  const sender = requireActivePlayer(players, input.fromId, 'Sender');
  const nextSenderBalance = sender.balance - amount;
  assertWithinNegativeLimit(sender, nextSenderBalance, room.meta.negativeLimit);

  const nextPlayers: Record<string, Player> = {
    ...players,
    [sender.id]: {
      ...sender,
      balance: nextSenderBalance,
    },
  };

  let nextBankBalance = room.meta.bankBalance;
  if (input.toId === 'BANK') {
    nextBankBalance += amount;
  } else {
    const recipient = requireActivePlayer(players, input.toId, 'Recipient');
    nextPlayers[recipient.id] = {
      ...recipient,
      balance: recipient.balance + amount,
    };
  }

  const tx = createTransactionRecord({
    type: 'transfer',
    fromId: sender.id,
    toId: input.toId,
    amount,
    actorId: input.actorId,
    createdAt: now,
    note: input.note,
  });

  return {
    ...room,
    meta: {
      ...room.meta,
      bankBalance: nextBankBalance,
    },
    players: nextPlayers,
    transactions: {
      ...transactions,
      [tx.id]: tx,
    },
  };
}

/**
 * Issue a mortgage from the Bank to an active player (Banker only).
 */
export function issueMortgage(
  room: RoomState,
  input: { playerId: string; propertyName: string; principal: number; actorId: string }
): RoomState {
  requireActiveGame(room);
  requireBanker(room, input.actorId);
  const players = getPlayersMap(room);
  const mortgages = getMortgagesMap(room);
  const transactions = getTransactionsMap(room);

  const player = requireActivePlayer(players, input.playerId, 'Player');
  const propertyName = input.propertyName.trim();
  if (propertyName.length < 1 || propertyName.length > MAX_PROPERTY_NAME_LENGTH) {
    throw new LedgerError(
      'INVALID_PROPERTY_NAME',
      `Property name must be between 1 and ${MAX_PROPERTY_NAME_LENGTH} characters.`
    );
  }
  const principal = assertPositiveInteger(input.principal, 'INVALID_AMOUNT', 'Mortgage amount');
  assertBankHasFunds(room, principal);
  const payoffAmount =
    room.meta.mortgageInterestPct === 10 ? Math.round(principal * 1.1) : principal;
  const now = nextTimestamp(room);

  const mortgage: Mortgage = {
    id: generateId(),
    playerId: player.id,
    propertyName,
    principal,
    payoffAmount,
    active: true,
    createdAt: now,
    clearedAt: null,
  };

  const tx = createTransactionRecord({
    type: 'mortgage',
    fromId: 'BANK',
    toId: player.id,
    amount: principal,
    actorId: input.actorId,
    createdAt: now,
    note: propertyName,
    mortgageId: mortgage.id,
  });

  return {
    ...room,
    meta: {
      ...room.meta,
      bankBalance: room.meta.bankBalance - principal,
    },
    players: {
      ...players,
      [player.id]: {
        ...player,
        balance: player.balance + principal,
      },
    },
    mortgages: {
      ...mortgages,
      [mortgage.id]: mortgage,
    },
    transactions: {
      ...transactions,
      [tx.id]: tx,
    },
  };
}

/**
 * Clear an active mortgage by deducting payoffAmount from the player (Banker only).
 */
export function clearMortgage(
  room: RoomState,
  input: { mortgageId: string; actorId: string }
): RoomState {
  requireActiveGame(room);
  requireBanker(room, input.actorId);
  const players = getPlayersMap(room);
  const mortgages = getMortgagesMap(room);
  const transactions = getTransactionsMap(room);

  const mortgage = mortgages[input.mortgageId];
  if (!mortgage) {
    throw new LedgerError('MORTGAGE_NOT_FOUND', 'Mortgage could not be found.');
  }
  if (!mortgage.active) {
    throw new LedgerError('MORTGAGE_ALREADY_CLEARED', 'This mortgage has already been cleared.');
  }

  const player = requireActivePlayer(players, mortgage.playerId, 'Player');
  const nextBalance = player.balance - mortgage.payoffAmount;
  assertWithinNegativeLimit(player, nextBalance, room.meta.negativeLimit);

  const now = nextTimestamp(room);
  const tx = createTransactionRecord({
    type: 'unmortgage',
    fromId: player.id,
    toId: 'BANK',
    amount: mortgage.payoffAmount,
    actorId: input.actorId,
    createdAt: now,
    note: mortgage.propertyName,
    mortgageId: mortgage.id,
  });

  return {
    ...room,
    meta: {
      ...room.meta,
      bankBalance: room.meta.bankBalance + mortgage.payoffAmount,
    },
    players: {
      ...players,
      [player.id]: {
        ...player,
        balance: nextBalance,
      },
    },
    mortgages: {
      ...mortgages,
      [mortgage.id]: {
        ...mortgage,
        active: false,
        clearedAt: now,
      },
    },
    transactions: {
      ...transactions,
      [tx.id]: tx,
    },
  };
}

/**
 * Mark an active player as bankrupt or removed, void their mortgages, and reassign Banker if needed.
 */
export function markPlayerExit(
  room: RoomState,
  input: { targetPlayerId: string; status: 'bankrupt' | 'removed'; actorId: string }
): RoomState {
  requireActiveGame(room);
  requireBanker(room, input.actorId);
  const players = getPlayersMap(room);
  const mortgages = getMortgagesMap(room);
  const transactions = getTransactionsMap(room);

  const target = requireActivePlayer(players, input.targetPlayerId, 'Player');
  const now = nextTimestamp(room);

  const nextPlayers: Record<string, Player> = {
    ...players,
    [target.id]: {
      ...target,
      balance: 0,
      status: input.status,
    },
  };

  const nextMortgages: Record<string, Mortgage> = { ...mortgages };
  for (const [id, mortgage] of Object.entries(mortgages)) {
    if (mortgage.playerId === target.id && mortgage.active) {
      nextMortgages[id] = {
        ...mortgage,
        active: false,
        clearedAt: now,
      };
    }
  }

  let nextBankerId = room.meta.bankerId;
  if (target.id === room.meta.bankerId) {
    const nextActive = Object.values(nextPlayers)
      .filter((p) => p.status === 'active')
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];
    nextBankerId = nextActive ? nextActive.id : '';
  }

  const tx = createTransactionRecord({
    type: input.status === 'bankrupt' ? 'bankrupt' : 'remove',
    fromId: target.id,
    toId: 'BANK',
    amount: 0,
    actorId: input.actorId,
    createdAt: now,
  });

  return {
    ...room,
    meta: {
      ...room.meta,
      bankerId: nextBankerId,
    },
    players: nextPlayers,
    mortgages: nextMortgages,
    transactions: {
      ...transactions,
      [tx.id]: tx,
    },
  };
}

/**
 * Transfer the Banker role to any active player (current Banker, or any active player if Banker exited).
 */
export function reassignBanker(
  room: RoomState,
  input: { newBankerId: string; actorId: string }
): RoomState {
  const players = getPlayersMap(room);
  requireActivePlayer(players, input.actorId, 'Actor');
  const currentBanker = room.meta.bankerId ? players[room.meta.bankerId] : undefined;
  const bankerActive = Boolean(currentBanker && currentBanker.status === 'active');

  if (bankerActive && input.actorId !== room.meta.bankerId) {
    throw new LedgerError('BANKER_REQUIRED', 'Only the current Banker can transfer the Banker role.');
  }
  const nextBanker = requireActivePlayer(players, input.newBankerId, 'New Banker');

  return {
    ...room,
    meta: {
      ...room.meta,
      bankerId: nextBanker.id,
    },
  };
}

function findMortgageForTx(
  mortgages: Record<string, Mortgage>,
  tx: Transaction,
  expectActive: boolean
): Mortgage | undefined {
  if (tx.mortgageId && mortgages[tx.mortgageId]) {
    return mortgages[tx.mortgageId];
  }
  const playerId = tx.type === 'mortgage' ? tx.toId : tx.fromId;
  return Object.values(mortgages).find(
    (m) => m.playerId === playerId && m.active === expectActive && m.propertyName === tx.note
  );
}

function getLatestNonUndoTransaction(room: RoomState): Transaction | null {
  return (
    Object.values(getTransactionsMap(room))
      .filter((tx) => !tx.undone && tx.type !== 'undo')
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0] ?? null
  );
}

/**
 * Return the latest transaction eligible for Undo, or null if blocked by a player exit.
 */
export function getLatestUndoableTransaction(room: RoomState): Transaction | null {
  const latest = getLatestNonUndoTransaction(room);
  if (!latest || latest.type === 'bankrupt' || latest.type === 'remove') {
    return null;
  }
  return UNDOABLE_TYPES.has(latest.type) ? latest : null;
}

/**
 * Reverse the latest non-undone financial transaction (Banker only).
 */
export function undoLastTransaction(room: RoomState, input: { actorId: string }): RoomState {
  requireActiveGame(room);
  requireBanker(room, input.actorId);
  const players = getPlayersMap(room);
  const mortgages = getMortgagesMap(room);
  const transactions = getTransactionsMap(room);

  const latest = getLatestNonUndoTransaction(room);
  if (!latest) {
    throw new LedgerError('NOTHING_TO_UNDO', 'There are no transactions left to undo.');
  }
  if (latest.type === 'bankrupt' || latest.type === 'remove') {
    throw new LedgerError('CANNOT_UNDO', 'Cannot undo past a player bankruptcy or removal.');
  }

  const candidate = getLatestUndoableTransaction(room);
  if (!candidate) {
    throw new LedgerError('NOTHING_TO_UNDO', 'There are no transactions left to undo.');
  }

  const nextPlayers: Record<string, Player> = { ...players };
  const nextMortgages: Record<string, Mortgage> = { ...mortgages };
  let nextBankBalance = room.meta.bankBalance;
  const now = nextTimestamp(room);

  switch (candidate.type) {
    case 'transfer': {
      const originalSender = requireActivePlayer(players, candidate.fromId, 'Original sender');
      if (candidate.toId === 'BANK') {
        assertBankHasFunds(room, candidate.amount);
        nextBankBalance -= candidate.amount;
      } else {
        const originalRecipient = requireActivePlayer(players, candidate.toId, 'Original recipient');
        const revertedBalance = originalRecipient.balance - candidate.amount;
        assertWithinNegativeLimit(originalRecipient, revertedBalance, room.meta.negativeLimit);
        nextPlayers[originalRecipient.id] = {
          ...originalRecipient,
          balance: revertedBalance,
        };
      }
      nextPlayers[originalSender.id] = {
        ...originalSender,
        balance: originalSender.balance + candidate.amount,
      };
      break;
    }

    case 'bank_pay':
    case 'pass_start': {
      const originalRecipient = requireActivePlayer(players, candidate.toId, 'Original recipient');
      const revertedBalance = originalRecipient.balance - candidate.amount;
      assertWithinNegativeLimit(originalRecipient, revertedBalance, room.meta.negativeLimit);
      nextPlayers[originalRecipient.id] = {
        ...originalRecipient,
        balance: revertedBalance,
      };
      nextBankBalance += candidate.amount;
      break;
    }

    case 'mortgage': {
      const player = requireActivePlayer(players, candidate.toId, 'Player');
      const mortgage = findMortgageForTx(mortgages, candidate, true);
      if (!mortgage || !mortgage.active) {
        throw new LedgerError(
          'CANNOT_UNDO',
          'This mortgage has already been cleared and cannot be undone.'
        );
      }
      const revertedBalance = player.balance - candidate.amount;
      assertWithinNegativeLimit(player, revertedBalance, room.meta.negativeLimit);
      nextPlayers[player.id] = {
        ...player,
        balance: revertedBalance,
      };
      nextMortgages[mortgage.id] = {
        ...mortgage,
        active: false,
        clearedAt: now,
      };
      nextBankBalance += candidate.amount;
      break;
    }

    case 'unmortgage': {
      const player = requireActivePlayer(players, candidate.fromId, 'Player');
      const mortgage = findMortgageForTx(mortgages, candidate, false);
      if (!mortgage || mortgage.active) {
        throw new LedgerError('CANNOT_UNDO', 'This mortgage state cannot be restored.');
      }
      assertBankHasFunds(room, candidate.amount);
      nextPlayers[player.id] = {
        ...player,
        balance: player.balance + candidate.amount,
      };
      nextMortgages[mortgage.id] = {
        ...mortgage,
        active: true,
        clearedAt: null,
      };
      nextBankBalance -= candidate.amount;
      break;
    }

    default:
      throw new LedgerError('CANNOT_UNDO', 'This transaction type cannot be undone.');
  }

  const undoTx = createTransactionRecord({
    type: 'undo',
    fromId: candidate.toId,
    toId: candidate.fromId,
    amount: candidate.amount,
    actorId: input.actorId,
    createdAt: now,
    note: candidate.note ? `Undo: ${candidate.note}` : `Undo ${candidate.type}`,
    reversesTxId: candidate.id,
  });

  return {
    ...room,
    meta: {
      ...room.meta,
      bankBalance: nextBankBalance,
    },
    players: nextPlayers,
    mortgages: nextMortgages,
    transactions: {
      ...transactions,
      [candidate.id]: {
        ...candidate,
        undone: true,
      },
      [undoTx.id]: undoTx,
    },
  };
}
