export type PlayerStatus = 'active' | 'bankrupt' | 'removed';
export type RoomStatus = 'lobby' | 'active';

export type PlayerColorId =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'black';

export type TransactionType =
  | 'transfer'
  | 'bank_pay'
  | 'pass_start'
  | 'mortgage'
  | 'unmortgage'
  | 'club'
  | 'rest_house'
  | 'jail'
  | 'bankrupt'
  | 'remove'
  | 'undo';

export interface RoomMeta {
  code: string;
  createdAt: number;
  creatorId: string;
  bankerId: string;
  status: RoomStatus;
  currencySymbol: string;
  currencyLocale: string;
  startingCash: number;
  bankStartingCash: number;
  bankBalance: number;
  negativeLimit: number;
  passStartAmount: number;
  mortgageInterestPct: 0 | 10;
  clubAmount?: number;
  restHouseAmount?: number;
  jailAmount?: number;
}

export interface Player {
  id: string;
  name: string;
  color?: PlayerColorId;
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
  splits?: Record<string, number>;
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
  creatorColor?: PlayerColorId;
  currencySymbol: string;
  currencyLocale?: string;
  startingCash: number;
  bankStartingCash: number;
  negativeLimit: number;
  passStartAmount: number;
  mortgageInterestPct: 0 | 10;
  clubAmount?: number;
  restHouseAmount?: number;
  jailAmount?: number;
  code?: string;
  creatorId?: string;
}
