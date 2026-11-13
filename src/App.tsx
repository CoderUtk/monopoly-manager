import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  History,
  Landmark,
  LogOut,
  PlusCircle,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LocalSession, RoomState } from './types/game';
import { clearSession, getRoomCodeFromUrl, loadSession, saveSession } from './lib/session';
import { isFirebaseConfigured, subscribeRoom } from './lib/roomStore';
import { Lobby, type LobbyTab } from './components/Lobby';
import { ShareSheet } from './components/ShareSheet';
import { TableView } from './components/TableView';
import { MortgagesView } from './components/MortgagesView';
import { HistoryView } from './components/HistoryView';

export type ActiveTab = 'table' | 'mortgages' | 'history';

const TABS: ReadonlyArray<{ id: ActiveTab; label: string; icon: typeof Users }> = [
  { id: 'table', label: 'Table', icon: Users },
  { id: 'mortgages', label: 'Mortgages', icon: Landmark },
  { id: 'history', label: 'History', icon: History },
];

export function App() {
  const firebaseReady = isFirebaseConfigured();
  const preloadedRoomCodeRef = useRef<string | null>(null);

  const [session, setSession] = useState<LocalSession | null>(() => loadSession());
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(loadSession() && firebaseReady));
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('table');
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('join');
  const [shareOpen, setShareOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const initialUrlCode = getRoomCodeFromUrl();

  useEffect(() => {
    if (!session || !firebaseReady) {
      setRoom(null);
      setLoading(false);
      return;
    }

    const hasPreloadedRoom = preloadedRoomCodeRef.current === session.roomCode;
    preloadedRoomCodeRef.current = null;
    if (!hasPreloadedRoom) {
      setLoading(true);
    }
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
  const isLobby = room?.meta.status === 'lobby';

  const showBottomNav = Boolean(
    firebaseReady &&
      session &&
      !loading &&
      !error &&
      room &&
      !seatMissingOrRemoved &&
      !isLobby
  );

  function handleEnterRoom(nextSession: LocalSession, nextRoom: RoomState) {
    preloadedRoomCodeRef.current = nextRoom.meta.code;
    saveSession(nextSession);
    setSession(nextSession);
    setRoom(nextRoom);
    setError(null);
    setLoading(false);
    setShareOpen(false);
    setActiveTab('table');
  }

  function handleLeaveRoom() {
    preloadedRoomCodeRef.current = null;
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

  function handleNavigateLobby(tab: LobbyTab) {
    setLobbyTab(tab);
    document.getElementById('lobby')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div id="top" className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          {session ? (
            <div className="app-brand">
              <span className="pill pill-accent tabular-nums" aria-label={`Room code ${session.roomCode}`}>
                {session.roomCode}
              </span>
              {room && (
                <span
                  className="pill tabular-nums"
                  aria-label={`Table currency ${room.meta.currencySymbol}`}
                >
                  {room.meta.currencySymbol}
                </span>
              )}
            </div>
          ) : (
            <a href="#top" className="app-brand">
              <span className="brand-mark" aria-hidden="true">
                <Landmark size={18} />
              </span>
              <span>Monopoly Manager</span>
            </a>
          )}

          {session ? (
            <div className="row">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => setShareOpen(true)}
                aria-haspopup="dialog"
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
          ) : (
            firebaseReady && (
              <nav className="site-nav" aria-label="Website navigation">
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => handleNavigateLobby('join')}
                >
                  <Search size={16} aria-hidden="true" />
                  <span>Join</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => handleNavigateLobby('create')}
                >
                  <PlusCircle size={16} aria-hidden="true" />
                  <span>Create</span>
                </button>
              </nav>
            )
          )}
        </div>
      </header>

      <main className={showBottomNav ? 'app-main' : 'app-main app-main--no-nav'}>
        <div className="stack-md">
          {session && (
            <ShareSheet
              open={shareOpen}
              roomCode={session.roomCode}
              onClose={() => setShareOpen(false)}
            />
          )}

          {!firebaseReady && (
            <section className="panel-warning stack-sm" role="alert">
              <div className="row">
                <AlertTriangle size={20} aria-hidden="true" />
                <h2>Firebase configuration needed</h2>
              </div>
              <p className="text-sm">
                Add <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_DATABASE_URL</code>, and
                your remaining <code>VITE_FIREBASE_*</code> keys in <code>.env.local</code> before
                creating or joining live game rooms.
              </p>
            </section>
          )}

          {firebaseReady && !session && !initialUrlCode && (
            <section className="panel stack-md" aria-label="Welcome">
              <div className="stack-xs">
                <h1>Digital banker for Monopoly &amp; Business nights</h1>
                <p className="text-sm text-muted">
                  Skip paper cash and manual change. Share a 6-character code so up to 4 players
                  pay, mortgage, and track a live Bank across phones.
                </p>
              </div>

              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleNavigateLobby('create')}
                >
                  <PlusCircle size={18} aria-hidden="true" />
                  <span>Create a room</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleNavigateLobby('join')}
                >
                  <Search size={18} aria-hidden="true" />
                  <span>Join with code</span>
                </button>
              </div>

              <ul className="landing-steps">
                <li className="landing-step">
                  <span className="landing-step-title">
                    <QrCode size={16} aria-hidden="true" />
                    <span>Share room code</span>
                  </span>
                  <span className="text-xs text-muted">
                    Up to 4 players join from any phone browser or QR scan.
                  </span>
                </li>
                <li className="landing-step">
                  <span className="landing-step-title">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>Pick any Banker</span>
                  </span>
                  <span className="text-xs text-muted">
                    Wait in the lobby, pick who acts as Banker, and start together.
                  </span>
                </li>
                <li className="landing-step">
                  <span className="landing-step-title">
                    <Landmark size={16} aria-hidden="true" />
                    <span>Live Bank &amp; Undo</span>
                  </span>
                  <span className="text-xs text-muted">
                    Enforces debt limits, finite Bank cash, mortgages, and instant Undo.
                  </span>
                </li>
              </ul>
            </section>
          )}

          {firebaseReady && !session && (
            <Lobby activeTab={lobbyTab} onTabChange={setLobbyTab} onEnterRoom={handleEnterRoom} />
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
              {(isLobby || activeTab === 'table') && (
                <TableView
                  room={room}
                  playerId={currentPlayer.id}
                  onOpenMortgages={() => setActiveTab('mortgages')}
                />
              )}

              {!isLobby && activeTab === 'mortgages' && (
                <MortgagesView room={room} playerId={currentPlayer.id} />
              )}

              {!isLobby && activeTab === 'history' && (
                <HistoryView room={room} playerId={currentPlayer.id} />
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
