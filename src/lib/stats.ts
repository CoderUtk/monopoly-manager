import type { RoomState } from '../types/game';

export interface RivalStat {
  playerId: string;
  name: string;
  amount: number;
}

export interface PersonalStats {
  earned: number;
  spent: number;
  netFromStart: number;
  passStartLaps: number;
  passStartEarned: number;
  paidMeMost: RivalStat | null;
  iPaidMost: RivalStat | null;
  clubPaid: number;
  restHouseCollected: number;
  jailPaid: number;
  activeMortgageCount: number;
  activeMortgagePayoff: number;
  mortgageInterestPaid: number;
}

export interface BankerEconomyStats {
  bankBalance: number;
  bankStartingCash: number;
  playersCashTotal: number;
  activeMortgageCount: number;
  activeMortgagePayoff: number;
  bankSharePct: number;
  playersSharePct: number;
}

export interface ComputedRoomStats {
  personal: PersonalStats;
  banker: BankerEconomyStats;
}

function pickTopRival(
  totals: Map<string, number>,
  players: RoomState['players']
): RivalStat | null {
  let bestId: string | null = null;
  let bestAmount = 0;

  for (const [id, amount] of totals.entries()) {
    if (amount > bestAmount) {
      bestAmount = amount;
      bestId = id;
    }
  }

  if (!bestId || bestAmount <= 0) {
    return null;
  }

  return {
    playerId: bestId,
    name: players[bestId]?.name ?? 'Player',
    amount: bestAmount,
  };
}

/**
 * Derive live personal stats for a player and table-wide Banker economy metrics from room state.
 */
export function computeRoomStats(room: RoomState, playerId: string): ComputedRoomStats {
  const players = room.players ?? {};
  const mortgages = room.mortgages ?? {};
  const transactions = room.transactions ?? {};
  const me = players[playerId];

  let earned = 0;
  let spent = 0;
  let passStartLaps = 0;
  let passStartEarned = 0;
  let clubPaid = 0;
  let restHouseCollected = 0;
  let jailPaid = 0;
  let mortgageInterestPaid = 0;

  const receivedFromPlayers = new Map<string, number>();
  const paidToPlayers = new Map<string, number>();
  const clearedMortgageIds = new Set<string>();

  for (const tx of Object.values(transactions)) {
    if (tx.undone || tx.type === 'undo') {
      continue;
    }

    switch (tx.type) {
      case 'transfer': {
        if (tx.toId === playerId && tx.fromId !== playerId) {
          earned += tx.amount;
          if (tx.fromId !== 'BANK') {
            receivedFromPlayers.set(
              tx.fromId,
              (receivedFromPlayers.get(tx.fromId) ?? 0) + tx.amount
            );
          }
        } else if (tx.fromId === playerId && tx.toId !== playerId) {
          spent += tx.amount;
          if (tx.toId !== 'BANK') {
            paidToPlayers.set(tx.toId, (paidToPlayers.get(tx.toId) ?? 0) + tx.amount);
          }
        }
        break;
      }

      case 'bank_pay': {
        if (tx.toId === playerId) {
          earned += tx.amount;
        }
        break;
      }

      case 'pass_start': {
        if (tx.toId === playerId) {
          earned += tx.amount;
          passStartLaps += 1;
          passStartEarned += tx.amount;
        }
        break;
      }

      case 'mortgage': {
        if (tx.toId === playerId) {
          earned += tx.amount;
        }
        break;
      }

      case 'unmortgage': {
        if (tx.fromId === playerId) {
          spent += tx.amount;
          if (tx.mortgageId) {
            clearedMortgageIds.add(tx.mortgageId);
          }
        }
        break;
      }

      case 'jail': {
        if (tx.fromId === playerId) {
          spent += tx.amount;
          jailPaid += tx.amount;
        }
        break;
      }

      case 'club':
      case 'rest_house': {
        const delta = tx.splits?.[playerId];
        if (typeof delta === 'number') {
          if (delta > 0) {
            earned += delta;
            if (tx.type === 'rest_house') {
              restHouseCollected += delta;
            }
          } else if (delta < 0) {
            const absDelta = Math.abs(delta);
            spent += absDelta;
            if (tx.type === 'club') {
              clubPaid += absDelta;
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  let myActiveMortgageCount = 0;
  let myActiveMortgagePayoff = 0;
  let tableActiveMortgageCount = 0;
  let tableActiveMortgagePayoff = 0;

  for (const mortgage of Object.values(mortgages)) {
    if (mortgage.active) {
      tableActiveMortgageCount += 1;
      tableActiveMortgagePayoff += mortgage.payoffAmount;
      if (mortgage.playerId === playerId) {
        myActiveMortgageCount += 1;
        myActiveMortgagePayoff += mortgage.payoffAmount;
      }
    } else if (mortgage.playerId === playerId && clearedMortgageIds.has(mortgage.id)) {
      mortgageInterestPaid += Math.max(0, mortgage.payoffAmount - mortgage.principal);
    }
  }

  let playersCashTotal = 0;
  for (const player of Object.values(players)) {
    if (player.status === 'active') {
      playersCashTotal += player.balance;
    }
  }

  const bankBalance = room.meta.bankBalance ?? 0;
  const positivePlayersCash = Math.max(0, playersCashTotal);
  const totalLiquidity = bankBalance + positivePlayersCash;
  const bankSharePct = totalLiquidity > 0 ? Math.round((bankBalance / totalLiquidity) * 100) : 0;
  const playersSharePct = totalLiquidity > 0 ? 100 - bankSharePct : 0;

  return {
    personal: {
      earned,
      spent,
      netFromStart: me ? me.balance - room.meta.startingCash : 0,
      passStartLaps,
      passStartEarned,
      paidMeMost: pickTopRival(receivedFromPlayers, players),
      iPaidMost: pickTopRival(paidToPlayers, players),
      clubPaid,
      restHouseCollected,
      jailPaid,
      activeMortgageCount: myActiveMortgageCount,
      activeMortgagePayoff: myActiveMortgagePayoff,
      mortgageInterestPaid,
    },
    banker: {
      bankBalance,
      bankStartingCash: room.meta.bankStartingCash ?? 0,
      playersCashTotal,
      activeMortgageCount: tableActiveMortgageCount,
      activeMortgagePayoff: tableActiveMortgagePayoff,
      bankSharePct,
      playersSharePct,
    },
  };
}
