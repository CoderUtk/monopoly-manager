import { describe, it, expect } from 'vitest';
import { formatCurrency, computeQuickChips } from './format';
import {
  LedgerError,
  generateRoomCode,
  createInitialRoom,
  joinOrReclaimPlayer,
  applyPayment,
  issueMortgage,
  clearMortgage,
  markPlayerExit,
  reassignBanker,
  getLatestUndoableTransaction,
  undoLastTransaction,
} from './ledger';
import type { RoomState } from '../types/game';

function makeBaseRoom(overrides?: Partial<{
  startingCash: number;
  negativeLimit: number;
  passStartAmount: number;
  mortgageInterestPct: 0 | 10;
}>): RoomState {
  return createInitialRoom({
    creatorId: 'p-creator',
    creatorName: 'Aarav',
    currencySymbol: '₹',
    currencyLocale: 'en-IN',
    startingCash: overrides?.startingCash ?? 15000,
    negativeLimit: overrides?.negativeLimit ?? 5000,
    passStartAmount: overrides?.passStartAmount ?? 2000,
    mortgageInterestPct: overrides?.mortgageInterestPct ?? 10,
    code: 'AB23CD',
  });
}

function makeRoomWithPlayers(): RoomState {
  let room = makeBaseRoom();
  room = joinOrReclaimPlayer(room, { playerId: 'p-raj', name: 'Raj' }).room;
  room = joinOrReclaimPlayer(room, { playerId: 'p-priya', name: 'Priya' }).room;
  return room;
}

describe('formatCurrency & computeQuickChips', () => {
  it('formats INR positive, zero, and negative amounts with minus before symbol', () => {
    expect(formatCurrency(150000, '₹', 'en-IN')).toBe('₹1,50,000');
    expect(formatCurrency(-2500, '₹', 'en-IN')).toBe('-₹2,500');
    expect(formatCurrency(0, '₹', 'en-IN')).toBe('₹0');
    expect(formatCurrency(-0, '₹', 'en-IN')).toBe('₹0');
  });

  it('formats other currencies using provided locale', () => {
    expect(formatCurrency(150000, '$', 'en-US')).toBe('$150,000');
    expect(formatCurrency(-450, '€', 'en-US')).toBe('-€450');
  });

  it('computes sensible ascending positive integer quick chips', () => {
    const chips = computeQuickChips(15000, 2000);
    expect(chips.length).toBeGreaterThanOrEqual(4);
    expect(chips.every((c) => Number.isInteger(c) && c > 0)).toBe(true);
    for (let i = 1; i < chips.length; i += 1) {
      expect(chips[i]).toBeGreaterThan(chips[i - 1]);
    }
    expect(chips).toContain(2000);

    const classicChips = computeQuickChips(1500, 200);
    expect(classicChips).toContain(200);
    expect(classicChips.every((c) => Number.isInteger(c) && c > 0)).toBe(true);

    const zeroRuleChips = computeQuickChips(0, 0);
    expect(zeroRuleChips.length).toBeGreaterThanOrEqual(3);
    expect(zeroRuleChips.every((c) => Number.isInteger(c) && c > 0)).toBe(true);
  });
});

describe('generateRoomCode & createInitialRoom', () => {
  it('generates 6-char uppercase codes excluding O, 0, I, 1', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('sets creator as active player with startingCash and bankerId === creatorId', () => {
    const room = makeBaseRoom();
    expect(room.meta.code).toBe('AB23CD');
    expect(room.meta.creatorId).toBe('p-creator');
    expect(room.meta.bankerId).toBe('p-creator');
    expect(room.players['p-creator']).toMatchObject({
      id: 'p-creator',
      name: 'Aarav',
      balance: 15000,
      status: 'active',
    });
    expect(Object.keys(room.mortgages)).toHaveLength(0);
    expect(Object.keys(room.transactions)).toHaveLength(0);
  });

  it('rejects invalid room configuration inputs', () => {
    expect(() =>
      createInitialRoom({
        creatorName: '   ',
        currencySymbol: '₹',
        startingCash: 15000,
        negativeLimit: 5000,
        passStartAmount: 2000,
        mortgageInterestPct: 10,
      })
    ).toThrow(LedgerError);

    expect(() =>
      createInitialRoom({
        creatorName: 'Aarav',
        currencySymbol: '₹',
        startingCash: -100,
        negativeLimit: 5000,
        passStartAmount: 2000,
        mortgageInterestPct: 10,
      })
    ).toThrow(LedgerError);
  });
});

describe('joinOrReclaimPlayer', () => {
  it('adds a new active player with startingCash without mutating input room', () => {
    const initial = makeBaseRoom();
    const { room, playerId } = joinOrReclaimPlayer(initial, {
      playerId: 'p-raj',
      name: '  Raj  ',
    });

    expect(playerId).toBe('p-raj');
    expect(room.players['p-raj']).toMatchObject({
      id: 'p-raj',
      name: 'Raj',
      balance: 15000,
      status: 'active',
    });
    expect(initial.players['p-raj']).toBeUndefined();
  });

  it('blocks case-insensitive and whitespace-trimmed duplicate names (" raj " vs "Raj")', () => {
    const { room } = joinOrReclaimPlayer(makeBaseRoom(), {
      playerId: 'p-raj',
      name: 'Raj',
    });

    expect(() =>
      joinOrReclaimPlayer(room, { playerId: 'p-raj-2', name: ' raj ' })
    ).toThrow(LedgerError);
  });

  it('reclaimPlayerId returns existing seat ID without altering balances', () => {
    let room = makeRoomWithPlayers();
    room = applyPayment(room, {
      fromId: 'p-raj',
      toId: 'p-priya',
      amount: 1200,
      actorId: 'p-raj',
    });

    const reclaimed = joinOrReclaimPlayer(room, {
      playerId: 'p-new-browser-uuid',
      name: 'Raj',
      reclaimPlayerId: 'p-raj',
    });

    expect(reclaimed.playerId).toBe('p-raj');
    expect(reclaimed.room.players['p-raj'].balance).toBe(13800);
    expect(reclaimed.room.players['p-new-browser-uuid']).toBeUndefined();
  });
});

describe('applyPayment', () => {
  it('allows landing exactly on -negativeLimit and rejects 1 unit past -negativeLimit', () => {
    const room = makeRoomWithPlayers(); // balance 15000, negativeLimit 5000 => min -5000

    const atLimit = applyPayment(room, {
      fromId: 'p-raj',
      toId: 'p-priya',
      amount: 20000,
      actorId: 'p-raj',
      note: 'Rent',
    });

    expect(atLimit.players['p-raj'].balance).toBe(-5000);
    expect(atLimit.players['p-priya'].balance).toBe(35000);
    // Original room stays untouched (pure/immutable)
    expect(room.players['p-raj'].balance).toBe(15000);

    expect(() =>
      applyPayment(room, {
        fromId: 'p-raj',
        toId: 'p-priya',
        amount: 20001,
        actorId: 'p-raj',
      })
    ).toThrow(LedgerError);
  });

  it('enforces negativeLimit === 0 as no negative balance allowed', () => {
    let room = makeBaseRoom({ startingCash: 1000, negativeLimit: 0 });
    room = joinOrReclaimPlayer(room, { playerId: 'p-raj', name: 'Raj' }).room;

    const exactZero = applyPayment(room, {
      fromId: 'p-raj',
      toId: 'BANK',
      amount: 1000,
      actorId: 'p-raj',
    });
    expect(exactZero.players['p-raj'].balance).toBe(0);

    expect(() =>
      applyPayment(room, {
        fromId: 'p-raj',
        toId: 'BANK',
        amount: 1001,
        actorId: 'p-raj',
      })
    ).toThrow(LedgerError);
  });

  it('rejects 0, negative, decimal, NaN, and self-pay transfers', () => {
    const room = makeRoomWithPlayers();
    const invalidAmounts = [0, -10, 12.5, Number.NaN, Number.POSITIVE_INFINITY];

    for (const amount of invalidAmounts) {
      expect(() =>
        applyPayment(room, {
          fromId: 'p-raj',
          toId: 'p-priya',
          amount,
          actorId: 'p-raj',
        })
      ).toThrow(LedgerError);
    }

    expect(() =>
      applyPayment(room, {
        fromId: 'p-raj',
        toId: 'p-raj',
        amount: 500,
        actorId: 'p-raj',
      })
    ).toThrow(LedgerError);
  });

  it('requires actorId === meta.bankerId for bank_pay and pass_start', () => {
    const room = makeRoomWithPlayers();

    expect(() =>
      applyPayment(room, {
        fromId: 'BANK',
        toId: 'p-raj',
        amount: 2000,
        actorId: 'p-raj',
        type: 'pass_start',
      })
    ).toThrow(LedgerError);

    expect(() =>
      applyPayment(room, {
        fromId: 'BANK',
        toId: 'p-raj',
        amount: 500,
        actorId: 'p-priya',
        type: 'bank_pay',
      })
    ).toThrow(LedgerError);

    const afterPassStart = applyPayment(room, {
      fromId: 'BANK',
      toId: 'p-raj',
      amount: 2000,
      actorId: 'p-creator',
      type: 'pass_start',
    });
    expect(afterPassStart.players['p-raj'].balance).toBe(17000);

    const afterBankPay = applyPayment(afterPassStart, {
      fromId: 'BANK',
      toId: 'p-priya',
      amount: 500,
      actorId: 'p-creator',
      type: 'bank_pay',
      note: 'Bank dividend',
    });
    expect(afterBankPay.players['p-priya'].balance).toBe(15500);
  });
});

describe('issueMortgage & clearMortgage', () => {
  it('computes payoffAmount at 0% and 10% and credits player', () => {
    const room0 = joinOrReclaimPlayer(
      makeBaseRoom({ mortgageInterestPct: 0 }),
      { playerId: 'p-raj', name: 'Raj' }
    ).room;

    const mortgaged0 = issueMortgage(room0, {
      playerId: 'p-raj',
      propertyName: 'Mumbai',
      principal: 305,
      actorId: 'p-creator',
    });
    const m0 = Object.values(mortgaged0.mortgages)[0];
    expect(m0.principal).toBe(305);
    expect(m0.payoffAmount).toBe(305);
    expect(m0.active).toBe(true);
    expect(mortgaged0.players['p-raj'].balance).toBe(15305);

    const room10 = joinOrReclaimPlayer(
      makeBaseRoom({ mortgageInterestPct: 10 }),
      { playerId: 'p-raj', name: 'Raj' }
    ).room;

    const mortgaged10 = issueMortgage(room10, {
      playerId: 'p-raj',
      propertyName: 'Delhi',
      principal: 305,
      actorId: 'p-creator',
    });
    const m10 = Object.values(mortgaged10.mortgages)[0];
    expect(m10.principal).toBe(305);
    expect(m10.payoffAmount).toBe(Math.round(305 * 1.1));
    expect(mortgaged10.players['p-raj'].balance).toBe(15305);
  });

  it('clears mortgage by deducting payoffAmount and rejects when overdraft would be breached', () => {
    let room = makeRoomWithPlayers(); // startingCash 15000, negativeLimit 5000, 10% interest
    room = issueMortgage(room, {
      playerId: 'p-raj',
      propertyName: 'Bengaluru',
      principal: 2000,
      actorId: 'p-creator',
    });
    const mortgageId = Object.keys(room.mortgages)[0];
    expect(room.players['p-raj'].balance).toBe(17000);
    expect(room.mortgages[mortgageId].payoffAmount).toBe(2200);

    // Spend Raj down to -3000 so payoff (2200) would push to -5200 (< -5000)
    const lowRoom = applyPayment(room, {
      fromId: 'p-raj',
      toId: 'p-priya',
      amount: 20000,
      actorId: 'p-raj',
    });
    expect(lowRoom.players['p-raj'].balance).toBe(-3000);

    expect(() =>
      clearMortgage(lowRoom, { mortgageId, actorId: 'p-creator' })
    ).toThrow(LedgerError);
    // Mortgage remains active on failed clear
    expect(lowRoom.mortgages[mortgageId].active).toBe(true);

    // Clearing on original room succeeds
    const cleared = clearMortgage(room, { mortgageId, actorId: 'p-creator' });
    expect(cleared.players['p-raj'].balance).toBe(14800);
    expect(cleared.mortgages[mortgageId].active).toBe(false);
    expect(cleared.mortgages[mortgageId].clearedAt).not.toBeNull();
  });
});

describe('markPlayerExit & reassignBanker', () => {
  it('zeros balance, voids active mortgages, and reassigns bankerId to active Creator or next active player', () => {
    let room = makeRoomWithPlayers();
    // Reassign banker to Raj first, then issue Raj a mortgage
    room = reassignBanker(room, {
      newBankerId: 'p-raj',
      actorId: 'p-creator',
    });
    expect(room.meta.bankerId).toBe('p-raj');

    room = issueMortgage(room, {
      playerId: 'p-raj',
      propertyName: 'Chennai',
      principal: 1000,
      actorId: 'p-raj',
    });
    const rajMortgageId = Object.keys(room.mortgages)[0];

    // Banker Raj goes bankrupt -> bankerId returns to active Creator
    const afterRajExit = markPlayerExit(room, {
      targetPlayerId: 'p-raj',
      status: 'bankrupt',
      actorId: 'p-raj',
    });
    expect(afterRajExit.players['p-raj'].status).toBe('bankrupt');
    expect(afterRajExit.players['p-raj'].balance).toBe(0);
    expect(afterRajExit.mortgages[rajMortgageId].active).toBe(false);
    expect(afterRajExit.meta.bankerId).toBe('p-creator');

    // Now Creator (who is also Banker) is removed -> bankerId moves to Priya
    const afterCreatorExit = markPlayerExit(afterRajExit, {
      targetPlayerId: 'p-creator',
      status: 'removed',
      actorId: 'p-creator',
    });
    expect(afterCreatorExit.players['p-creator'].status).toBe('removed');
    expect(afterCreatorExit.players['p-creator'].balance).toBe(0);
    expect(afterCreatorExit.meta.bankerId).toBe('p-priya');
  });
});

describe('undoLastTransaction', () => {
  it('reverses transfer, bank_pay, pass_start, mortgage, and unmortgage, skipping already-undone entries', () => {
    let room = makeRoomWithPlayers();

    // 1. transfer: Raj -> Priya 1000 (Raj 14000, Priya 16000)
    room = applyPayment(room, {
      fromId: 'p-raj',
      toId: 'p-priya',
      amount: 1000,
      actorId: 'p-raj',
    });
    // 2. pass_start: BANK -> Raj 2000 (Raj 16000)
    room = applyPayment(room, {
      fromId: 'BANK',
      toId: 'p-raj',
      amount: 2000,
      actorId: 'p-creator',
      type: 'pass_start',
    });
    // 3. bank_pay: BANK -> Priya 500 (Priya 16500)
    room = applyPayment(room, {
      fromId: 'BANK',
      toId: 'p-priya',
      amount: 500,
      actorId: 'p-creator',
      type: 'bank_pay',
    });
    // 4. mortgage: Raj +1000 (Raj 17000, payoff 1100)
    room = issueMortgage(room, {
      playerId: 'p-raj',
      propertyName: 'Goa',
      principal: 1000,
      actorId: 'p-creator',
    });
    const mortgageId = Object.keys(room.mortgages)[0];
    // 5. unmortgage: Raj -1100 (Raj 15900, active: false)
    room = clearMortgage(room, { mortgageId, actorId: 'p-creator' });
    expect(room.players['p-raj'].balance).toBe(15900);
    expect(room.mortgages[mortgageId].active).toBe(false);

    // Undo #5 (unmortgage) -> Raj 17000, active: true
    room = undoLastTransaction(room, { actorId: 'p-creator' });
    expect(room.players['p-raj'].balance).toBe(17000);
    expect(room.mortgages[mortgageId].active).toBe(true);

    // Undo #4 (mortgage) -> skips undone #5 and undo tx, reverses mortgage -> Raj 16000, active: false
    room = undoLastTransaction(room, { actorId: 'p-creator' });
    expect(room.players['p-raj'].balance).toBe(16000);
    expect(room.mortgages[mortgageId].active).toBe(false);

    // Undo #3 (bank_pay) -> Priya 16000
    room = undoLastTransaction(room, { actorId: 'p-creator' });
    expect(room.players['p-priya'].balance).toBe(16000);

    // Undo #2 (pass_start) -> Raj 14000
    room = undoLastTransaction(room, { actorId: 'p-creator' });
    expect(room.players['p-raj'].balance).toBe(14000);

    // Undo #1 (transfer) -> Raj 15000, Priya 15000
    room = undoLastTransaction(room, { actorId: 'p-creator' });
    expect(room.players['p-raj'].balance).toBe(15000);
    expect(room.players['p-priya'].balance).toBe(15000);

    // Nothing left to undo
    expect(() =>
      undoLastTransaction(room, { actorId: 'p-creator' })
    ).toThrow(LedgerError);
  });

  it('rejects undo if reversing would push former recipient below -negativeLimit', () => {
    const room = makeRoomWithPlayers(); // startingCash 15000, negativeLimit 5000
    const directState: RoomState = {
      ...room,
      players: {
        ...room.players,
        'p-raj': { ...room.players['p-raj'], balance: -4000 },
      },
      transactions: {
        'tx-1': {
          id: 'tx-1',
          type: 'bank_pay',
          fromId: 'BANK',
          toId: 'p-raj',
          amount: 5000,
          actorId: 'p-creator',
          createdAt: Date.now(),
          undone: false,
          reversesTxId: null,
        },
      },
    };

    expect(() =>
      undoLastTransaction(directState, { actorId: 'p-creator' })
    ).toThrow(LedgerError);
    expect(directState.transactions['tx-1'].undone).toBe(false);
    expect(directState.players['p-raj'].balance).toBe(-4000);
  });

  it('blocks undo past a player bankruptcy or removal and leaves state untouched', () => {
    for (const exitStatus of ['bankrupt', 'removed'] as const) {
      let room = makeRoomWithPlayers();
      room = issueMortgage(room, {
        playerId: 'p-priya',
        propertyName: 'Kolkata',
        principal: 1000,
        actorId: 'p-creator',
      });
      const priyaMortgageId = Object.keys(room.mortgages)[0];

      room = applyPayment(room, {
        fromId: 'p-raj',
        toId: 'p-priya',
        amount: 2000,
        actorId: 'p-raj',
      });

      room = markPlayerExit(room, {
        targetPlayerId: 'p-raj',
        status: exitStatus,
        actorId: 'p-creator',
      });

      expect(getLatestUndoableTransaction(room)).toBeNull();

      const snapshotBefore = structuredClone(room);
      expect(() =>
        undoLastTransaction(room, { actorId: 'p-creator' })
      ).toThrowError(
        new LedgerError('CANNOT_UNDO', 'Cannot undo past a player bankruptcy or removal.')
      );
      expect(room).toEqual(snapshotBefore);
      expect(room.players['p-priya'].balance).toBe(18000);
      expect(room.mortgages[priyaMortgageId].active).toBe(true);

      // A subsequent financial transaction after the exit can be undone, then hits the barrier again
      const afterPostExitPay = applyPayment(room, {
        fromId: 'BANK',
        toId: 'p-priya',
        amount: 500,
        actorId: 'p-creator',
        type: 'bank_pay',
      });
      expect(getLatestUndoableTransaction(afterPostExitPay)?.type).toBe('bank_pay');

      const afterUndoPostExit = undoLastTransaction(afterPostExitPay, { actorId: 'p-creator' });
      expect(afterUndoPostExit.players['p-priya'].balance).toBe(18000);
      expect(getLatestUndoableTransaction(afterUndoPostExit)).toBeNull();
      expect(() =>
        undoLastTransaction(afterUndoPostExit, { actorId: 'p-creator' })
      ).toThrowError(
        new LedgerError('CANNOT_UNDO', 'Cannot undo past a player bankruptcy or removal.')
      );
    }
  });
});
