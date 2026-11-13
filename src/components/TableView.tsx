import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Landmark,
  Play,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { RoomState } from '../types/game';
import { formatCurrency } from '../lib/format';
import { MAX_PLAYERS, selectLobbyBanker, startGame } from '../lib/ledger';
import { runRoomMutation } from '../lib/roomStore';
import { BankerBar } from './BankerBar';
import { PaySheet, type PaySheetMode } from './PaySheet';
import './TableView.css';

export interface TableViewProps {
  room: RoomState;
  playerId: string;
  onOpenMortgages: () => void;
  onError?: (message: string) => void;
}

interface PaySheetState {
  open: boolean;
  mode: PaySheetMode;
  initialRecipientId?: string;
}

export function TableView({
  room,
  playerId,
  onOpenMortgages,
  onError,
}: TableViewProps) {
  const [paySheet, setPaySheet] = useState<PaySheetState>({
    open: false,
    mode: 'player_pay',
  });
  const [lobbyBusy, setLobbyBusy] = useState<'banker' | 'start' | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  const me = room.players[playerId] ?? null;

  const { activePlayers, exitedPlayers } = useMemo(() => {
    const allPlayers = Object.values(room.players ?? {}).sort(
      (a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)
    );
    return {
      activePlayers: allPlayers.filter((player) => player.status === 'active'),
      exitedPlayers: allPlayers.filter((player) => player.status !== 'active'),
    };
  }, [room.players]);

  const activeMortgageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const mortgage of Object.values(room.mortgages ?? {})) {
      if (mortgage.active) {
        counts[mortgage.playerId] = (counts[mortgage.playerId] ?? 0) + 1;
      }
    }
    return counts;
  }, [room.mortgages]);

  if (!me || me.status === 'removed') {
    return (
      <section className="panel stack-sm" role="status">
        <h2>Seat inactive</h2>
        <p className="text-sm text-muted">This player seat is no longer active at the table.</p>
      </section>
    );
  }

  const { currencySymbol, currencyLocale, negativeLimit, bankerId, bankBalance, startingCash, status } =
    room.meta;
  const isBankrupt = me.status === 'bankrupt';
  const isActive = me.status === 'active';
  const isBanker = isActive && me.id === bankerId;
  const myMortgageCount = activeMortgageCounts[me.id] ?? 0;
  const isNegative = me.balance < 0;
  const debtHeadroom = negativeLimit + me.balance;

  const selectedBanker = activePlayers.find((player) => player.id === bankerId) ?? null;

  async function handleSelectLobbyBanker(nextBankerId: string) {
    if (lobbyBusy !== null) {
      return;
    }
    setLobbyBusy('banker');
    setLobbyError(null);
    const result = await runRoomMutation(room.meta.code, (latestRoom) =>
      selectLobbyBanker(latestRoom, {
        bankerId: nextBankerId,
        actorId: me.id,
      })
    );
    setLobbyBusy(null);
    if (!result.ok) {
      setLobbyError(result.error);
      onError?.(result.error);
    }
  }

  async function handleStartGame() {
    if (lobbyBusy !== null || !selectedBanker) {
      return;
    }
    setLobbyBusy('start');
    setLobbyError(null);
    const result = await runRoomMutation(room.meta.code, (latestRoom) =>
      startGame(latestRoom, { actorId: me.id })
    );
    setLobbyBusy(null);
    if (!result.ok) {
      setLobbyError(result.error);
      onError?.(result.error);
    }
  }

  if (status === 'lobby') {
    return (
      <div className="stack-md">
        <section className="panel stack-md" aria-label="Waiting room">
          <div className="row-between">
            <div className="stack-xs">
              <h1>Waiting for players</h1>
              <p className="text-sm text-muted">
                Wait for players to join (max {MAX_PLAYERS}), choose any player as Banker, then
                start the game.
              </p>
            </div>
            <span className="pill pill-accent tabular-nums">
              {activePlayers.length} / {MAX_PLAYERS}
            </span>
          </div>

          <div className="table-divider stack-xs">
            <div className="row-between text-sm">
              <span className="text-muted">Bank starting balance</span>
              <strong className="tabular-nums">
                {formatCurrency(bankBalance, currencySymbol, currencyLocale)}
              </strong>
            </div>
            <div className="row-between text-sm">
              <span className="text-muted">Player starting cash</span>
              <strong className="tabular-nums">
                {formatCurrency(startingCash, currencySymbol, currencyLocale)}
              </strong>
            </div>
          </div>

          <ul className="player-list table-divider">
            {activePlayers.map((player) => {
              const isSelf = player.id === me.id;
              const isPlayerBanker = player.id === bankerId;
              return (
                <li key={player.id} className="player-row">
                  <div className="player-name-row">
                    <span className="player-name">{player.name}</span>
                    {isSelf && <span className="pill">You</span>}
                    {isPlayerBanker && <span className="pill pill-accent">Banker</span>}
                  </div>
                  <button
                    type="button"
                    className={
                      isPlayerBanker
                        ? 'btn btn-secondary btn-compact'
                        : 'btn btn-ghost btn-compact'
                    }
                    disabled={lobbyBusy !== null || isPlayerBanker}
                    onClick={() => handleSelectLobbyBanker(player.id)}
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>{isPlayerBanker ? 'Banker' : 'Make Banker'}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {!selectedBanker && (
            <p className="text-sm text-muted">Choose a Banker above to enable game start.</p>
          )}

          {lobbyError && (
            <div className="table-inline-alert" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{lobbyError}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            disabled={lobbyBusy !== null || !selectedBanker}
            onClick={handleStartGame}
          >
            <Play size={18} aria-hidden="true" />
            <span>{lobbyBusy === 'start' ? 'Starting game...' : 'Start game'}</span>
          </button>
        </section>
      </div>
    );
  }

  function openPaySheet(mode: PaySheetMode, initialRecipientId?: string) {
    if (!isActive) {
      return;
    }
    setPaySheet({
      open: true,
      mode,
      initialRecipientId,
    });
  }

  function closePaySheet() {
    setPaySheet((prev) => ({
      ...prev,
      open: false,
    }));
  }

  return (
    <div className="stack-md">
      <section className="panel stack-md" aria-label="My wallet">
        <div className="row-between">
          <div className="row-wrap">
            <h1>{me.name}</h1>
            {isBanker && <span className="pill pill-accent">Banker</span>}
            {isBankrupt && <span className="pill pill-danger">Bankrupt</span>}
          </div>
          <span className="text-xs text-muted">My wallet</span>
        </div>

        <div className="wallet-balance-row">
          <div
            className={
              isNegative
                ? 'wallet-balance-value wallet-balance-value--negative tabular-nums'
                : 'wallet-balance-value tabular-nums'
            }
          >
            {formatCurrency(me.balance, currencySymbol, currencyLocale)}
          </div>

          {isNegative && (
            <span className={debtHeadroom <= 0 ? 'pill pill-danger' : 'pill pill-warning'}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span>
                {debtHeadroom <= 0 ? (
                  <>
                    At{' '}
                    <span className="tabular-nums">
                      {formatCurrency(-negativeLimit, currencySymbol, currencyLocale)}
                    </span>{' '}
                    limit
                  </>
                ) : (
                  <>
                    <span className="tabular-nums">
                      {formatCurrency(debtHeadroom, currencySymbol, currencyLocale)}
                    </span>{' '}
                    left before{' '}
                    <span className="tabular-nums">
                      {formatCurrency(-negativeLimit, currencySymbol, currencyLocale)}
                    </span>{' '}
                    limit
                  </>
                )}
              </span>
            </span>
          )}
        </div>

        {isBankrupt && (
          <p className="text-sm text-muted">
            You are bankrupt and can no longer send payments. You can still follow the table below.
          </p>
        )}

        <button
          type="button"
          className="btn btn-secondary wallet-mortgage-btn"
          onClick={onOpenMortgages}
        >
          <span className="row">
            <Landmark size={18} aria-hidden="true" />
            <span>Active mortgages</span>
          </span>
          <span className="row">
            <span className="pill tabular-nums">{myMortgageCount}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </span>
        </button>

        {isActive && (
          <div className="wallet-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openPaySheet('player_pay')}
            >
              <Send size={18} aria-hidden="true" />
              <span>Pay</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => openPaySheet('player_pay', 'BANK')}
            >
              <Landmark size={18} aria-hidden="true" />
              <span>Pay Bank</span>
            </button>
          </div>
        )}
      </section>

      <BankerBar
        room={room}
        me={me}
        onOpenBankPay={() => openPaySheet('bank_pay')}
        onOpenMortgages={onOpenMortgages}
        onError={onError}
      />

      <section className="panel stack-md" aria-label="Players">
        <div className="row-between">
          <h2>Players</h2>
          <span className="pill tabular-nums">{activePlayers.length} active</span>
        </div>

        <div className="row-between table-divider text-sm">
          <span className="text-muted">Bank balance</span>
          <strong className="tabular-nums">
            {formatCurrency(bankBalance, currencySymbol, currencyLocale)}
          </strong>
        </div>

        <ul className="player-list">
          {activePlayers.map((player) => {
            const isSelf = player.id === me.id;
            const isPlayerBanker = player.id === bankerId;
            const playerMortgages = activeMortgageCounts[player.id] ?? 0;

            return (
              <li key={player.id} className="player-row">
                <div className="player-meta">
                  <div className="player-name-row">
                    <span className="player-name">{player.name}</span>
                    {isSelf && <span className="pill">You</span>}
                    {isPlayerBanker && <span className="pill pill-accent">Banker</span>}
                  </div>
                  {playerMortgages > 0 && (
                    <span className="text-xs text-muted tabular-nums">
                      {playerMortgages} {playerMortgages === 1 ? 'mortgage' : 'mortgages'}
                    </span>
                  )}
                </div>

                <div className="player-right">
                  <span
                    className={
                      player.balance < 0
                        ? 'player-balance player-balance--negative tabular-nums'
                        : 'player-balance tabular-nums'
                    }
                  >
                    {formatCurrency(player.balance, currencySymbol, currencyLocale)}
                  </span>
                  {isActive && !isSelf && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => openPaySheet('player_pay', player.id)}
                      aria-label={`Pay ${player.name}`}
                    >
                      <span>Pay</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {exitedPlayers.length > 0 && (
          <details className="table-divider">
            <summary className="exited-summary">
              <span>Exited players ({exitedPlayers.length})</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <ul className="player-list">
              {exitedPlayers.map((player) => (
                <li key={player.id} className="player-row">
                  <span className="exited-player-name">{player.name}</span>
                  <span
                    className={
                      player.status === 'bankrupt' ? 'pill pill-danger' : 'pill'
                    }
                  >
                    {player.status === 'bankrupt' ? 'Bankrupt' : 'Removed'}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {isActive && (
        <PaySheet
          open={paySheet.open}
          mode={paySheet.mode}
          room={room}
          me={me}
          initialRecipientId={paySheet.initialRecipientId}
          onClose={closePaySheet}
        />
      )}
    </div>
  );
}
