import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, X } from 'lucide-react';
import './Lobby.css';

export interface ShareSheetProps {
  open: boolean;
  roomCode: string;
  onClose: () => void;
}

function buildInviteUrl(roomCode: string): string {
  const normalized = roomCode.trim().toUpperCase();
  if (typeof window === 'undefined') {
    return `?room=${encodeURIComponent(normalized)}`;
  }
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('room', normalized);
  return url.toString();
}

export function ShareSheet({ open, roomCode, onClose }: ShareSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const normalizedCode = roomCode.trim().toUpperCase();
  const inviteUrl = useMemo(() => buildInviteUrl(normalizedCode), [normalizedCode]);

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
    if (!open || !normalizedCode) {
      return;
    }

    let cancelled = false;
    setQrError(null);

    QRCode.toDataURL(inviteUrl, { margin: 1, width: 220 })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrError('Unable to generate QR code.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, inviteUrl, normalizedCode]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setCopyError(null);
    }
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  async function handleCopyLink() {
    setCopyError(null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const helper = document.createElement('textarea');
        helper.value = inviteUrl;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const copiedOk = document.execCommand('copy');
        document.body.removeChild(helper);
        if (!copiedOk) {
          throw new Error('Clipboard copy failed');
        }
      }

      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      setCopyError('Could not copy automatically. Share the room code above instead.');
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="share-dialog"
      aria-labelledby="share-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
    >
      <div className="stack-md">
        <div className="row-between">
          <div className="stack-xs">
            <h2 id="share-dialog-title">Invite players</h2>
            <p className="text-sm text-muted">Scan the QR code or enter the room code.</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close invite dialog"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="row-between lobby-divider">
          <span className="text-sm text-muted">Room code</span>
          <strong className="share-code-value tabular-nums">{normalizedCode}</strong>
        </div>

        <div className="share-qr-frame">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Room invite QR code"
              width={220}
              height={220}
              className="share-qr-image"
            />
          ) : qrError ? (
            <p className="text-sm text-danger" role="alert">
              {qrError}
            </p>
          ) : (
            <div className="skeleton share-qr-image" aria-label="Generating QR code" />
          )}
        </div>

        <p className="share-url-text">{inviteUrl}</p>

        {copyError && (
          <p className="text-sm text-danger" role="alert">
            {copyError}
          </p>
        )}

        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <Check size={18} aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={18} aria-hidden="true" />
                <span>Copy invite link</span>
              </>
            )}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
