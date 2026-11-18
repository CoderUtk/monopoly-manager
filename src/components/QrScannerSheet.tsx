import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import jsQR from 'jsqr';
import { AlertTriangle, Camera, ImageUp, X } from 'lucide-react';
import { extractRoomCodeFromScan } from '../lib/session';
import './Lobby.css';

export interface QrScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onScanCode: (roomCode: string) => void;
}

const SCAN_INTERVAL_MS = 160;
const MAX_IMAGE_SIDE = 960;

export function QrScannerSheet({ open, onClose, onScanCode }: QrScannerSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onScanRef = useRef(onScanCode);
  onScanRef.current = onScanCode;

  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'unavailable'>('starting');
  const [scanError, setScanError] = useState<string | null>(null);

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
      setScanError(null);
      setCameraState('starting');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timerId: number | null = null;

    function stopCamera() {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        stream = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    async function startCamera() {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setCameraState('unavailable');
        return;
      }

      setCameraState('starting');
      setScanError(null);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stopCamera();
          return;
        }

        const video = videoRef.current;
        if (!video) {
          stopCamera();
          return;
        }

        video.srcObject = stream;
        await video.play().catch(() => {});
        if (cancelled) {
          stopCamera();
          return;
        }

        setCameraState('active');

        timerId = window.setInterval(() => {
          const currentVideo = videoRef.current;
          if (
            !currentVideo ||
            currentVideo.readyState < 2 ||
            currentVideo.videoWidth === 0 ||
            currentVideo.videoHeight === 0
          ) {
            return;
          }

          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
          }
          const canvas = canvasRef.current;
          const width = currentVideo.videoWidth;
          const height = currentVideo.videoHeight;
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            return;
          }
          ctx.drawImage(currentVideo, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const decoded = jsQR(imageData.data, width, height, {
            inversionAttempts: 'attemptBoth',
          });
          if (!decoded?.data) {
            return;
          }

          const roomCode = extractRoomCodeFromScan(decoded.data);
          if (roomCode) {
            stopCamera();
            onScanRef.current(roomCode);
          } else {
            setScanError('Scanned QR code is not a Monopoly Manager invite.');
          }
        }, SCAN_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          stopCamera();
          setCameraState('unavailable');
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setScanError(null);
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = objectUrl;
      });

      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setScanError('Could not read image on this device.');
        return;
      }

      ctx.drawImage(image, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const decoded = jsQR(imageData.data, width, height, {
        inversionAttempts: 'attemptBoth',
      });

      if (!decoded?.data) {
        setScanError('No QR code found in that image. Try closer framing or enter the 6-character code.');
        return;
      }

      const roomCode = extractRoomCodeFromScan(decoded.data);
      if (!roomCode) {
        setScanError('That QR code is not a Monopoly Manager room link.');
        return;
      }

      onScanCode(roomCode);
    } catch {
      setScanError('Could not read that image. Try another photo or type the room code.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="share-dialog qr-scan-dialog"
      aria-labelledby="qr-scan-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
    >
      <div className="stack-md">
        <div className="row-between">
          <h2 id="qr-scan-title">Scan room QR</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close QR scanner"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted">
          Point your camera at another player&apos;s Share QR code to fill and find their table.
        </p>

        {cameraState !== 'unavailable' ? (
          <div className="qr-video-frame">
            <video
              ref={videoRef}
              poster="./icon.svg"
              playsInline
              muted
              autoPlay
              className="qr-video"
            />
            {cameraState === 'starting' && (
              <div className="qr-video-status text-sm">
                <Camera size={20} aria-hidden="true" />
                <span>Starting camera…</span>
              </div>
            )}
          </div>
        ) : (
          <div className="lobby-error" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>Camera unavailable here. Use a photo capture below or enter the room code.</span>
          </div>
        )}

        {scanError && (
          <div className="lobby-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{scanError}</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="qr-file-input"
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageUp size={18} aria-hidden="true" />
          <span>Scan from photo</span>
        </button>
      </div>
    </dialog>
  );
}
