import { BrandMark } from './BrandMark';
import type { LobbyTab } from './Lobby';
import './LandingPage.css';

interface SiteHeaderProps {
  firebaseReady: boolean;
  showSectionLinks: boolean;
  handleNavigateLobby: (tab: LobbyTab) => void;
}

export function SiteHeader({
  firebaseReady,
  showSectionLinks,
  handleNavigateLobby,
}: SiteHeaderProps) {
  return (
    <header className="site-masthead">
      <div className="site-masthead-inner">
        <a href="#top" className="site-brand">
          <BrandMark size={34} />
          <span className="site-wordmark">Monopoly Manager</span>
        </a>

        {firebaseReady && (
          <nav className="site-nav" aria-label="Website navigation">
            {showSectionLinks && (
              <div className="site-nav-links">
                <a href="#screens" className="site-nav-link">
                  Screens
                </a>
                <a href="#rules" className="site-nav-link">
                  Table rules
                </a>
                <a href="#comparison" className="site-nav-link">
                  Before &amp; after
                </a>
              </div>
            )}
            <div className="site-nav-actions">
              <button
                type="button"
                className="land-btn land-btn-secondary land-btn-compact"
                onClick={() => handleNavigateLobby('join')}
              >
                Join
              </button>
              <button
                type="button"
                className="land-btn land-btn-primary land-btn-compact"
                onClick={() => handleNavigateLobby('create')}
              >
                Create
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
