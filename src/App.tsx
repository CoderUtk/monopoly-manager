import { useEffect, useRef, useState } from 'react';
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
import { clearSession, getRoomCodeFromUrl, loadSession, saveSession } from './lib/session';
import { isFirebaseConfigured, subscribeRoom } from './lib/roomStore';
import { Lobby, type LobbyTab } from './components/Lobby';
import { SiteHeader } from './components/SiteHeader';
import { LandingPage } from './components/LandingPage';
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

  if (!session) {
    return (
      <div id="top" className="landing-root">
        <SiteHeader
          firebaseReady={firebaseReady}
          showSectionLinks={firebaseReady && !initialUrlCode}
          handleNavigateLobby={handleNavigateLobby}
        />

        <main>
          {!firebaseReady && (
            <div className="land-invite-wrap">
              <div className="land-invite-inner">
                <section className="panel-warning stack-sm" role="alert">
                  <div className="row">
                    <AlertTriangle size={20} aria-hidden="true" />
                    <h2>Firebase configuration needed</h2>
                  </div>
                  <p className="text-sm">
                    Add <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_DATABASE_URL</code>,
                    and your remaining <code>VITE_FIREBASE_*</code> keys in <code>.env.local</code>{' '}
                    before creating or joining live game rooms.
                  </p>
                </section>
              </div>
            </div>
          )}

          {firebaseReady && !initialUrlCode && (
            <LandingPage
              handleNavigateLobby={handleNavigateLobby}
              lobbySlot={
                <Lobby activeTab={lobbyTab} onTabChange={setLobbyTab} onEnterRoom={handleEnterRoom} />
              }
            />
          )}

          {firebaseReady && initialUrlCode && (
            <div className="land-invite-wrap">
              <div className="land-invite-inner">
                <Lobby activeTab={lobbyTab} onTabChange={setLobbyTab} onEnterRoom={handleEnterRoom} />
              </div>
            </div>
          )}
        </main>

        <footer className="land-footer">
          <div className="landing-container land-footer-inner">
            <p className="land-footer-note">
              Built for Monopoly and Business nights on real boards. Runs free in your browser.
            </p>
            <div className="land-footer-links">
              <a href="#top" className="land-footer-link">
                Back to top
              </a>
              {firebaseReady && !initialUrlCode && (
                <a href="#screens" className="land-footer-link">
                  Screens
                </a>
              )}
              <a href="#lobby" className="land-footer-link">
                Open lobby
              </a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div id="top" className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
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
        </div>
      </header>

      <main className={showBottomNav ? 'app-main' : 'app-main app-main--no-nav'}>
        <div className="stack-md">
          <ShareSheet
            open={shareOpen}
            roomCode={session.roomCode}
            onClose={() => setShareOpen(false)}
          />

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
