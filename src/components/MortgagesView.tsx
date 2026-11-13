import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Landmark,
  PlusCircle,
} from 'lucide-react';
import type { RoomState } from '../types/game';
import { clearMortgage, issueMortgage } from '../lib/ledger';
import { formatCurrency } from '../lib/format';
import { runRoomMutation } from '../lib/roomStore';
import './LedgerViews.css';

export interface MortgagesViewProps {
  room: RoomState;
  playerId: string;
}

const MAX_PROPERTY_NAME_LENGTH = 40;

function parsePositiveWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatShortTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function MortgagesView({ room, playerId }: MortgagesViewProps) {
  const players = room.players ?? {};
  const me = players[playerId] ?? null;
  const isBanker = Boolean(me && me.status === 'active' && playerId === room.meta.bankerId);

  const activePlayers = useMemo(
    () =>
      Object.values(players)
        .filter((player) => player.status === 'active')
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)),
    [players]
  );

  const [targetPlayerId, setTargetPlayerId] = useState<string>(() => {
    if (players[playerId]?.status === 'active') {
      return playerId;
    }
    return activePlayers[0]?.id ?? '';
  });
  const [propertyName, setPropertyName] = useState('');
  const [principalInput, setPrincipalInput] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const [clearingId, setClearingId] = useState<string | null>(null);
  const [clearError, setClearError] = useState<{ mortgageId: string; message: string } | null>(
    null
  );

  useEffect(() => {
    if (activePlayers.length === 0) {
      setTargetPlayerId('');
      return;
    }
    if (!activePlayers.some((player) => player.id === targetPlayerId)) {
      const preferred = activePlayers.find((player) => player.id === playerId) ?? activePlayers[0];
      setTargetPlayerId(preferred.id);
    }
  }, [activePlayers, playerId, targetPlayerId]);

  const { activeMortgages, archivedMortgages, clearedMortgageIds } = useMemo(() => {
    const allMortgages = Object.values(room.mortgages ?? {}).sort(
      (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
    );
    const clearedIds = new Set<string>();
    for (const tx of Object.values(room.transactions ?? {})) {
      if (tx.type === 'unmortgage' && !tx.undone && tx.mortgageId) {
        clearedIds.add(tx.mortgageId);
      }
    }
    return {
      activeMortgages: allMortgages.filter((mortgage) => mortgage.active),
      archivedMortgages: allMortgages.filter((mortgage) => !mortgage.active),
      clearedMortgageIds: clearedIds,
    };
  }, [room.mortgages, room.transactions]);

  const { currencySymbol, currencyLocale, mortgageInterestPct, bankBalance } = room.meta;
  const parsedPrincipal = parsePositiveWholeNumber(principalInput);
  const isBankInsufficient = parsedPrincipal !== null && parsedPrincipal > bankBalance;
  const previewPayoff =
    parsedPrincipal !== null
      ? mortgageInterestPct === 10
        ? Math.round(parsedPrincipal * 1.1)
        : parsedPrincipal
      : null;

  const isMutating = issuing || clearingId !== null;

  async function handleIssueMortgage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBanker || isMutating) {
      return;
    }

    const trimmedProperty = propertyName.trim();
    if (trimmedProperty.length < 1 || trimmedProperty.length > MAX_PROPERTY_NAME_LENGTH) {
      setIssueError(`Property name must be between 1 and ${MAX_PROPERTY_NAME_LENGTH} characters.`);
      return;
    }
    if (!targetPlayerId) {
      setIssueError('Select an active player to receive the mortgage payout.');
      return;
    }
    if (parsedPrincipal === null) {
      setIssueError('Payout amount must be a whole number greater than 0.');
      return;
    }

    setIssuing(true);
    setIssueError(null);
    setClearError(null);

    const result = await runRoomMutation(room.meta.code, (latestRoom) =>
      issueMortgage(latestRoom, {
        playerId: targetPlayerId,
        propertyName: trimmedProperty,
        principal: parsedPrincipal,
        actorId: playerId,
      })
    );

    setIssuing(false);

    if (!result.ok) {
      setIssueError(result.error);
      return;
    }

    setPropertyName('');
    setPrincipalInput('');
  }

  async function handleClearMortgage(mortgageId: string) {
    if (!isBanker || isMutating) {
      return;
    }

    setClearingId(mortgageId);
    setClearError(null);
    setIssueError(null);

    const result = await runRoomMutation(room.meta.code, (latestRoom) =>
      clearMortgage(latestRoom, {
        mortgageId,
        actorId: playerId,
      })
    );

    setClearingId(null);

    if (!result.ok) {
      setClearError({ mortgageId, message: result.error });
    }
  }

  return (
    <div className="stack-md">
      {isBanker && (
        <section className="panel stack-md" aria-label="Issue mortgage">
          <div className="row-between">
            <div className="row">
              <Landmark size={20} aria-hidden="true" />
              <h2>Issue mortgage</h2>
            </div>
            <span className="pill pill-accent tabular-nums">
              {mortgageInterestPct === 10 ? '+10% payoff' : '0% payoff'}
            </span>
          </div>

          <form className="stack-md" onSubmit={handleIssueMortgage} noValidate>
            <div className="mortgage-form-grid">
              <div className="field">
                <label className="field-label" htmlFor="mortgage-player-select">
                  Player
                </label>
                <select
                  id="mortgage-player-select"
                  className="select"
                  value={targetPlayerId}
                  onChange={(event) => {
                    setIssueError(null);
                    setTargetPlayerId(event.target.value);
                  }}
                  disabled={isMutating || activePlayers.length === 0}
                >
                  {activePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.id === playerId ? `${player.name} (You)` : player.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="mortgage-amount-input">
                  Cash payout ({currencySymbol})
                </label>
                <input
                  id="mortgage-amount-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="input tabular-nums"
                  placeholder="e.g. 1000"
                  value={principalInput}
                  onChange={(event) => {
                    setIssueError(null);
                    setPrincipalInput(event.target.value.replace(/[^\d]/g, ''));
                  }}
                  disabled={isMutating}
                />
              </div>

              <div className="field mortgage-form-span">
                <label className="field-label" htmlFor="mortgage-property-input">
                  Property or card name
                </label>
                <input
                  id="mortgage-property-input"
                  type="text"
                  className="input"
                  maxLength={MAX_PROPERTY_NAME_LENGTH}
                  placeholder="e.g. Mumbai or Boardwalk"
                  value={propertyName}
                  onChange={(event) => {
                    setIssueError(null);
                    setPropertyName(event.target.value);
                  }}
                  disabled={isMutating}
                />
                <span className="field-hint tabular-nums">
                  {propertyName.trim().length}/{MAX_PROPERTY_NAME_LENGTH} characters
                </span>
              </div>
            </div>

            <div className="mortgage-preview-row">
              <span className="text-sm text-muted">Bank balance available</span>
              <span className="text-sm tabular-nums">
                {formatCurrency(bankBalance, currencySymbol, currencyLocale)}
              </span>
            </div>

            <div className="mortgage-preview-row">
              <span className="text-sm text-muted">
                Payoff to clear ({mortgageInterestPct === 10 ? '+10% interest' : '0% interest'})
              </span>
              <span className="mortgage-preview-value tabular-nums">
                {previewPayoff !== null
                  ? formatCurrency(previewPayoff, currencySymbol, currencyLocale)
                  : '—'}
              </span>
            </div>

            {isBankInsufficient && (
              <div className="ledger-inline-alert" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  Payout exceeds available Bank balance (
                  {formatCurrency(bankBalance, currencySymbol, currencyLocale)}).
                </span>
              </div>
            )}

            {issueError && (
              <div className="ledger-inline-alert" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{issueError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary mortgage-submit-btn"
              disabled={isMutating || activePlayers.length === 0 || isBankInsufficient}
            >
              <PlusCircle size={18} aria-hidden="true" />
              <span>{issuing ? 'Issuing...' : 'Issue Mortgage'}</span>
            </button>
          </form>
        </section>
      )}

      <section className="panel stack-md" aria-label="Active mortgages">
        <div className="row-between">
          <h2>Active mortgages</h2>
          <span className="pill tabular-nums">{activeMortgages.length}</span>
        </div>

        {clearError && !activeMortgages.some((m) => m.id === clearError.mortgageId) && (
          <div className="ledger-inline-alert" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{clearError.message}</span>
          </div>
        )}

        {activeMortgages.length === 0 ? (
          <div className="ledger-empty">
            <p className="text-sm">No active mortgages on the table.</p>
            <p className="text-xs text-muted">
              {isBanker
                ? 'Use Issue mortgage above when a player pledges a property to the Bank.'
                : 'Properties mortgaged to the Bank by any player will appear here.'}
            </p>
          </div>
        ) : (
          <ul className="ledger-list">
            {activeMortgages.map((mortgage) => {
              const owner = players[mortgage.playerId];
              const isMine = mortgage.playerId === playerId;
              const isClearingThis = clearingId === mortgage.id;
              const rowError =
                clearError && clearError.mortgageId === mortgage.id ? clearError.message : null;

              return (
                <li key={mortgage.id} className="mortgage-row">
                  <div className="mortgage-row-top">
                    <div className="mortgage-title-group">
                      <span className="mortgage-property-name">{mortgage.propertyName}</span>
                      <div className="mortgage-owner-row">
                        <span>{owner?.name ?? 'Unknown player'}</span>
                        {isMine && <span className="pill">You</span>}
                        {owner && owner.status === 'bankrupt' && (
                          <span className="pill pill-danger">Bankrupt</span>
                        )}
                      </div>
                    </div>

                    {isBanker && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        disabled={isMutating}
                        onClick={() => handleClearMortgage(mortgage.id)}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <span>{isClearingThis ? 'Clearing...' : 'Clear Mortgage'}</span>
                      </button>
                    )}
                  </div>

                  <div className="mortgage-figures">
                    <div className="mortgage-figure-pair">
                      <span className="mortgage-figure-item">
                        <span>Cash received:</span>
                        <span className="mortgage-figure-value tabular-nums">
                          {formatCurrency(mortgage.principal, currencySymbol, currencyLocale)}
                        </span>
                      </span>
                      <span className="mortgage-figure-item">
                        <span>Payoff:</span>
                        <span className="mortgage-figure-value tabular-nums">
                          {formatCurrency(mortgage.payoffAmount, currencySymbol, currencyLocale)}
                        </span>
                      </span>
                    </div>
                    <span className="text-xs text-muted tabular-nums">
                      {formatShortTime(mortgage.createdAt)}
                    </span>
                  </div>

                  {rowError && (
                    <div className="ledger-inline-alert" role="alert">
                      <AlertTriangle size={16} aria-hidden="true" />
                      <span>{rowError}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {archivedMortgages.length > 0 && (
          <details className="ledger-divider">
            <summary className="ledger-details-summary">
              <span>Cleared / voided mortgages ({archivedMortgages.length})</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <ul className="ledger-list">
              {archivedMortgages.map((mortgage) => {
                const owner = players[mortgage.playerId];
                const wasCleared = clearedMortgageIds.has(mortgage.id);
                const hasClearedTimestamp = mortgage.clearedAt != null;

                return (
                  <li key={mortgage.id} className="mortgage-row mortgage-row--archived">
                    <div className="mortgage-row-top">
                      <div className="mortgage-title-group">
                        <span className="mortgage-property-name">{mortgage.propertyName}</span>
                        <div className="mortgage-owner-row">
                          <span>{owner?.name ?? 'Unknown player'}</span>
                          {mortgage.playerId === playerId && <span className="pill">You</span>}
                        </div>
                      </div>
                      <span className="pill">{wasCleared ? 'Cleared' : 'Voided'}</span>
                    </div>

                    <div className="mortgage-figures">
                      <div className="mortgage-figure-pair">
                        <span className="mortgage-figure-item">
                          <span>Cash:</span>
                          <span className="tabular-nums">
                            {formatCurrency(mortgage.principal, currencySymbol, currencyLocale)}
                          </span>
                        </span>
                        <span className="mortgage-figure-item">
                          <span>Payoff:</span>
                          <span className="tabular-nums">
                            {formatCurrency(mortgage.payoffAmount, currencySymbol, currencyLocale)}
                          </span>
                        </span>
                      </div>
                      {hasClearedTimestamp && mortgage.clearedAt != null && (
                        <span className="text-xs text-muted tabular-nums">
                          {formatShortTime(mortgage.clearedAt)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
