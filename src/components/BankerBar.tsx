import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flag,
  Landmark,
  RotateCcw,
  ShieldCheck,
  UserCog,
  UserMinus,
} from 'lucide-react';
import type { Player, RoomState, Transaction } from '../types/game';
import {
  applyPayment,
  getLatestUndoableTransaction,
  markPlayerExit,
  reassignBanker,
  undoLastTransaction,
} from '../lib/ledger';
import { formatCurrency } from '../lib/format';
import { runRoomMutation } from '../lib/roomStore';
import './TableView.css';

export interface BankerBarProps {
  room: RoomState;
  me: Player;
  onOpenBankPay: () => void;
  onOpenMortgages: () => void;
  onError?: (message: string) => void;
}

type BusyAction = 'pass_start' | 'undo' | 'reassign' | 'exit' | 'claim' | null;

interface PendingExitConfirm {
  playerId: string;
  status: 'bankrupt' | 'removed';
}

function getParticipantLabel(players: Record<string, Player>, id: string): string {
  if (id === 'BANK') {
    return 'Bank';
  }
  return players[id]?.name ?? 'Player';
}

function formatUndoSummary(tx: Transaction, room: RoomState): string {
  const players = room.players ?? {};
  const amount = formatCurrency(tx.amount, room.meta.currencySymbol, room.meta.currencyLocale);
  const fromName = getParticipantLabel(players, tx.fromId);
  const toName = getParticipantLabel(players, tx.toId);

  switch (tx.type) {
    case 'pass_start':
      return `Pass Start → ${toName} · ${amount}`;
    case 'bank_pay':
      return tx.note ? `Bank → ${toName} · ${amount} (${tx.note})` : `Bank → ${toName} · ${amount}`;
    case 'mortgage':
      return `Mortgage → ${toName} · ${amount}${tx.note ? ` (${tx.note})` : ''}`;
    case 'unmortgage':
      return `Unmortgage · ${fromName} · ${amount}${tx.note ? ` (${tx.note})` : ''}`;
    case 'transfer':
    default:
      return tx.note
        ? `${fromName} → ${toName} · ${amount} (${tx.note})`
        : `${fromName} → ${toName} · ${amount}`;
  }
}

export function BankerBar({
  room,
  me,
  onOpenBankPay,
  onOpenMortgages,
  onError,
}: BankerBarProps) {
  const [passStartTargetId, setPassStartTargetId] = useState<string>(me.id);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');
  const [manageTargetId, setManageTargetId] = useState<string>('');
  const [manageOpen, setManageOpen] = useState<boolean>(false);
  const [pendingExit, setPendingExit] = useState<PendingExitConfirm | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);

  const isBanker = me.id === room.meta.bankerId && me.status === 'active';
  const isCreator = me.id === room.meta.creatorId && me.status === 'active';
  const currentBanker = room.players[room.meta.bankerId];
  const needsEmergencyClaim =
    !isBanker &&
    isCreator &&
    (!currentBanker || currentBanker.status !== 'active');

  const activePlayers = useMemo(
    () =>
      Object.values(room.players ?? {})
        .filter((player) => player.status === 'active')
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)),
    [room.players]
  );

  const latestUndoableTx = useMemo(() => getLatestUndoableTransaction(room), [room]);

  useEffect(() => {
    if (activePlayers.length === 0) {
      return;
    }
    if (!activePlayers.some((player) => player.id === passStartTargetId)) {
      setPassStartTargetId(activePlayers[0].id);
    }

    const nonBankerPlayers = activePlayers.filter((player) => player.id !== room.meta.bankerId);
    if (!activePlayers.some((player) => player.id === reassignTargetId)) {
      setReassignTargetId(nonBankerPlayers[0]?.id ?? activePlayers[0].id);
    }
    const otherPlayers = activePlayers.filter((player) => player.id !== me.id);
    if (!activePlayers.some((player) => player.id === manageTargetId)) {
      setManageTargetId(otherPlayers[0]?.id ?? activePlayers[0].id);
    }
  }, [activePlayers, manageTargetId, me.id, passStartTargetId, reassignTargetId, room.meta.bankerId]);

  useEffect(() => {
    if (pendingExit && pendingExit.playerId !== manageTargetId) {
      setPendingExit(null);
    }
  }, [manageTargetId, pendingExit]);

  function reportError(message: string) {
    setError(message);
    onError?.(message);
  }

  async function runBankerMutation(
    action: Exclude<BusyAction, null>,
    mutator: (latestRoom: RoomState) => RoomState
  ) {
    if (busyAction !== null) {
      return;
    }
    setBusyAction(action);
    setError(null);

    const result = await runRoomMutation(room.meta.code, mutator);
    setBusyAction(null);

    if (!result.ok) {
      reportError(result.error);
      return;
    }

    if (action === 'exit') {
      setPendingExit(null);
    }
  }

  if (!isBanker && !isCreator) {
    return null;
  }

  function renderReassignBankerControl(showLabel = true) {
    return (
      <div className="stack-xs">
        {showLabel && (
          <label className="field-label" htmlFor="banker-reassign-select">
            Reassign Banker
          </label>
        )}
        <div className="banker-action-row">
          <select
            id="banker-reassign-select"
            aria-label={showLabel ? undefined : 'Reassign Banker'}
            className="select"
            value={reassignTargetId}
            onChange={(event) => {
              setError(null);
              setReassignTargetId(event.target.value);
            }}
            disabled={busyAction !== null || activePlayers.length <= 1}
          >
            {activePlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.id === room.meta.bankerId
                  ? `${player.name} (Current Banker)`
                  : player.id === me.id
                    ? `${player.name} (You)`
                    : player.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={
              busyAction !== null ||
              !reassignTargetId ||
              reassignTargetId === room.meta.bankerId
            }
            onClick={() =>
              runBankerMutation('reassign', (latestRoom) =>
                reassignBanker(latestRoom, {
                  newBankerId: reassignTargetId,
                  actorId: me.id,
                })
              )
            }
          >
            {busyAction === 'reassign' ? 'Saving...' : 'Transfer'}
          </button>
        </div>
      </div>
    );
  }

  if (!isBanker && isCreator) {
    return (
      <section
        className="panel stack-sm"
        aria-label={needsEmergencyClaim ? 'Banker recovery' : 'Reassign Banker'}
      >
        <div className="row-between">
          <div className="row">
            <ShieldCheck size={20} aria-hidden="true" />
            <h2>{needsEmergencyClaim ? 'Banker unassigned' : 'Reassign Banker'}</h2>
          </div>
          <span className={needsEmergencyClaim ? 'pill pill-warning' : 'pill'}>
            {needsEmergencyClaim ? 'Creator recovery' : 'Creator'}
          </span>
        </div>

        <p className="text-sm text-muted">
          {needsEmergencyClaim
            ? 'The current Banker is inactive. As room creator, you can claim or reassign the Banker role to keep Bank payouts and undo available.'
            : `Current Banker: ${currentBanker?.name ?? 'Active player'}. As room creator, you can reassign the Banker role at any time.`}
        </p>

        {needsEmergencyClaim && (
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyAction !== null}
              onClick={() =>
                runBankerMutation('claim', (latestRoom) =>
                  reassignBanker(latestRoom, {
                    newBankerId: me.id,
                    actorId: me.id,
                  })
                )
              }
            >
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{busyAction === 'claim' ? 'Claiming...' : 'Claim Banker'}</span>
            </button>
          </div>
        )}

        <div className={needsEmergencyClaim ? 'table-divider' : undefined}>
          {renderReassignBankerControl(needsEmergencyClaim)}
        </div>

        {error && (
          <div className="table-inline-alert" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>
    );
  }

  const passStartFormatted = formatCurrency(
    room.meta.passStartAmount,
    room.meta.currencySymbol,
    room.meta.currencyLocale
  );
  const manageTarget = activePlayers.find((player) => player.id === manageTargetId) ?? null;

  return (
    <section className="panel stack-md" aria-label="Banker controls">
      <div className="row-between">
        <div className="row">
          <Landmark size={20} aria-hidden="true" />
          <h2>Banker controls</h2>
        </div>
        <span className="pill pill-accent">Banker</span>
      </div>

      <div className="stack-xs">
        <label className="field-label" htmlFor="banker-pass-start-select">
          Pass Start credit
        </label>
        <div className="banker-action-row">
          <select
            id="banker-pass-start-select"
            className="select"
            value={passStartTargetId}
            onChange={(event) => {
              setError(null);
              setPassStartTargetId(event.target.value);
            }}
            disabled={busyAction !== null || activePlayers.length === 0}
          >
            {activePlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.id === me.id ? `${player.name} (You)` : player.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary tabular-nums"
            disabled={
              busyAction !== null ||
              !passStartTargetId ||
              room.meta.passStartAmount <= 0
            }
            onClick={() =>
              runBankerMutation('pass_start', (latestRoom) =>
                applyPayment(latestRoom, {
                  type: 'pass_start',
                  fromId: 'BANK',
                  toId: passStartTargetId,
                  amount: latestRoom.meta.passStartAmount,
                  actorId: me.id,
                })
              )
            }
          >
            <Flag size={18} aria-hidden="true" />
            <span>
              {busyAction === 'pass_start' ? 'Crediting...' : `Pass Start (+${passStartFormatted})`}
            </span>
          </button>
        </div>
        {room.meta.passStartAmount <= 0 && (
          <p className="text-xs text-muted">Pass Start is disabled (set to 0 in room rules).</p>
        )}
      </div>

      <div className="banker-quick-grid">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busyAction !== null}
          onClick={() => {
            setError(null);
            onOpenBankPay();
          }}
        >
          <Landmark size={18} aria-hidden="true" />
          <span>Bank payout</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busyAction !== null}
          onClick={() => {
            setError(null);
            onOpenMortgages();
          }}
        >
          <Landmark size={18} aria-hidden="true" />
          <span>Issue mortgage</span>
        </button>
      </div>

      <div className="table-divider banker-undo-row">
        <div className="banker-undo-meta">
          <span className="text-xs text-muted">Latest transaction</span>
          <span className="banker-undo-summary tabular-nums">
            {latestUndoableTx
              ? formatUndoSummary(latestUndoableTx, room)
              : 'No transactions to undo'}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          disabled={busyAction !== null || !latestUndoableTx}
          onClick={() =>
            runBankerMutation('undo', (latestRoom) =>
              undoLastTransaction(latestRoom, { actorId: me.id })
            )
          }
        >
          <RotateCcw size={18} aria-hidden="true" />
          <span>{busyAction === 'undo' ? 'Undoing...' : 'Undo last'}</span>
        </button>
      </div>

      <div className="table-divider stack-sm">
        <button
          type="button"
          className="btn btn-ghost banker-manage-toggle"
          aria-expanded={manageOpen}
          onClick={() => {
            setManageOpen((prev) => !prev);
            setPendingExit(null);
            setError(null);
          }}
        >
          <span className="row">
            <UserCog size={18} aria-hidden="true" />
            <span>Manage players</span>
          </span>
          {manageOpen ? (
            <ChevronUp size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
        </button>

        {manageOpen && (
          <div className="stack-md">
            {renderReassignBankerControl(true)}

            <div className="table-divider stack-sm">
              <label className="field-label" htmlFor="banker-exit-select">
                Bankrupt or remove player
              </label>
              <select
                id="banker-exit-select"
                className="select"
                value={manageTargetId}
                onChange={(event) => {
                  setError(null);
                  setPendingExit(null);
                  setManageTargetId(event.target.value);
                }}
                disabled={busyAction !== null || activePlayers.length === 0}
              >
                {activePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.id === me.id ? `${player.name} (You)` : player.name}
                  </option>
                ))}
              </select>

              {!pendingExit && (
                <div className="row-wrap">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyAction !== null || !manageTarget}
                    onClick={() => {
                      if (manageTarget) {
                        setError(null);
                        setPendingExit({ playerId: manageTarget.id, status: 'bankrupt' });
                      }
                    }}
                  >
                    <UserMinus size={18} aria-hidden="true" />
                    <span>Mark bankrupt</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyAction !== null || !manageTarget}
                    onClick={() => {
                      if (manageTarget) {
                        setError(null);
                        setPendingExit({ playerId: manageTarget.id, status: 'removed' });
                      }
                    }}
                  >
                    <UserMinus size={18} aria-hidden="true" />
                    <span>Remove player</span>
                  </button>
                </div>
              )}

              {pendingExit && manageTarget && (
                <div className="stack-sm" role="region" aria-label="Confirm player exit">
                  <p className="text-sm">
                    {pendingExit.status === 'bankrupt'
                      ? `Mark ${manageTarget.name} bankrupt? Their balance resets to 0 and active mortgages are cleared.`
                      : `Remove ${manageTarget.name} from the room? They will not be able to reclaim this seat.`}
                  </p>
                  <div className="banker-confirm-row">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busyAction !== null}
                      onClick={() =>
                        runBankerMutation('exit', (latestRoom) =>
                          markPlayerExit(latestRoom, {
                            targetPlayerId: pendingExit.playerId,
                            status: pendingExit.status,
                            actorId: me.id,
                          })
                        )
                      }
                    >
                      {busyAction === 'exit'
                        ? 'Updating...'
                        : pendingExit.status === 'bankrupt'
                          ? 'Confirm Bankrupt'
                          : 'Confirm Remove'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyAction !== null}
                      onClick={() => setPendingExit(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="table-inline-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
