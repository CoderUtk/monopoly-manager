import { useState, type ReactNode } from 'react';
import type { LobbyTab } from './Lobby';
import './LandingPage.css';

interface LandingPageProps {
  handleNavigateLobby: (tab: LobbyTab) => void;
  lobbySlot: ReactNode;
}

interface ScreenMoment {
  id: string;
  number: string;
  title: string;
  summary: string;
  headline: string;
  description: string;
  image: string;
  imageAlt: string;
  bullets: ReadonlyArray<string>;
}

const SCREEN_MOMENTS: ReadonlyArray<ScreenMoment> = [
  {
    id: 'waiting',
    number: '01',
    title: 'Waiting room',
    summary: 'Fill up to four seats before deciding who runs the Bank.',
    headline: 'Wait together, then appoint your Banker',
    description:
      'Every player joins with a six-character room code or QR scan. Once seats are filled, anyone at the table can tap Make Banker before starting.',
    image: './screens/waiting-lobby.png',
    imageAlt: 'Waiting room showing three joined players and Banker selection',
    bullets: [
      'Up to 4 seats visible in real time',
      'Displays starting player cash and Bank vault cap',
      'Room creator holds zero special privilege',
    ],
  },
  {
    id: 'table',
    number: '02',
    title: 'Live table',
    summary: 'Wallet card, Bank balance, Pass Start, and one-tap Undo in view.',
    headline: 'Every seat updates without refreshing',
    description:
      'Keep your personal balance at the top while monitoring every player and the remaining Bank reserve underneath.',
    image: './screens/table-wallet.png',
    imageAlt: 'Live table wallet screen showing balance, Banker controls, and undo bar',
    bullets: [
      'Banker runs Pass Start credits and payouts',
      'Single-tap Undo reverses the last ledger move cleanly',
      'Custom currency symbol (₹, $, €, £, or custom)',
    ],
  },
  {
    id: 'pay',
    number: '03',
    title: 'Quick keypad',
    summary: 'Tap currency chips, preview resulting balances, and pay.',
    headline: 'Prevent math slips before confirming cash',
    description:
      'Pick a recipient chip, enter rent on a phone keypad or quick denomination buttons, and check both updated totals before hitting send.',
    image: './screens/pay-keypad.png',
    imageAlt: 'Payment keypad dialog previewing sender and receiver balance changes',
    bullets: [
      'Live before-and-after preview for sender and payee',
      'Optional property or tax note in the shared log',
      'Enforces room debt limits and finite Bank funds',
    ],
  },
  {
    id: 'mortgages',
    number: '04',
    title: 'Mortgages',
    summary: 'Issue property loans and compute 0% or 10% payoffs automatically.',
    headline: 'Never write another mortgage total on scrap paper',
    description:
      'Log pledged deeds against the Bank, credit the player instantly, and settle the exact principal or 10% payoff back to the Bank vault later.',
    image: './screens/mortgages.png',
    imageAlt: 'Mortgages tab listing active Marine Drive loan and payoff total',
    bullets: [
      'Automatic 0% or 10% payoff math locked per room',
      'Bank balance checks block impossible payouts',
      'One click clears the mortgage and returns payoff cash',
    ],
  },
];

const TABLE_FIGURES: ReadonlyArray<{ value: string; label: string; note: string }> = [
  {
    value: '4 SEATS',
    label: 'Table capacity',
    note: 'Designed for two to four players around a physical board.',
  },
  {
    value: '0% OR 10%',
    label: 'Mortgage interest',
    note: 'Pick classic zero-interest Business rules or ten-percent Monopoly payoffs.',
  },
  {
    value: 'FINITE BANK',
    label: 'Vault enforcement',
    note: 'Set a real Bank cash pool so payouts stop when the vault runs dry.',
  },
  {
    value: 'ZERO APP',
    label: 'Browser first',
    note: 'Opens on iOS Safari, Android Chrome, and desktop with one link.',
  },
];

const COMPARE_ROWS: ReadonlyArray<{ before: string; after: string }> = [
  {
    before: 'Sorting crumpled ₹10, ₹50, and ₹500 notes after every rent roll',
    after: 'Tap a player name, punch rent on the keypad, and see updated balances at once',
  },
  {
    before: 'One box owner stuck playing Banker all night before anyone else sits down',
    after: 'Hold seats in the Waiting room and assign Banker to any willing player',
  },
  {
    before: 'Unlimited IOUs and quiet mental errors around debt limits',
    after: 'Explicit room debt cap and finite Bank reserve guard every transfer',
  },
  {
    before: 'Scrap paper notes to track which deeds are mortgaged and at what cost',
    after: 'Dedicated Mortgages tab computes 0% or 10% clear amounts automatically',
  },
];

export function LandingPage({ handleNavigateLobby, lobbySlot }: LandingPageProps) {
  const [activeId, setActiveId] = useState<string>(SCREEN_MOMENTS[0].id);
  const activeScreen =
    SCREEN_MOMENTS.find((moment) => moment.id === activeId) ?? SCREEN_MOMENTS[0];

  return (
    <>
      <section className="land-hero" aria-label="Introduction">
        <div className="landing-container land-hero-grid">
          <div className="land-hero-copy">
            <h1 className="land-display-h1">Ditch the paper bank.</h1>
            <p className="land-lead">
              Share a six-character room code. Track four players, a finite Bank vault, and active
              mortgages together across every phone at the table.
            </p>
            <div className="land-hero-actions">
              <button
                type="button"
                className="land-btn land-btn-primary"
                onClick={() => handleNavigateLobby('create')}
              >
                Create room
              </button>
              <button
                type="button"
                className="land-btn land-btn-secondary"
                onClick={() => handleNavigateLobby('join')}
              >
                Join with code
              </button>
            </div>
            <ul className="land-hero-facts">
              <li className="land-hero-fact">
                <strong>No sign-in</strong>
                <span>Pick a display name and play</span>
              </li>
              <li className="land-hero-fact">
                <strong>Real-time sync</strong>
                <span>Live across iOS and Android</span>
              </li>
              <li className="land-hero-fact">
                <strong>Undo safe</strong>
                <span>Reverse last transfer cleanly</span>
              </li>
            </ul>
          </div>

          <div className="land-hero-visual" data-slot="hero">
            <figure className="land-screen-plate">
              <img
                src="./screens/table-wallet.png"
                alt="Monopoly Manager live table showing player wallet, Banker controls, and Bank balance"
                className="land-screen-img"
                data-kind="product"
              />
              <figcaption className="land-screen-caption">
                <span>Live table view</span>
                <span className="tabular-nums">Room NA26VW</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section id="screens" className="land-band land-band-tint" aria-labelledby="screens-heading">
        <div className="landing-container">
          <div className="land-section-head">
            <h2 id="screens-heading" className="land-display-h2">
              Four moments at the table
            </h2>
            <p className="land-lead">
              Select a moment to inspect the exact screen players see from lobby seat selection
              through mortgage payoff.
            </p>
          </div>

          <div className="land-switcher-grid">
            <div className="land-switcher-tabs" role="tablist" aria-label="Table workflow moments">
              {SCREEN_MOMENTS.map((moment) => {
                const selected = moment.id === activeScreen.id;
                return (
                  <button
                    key={moment.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`screen-panel-${moment.id}`}
                    className={`land-switcher-tab ${selected ? 'land-switcher-tab--active' : ''}`}
                    onClick={() => setActiveId(moment.id)}
                  >
                    <span className="land-switcher-num tabular-nums">{moment.number}</span>
                    <span>
                      <span className="land-switcher-title">{moment.title}</span>
                      <span className="land-switcher-summary">{moment.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              id={`screen-panel-${activeScreen.id}`}
              role="tabpanel"
              className="land-switcher-stage"
            >
              <img
                src={activeScreen.image}
                alt={activeScreen.imageAlt}
                className="land-switcher-shot"
                data-kind="product"
              />
              <div className="land-switcher-detail">
                <h3 className="land-switcher-detail-title">{activeScreen.headline}</h3>
                <p className="land-switcher-detail-copy">{activeScreen.description}</p>
                <ul className="land-switcher-bullets">
                  {activeScreen.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="rules" className="land-band" aria-labelledby="rules-heading">
        <div className="landing-container">
          <div className="land-section-head">
            <h2 id="rules-heading" className="land-display-h2">
              Built for any phone browser
            </h2>
            <p className="land-lead">
              Runs inside Chrome, Safari, or Edge without downloads, accounts, or printed rulesets.
            </p>
          </div>

          <div className="land-figures-grid">
            {TABLE_FIGURES.map((item) => (
              <div key={item.value} className="land-figure-cell">
                <div className="land-figure-val">{item.value}</div>
                <div className="land-figure-label">{item.label}</div>
                <div className="land-figure-note">{item.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="comparison" className="land-band land-band-tint" aria-labelledby="compare-heading">
        <div className="landing-container">
          <div className="land-section-head">
            <h2 id="compare-heading" className="land-display-h2">
              Paper tray vs live ledger
            </h2>
            <p className="land-lead">
              Keep the cardboard board, dice, and plastic houses on the table. Let phones tally the
              cash.
            </p>
          </div>

          <div className="land-compare-head" aria-hidden="true">
            <span>Paper bank tray</span>
            <span className="land-compare-head-after">Monopoly Manager</span>
          </div>
          <ul className="land-compare-list">
            {COMPARE_ROWS.map((row) => (
              <li key={row.before} className="land-compare-row">
                <span className="land-compare-before">{row.before}</span>
                <span className="land-compare-after">{row.after}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="land-band" aria-labelledby="close-heading">
        <div className="landing-container land-close-grid">
          <div className="land-close-aside">
            <h2 id="close-heading" className="land-display-h2">
              Open a room before the first roll.
            </h2>
            <p className="land-lead">
              Pick your starting cash, finite Bank pool, debt limit, and mortgage rate here, then
              send the six-character link to the group.
            </p>
            <div className="land-close-screen">
              <img
                src="./screens/mortgages.png"
                alt="Monopoly Manager mortgages view showing active Marine Drive loan and clear math"
                data-kind="product"
              />
            </div>
          </div>

          <div className="land-lobby-host">{lobbySlot}</div>
        </div>
      </section>
    </>
  );
}
