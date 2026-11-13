import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  History,
  Landmark,
  LogOut,
  QrCode,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { LocalSession, RoomState } from './types/game';
import { clearSession, getRoomCodeFromUrl, loadSession } from './lib/session';
import { isFirebaseConfigured, subscribeRoom } from './lib/roomStore';
import { formatCurrency } from './lib/format';

export type ActiveTab = 'table' | 'mortgages' | 'history';

const TABS: ReadonlyArray<{ id: ActiveTab; label: string; icon: typeof Users }> = [
  { id: 'table', label: 'Table', icon: Users },
  { id: 'mortgages', label: 'Mortgages', icon: Landmark },
  { id: 'history', label: 'History', icon: History },
];

export function App() {
  const firebaseReady = isFirebaseConfigured();
  const urlRoomCode = useMemo(() => getRoomCodeFromUrl(), []);

  const [session, setSession] = useState<LocalSession | null>(() => loadSession());
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(loadSession() && firebaseReady));
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('table');
  const [shareOpen, setShareOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!session || !firebaseReady) {
      setRoom(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeRoom(
      session.roomCode,
      (nextRoom) => {
        setRoom(nextRoom);
        setLoading(false);
        setError(null);
      },
      (message) => {
        setError(message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [session, firebaseReady, retryToken]);

  const currentPlayer = session && room ? room.players[session.playerId] ?? null : null;
  const seatMissingOrRemoved =
    Boolean(session && room) && (!currentPlayer || currentPlayer.status === 'removed');

  const showBottomNav = Boolean(
    firebaseReady && session && !loading && !error && room && !seatMissingOrRemoved
  );

  function handleLeaveRoom() {
    clearSession();
    setSession(null);
    setRoom(null);
    setError(null);
    setLoading(false);
    setShareOpen(false);
    setActiveTab('table');
  }

  function handleRetrySubscription() {
    setRetryToken((prev) => prev + 1);
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="app-brand">
            {session ? (
              <span className="pill pill-accent tabular-nums" aria-label={`Room code ${session.roomCode}`}>
                {session.roomCode}
              </span>
            ) : (
              <span>Monopoly Manager</span>
            )}
            {session && room && (
              <span
                className="pill tabular-nums"
                aria-label={`Table currency ${room.meta.currencySymbol}`}
              >
                {room.meta.currencySymbol}
              </span>
            )}
          </div>

          {session && (
            <div className="row">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => setShareOpen((prev) => !prev)}
                aria-expanded={shareOpen}
              >
                <QrCode size={18} aria-hidden="true" />
                <span>Share</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={handleLeaveRoom}
              >
                <LogOut size={18} aria-hidden="true" />
                <span>Leave</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className={showBottomNav ? 'app-main' : 'app-main app-main--no-nav'}>
        <div className="stack-md">
          {shareOpen && session && (
            <section className="panel stack-sm" aria-label="Share room">
              <div className="row-between">
                <h2>Invite players</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => setShareOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="text-sm text-muted">
                Share room code <strong className="tabular-nums">{session.roomCode}</strong> so players
                can join from their phone. QR code sharing arrives in the next update.
              </p>
            </section>
          )}

          {!firebaseReady && (
            <section className="panel-warning stack-sm" role="alert">
              <div className="row">
                <AlertTriangle size={20} aria-hidden="true" />
                <h2>Firebase configuration needed</h2>
              </div>
              <p className="text-sm">
                Add your Firebase Realtime Database keys in <code>.env.local</code> before creating or
                joining live game rooms.
              </p>
            </section>
          )}

          {firebaseReady && !session && (
            <section className="panel stack-md" aria-label="Game lobby">
              <div className="stack-xs">
                <h1>Digital banker for your tabletop game</h1>
                <p className="text-muted">
                  Create a shared room for Monopoly or Business, or enter a 6-character code to join
                  your table.
                </p>
              </div>

              {urlRoomCode && (
                <p className="text-sm">
                  Invite code detected in URL:{' '}
                  <strong className="tabular-nums">{urlRoomCode}</strong>
                </p>
              )}

              <p className="text-sm text-muted">
                Room creation and join controls will mount in this lobby shell.
              </p>
            </section>
          )}

          {firebaseReady && session && loading && (
            <section className="panel stack-md" aria-busy="true" aria-label="Loading room">
              <div className="skeleton skeleton-title" aria-hidden="true" />
              <div className="skeleton skeleton-line" aria-hidden="true" />
              <div className="skeleton skeleton-line skeleton-line--short" aria-hidden="true" />
              <div className="skeleton skeleton-block" aria-hidden="true" />
              <div className="skeleton skeleton-block" aria-hidden="true" />
            </section>
          )}

          {firebaseReady && session && !loading && error && (
            <section className="panel-danger stack-md" role="alert">
              <div className="stack-xs">
                <div className="row">
                  <AlertTriangle size={20} aria-hidden="true" />
                  <h2>Unable to sync room</h2>
                </div>
                <p className="text-sm">{error}</p>
              </div>
              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRetrySubscription}
                >
                  <RefreshCw size={18} aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLeaveRoom}
                >
                  <LogOut size={18} aria-hidden="true" />
                  <span>Leave</span>
                </button>
              </div>
            </section>
          )}

          {firebaseReady && session && !loading && !error && !room && (
            <section className="panel stack-md" role="status">
              <div className="stack-xs">
                <h2>Room not found</h2>
                <p className="text-sm text-muted">
                  Room <strong className="tabular-nums">{session.roomCode}</strong> could not be found
                  or has ended.
                </p>
              </div>
              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRetrySubscription}
                >
                  <RefreshCw size={18} aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLeaveRoom}
                >
                  <LogOut size={18} aria-hidden="true" />
                  <span>Back to lobby</span>
                </button>
              </div>
            </section>
          )}

          {firebaseReady && session && !loading && !error && room && seatMissingOrRemoved && (
            <section className="panel stack-md" role="status">
              <div className="stack-xs">
                <h2>Seat unavailable</h2>
                <p className="text-sm text-muted">
                  Your seat for <strong>{session.playerName}</strong> in room{' '}
                  <strong className="tabular-nums">{session.roomCode}</strong> was removed or is no
                  longer active.
                </p>
              </div>
              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLeaveRoom}
                >
                  <LogOut size={18} aria-hidden="true" />
                  <span>Back to lobby</span>
                </button>
              </div>
            </section>
          )}

          {firebaseReady && session && !loading && !error && room && currentPlayer && !seatMissingOrRemoved && (
            <>
              {activeTab === 'table' && (
                <section className="panel stack-md" aria-label="Table view">
                  <div className="row-between">
                    <h1>{currentPlayer.name}</h1>
                    <span className="pill pill-accent tabular-nums">
                      {formatCurrency(
                        currentPlayer.balance,
                        room.meta.currencySymbol,
                        room.meta.currencyLocale
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    Table view ready. Player cards, quick-pay actions, and banker controls will mount
                    here.
                  </p>
                </section>
              )}

              {activeTab === 'mortgages' && (
                <section className="panel stack-sm" aria-label="Mortgages view">
                  <h2>Mortgages</h2>
                  <p className="text-sm text-muted">
                    Active property mortgages and payoff actions will mount here.
                  </p>
                </section>
              )}

              {activeTab === 'history' && (
                <section className="panel stack-sm" aria-label="History view">
                  <h2>History</h2>
                  <p className="text-sm text-muted">
                    Live transaction ledger and undo controls will mount here.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {showBottomNav && (
        <nav className="app-bottomnav" aria-label="Primary navigation">
          <div className="app-bottomnav-inner">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={isActive ? 'nav-tab nav-tab--active' : 'nav-tab'}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;
