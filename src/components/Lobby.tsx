import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  Search,
  UserCheck,
} from 'lucide-react';
import type { LocalSession, Player, PlayerColorId, RoomState } from '../types/game';
import {
  createRoom,
  fetchRoomOnce,
  isFirebaseConfigured,
  joinRoom,
  reclaimSeat,
} from '../lib/roomStore';
import { formatCurrency } from '../lib/format';
import {
  DEFAULT_CLUB_AMOUNT,
  DEFAULT_JAIL_AMOUNT,
  DEFAULT_REST_HOUSE_AMOUNT,
  MAX_PLAYERS,
} from '../lib/ledger';
import {
  getFirstAvailableColor,
  getPlayerColorStyle,
  getTakenColorOwners,
  PLAYER_COLORS,
} from '../lib/colors';
import { createLocalPlayerId, getRoomCodeFromUrl } from '../lib/session';
import './Lobby.css';

export type LobbyTab = 'join' | 'create';

export interface LobbyProps {
  activeTab?: LobbyTab;
  onTabChange?: (tab: LobbyTab) => void;
  onEnterRoom: (session: LocalSession, room: RoomState) => void;
}
type CurrencyPresetId = 'inr' | 'usd' | 'eur' | 'gbp' | 'custom';

interface CurrencyPreset {
  id: Exclude<CurrencyPresetId, 'custom'>;
  symbol: string;
  locale: string;
  label: string;
}

const CURRENCY_PRESETS: ReadonlyArray<CurrencyPreset> = [
  { id: 'inr', symbol: '₹', locale: 'en-IN', label: 'Indian Rupee (₹)' },
  { id: 'usd', symbol: '$', locale: 'en-US', label: 'US Dollar ($)' },
  { id: 'eur', symbol: '€', locale: 'en-US', label: 'Euro (€)' },
  { id: 'gbp', symbol: '£', locale: 'en-US', label: 'British Pound (£)' },
];

const ROOM_CODE_LENGTH = 6;
const MAX_NAME_LENGTH = 20;

interface ColorPickerFieldProps {
  labelId: string;
  label: string;
  selectedColor: PlayerColorId;
  takenOwners?: Partial<Record<PlayerColorId, Player>>;
  disabled: boolean;
  onSelect: (color: PlayerColorId) => void;
}

function ColorPickerField({
  labelId,
  label,
  selectedColor,
  takenOwners,
  disabled,
  onSelect,
}: ColorPickerFieldProps) {
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="lobby-color-grid" role="group" aria-labelledby={labelId}>
        {PLAYER_COLORS.map((color) => {
          const takenBy = takenOwners?.[color.id];
          const isSelected = selectedColor === color.id && !takenBy;
          return (
            <button
              key={color.id}
              type="button"
              style={getPlayerColorStyle(color.id)}
              aria-label={takenBy ? `${color.label} (taken by ${takenBy.name})` : color.label}
              aria-pressed={isSelected}
              title={takenBy ? `Taken by ${takenBy.name}` : color.label}
              className={isSelected ? 'lobby-color-btn lobby-color-btn--active' : 'lobby-color-btn'}
              disabled={disabled || Boolean(takenBy)}
              onClick={() => onSelect(color.id)}
            >
              <span className="lobby-color-swatch" aria-hidden="true" />
              <span>{color.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function sanitizeRoomCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

function parseNonNegativeWholeNumber(
  raw: string,
  label: string
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `${label} must be a whole number of 0 or more.` };
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { ok: false, error: `${label} is too large.` };
  }
  return { ok: true, value: parsed };
}

export function Lobby({ activeTab: controlledTab, onTabChange, onEnterRoom }: LobbyProps) {
  const firebaseReady = isFirebaseConfigured();
  const initialUrlCode = useMemo(() => getRoomCodeFromUrl(), []);

  const [uncontrolledTab, setUncontrolledTab] = useState<LobbyTab>('join');
  const activeTab = controlledTab ?? uncontrolledTab;

  function selectTab(nextTab: LobbyTab) {
    if (controlledTab === undefined) {
      setUncontrolledTab(nextTab);
    }
    onTabChange?.(nextTab);
  }

  // Join & reclaim state
  const [roomCodeInput, setRoomCodeInput] = useState<string>(() => initialUrlCode ?? '');
  const [foundRoom, setFoundRoom] = useState<RoomState | null>(null);
  const [lookupLoading, setLookupLoading] = useState<boolean>(() =>
    Boolean(firebaseReady && initialUrlCode)
  );
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [joinName, setJoinName] = useState('');
  const [joinColor, setJoinColor] = useState<PlayerColorId>(PLAYER_COLORS[1].id);
  const [joinLoading, setJoinLoading] = useState(false);
  const [reclaimingId, setReclaimingId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Create room state
  const [creatorName, setCreatorName] = useState('');
  const [creatorColor, setCreatorColor] = useState<PlayerColorId>(PLAYER_COLORS[0].id);
  const [currencyPreset, setCurrencyPreset] = useState<CurrencyPresetId>('inr');
  const [customCurrency, setCustomCurrency] = useState('');
  const [startingCashInput, setStartingCashInput] = useState('15000');
  const [bankStartingCashInput, setBankStartingCashInput] = useState('100000');
  const [negativeLimitInput, setNegativeLimitInput] = useState('5000');
  const [passStartInput, setPassStartInput] = useState('2000');
  const [clubAmountInput, setClubAmountInput] = useState(String(DEFAULT_CLUB_AMOUNT));
  const [restHouseAmountInput, setRestHouseAmountInput] = useState(
    String(DEFAULT_REST_HOUSE_AMOUNT)
  );
  const [jailAmountInput, setJailAmountInput] = useState(String(DEFAULT_JAIL_AMOUNT));
  const [mortgageInterestPct, setMortgageInterestPct] = useState<0 | 10>(10);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseReady || !initialUrlCode) {
      return;
    }

    let cancelled = false;
    setLookupLoading(true);
    setLookupError(null);

    fetchRoomOnce(initialUrlCode)
      .then((room) => {
        if (cancelled) {
          return;
        }
        setLookupLoading(false);
        if (!room) {
          setFoundRoom(null);
          setLookupError(`Room ${initialUrlCode} was not found.`);
          return;
        }
        setFoundRoom(room);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLookupLoading(false);
        setFoundRoom(null);
        setLookupError('Unable to look up room. Check your connection and try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseReady, initialUrlCode]);

  const seats = useMemo(() => {
    if (!foundRoom) {
      return [];
    }
    return Object.values(foundRoom.players)
      .filter((player) => player.status !== 'removed')
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [foundRoom]);

  const duplicatePlayer = useMemo(() => {
    if (!foundRoom) {
      return null;
    }
    const normalized = joinName.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return (
      seats.find((player) => player.name.trim().toLowerCase() === normalized) ?? null
    );
  }, [foundRoom, joinName, seats]);

  const takenColorOwners = useMemo(
    () => getTakenColorOwners(foundRoom?.players),
    [foundRoom?.players]
  );

  useEffect(() => {
    if (!foundRoom) {
      return;
    }
    if (takenColorOwners[joinColor]) {
      setJoinColor(getFirstAvailableColor(foundRoom.players));
    }
  }, [foundRoom, joinColor, takenColorOwners]);

  const joinBusy = lookupLoading || joinLoading || reclaimingId !== null;

  if (!firebaseReady) {
    return (
      <section className="panel-warning stack-sm" role="alert">
        <div className="row">
          <AlertTriangle size={20} aria-hidden="true" />
          <h2>Firebase configuration needed</h2>
        </div>
        <p className="text-sm">
          Add <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_DATABASE_URL</code>, and your
          remaining <code>VITE_FIREBASE_*</code> keys in <code>.env.local</code> before creating or
          joining live game rooms.
        </p>
      </section>
    );
  }

  function handleRoomCodeChange(nextValue: string) {
    const sanitized = sanitizeRoomCodeInput(nextValue);
    setRoomCodeInput(sanitized);
    setLookupError(null);
    setJoinError(null);
    if (foundRoom && sanitized !== foundRoom.meta.code) {
      setFoundRoom(null);
    }
  }

  async function handleFindRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joinBusy) {
      return;
    }

    const code = sanitizeRoomCodeInput(roomCodeInput);
    setRoomCodeInput(code);
    setLookupError(null);
    setJoinError(null);

    if (code.length !== ROOM_CODE_LENGTH) {
      setFoundRoom(null);
      setLookupError('Enter a 6-character room code.');
      return;
    }

    setLookupLoading(true);
    try {
      const room = await fetchRoomOnce(code);
      if (!room) {
        setFoundRoom(null);
        setLookupError(`Room ${code} was not found.`);
      } else {
        setFoundRoom(room);
      }
    } catch {
      setFoundRoom(null);
      setLookupError('Unable to look up room. Check your connection and try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleJoinGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!foundRoom || joinBusy) {
      return;
    }

    setJoinError(null);
    const trimmedName = joinName.trim();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
      setJoinError(`Enter a name between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    if (duplicatePlayer) {
      setJoinError(
        `"${duplicatePlayer.name}" is already in this room. Tap Reclaim seat below to resume.`
      );
      return;
    }

    setJoinLoading(true);
    const playerId = createLocalPlayerId();
    const result = await joinRoom(foundRoom.meta.code, {
      playerId,
      name: trimmedName,
      color: joinColor,
    });
    setJoinLoading(false);

    if (!result.ok) {
      setJoinError(result.error);
      fetchRoomOnce(foundRoom.meta.code)
        .then((latest) => {
          if (latest) {
            setFoundRoom(latest);
          }
        })
        .catch(() => {});
      return;
    }

    const seatedPlayer = result.room.players[result.playerId];
    onEnterRoom(
      {
        roomCode: result.room.meta.code,
        playerId: result.playerId,
        playerName: seatedPlayer?.name ?? trimmedName,
      },
      result.room
    );
  }

  async function handleReclaimSeat(playerId: string, playerName: string) {
    if (!foundRoom || joinBusy) {
      return;
    }

    setJoinError(null);
    setReclaimingId(playerId);
    const result = await reclaimSeat(foundRoom.meta.code, playerId);
    setReclaimingId(null);

    if (!result.ok) {
      setJoinError(result.error);
      return;
    }

    const seatedPlayer = result.room.players[result.playerId];
    onEnterRoom(
      {
        roomCode: result.room.meta.code,
        playerId: result.playerId,
        playerName: seatedPlayer?.name ?? playerName,
      },
      result.room
    );
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createLoading) {
      return;
    }

    setCreateError(null);

    const trimmedCreator = creatorName.trim();
    if (!trimmedCreator || trimmedCreator.length > MAX_NAME_LENGTH) {
      setCreateError(`Your name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    const selectedPreset = CURRENCY_PRESETS.find((item) => item.id === currencyPreset);
    const currencySymbol = selectedPreset ? selectedPreset.symbol : customCurrency.trim();
    if (!currencySymbol) {
      setCreateError('Enter a custom currency symbol.');
      return;
    }
    const currencyLocale = selectedPreset
      ? selectedPreset.locale
      : currencySymbol === '₹'
        ? 'en-IN'
        : 'en-US';

    const startingCash = parseNonNegativeWholeNumber(startingCashInput, 'Starting cash');
    if (!startingCash.ok) {
      setCreateError(startingCash.error);
      return;
    }

    const bankStartingCash = parseNonNegativeWholeNumber(
      bankStartingCashInput,
      'Bank starting balance'
    );
    if (!bankStartingCash.ok) {
      setCreateError(bankStartingCash.error);
      return;
    }

    const negativeLimit = parseNonNegativeWholeNumber(
      negativeLimitInput,
      'Negative balance limit'
    );
    if (!negativeLimit.ok) {
      setCreateError(negativeLimit.error);
      return;
    }

    const passStartAmount = parseNonNegativeWholeNumber(passStartInput, 'Pass Start bonus');
    if (!passStartAmount.ok) {
      setCreateError(passStartAmount.error);
      return;
    }

    const clubAmount = parseNonNegativeWholeNumber(clubAmountInput, 'Club fee');
    if (!clubAmount.ok) {
      setCreateError(clubAmount.error);
      return;
    }

    const restHouseAmount = parseNonNegativeWholeNumber(restHouseAmountInput, 'Rest House amount');
    if (!restHouseAmount.ok) {
      setCreateError(restHouseAmount.error);
      return;
    }

    const jailAmount = parseNonNegativeWholeNumber(jailAmountInput, 'Jail fine');
    if (!jailAmount.ok) {
      setCreateError(jailAmount.error);
      return;
    }

    setCreateLoading(true);
    const creatorId = createLocalPlayerId();
    const result = await createRoom({
      creatorName: trimmedCreator,
      creatorColor,
      currencySymbol,
      currencyLocale,
      startingCash: startingCash.value,
      bankStartingCash: bankStartingCash.value,
      negativeLimit: negativeLimit.value,
      passStartAmount: passStartAmount.value,
      clubAmount: clubAmount.value,
      restHouseAmount: restHouseAmount.value,
      jailAmount: jailAmount.value,
      mortgageInterestPct,
      creatorId,
    });
    setCreateLoading(false);

    if (!result.ok) {
      setCreateError(result.error);
      return;
    }

    const creator = result.room.players[result.room.meta.creatorId];
    onEnterRoom(
      {
        roomCode: result.room.meta.code,
        playerId: result.room.meta.creatorId,
        playerName: creator?.name ?? trimmedCreator,
      },
      result.room
    );
  }

  return (
    <section id="lobby" className="panel stack-md" aria-label="Game lobby">
      <div className="stack-xs">
        <h2>Enter a table</h2>
        <p className="text-sm text-muted">
          Create a shared room or join an existing table with its 6-character code.
        </p>
      </div>

      <div className="lobby-tabs" role="tablist" aria-label="Lobby mode">
        <button
          id="lobby-tab-join"
          type="button"
          role="tab"
          aria-selected={activeTab === 'join'}
          aria-controls="lobby-panel-join"
          className={activeTab === 'join' ? 'lobby-tab lobby-tab--active' : 'lobby-tab'}
          onClick={() => selectTab('join')}
        >
          <Search size={18} aria-hidden="true" />
          <span>Join room</span>
        </button>
        <button
          id="lobby-tab-create"
          type="button"
          role="tab"
          aria-selected={activeTab === 'create'}
          aria-controls="lobby-panel-create"
          className={activeTab === 'create' ? 'lobby-tab lobby-tab--active' : 'lobby-tab'}
          onClick={() => selectTab('create')}
        >
          <PlusCircle size={18} aria-hidden="true" />
          <span>Create room</span>
        </button>
      </div>

      {activeTab === 'join' && (
        <div
          id="lobby-panel-join"
          role="tabpanel"
          aria-labelledby="lobby-tab-join"
          className="stack-md"
        >
          <form className="stack-sm" onSubmit={handleFindRoom} noValidate>
            <div className="field">
              <label htmlFor="lobby-room-code" className="field-label">
                Room code
              </label>
              <div className="lobby-lookup-row">
                <input
                  id="lobby-room-code"
                  type="text"
                  className="input lobby-code-input tabular-nums"
                  value={roomCodeInput}
                  onChange={(event) => handleRoomCodeChange(event.target.value)}
                  placeholder="ABCD23"
                  maxLength={ROOM_CODE_LENGTH}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={joinBusy}
                />
                <button
                  type="submit"
                  className={foundRoom ? 'btn btn-secondary' : 'btn btn-primary'}
                  disabled={joinBusy}
                >
                  <Search size={18} aria-hidden="true" />
                  <span>{lookupLoading ? 'Finding...' : 'Find room'}</span>
                </button>
              </div>
            </div>

            {lookupError && (
              <div className="lobby-error" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{lookupError}</span>
              </div>
            )}
          </form>

          {foundRoom && (
            <>
              <div className="lobby-divider stack-sm">
                <div className="row-between">
                  <h2>Room {foundRoom.meta.code}</h2>
                  <span className="pill pill-accent tabular-nums">
                    {foundRoom.meta.currencySymbol}
                  </span>
                </div>

                <dl className="lobby-meta-grid">
                  <div className="lobby-meta-item">
                    <dt>Starting cash</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(
                        foundRoom.meta.startingCash,
                        foundRoom.meta.currencySymbol,
                        foundRoom.meta.currencyLocale
                      )}
                    </dd>
                  </div>
                  <div className="lobby-meta-item">
                    <dt>Pass Start</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(
                        foundRoom.meta.passStartAmount,
                        foundRoom.meta.currencySymbol,
                        foundRoom.meta.currencyLocale
                      )}
                    </dd>
                  </div>
                  <div className="lobby-meta-item">
                    <dt>Debt limit</dt>
                    <dd className="tabular-nums">
                      {foundRoom.meta.negativeLimit === 0
                        ? 'Disabled'
                        : `-${formatCurrency(
                            foundRoom.meta.negativeLimit,
                            foundRoom.meta.currencySymbol,
                            foundRoom.meta.currencyLocale
                          )}`}
                    </dd>
                  </div>
                  <div className="lobby-meta-item">
                    <dt>Bank balance</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(
                        foundRoom.meta.bankBalance,
                        foundRoom.meta.currencySymbol,
                        foundRoom.meta.currencyLocale
                      )}
                    </dd>
                  </div>
                  <div className="lobby-meta-item">
                    <dt>Players</dt>
                    <dd className="tabular-nums">
                      {seats.length} / {MAX_PLAYERS}
                    </dd>
                  </div>
                  <div className="lobby-meta-item">
                    <dt>Mortgage interest</dt>
                    <dd className="tabular-nums">{foundRoom.meta.mortgageInterestPct}%</dd>
                  </div>
                </dl>
              </div>

              {foundRoom.meta.status === 'active' || seats.length >= MAX_PLAYERS ? (
                <div className="lobby-divider stack-xs">
                  <h3>
                    {foundRoom.meta.status === 'active'
                      ? 'Game already in progress'
                      : `Room full (${seats.length}/${MAX_PLAYERS})`}
                  </h3>
                  <p className="text-sm text-muted">
                    {foundRoom.meta.status === 'active'
                      ? 'New players cannot join after start. Reclaim an existing seat below.'
                      : 'Maximum players reached. Reclaim an existing seat below.'}
                  </p>
                </div>
              ) : (
                <form className="lobby-divider stack-sm" onSubmit={handleJoinGame} noValidate>
                  <div className="field">
                    <label htmlFor="lobby-join-name" className="field-label">
                      Join as a new player
                    </label>
                    <input
                      id="lobby-join-name"
                      type="text"
                      className="input"
                      value={joinName}
                      onChange={(event) => {
                        setJoinName(event.target.value);
                        setJoinError(null);
                      }}
                      placeholder="Enter your name"
                      maxLength={MAX_NAME_LENGTH}
                      autoComplete="nickname"
                      disabled={joinBusy}
                    />
                  </div>

                  <ColorPickerField
                    labelId="lobby-join-color-label"
                    label="Your color (first come, first served)"
                    selectedColor={joinColor}
                    takenOwners={takenColorOwners}
                    disabled={joinBusy}
                    onSelect={(color) => {
                      setJoinColor(color);
                      setJoinError(null);
                    }}
                  />

                  {duplicatePlayer && (
                    <div className="lobby-error" role="alert">
                      <AlertTriangle size={18} aria-hidden="true" />
                      <span>
                        &ldquo;{duplicatePlayer.name}&rdquo; is already in this room. Tap Reclaim seat
                        below instead.
                      </span>
                    </div>
                  )}

                  {joinError && !duplicatePlayer && (
                    <div className="lobby-error" role="alert">
                      <AlertTriangle size={18} aria-hidden="true" />
                      <span>{joinError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={joinBusy || Boolean(duplicatePlayer)}
                  >
                    <ArrowRight size={18} aria-hidden="true" />
                    <span>{joinLoading ? 'Joining...' : 'Join room'}</span>
                  </button>
                </form>
              )}

              <div className="lobby-divider stack-sm">
                <div className="stack-xs">
                  <h3>Reclaim existing seat</h3>
                  <p className="text-xs text-muted">
                    Pick your seat to reconnect without losing your balance.
                  </p>
                </div>

                {seats.length === 0 ? (
                  <p className="text-sm text-muted">No active seats in this room yet.</p>
                ) : (
                  <ul className="seat-list">
                    {seats.map((seat) => {
                      const isBanker = seat.id === foundRoom.meta.bankerId;
                      const isBankrupt = seat.status === 'bankrupt';
                      const isReclaimingThis = reclaimingId === seat.id;

                      return (
                        <li key={seat.id} className="seat-row">
                          <div className="seat-info">
                            <div className="seat-name-row">
                              {seat.color && (
                                <span
                                  className="color-dot"
                                  style={getPlayerColorStyle(seat.color)}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="seat-name">{seat.name}</span>
                              {isBanker && <span className="pill pill-accent">Banker</span>}
                              {isBankrupt && <span className="pill pill-danger">Bankrupt</span>}
                            </div>
                            <span className="text-sm text-muted tabular-nums">
                              {formatCurrency(
                                seat.balance,
                                foundRoom.meta.currencySymbol,
                                foundRoom.meta.currencyLocale
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            disabled={joinBusy}
                            onClick={() => handleReclaimSeat(seat.id, seat.name)}
                          >
                            <UserCheck size={18} aria-hidden="true" />
                            <span>{isReclaimingThis ? 'Reclaiming...' : 'Reclaim seat'}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <form
          id="lobby-panel-create"
          role="tabpanel"
          aria-labelledby="lobby-tab-create"
          className="stack-md"
          onSubmit={handleCreateRoom}
          noValidate
        >
          <div className="field">
            <label htmlFor="lobby-creator-name" className="field-label">
              Your name
            </label>
            <input
              id="lobby-creator-name"
              type="text"
              className="input"
              value={creatorName}
              onChange={(event) => {
                setCreatorName(event.target.value);
                setCreateError(null);
              }}
              placeholder="Enter your name"
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              disabled={createLoading}
            />
          </div>

          <ColorPickerField
            labelId="lobby-creator-color-label"
            label="Your color"
            selectedColor={creatorColor}
            disabled={createLoading}
            onSelect={(color) => {
              setCreatorColor(color);
              setCreateError(null);
            }}
          />

          <div className="field">
            <span className="field-label" id="lobby-currency-label">
              Currency
            </span>
            <div
              className="lobby-option-grid"
              role="group"
              aria-labelledby="lobby-currency-label"
            >
              {CURRENCY_PRESETS.map((preset) => {
                const isSelected = currencyPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={preset.label}
                    aria-pressed={isSelected}
                    className={
                      isSelected ? 'lobby-option-btn lobby-option-btn--active' : 'lobby-option-btn'
                    }
                    onClick={() => {
                      setCurrencyPreset(preset.id);
                      setCreateError(null);
                    }}
                    disabled={createLoading}
                  >
                    {preset.symbol}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={currencyPreset === 'custom'}
                className={
                  currencyPreset === 'custom'
                    ? 'lobby-option-btn lobby-option-btn--active'
                    : 'lobby-option-btn'
                }
                onClick={() => {
                  setCurrencyPreset('custom');
                  setCreateError(null);
                }}
                disabled={createLoading}
              >
                Custom
              </button>
            </div>
          </div>

          {currencyPreset === 'custom' && (
            <div className="field">
              <label htmlFor="lobby-custom-currency" className="field-label">
                Custom currency symbol
              </label>
              <input
                id="lobby-custom-currency"
                type="text"
                className="input"
                value={customCurrency}
                onChange={(event) => {
                  setCustomCurrency(event.target.value);
                  setCreateError(null);
                }}
                placeholder="e.g. ¥ or CHF"
                maxLength={6}
                disabled={createLoading}
              />
            </div>
          )}

          <div className="lobby-rules-grid">
            <div className="field">
              <label htmlFor="lobby-starting-cash" className="field-label">
                Player starting cash
              </label>
              <input
                id="lobby-starting-cash"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={startingCashInput}
                onChange={(event) => {
                  setStartingCashInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
            </div>

            <div className="field">
              <label htmlFor="lobby-bank-starting-cash" className="field-label">
                Bank starting balance
              </label>
              <input
                id="lobby-bank-starting-cash"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={bankStartingCashInput}
                onChange={(event) => {
                  setBankStartingCashInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
            </div>

            <div className="field">
              <label htmlFor="lobby-pass-start" className="field-label">
                Pass Start bonus
              </label>
              <input
                id="lobby-pass-start"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={passStartInput}
                onChange={(event) => {
                  setPassStartInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
            </div>

            <div className="field">
              <label htmlFor="lobby-negative-limit" className="field-label">
                Negative balance limit
              </label>
              <input
                id="lobby-negative-limit"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={negativeLimitInput}
                onChange={(event) => {
                  setNegativeLimitInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
              <span className="field-hint">Set to 0 to disallow negative balances.</span>
            </div>

            <div className="field">
              <label htmlFor="lobby-club-amount" className="field-label">
                Club fee (pay each player)
              </label>
              <input
                id="lobby-club-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={clubAmountInput}
                onChange={(event) => {
                  setClubAmountInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
            </div>

            <div className="field">
              <label htmlFor="lobby-rest-house-amount" className="field-label">
                Rest House (collect each)
              </label>
              <input
                id="lobby-rest-house-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={restHouseAmountInput}
                onChange={(event) => {
                  setRestHouseAmountInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
            </div>

            <div className="field">
              <label htmlFor="lobby-jail-amount" className="field-label">
                Jail bail fine (to Bank)
              </label>
              <input
                id="lobby-jail-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input tabular-nums"
                value={jailAmountInput}
                onChange={(event) => {
                  setJailAmountInput(event.target.value);
                  setCreateError(null);
                }}
                disabled={createLoading}
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label" id="lobby-interest-label">
              Mortgage interest
            </span>
            <div
              className="lobby-option-grid"
              role="group"
              aria-labelledby="lobby-interest-label"
            >
              {([0, 10] as const).map((pct) => {
                const isSelected = mortgageInterestPct === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={isSelected}
                    className={
                      isSelected ? 'lobby-option-btn lobby-option-btn--active' : 'lobby-option-btn'
                    }
                    onClick={() => setMortgageInterestPct(pct)}
                    disabled={createLoading}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
          </div>

          {createError && (
            <div className="lobby-error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{createError}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={createLoading}>
            <PlusCircle size={18} aria-hidden="true" />
            <span>{createLoading ? 'Creating room...' : 'Create room'}</span>
          </button>
        </form>
      )}
    </section>
  );
}
