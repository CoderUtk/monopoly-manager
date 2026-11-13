import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { AlertTriangle, Delete, Landmark, Send, X } from 'lucide-react';
import type { Player, RoomState } from '../types/game';
import { applyPayment } from '../lib/ledger';
import { computeQuickChips, formatCurrency } from '../lib/format';
import { runRoomMutation } from '../lib/roomStore';
import './TableView.css';

export type PaySheetMode = 'player_pay' | 'bank_pay';

export interface PaySheetProps {
  open: boolean;
  mode: PaySheetMode;
  room: RoomState;
  me: Player;
  initialRecipientId?: string;
  onClose: () => void;
}

interface RecipientOption {
  id: string;
  label: string;
  isBank: boolean;
  player?: Player;
}

const MAX_AMOUNT_DIGITS = 8;
const MAX_AMOUNT_VALUE = 99_999_999;
const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

function applyKeypadInput(prev: string, input: string): string {
  if (input === 'Backspace') {
    return prev.slice(0, -1);
  }
  if (prev === '' && (input === '0' || input === '00')) {
    return '';
  }
  if (prev === '0') {
    return input === '0' || input === '00' ? '' : input;
  }
  if (prev.length + input.length > MAX_AMOUNT_DIGITS) {
    return prev;
  }
  return prev + input;
}

export function PaySheet({
  open,
  mode,
  room,
  me,
  initialRecipientId,
  onClose,
}: PaySheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const [recipientId, setRecipientId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activePlayers = useMemo(
    () =>
      Object.values(room.players ?? {})
        .filter((player) => player.status === 'active')
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)),
    [room.players]
  );

  const recipients = useMemo<RecipientOption[]>(() => {
    if (mode === 'bank_pay') {
      return activePlayers.map((player) => ({
        id: player.id,
        label: player.id === me.id ? `${player.name} (You)` : player.name,
        isBank: false,
        player,
      }));
    }

    const otherPlayers = activePlayers
      .filter((player) => player.id !== me.id)
      .map((player) => ({
        id: player.id,
        label: player.name,
        isBank: false,
        player,
      }));

    return [{ id: 'BANK', label: 'Bank', isBank: true }, ...otherPlayers];
  }, [activePlayers, me.id, mode]);

  const recipientsRef = useRef<RecipientOption[]>(recipients);
  recipientsRef.current = recipients;

  const quickChips = useMemo(
    () => computeQuickChips(room.meta.startingCash, room.meta.passStartAmount),
    [room.meta.passStartAmount, room.meta.startingCash]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAmountStr('');
      setNote('');
      setError(null);
      setSubmitting(false);
      return;
    }

    setAmountStr('');
    setNote('');
    setError(null);
    setSubmitting(false);

    const availableRecipients = recipientsRef.current;
    if (
      initialRecipientId &&
      availableRecipients.some((option) => option.id === initialRecipientId)
    ) {
      setRecipientId(initialRecipientId);
      return;
    }

    if (mode === 'player_pay') {
      const firstOtherPlayer = availableRecipients.find((option) => !option.isBank);
      setRecipientId(firstOtherPlayer ? firstOtherPlayer.id : 'BANK');
      return;
    }

    const selfOption = availableRecipients.find((option) => option.id === me.id);
    setRecipientId(selfOption ? selfOption.id : (availableRecipients[0]?.id ?? ''));
  }, [open, mode, initialRecipientId, me.id]);

  useEffect(() => {
    if (!open || recipients.length === 0) {
      return;
    }
    if (!recipients.some((option) => option.id === recipientId)) {
      setRecipientId(recipients[0].id);
    }
  }, [open, recipientId, recipients]);

  const applyAmountKey = useCallback(
    (input: string) => {
      if (submitting) {
        return;
      }
      setError(null);
      setAmountStr((prev) => applyKeypadInput(prev, input));
    },
    [submitting]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (submitting) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (/^[0-9]$/.test(event.key) || event.key === 'Backspace') {
        event.preventDefault();
        applyAmountKey(event.key);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyAmountKey, open, submitting]);

  const amount = amountStr ? Number(amountStr) : 0;
  const selectedRecipient = recipients.find((option) => option.id === recipientId) ?? null;

  const { currencySymbol, currencyLocale, negativeLimit } = room.meta;
  const formattedAmount = formatCurrency(amount, currencySymbol, currencyLocale);
  const projectedSenderBalance = me.balance - amount;
  const isOverdraft = mode === 'player_pay' && amount > 0 && projectedSenderBalance < -negativeLimit;
  const overdraftExcess = isOverdraft ? -negativeLimit - projectedSenderBalance : 0;
  const remainingHeadroom =
    mode === 'player_pay' && projectedSenderBalance < 0 && !isOverdraft
      ? negativeLimit + projectedSenderBalance
      : null;

  const isBankerAuthorized = mode === 'player_pay' || me.id === room.meta.bankerId;
  const canSubmit =
    !submitting &&
    isBankerAuthorized &&
    Boolean(selectedRecipient) &&
    Number.isInteger(amount) &&
    amount > 0 &&
    !isOverdraft;

  function handleAddChip(chipValue: number) {
    if (submitting) {
      return;
    }
    setError(null);
    setAmountStr((prev) => {
      const current = prev ? Number(prev) : 0;
      const next = Math.min(MAX_AMOUNT_VALUE, current + chipValue);
      return next > 0 ? String(next) : '';
    });
  }

  function handleClear() {
    if (submitting) {
      return;
    }
    setError(null);
    setAmountStr('');
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (!submitting && event.target === dialogRef.current) {
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !selectedRecipient) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const trimmedNote = note.trim();
    const result = await runRoomMutation(room.meta.code, (latestRoom) =>
      applyPayment(latestRoom, {
        type: mode === 'bank_pay' ? 'bank_pay' : 'transfer',
        fromId: mode === 'bank_pay' ? 'BANK' : me.id,
        toId: selectedRecipient.id,
        amount,
        actorId: me.id,
        note: trimmedNote || undefined,
      })
    );

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
  }

  const sheetTitle = mode === 'bank_pay' ? 'Bank payout' : 'Send payment';

  return (
    <dialog
      ref={dialogRef}
      className="pay-sheet"
      aria-labelledby="pay-sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) {
          onClose();
        }
      }}
      onClick={handleBackdropClick}
    >
      <form className="stack-md" onSubmit={handleSubmit}>
        <div className="row-between">
          <div className="stack-xs">
            <h2 id="pay-sheet-title">{sheetTitle}</h2>
            <p className="text-sm text-muted">
              {mode === 'bank_pay'
                ? 'Pay an active player directly from the Bank.'
                : `From ${me.name} to a player or the Bank.`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close payment sheet"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="stack-xs">
          <span className="field-label" id="pay-recipient-label">
            Recipient
          </span>
          <div className="pay-recipient-list" role="group" aria-labelledby="pay-recipient-label">
            {recipients.map((option) => {
              const isSelected = option.id === recipientId;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={
                    isSelected
                      ? 'pay-recipient-pill pay-recipient-pill--active'
                      : 'pay-recipient-pill'
                  }
                  aria-pressed={isSelected}
                  disabled={submitting}
                  onClick={() => {
                    setError(null);
                    setRecipientId(option.id);
                  }}
                >
                  {option.isBank && <Landmark size={16} aria-hidden="true" />}
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pay-amount-bar">
          <div className="stack-xs">
            <span className="text-xs text-muted">Amount</span>
            <output
              aria-live="polite"
              className={
                amount === 0
                  ? 'pay-amount-readout pay-amount-readout--zero tabular-nums'
                  : 'pay-amount-readout tabular-nums'
              }
            >
              {formattedAmount}
            </output>
          </div>
          <button
            type="button"
            className="pay-clear-btn"
            onClick={handleClear}
            disabled={submitting || amount === 0}
          >
            Clear
          </button>
        </div>

        <div className="pay-preview-list" aria-live="polite">
          {mode === 'player_pay' ? (
            <>
              <div className="row-between text-sm">
                <span className="text-muted">Your balance after transfer</span>
                <strong
                  className={
                    projectedSenderBalance < 0 ? 'tabular-nums text-danger' : 'tabular-nums'
                  }
                >
                  {formatCurrency(me.balance, currencySymbol, currencyLocale)} →{' '}
                  {formatCurrency(projectedSenderBalance, currencySymbol, currencyLocale)}
                </strong>
              </div>
              {selectedRecipient?.player && amount > 0 && (
                <div className="row-between text-sm">
                  <span className="text-muted">{selectedRecipient.player.name} after transfer</span>
                  <strong className="tabular-nums text-success">
                    {formatCurrency(
                      selectedRecipient.player.balance,
                      currencySymbol,
                      currencyLocale
                    )}{' '}
                    →{' '}
                    {formatCurrency(
                      selectedRecipient.player.balance + amount,
                      currencySymbol,
                      currencyLocale
                    )}
                  </strong>
                </div>
              )}
              {isOverdraft && (
                <div className="table-inline-alert" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>
                    Exceeds debt limit (
                    <span className="tabular-nums">
                      {formatCurrency(-negativeLimit, currencySymbol, currencyLocale)}
                    </span>
                    ) by{' '}
                    <span className="tabular-nums">
                      {formatCurrency(overdraftExcess, currencySymbol, currencyLocale)}
                    </span>
                    .
                  </span>
                </div>
              )}
              {remainingHeadroom !== null && (
                <div className="table-inline-warning">
                  <span>
                    Within debt limit (
                    <span className="tabular-nums">
                      {formatCurrency(remainingHeadroom, currencySymbol, currencyLocale)}
                    </span>{' '}
                    headroom left).
                  </span>
                </div>
              )}
            </>
          ) : (
            selectedRecipient?.player && (
              <div className="row-between text-sm">
                <span className="text-muted">{selectedRecipient.player.name} after payout</span>
                <strong className="tabular-nums text-success">
                  {formatCurrency(
                    selectedRecipient.player.balance,
                    currencySymbol,
                    currencyLocale
                  )}{' '}
                  →{' '}
                  {formatCurrency(
                    selectedRecipient.player.balance + amount,
                    currencySymbol,
                    currencyLocale
                  )}
                </strong>
              </div>
            )
          )}
        </div>

        <div className="pay-chip-row" aria-label="Quick add amounts">
          {quickChips.map((chipValue) => (
            <button
              key={chipValue}
              type="button"
              className="pay-chip tabular-nums"
              disabled={submitting}
              onClick={() => handleAddChip(chipValue)}
            >
              +{formatCurrency(chipValue, currencySymbol, currencyLocale)}
            </button>
          ))}
        </div>

        <div className="pay-keypad" role="group" aria-label="Amount keypad">
          {KEYPAD_DIGITS.map((key) => (
            <button
              key={key}
              type="button"
              className="pay-key tabular-nums"
              disabled={submitting}
              onClick={() => applyAmountKey(key)}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            className="pay-key"
            disabled={submitting || amountStr.length === 0}
            onClick={() => applyAmountKey('Backspace')}
            aria-label="Backspace"
          >
            <Delete size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="pay-note-input">
            Note (optional)
          </label>
          <input
            id="pay-note-input"
            type="text"
            className="input"
            maxLength={60}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={mode === 'bank_pay' ? 'e.g. Bank dividend, Prize' : 'e.g. Rent, Tax'}
            disabled={submitting}
          />
        </div>

        {!isBankerAuthorized && (
          <div className="table-inline-alert" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Only the current Banker can send Bank payouts.</span>
          </div>
        )}

        {error && (
          <div className="table-inline-alert" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary pay-submit-btn" disabled={!canSubmit}>
          <Send size={18} aria-hidden="true" />
          <span>
            {submitting
              ? 'Sending...'
              : amount > 0 && selectedRecipient
                ? mode === 'bank_pay'
                  ? `Send ${formattedAmount} to ${selectedRecipient.player?.name ?? selectedRecipient.label}`
                  : `Pay ${formattedAmount} to ${selectedRecipient.label}`
                : 'Enter an amount'}
          </span>
        </button>
      </form>
    </dialog>
  );
}
