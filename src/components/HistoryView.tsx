import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Flag,
  History,
  Home,
  KeyRound,
  Landmark,
  Lock,
  PartyPopper,
  RotateCcw,
  UserMinus,
} from 'lucide-react';
import type { Player, RoomState, Transaction } from '../types/game';
import { getPlayerColorStyle } from '../lib/colors';
import { formatCurrency } from '../lib/format';
import { computeRoomStats } from '../lib/stats';
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
    case 'club':
      return {
        title: `${fromName} paid Club`,
        detail: note,
      };
    case 'rest_house':
      return {
        title: `${toName} collected Rest House`,
        detail: note,
      };
    case 'jail':
      return {
        title: `${fromName} paid Jail fine to Bank`,
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

function renderTransactionIcon(tx: Transaction, viewerId: string) {
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
          <Banknote size={18} />
        </span>
      );
    case 'mortgage':
      return (
        <span className="history-icon history-icon--accent" aria-hidden="true">
          <KeyRound size={18} />
        </span>
      );
    case 'unmortgage':
      return (
        <span className="history-icon history-icon--in" aria-hidden="true">
          <BadgeCheck size={18} />
        </span>
      );
    case 'club':
      return (
        <span
          className={
            tx.splits?.[viewerId] && tx.splits[viewerId] > 0
              ? 'history-icon history-icon--in'
              : 'history-icon history-icon--out'
          }
          aria-hidden="true"
        >
          <PartyPopper size={18} />
        </span>
      );
    case 'rest_house':
      return (
        <span
          className={
            tx.splits?.[viewerId] && tx.splits[viewerId] < 0
              ? 'history-icon history-icon--out'
              : 'history-icon history-icon--in'
          }
          aria-hidden="true"
        >
          <Home size={18} />
        </span>
      );
    case 'jail':
      return (
        <span className="history-icon history-icon--danger" aria-hidden="true">
          <Lock size={18} />
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
    default: {
      if (tx.toId === 'BANK') {
        return (
          <span className="history-icon history-icon--out" aria-hidden="true">
            <Landmark size={18} />
          </span>
        );
      }
      if (tx.toId === viewerId) {
        return (
          <span className="history-icon history-icon--in" aria-hidden="true">
            <ArrowDownLeft size={18} />
          </span>
        );
      }
      if (tx.fromId === viewerId) {
        return (
          <span className="history-icon history-icon--out" aria-hidden="true">
            <ArrowUpRight size={18} />
          </span>
        );
      }
      return (
        <span className="history-icon" aria-hidden="true">
          <ArrowLeftRight size={18} />
        </span>
      );
    }
  }
}

export function HistoryView({ room, playerId }: HistoryViewProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const players = room.players ?? {};
  const transactions = room.transactions ?? {};
  const me = players[playerId] ?? null;
  const isBanker = Boolean(me && me.status === 'active' && playerId === room.meta.bankerId);

  const sortedTransactions = useMemo(
    () =>
      Object.values(transactions).sort(
        (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
      ),
    [transactions]
  );

  const stats = useMemo(() => computeRoomStats(room, playerId), [room, playerId]);

  const { currencySymbol, currencyLocale } = room.meta;
  const fmt = (val: number) => formatCurrency(val, currencySymbol, currencyLocale);
  const { personal, banker } = stats;
  const netPrefix = personal.netFromStart > 0 ? '+' : '';
  const netFormatted = `${netPrefix}${fmt(personal.netFromStart)}`;

  return (
    <div className="stack-md">
      <section className="panel stats-section" aria-label="Statistics">
        <button
          type="button"
          className="stats-toggle-btn"
          aria-expanded={statsOpen}
          onClick={() => setStatsOpen((prev) => !prev)}
        >
          <span className="stats-toggle-title">
            <BarChart3 size={18} aria-hidden="true" />
            <span>{isBanker ? 'Your stats & Bank economy' : 'Your stats'}</span>
          </span>
          <span className="stats-toggle-aside">
            <span
              className={
                personal.netFromStart > 0
                  ? 'pill pill-accent tabular-nums'
                  : personal.netFromStart < 0
                    ? 'pill pill-danger tabular-nums'
                    : 'pill tabular-nums'
              }
            >
              Net {netFormatted}
            </span>
            {statsOpen ? (
              <ChevronUp size={18} aria-hidden="true" />
            ) : (
              <ChevronDown size={18} aria-hidden="true" />
            )}
          </span>
        </button>

        {statsOpen && (
          <div className="stats-body">
            <div className="stats-grid">
              <div className="stats-card">
                <span className="stats-card-title">Cash flow</span>
                <div className="stats-kv-list">
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Earned</span>
                    <span className="stats-kv-value stats-kv-value--in tabular-nums">
                      +{fmt(personal.earned)}
                    </span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Spent</span>
                    <span className="stats-kv-value stats-kv-value--out tabular-nums">
                      -{fmt(personal.spent)}
                    </span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Net vs start</span>
                    <span
                      className={[
                        'stats-kv-value',
                        'tabular-nums',
                        personal.netFromStart > 0
                          ? 'stats-kv-value--in'
                          : personal.netFromStart < 0
                            ? 'stats-kv-value--out'
                            : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {netFormatted}
                    </span>
                  </div>
                </div>
              </div>

              <div className="stats-card">
                <span className="stats-card-title">Pass Start</span>
                <div className="stats-kv-list">
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Laps completed</span>
                    <span className="stats-kv-value tabular-nums">{personal.passStartLaps}</span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Salary earned</span>
                    <span className="stats-kv-value stats-kv-value--in tabular-nums">
                      {fmt(personal.passStartEarned)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="stats-card">
                <span className="stats-card-title">Rivals</span>
                <div className="stats-kv-list">
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Paid you most</span>
                    <span className="stats-kv-value tabular-nums">
                      {personal.paidMeMost
                        ? `${personal.paidMeMost.name} (${fmt(personal.paidMeMost.amount)})`
                        : '—'}
                    </span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">You paid most</span>
                    <span className="stats-kv-value tabular-nums">
                      {personal.iPaidMost
                        ? `${personal.iPaidMost.name} (${fmt(personal.iPaidMost.amount)})`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="stats-card">
                <span className="stats-card-title">Board events</span>
                <div className="stats-kv-list">
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Club paid</span>
                    <span className="stats-kv-value tabular-nums">{fmt(personal.clubPaid)}</span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Rest House</span>
                    <span className="stats-kv-value stats-kv-value--in tabular-nums">
                      +{fmt(personal.restHouseCollected)}
                    </span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Jail fines</span>
                    <span className="stats-kv-value tabular-nums">{fmt(personal.jailPaid)}</span>
                  </div>
                </div>
              </div>

              <div className="stats-card stats-card--wide">
                <span className="stats-card-title">Mortgages</span>
                <div className="stats-kv-list">
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">
                      Active debt ({personal.activeMortgageCount}{' '}
                      {personal.activeMortgageCount === 1 ? 'property' : 'properties'})
                    </span>
                    <span className="stats-kv-value tabular-nums">
                      {fmt(personal.activeMortgagePayoff)}
                    </span>
                  </div>
                  <div className="stats-kv-row">
                    <span className="stats-kv-label">Interest paid</span>
                    <span className="stats-kv-value tabular-nums">
                      {fmt(personal.mortgageInterestPaid)}
                    </span>
                  </div>
                </div>
              </div>

              {isBanker && (
                <div className="stats-card stats-card--wide" aria-label="Banker economy split">
                  <span className="stats-card-title">Banker economy split</span>
                  <div className="economy-bar" aria-hidden="true">
                    <div
                      className="economy-bar-bank"
                      style={{ width: `${banker.bankSharePct}%` }}
                    />
                    <div
                      className="economy-bar-players"
                      style={{ width: `${banker.playersSharePct}%` }}
                    />
                  </div>
                  <div className="stats-kv-list">
                    <div className="stats-kv-row">
                      <span className="stats-kv-label">Bank vault left ({banker.bankSharePct}%)</span>
                      <span className="stats-kv-value tabular-nums">{fmt(banker.bankBalance)}</span>
                    </div>
                    <div className="stats-kv-row">
                      <span className="stats-kv-label">
                        Players&apos; cash ({banker.playersSharePct}%)
                      </span>
                      <span className="stats-kv-value tabular-nums">
                        {fmt(banker.playersCashTotal)}
                      </span>
                    </div>
                    <div className="stats-kv-row">
                      <span className="stats-kv-label">
                        Active mortgage debt ({banker.activeMortgageCount})
                      </span>
                      <span className="stats-kv-value tabular-nums">
                        {fmt(banker.activeMortgagePayoff)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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
            const splitDelta = tx.splits?.[playerId];
            const showAmount = tx.type !== 'bankrupt' && tx.type !== 'remove' && tx.amount > 0;
            const isIncomingForMe =
              !tx.undone &&
              tx.type !== 'undo' &&
              ((splitDelta !== undefined && splitDelta > 0) ||
                (splitDelta === undefined && tx.toId === playerId && tx.fromId !== playerId));
            const isOutgoingForMe =
              !tx.undone &&
              tx.type !== 'undo' &&
              ((splitDelta !== undefined && splitDelta < 0) ||
                (splitDelta === undefined && tx.fromId === playerId && tx.toId !== playerId));
            const displayMagnitude =
              splitDelta !== undefined && !tx.undone ? Math.abs(splitDelta) : tx.amount;
            const formattedAmount = showAmount
              ? formatCurrency(displayMagnitude, currencySymbol, currencyLocale)
              : null;
            const signedAmount = formattedAmount
              ? isIncomingForMe
                ? `+${formattedAmount}`
                : isOutgoingForMe
                  ? `-${formattedAmount}`
                  : formattedAmount
              : null;
            const actorPlayer =
              players[tx.fromId] ?? players[tx.toId] ?? players[tx.actorId];
            const rowStyle = actorPlayer?.color
              ? getPlayerColorStyle(actorPlayer.color)
              : undefined;

            return (
              <li
                key={tx.id}
                style={rowStyle}
                className={[
                  'history-row',
                  tx.undone ? 'history-row--undone' : '',
                  rowStyle ? 'history-row--colored' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {renderTransactionIcon(tx, playerId)}

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
    </div>
  );
}
