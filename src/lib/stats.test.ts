import { describe, it, expect } from 'vitest';
import {
  applyBoardEvent,
  applyPayment,
  clearMortgage,
  createInitialRoom,
  issueMortgage,
  joinOrReclaimPlayer,
  selectLobbyBanker,
  startGame,
  undoLastTransaction,
} from './ledger';
import { computeRoomStats } from './stats';

function setupStartedRoom() {
  let room = createInitialRoom({
    creatorId: 'p-1',
    creatorName: 'Aarav',
    creatorColor: 'red',
    currencySymbol: '₹',
    startingCash: 15000,
    bankStartingCash: 100000,
    negativeLimit: 5000,
    passStartAmount: 2000,
    mortgageInterestPct: 10,
    code: 'ST1234',
  });
  room = joinOrReclaimPlayer(room, { playerId: 'p-2', name: 'Rohan', color: 'blue' }).room;
  room = joinOrReclaimPlayer(room, { playerId: 'p-3', name: 'Priya', color: 'green' }).room;
  room = selectLobbyBanker(room, { bankerId: 'p-2', actorId: 'p-2' });
  return startGame(room, { actorId: 'p-2' });
}

describe('computeRoomStats', () => {
  it('returns zeroed personal stats and initial economy split on fresh room', () => {
    const room = setupStartedRoom();
    const { personal, banker } = computeRoomStats(room, 'p-1');

    expect(personal).toEqual({
      earned: 0,
      spent: 0,
      netFromStart: 0,
      passStartLaps: 0,
      passStartEarned: 0,
      paidMeMost: null,
      iPaidMost: null,
      clubPaid: 0,
      restHouseCollected: 0,
      jailPaid: 0,
      activeMortgageCount: 0,
      activeMortgagePayoff: 0,
      mortgageInterestPaid: 0,
    });

    expect(banker.bankBalance).toBe(100000);
    expect(banker.playersCashTotal).toBe(45000);
    expect(banker.activeMortgageCount).toBe(0);
    expect(banker.activeMortgagePayoff).toBe(0);
    expect(banker.bankSharePct + banker.playersSharePct).toBe(100);
  });

  it('tracks cash flow, rivals, laps, board events, mortgages, and excludes undone txs', () => {
    let room = setupStartedRoom();

    // Pass Start x1 for Aarav (+2000)
    room = applyPayment(room, {
      type: 'pass_start',
      fromId: 'BANK',
      toId: 'p-1',
      amount: 2000,
      actorId: 'p-2',
    });

    // Rohan pays Aarav 800, Priya pays Aarav 1200 (Priya = paidMeMost)
    room = applyPayment(room, { fromId: 'p-2', toId: 'p-1', amount: 800, actorId: 'p-2' });
    room = applyPayment(room, { fromId: 'p-3', toId: 'p-1', amount: 1200, actorId: 'p-3' });

    // Aarav pays Rohan 500, and pays Priya 3000 which is undone (excluded!)
    room = applyPayment(room, { fromId: 'p-1', toId: 'p-2', amount: 500, actorId: 'p-1' });
    room = applyPayment(room, { fromId: 'p-1', toId: 'p-3', amount: 3000, actorId: 'p-1' });
    room = undoLastTransaction(room, { actorId: 'p-2' });

    // Board events for Aarav: Club (-200 total), Rest House (+200 total), Jail (-500 Bank)
    room = applyBoardEvent(room, { playerId: 'p-1', event: 'club' });
    room = applyBoardEvent(room, { playerId: 'p-1', event: 'rest_house' });
    room = applyBoardEvent(room, { playerId: 'p-1', event: 'jail' });

    // Mortgage 1000 cleared (+100 interest), plus Mortgage 2000 kept active (2200 payoff owed)
    room = issueMortgage(room, {
      playerId: 'p-1',
      propertyName: 'Goa',
      principal: 1000,
      actorId: 'p-2',
    });
    const goaId = Object.keys(room.mortgages)[0];
    room = clearMortgage(room, { mortgageId: goaId, actorId: 'p-2' });
    room = issueMortgage(room, {
      playerId: 'p-1',
      propertyName: 'Mumbai',
      principal: 2000,
      actorId: 'p-2',
    });

    const { personal, banker } = computeRoomStats(room, 'p-1');

    expect(personal.passStartLaps).toBe(1);
    expect(personal.passStartEarned).toBe(2000);
    expect(personal.paidMeMost).toEqual({ playerId: 'p-3', name: 'Priya', amount: 1200 });
    expect(personal.iPaidMost).toEqual({ playerId: 'p-2', name: 'Rohan', amount: 500 });
    expect(personal.clubPaid).toBe(200);
    expect(personal.restHouseCollected).toBe(200);
    expect(personal.jailPaid).toBe(500);
    expect(personal.mortgageInterestPaid).toBe(100);
    expect(personal.activeMortgageCount).toBe(1);
    expect(personal.activeMortgagePayoff).toBe(2200);

    expect(personal.earned).toBe(2000 + 800 + 1200 + 200 + 1000 + 2000);
    expect(personal.spent).toBe(500 + 200 + 500 + 1100);
    expect(personal.netFromStart).toBe(room.players['p-1'].balance - 15000);

    expect(banker.activeMortgageCount).toBe(1);
    expect(banker.activeMortgagePayoff).toBe(2200);
    expect(banker.bankBalance).toBe(room.meta.bankBalance);
    expect(banker.playersCashTotal).toBe(
      room.players['p-1'].balance + room.players['p-2'].balance + room.players['p-3'].balance
    );
  });
});
