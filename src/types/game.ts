export type PlayerStatus = 'active' | 'bankrupt' | 'removed';

export type TransactionType =
  | 'transfer'
  | 'bank_pay'
  | 'pass_start'
  | 'mortgage'
  | 'unmortgage'
  | 'bankrupt'
  | 'remove'
  | 'undo';

export interface RoomMeta {
  code: string;
  createdAt: number;
  creatorId: string;
  bankerId: string;
  currencySymbol: string;
  currencyLocale: string;
  startingCash: number;
  negativeLimit: number;
  passStartAmount: number;
  mortgageInterestPct: 0 | 10;
}

export interface Player {
  id: string;
  name: string;
  balance: number;
  status: PlayerStatus;
  joinedAt: number;
}

export interface Mortgage {
  id: string;
  playerId: string;
  propertyName: string;
  principal: number;
  payoffAmount: number;
  active: boolean;
  createdAt: number;
  clearedAt: number | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  fromId: string;
  toId: string;
  amount: number;
  note?: string;
  mortgageId?: string;
  actorId: string;
  createdAt: number;
  undone: boolean;
  reversesTxId: string | null;
}

export interface RoomState {
  meta: RoomMeta;
  players: Record<string, Player>;
  mortgages: Record<string, Mortgage>;
  transactions: Record<string, Transaction>;
}

export interface LocalSession {
  roomCode: string;
  playerId: string;
  playerName: string;
}

export interface CreateRoomInput {
  creatorName: string;
  currencySymbol: string;
  currencyLocale?: string;
  startingCash: number;
  negativeLimit: number;
  passStartAmount: number;
  mortgageInterestPct: 0 | 10;
  code?: string;
  creatorId?: string;
}
