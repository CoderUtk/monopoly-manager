# Monopoly & Business Cash Manager — Design Spec

## Intent & Why

Indian Business and Monopoly games with family in the same room bog down in counting physical notes, making change, and tracking mortgages on scraps of paper. This mobile web app replaces physical cash and mortgage bookkeeping with a fast, shared digital ledger on every player's phone—zero app store install, zero server hosting cost, works across iOS Safari and Android Chrome.

## Goals, Non-Goals, Anti-Goals

### Goals
- **Fast room join:** Create or join a room in under 30 seconds via 6-character code or QR/share link with display name only (no accounts or passwords).
- **Resilient live sync:** Real-time balance, mortgage, and transaction sync across iOS and Android browsers that survives phone screen lock, app switching, and page refresh.
- **Configurable table rules:** Room creator sets currency (`₹` INR default, `$`, `€`, `£`, or custom symbol), player starting cash, bank starting balance (default `100000`), negative balance limit (`0` disables negative balances), Pass Start bonus amount, and mortgage payoff fee (`0%` or `10%`).
- **Pre-game lobby & finite Bank:** Rooms open in `'lobby'` status (max 4 non-removed players). Any joined player selects who acts as Banker (not tied to room creator) and starts the game. Payments to `BANK` and cleared mortgages credit `bankBalance`; Bank payouts, Pass Start credits, and issued mortgages deduct from `bankBalance` and block if insufficient.
- **Low-friction payments:** Any player can pay another player or the Bank directly. Assigned Banker (reassignable anytime) controls Bank payouts, Pass Start bonuses, mortgage issue/clear, and Undo.
- **Overdraft & mortgage enforcement:** Transfers that would push a player past the negative limit are blocked atomically until they mortgage property or receive cash.

### Non-Goals
- No built-in digital board, dice roller, or hardcoded city/property catalog (physical board and deed cards stay on the table).
- No user accounts, login flows, or persistent cross-game stats.
- No center Tax / Free Parking pot (can be added later if needed).
- No offline phone-to-phone Bluetooth/Wi-Fi Direct mesh (blocked by iOS Safari).

### Anti-Goals
- No Banker approval queue for routine player-to-player rent payments (creates table bottleneck).
- No client-side-only balance math without atomic transactions (causes lost updates or overdraft races).
- No bloated marketing hero, emoji icons, card-inside-card clutter, or sub-44px mobile tap targets.

## Constraints

- **Zero server cost:** Static frontend (Cloudflare Pages / Vercel / GitHub Pages) + Firebase Realtime Database on the Spark free plan (no Cloud Functions, no paid backend).
- **Cross-platform mobile web:** Must work seamlessly on iOS Safari and Android Chrome (`min-h-dvh`, safe-area inset padding, `16px+` input font size to prevent iOS zoom, `touch-action: manipulation`).
- **Internet assumed during play:** Accepted tradeoff for zero-install cross-platform sync across iOS and Android that survives Safari background suspension.

## Approaches Considered

1. **Vite + React + CSS Tokens + Firebase Realtime Database (Spark Free Plan) — Selected**
   - Static PWA hosted free; Firebase RTDB handles live WebSocket sync, reconnect after iOS Safari sleep, and client `runTransaction` for atomic balance/overdraft enforcement.
   - *Why:* ₹0 cost, no credit card, never auto-pauses between sporadic family game nights, and avoids iOS WebRTC host-disconnect issues.
   - *Tradeoff:* Requires one free Firebase web config key and client-side RTDB `.validate` rules.
2. **Vite + React + Supabase Free Tier — Rejected**
   - *Tradeoff:* Free projects auto-pause after 7 days of inactivity, breaking occasional family game nights.
3. **Pure Static PWA + Public P2P (Trystero / WebRTC) — Rejected**
   - *Tradeoff:* Host phone holds canonical state; iOS Safari suspends background tabs when locked, stalling the whole room.

## Architecture & Data Model

### Firebase Realtime Database Schema (`/rooms/{roomCode}`)
- `meta`:
  - `code`: string (6-char uppercase alphanumeric, unambiguous alphabet excluding `O/0/I/1`)
  - `createdAt`: server timestamp
  - `creatorId`: string
  - `bankerId`: string (`''` until selected in lobby)
  - `status`: `'lobby' | 'active'`
  - `currencySymbol`: string (default `₹`)
  - `currencyLocale`: string (`en-IN` when `₹`, else `en-US` / standard grouping)
  - `startingCash`: integer (>= 0)
  - `bankStartingCash`: integer (>= 0)
  - `bankBalance`: integer (>= 0)
  - `negativeLimit`: integer (>= 0; stored as positive max debt magnitude, so min allowed balance is `-negativeLimit`)
  - `passStartAmount`: integer (>= 0)
  - `mortgageInterestPct`: `0 | 10`
- `players/{playerId}`:
  - `id`: string (UUID generated client-side, persisted in `localStorage`)
  - `name`: string (trimmed, 1–20 chars, case-insensitive unique among active/bankrupt seats in room)
  - `balance`: integer
  - `status`: `'active' | 'bankrupt' | 'removed'`
  - `joinedAt`: number
- `mortgages/{mortgageId}`:
  - `id`: string
  - `playerId`: string
  - `propertyName`: string (1–40 chars)
  - `principal`: integer (> 0)
  - `payoffAmount`: integer (`principal` if `0%`, `Math.round(principal * 1.1)` if `10%`)
  - `active`: boolean
  - `createdAt`: number
  - `clearedAt`: number | null
- `transactions/{txId}`:
  - `id`: string
  - `type`: `'transfer' | 'bank_pay' | 'pass_start' | 'mortgage' | 'unmortgage' | 'bankrupt' | 'remove' | 'undo'`
  - `fromId`: string (`'BANK'` or `playerId`)
  - `toId`: string (`'BANK'` or `playerId`)
  - `amount`: integer (>= 0; `> 0` for money moves, `0` allowed for status-only `bankrupt`/`remove`)
  - `note`: string (optional)
  - `actorId`: string
  - `createdAt`: number
  - `undone`: boolean (default `false`)
  - `reversesTxId`: string | null

### Concurrency, Trust & Session Recovery
- **Atomic room mutations:** Since a 2-hour family room is tiny (~10–20 KB JSON), mutations run via `runTransaction` on `/rooms/{roomCode}` so overdraft limits (`newBalance >= -negativeLimit`), mortgage creation/clearing, player elimination, and Undo cannot race or leave half-applied state.
- **Trust model (Assistant Call):** Uses client-generated `localStorage` UUIDs plus Firebase RTDB `.validate` rules (checking integer bounds and `-negativeLimit`) instead of Firebase Anonymous Auth. Keeps Firebase Console setup zero-config and makes multi-device seat recovery seamless among family in the same room.
- **Rejoin & seat recovery:** Client persists `{ roomCode, playerId, playerName }` in `localStorage`. Reloading or waking iOS Safari auto-resubscribes to `/rooms/{roomCode}`. If storage is lost (battery dies, Private mode, switching from WhatsApp in-app browser to Safari), the Join screen blocks duplicate new seats with the same name and lets the user tap **"Reclaim seat"** on an existing seat (zero-PIN) to adopt its `playerId` and restore their balance, mortgages, and Banker/Creator role.

## Core Flows & Rules

1. **Create Room:** Creator enters display name, picks currency (`₹` default, `$`, `€`, `£`, custom), player starting cash (e.g. `15000`), Bank starting balance (default `100000`), negative limit (e.g. `5000`, `0` for no negative), Pass Start bonus (e.g. `2000`), and mortgage interest (`0%` or `10%`). Room starts in `'lobby'` with `bankerId: ''`.
2. **Join / Waiting Room / Reclaim:** Up to 4 players enter the 6-char room code (or open share link / scan QR) while in `'lobby'` and join with a unique display name (credited `startingCash`). Any active player picks who becomes Banker and starts the game (at which point new player joins close, while existing seats can still be reclaimed anytime).
3. **Direct Pay (Any Active Player):** Select active recipient (another player or `BANK`), enter integer amount (with quick amount chips + large touch keypad), optional short note, tap Pay. Paying `BANK` credits `bankBalance`; rejected immediately if `sender.balance - amount < -negativeLimit`.
4. **Banker Controls (Banker Only):**
   - **Pass Start:** 1-tap credit `passStartAmount` from `BANK` to chosen active player (blocked if `bankBalance < passStartAmount`).
   - **Bank Payout:** Credit custom amount from `BANK` to chosen active player (blocked if `bankBalance < amount`).
   - **Issue Mortgage:** Choose active player, enter physical card/property name and mortgage payout amount; credits player from `BANK` (blocked if `bankBalance < principal`) and logs active mortgage with computed `payoffAmount`.
   - **Clear Mortgage:** Select active mortgage; deducts `payoffAmount` from player to `BANK` (blocked if it breaches `-negativeLimit`), credits `bankBalance`, and marks mortgage cleared.
   - **Bankrupt / Remove Player:** Marks player `bankrupt` or `removed`, zeros their balance, voids active mortgages, and hides them from Pay recipients and Banker selection. If the exiting player was Banker, automatically reassigns `bankerId` to the earliest active player.
   - **Undo Last:** Reverses the latest non-undone transaction (`transfer`, `bank_pay`, `pass_start`, `mortgage`, `unmortgage`), restoring player balances, `bankBalance`, and active mortgage flag atomically.
   - **Reassign Banker:** Current Banker can transfer Banker role to any active player; if current Banker becomes missing/inactive, any active player can claim or assign a new Banker.

## UI & Visual Direction

Designed under **Hallmark (App Scope)**, **Impeccable (Operate Mode)**, and **UI/UX Pro Max** mobile standards:

- **Mode & Scope:** `Operate` mode / `app` screen (`sloplint --scope app`). The tool disappears into fast table transactions; the signature object is the live **Wallet + Quick-Pay Ledger**.
- **Design Tokens:** All colors, typography, radii, and spacing defined once in CSS custom properties (`tokens.css`); zero literal hex or font names in components.
- **Palette & Surfaces:** Restrained warm-paper light neutral surface, crisp dark ink (`>= 4.5:1` contrast), one focused accent for primary Pay action and active selection, semantic danger/warning color (paired with text/icon) for negative balances and mortgaged states. No purple-to-blue gradients, no card-inside-card nesting.
- **Typography:** Single clean sans-serif stack, fixed `rem` scale (`1.125–1.2` ratio), `tabular-nums` on every currency balance and ledger amount, sentence-case labels (no tracked uppercase eyebrows or small caps), `>= 16px` input font size.
- **Mobile Ergonomics:** Primary touch targets `>= 44×44px` (`48px`+ on payment keypad/chips) with `>= 8px` gap, `overflow-x: clip`, crisp SVG icons only (no emoji icons), `:focus-visible` outlines, `150–250ms` `transform`/`opacity` state transitions honoring `prefers-reduced-motion`.
- **Navigation & States:** Single screen with 3-item segmented view (`Table`, `Mortgages`, `History`) and inline/bottom-sheet payment pad; every async region implements `loading` (skeleton), `empty`, `error`, and `full` states.

## What Is Left to the Builder

- Exact color hex values and font stack selection inside `tokens.css`.
- Smart quick-pay chip denominations derived cleanly from `startingCash` / `passStartAmount`.
- Firebase RTDB security `.validate` rules enforcing non-negative amounts and schema integrity on Spark tier.
- Lightweight client QR SVG generator for room sharing.

