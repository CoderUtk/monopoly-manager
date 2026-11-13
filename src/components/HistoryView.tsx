import { useMemo } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Flag,
  History,
  Landmark,
  RotateCcw,
  UserMinus,
} from 'lucide-react';
import type { Player, RoomState, Transaction } from '../types/game';
import { formatCurrency } from '../lib/format';
import './LedgerViews.css';

export interface HistoryViewProps {
  room: RoomState;
  playerId: string;
}

function getParticipantName(players: Record<string, Player>, id: string): string {
  if (id === 'BANK') {
    return 'Bank';
  }
  return players[id]?.name ?? 'Player';
}

function formatShortTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface DescribedTransaction {
  title: string;
  detail: string | null;
}

function describeCoreAction(tx: Transaction, players: Record<string, Player>): DescribedTransaction {
  const fromName = getParticipantName(players, tx.fromId);
  const toName = getParticipantName(players, tx.toId);
  const note = tx.note?.trim() || null;

  switch (tx.type) {
    case 'transfer':
      return {
        title: `${fromName} paid ${toName}`,
        detail: note,
      };
    case 'bank_pay':
      return {
        title: `Bank paid ${toName}`,
        detail: note,
      };
    case 'pass_start':
      return {
        title: `Bank paid ${toName} · Pass Start`,
        detail: note,
      };
    case 'mortgage':
      return {
        title: `Bank mortgaged ${note ?? 'property'} to ${toName}`,
        detail: null,
      };
    case 'unmortgage':
      return {
        title: `${fromName} cleared ${note ?? 'mortgage'}`,
        detail: null,
      };
    case 'bankrupt':
      return {
        title: `Banker marked ${fromName} bankrupt`,
        detail: null,
      };
    case 'remove':
      return {
        title: `Banker removed ${fromName}`,
        detail: null,
      };
    case 'undo':
    default:
      return {
        title: 'Undid last move',
        detail: note,
      };
  }
}

function describeTransaction(
  tx: Transaction,
  players: Record<string, Player>,
  transactions: Record<string, Transaction>
): DescribedTransaction {
  if (tx.type === 'undo') {
    const reversed = tx.reversesTxId != null ? transactions[tx.reversesTxId] : undefined;
    if (reversed) {
      const reversedDesc = describeCoreAction(reversed, players);
      return {
        title: 'Undid last move',
        detail: reversedDesc.detail
          ? `${reversedDesc.title} · ${reversedDesc.detail}`
          : reversedDesc.title,
      };
    }
    return {
      title: 'Undid last move',
      detail: tx.note?.trim() || null,
    };
  }
  return describeCoreAction(tx, players);
}

function renderTransactionIcon(tx: Transaction) {
  switch (tx.type) {
    case 'pass_start':
      return (
        <span className="history-icon history-icon--in" aria-hidden="true">
          <Flag size={18} />
        </span>
      );
    case 'bank_pay':
      return (
        <span className="history-icon history-icon--in" aria-hidden="true">
          <Landmark size={18} />
        </span>
      );
    case 'mortgage':
      return (
        <span className="history-icon history-icon--accent" aria-hidden="true">
          <Landmark size={18} />
        </span>
      );
    case 'unmortgage':
      return (
        <span className="history-icon history-icon--accent" aria-hidden="true">
          <CheckCircle2 size={18} />
        </span>
      );
    case 'bankrupt':
    case 'remove':
      return (
        <span className="history-icon history-icon--danger" aria-hidden="true">
          <UserMinus size={18} />
        </span>
      );
    case 'undo':
      return (
        <span className="history-icon" aria-hidden="true">
          <RotateCcw size={18} />
        </span>
      );
    case 'transfer':
    default:
      return (
        <span className="history-icon" aria-hidden="true">
          <ArrowLeftRight size={18} />
        </span>
      );
  }
}

export function HistoryView({ room, playerId }: HistoryViewProps) {
  const players = room.players ?? {};
  const transactions = room.transactions ?? {};

  const sortedTransactions = useMemo(
    () =>
      Object.values(transactions).sort(
        (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
      ),
    [transactions]
  );

  const { currencySymbol, currencyLocale } = room.meta;

  return (
    <section className="panel stack-md" aria-label="Transaction history">
      <div className="row-between">
        <div className="row">
          <History size={20} aria-hidden="true" />
          <h2>History</h2>
        </div>
        <span className="pill tabular-nums">{sortedTransactions.length}</span>
      </div>

      {sortedTransactions.length === 0 ? (
        <div className="ledger-empty">
          <p className="text-sm">No transactions yet.</p>
          <p className="text-xs text-muted">
            Player payments, Pass Start credits, and mortgages will appear here live.
          </p>
        </div>
      ) : (
        <ul className="ledger-list">
          {sortedTransactions.map((tx) => {
            const { title, detail } = describeTransaction(tx, players, transactions);
            const showAmount = tx.type !== 'bankrupt' && tx.type !== 'remove' && tx.amount > 0;
            const isIncomingForMe =
              !tx.undone && tx.type !== 'undo' && tx.toId === playerId && tx.fromId !== playerId;
            const isOutgoingForMe =
              !tx.undone && tx.type !== 'undo' && tx.fromId === playerId && tx.toId !== playerId;
            const formattedAmount = showAmount
              ? formatCurrency(tx.amount, currencySymbol, currencyLocale)
              : null;
            const signedAmount = formattedAmount
              ? isIncomingForMe
                ? `+${formattedAmount}`
                : isOutgoingForMe
                  ? `-${formattedAmount}`
                  : formattedAmount
              : null;

            return (
              <li
                key={tx.id}
                className={tx.undone ? 'history-row history-row--undone' : 'history-row'}
              >
                {renderTransactionIcon(tx)}

                <div className="history-body">
                  <span className={tx.undone ? 'history-title history-title--undone' : 'history-title'}>
                    {title}
                  </span>
                  <div className="history-meta">
                    <time className="tabular-nums">{formatShortTime(tx.createdAt)}</time>
                    {detail && <span className="history-note">· {detail}</span>}
                    {tx.undone && <span className="pill">Undone</span>}
                  </div>
                </div>

                {signedAmount && (
                  <div className="history-aside">
                    <span
                      className={[
                        'history-amount',
                        'tabular-nums',
                        tx.undone
                          ? 'history-amount--undone'
                          : isIncomingForMe
                            ? 'history-amount--in'
                            : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {signedAmount}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
