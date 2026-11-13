# Monopoly & Business Cash Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-server-cost, mobile-first PWA ledger for Indian Business and Monopoly games across iOS Safari and Android Chrome with real-time sync, configurable currency/rules, Banker controls, overdraft limits, and mortgage tracking.

**Architecture:** Static Vite + React + TypeScript PWA backed by Firebase Realtime Database (Spark free plan). Pure domain logic lives in `src/lib/ledger.ts` and runs inside atomic `runTransaction` room mutations on `/rooms/{roomCode}` so concurrent payments, overdraft guards, mortgage clearing, and Undo stay consistent without Cloud Functions. UI follows Hallmark (`--scope app`), Impeccable (`Operate` mode), and UI/UX Pro Max mobile touch/accessibility constraints via shared CSS tokens.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Firebase Realtime Database (`firebase`), `lucide-react`, `qrcode`, CSS Custom Properties (`tokens.css` + `base.css`).

**Spec:** [2026-11-13-monopoly-manager-design.md](file:///c:/utkarsh/Projects/monopoly-manager/docs/superpowers/specs/2026-11-13-monopoly-manager-design.md)

## Global Constraints

- Zero server hosting cost: static build only + Firebase Realtime Database Spark free plan (no Cloud Functions, no Anonymous Auth).
- Mobile-first cross-browser support (iOS Safari + Android Chrome): `min-h-dvh`, safe-area inset padding, `overflow-x: clip` on `html` and `body`, `touch-action: manipulation`, `>= 16px` input fonts.
- Hallmark Floor & App Scope (`--scope app`): all colors and fonts via `:root` CSS tokens in `tokens.css` (no literal hex/font names in components), `:focus-visible` outline, `prefers-reduced-motion: reduce`, SVG icons only (no emoji icons), no purple-to-blue gradients, no card-inside-card nesting, no tracked uppercase labels/eyebrows, `tabular-nums` on all currency figures.
- Touch targets `>= 44×44px` (`>= 48px` on payment keypad and quick chips) with `>= 8px` gap.
- Every async region implements `loading` (skeleton), `empty`, `error`, and `full` states.

## Review Focus

- **Malformed transfer amounts (`0`, `-50`, `12.5`, `NaN`) or self-pay (`fromId === toId`):** Must reject cleanly with a clear error message and leave balances untouched.
- **Exact negative limit boundary (`balance - amount === -negativeLimit` vs `-negativeLimit - 1`):** Payment landing exactly on `-negativeLimit` must succeed; `1` unit beyond must reject.
- **Case-insensitive and whitespace-padded duplicate names (`" raj "` vs `"Raj"`):** Must block creating a duplicate seat on join while allowing one-tap seat reclaim.
- **Unmortgage exceeding overdraft headroom (`balance - payoffAmount < -negativeLimit`):** Must reject and keep the mortgage `active: true` without partial balance deduction.
- **Banker bankruptcy / removal & Undo edge cases:** Marking the active Banker bankrupt/removed must atomically void their active mortgages, zero their balance, and auto-reassign `bankerId` to the active Creator or next active player; Undo must skip already-undone transactions and reject if reversing would breach `-negativeLimit`.

---

## File Structure

- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, `.env.example`, `firebase.rules.json` — Project build, PWA metadata, Vitest config, RTDB `.validate` rules.
- `src/types/game.ts` — Shared TypeScript interfaces (`RoomState`, `RoomMeta`, `Player`, `Mortgage`, `Transaction`, `LocalSession`).
- `src/lib/format.ts` — Currency formatting (`en-IN` grouping for `₹`, minus sign placement) and smart quick-pay chip generation.
- `src/lib/ledger.ts` — Pure immutable room state transitions (`createInitialRoom`, `joinOrReclaimPlayer`, `applyPayment`, `issueMortgage`, `clearMortgage`, `markPlayerExit`, `reassignBanker`, `undoLastTransaction`).
- `src/lib/ledger.test.ts` — Vitest unit tests covering all domain rules and Review Focus edge cases.
- `src/lib/session.ts` — `localStorage` session persistence and URL `?room=` parsing.
- `src/lib/firebase.ts`, `src/lib/roomStore.ts`, `src/lib/roomStore.test.ts` — Firebase RTDB initialization, missing-env guard, subscription, and `runTransaction` wrapper.
- `src/styles/tokens.css`, `src/styles/base.css` — Hallmark-compliant design tokens and base mobile/a11y rules.
- `src/components/Lobby.tsx`, `src/components/ShareSheet.tsx` — Create Room, Join / Reclaim Seat, QR invite modal.
- `src/components/TableView.tsx`, `src/components/PaySheet.tsx`, `src/components/BankerBar.tsx` — Wallet card, player list, keypad payment sheet, Banker controls (Pass Start, Payout, Issue Mortgage, Undo, Reassign, Bankrupt/Remove).
- `src/components/MortgagesView.tsx`, `src/components/HistoryView.tsx` — Mortgages tab (issue/clear) and transaction ledger feed.
- `src/App.tsx`, `src/main.tsx` — Root state orchestration, 3-tab mobile shell, skeleton/error/rejoin states.

---

### Task 1: Project Scaffold, PWA Config, and RTDB Rules

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, `.env.example`, `firebase.rules.json`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Produces: runnable `npm run test` (Vitest), `npm run build` (Vite + TypeScript), and Firebase RTDB schema validation rules (`firebase.rules.json`).

- [ ] **Step 1: Initialize git repository and project dependencies**

Create `package.json` with `react`, `react-dom`, `firebase`, `lucide-react`, `qrcode` in dependencies and `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `@types/react`, `@types/react-dom`, `@types/qrcode` in devDependencies. Run `git init` and `npm install`.

- [ ] **Step 2: Create `tsconfig.json`, `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, `.env.example`**

Configure strict TypeScript, Vitest globals/node environment, `index.html` with `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, and `.env.example` listing `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.

- [ ] **Step 3: Create `firebase.rules.json`**

Write RTDB rules under `rooms/$roomCode` validating integer `startingCash >= 0`, `negativeLimit >= 0`, `passStartAmount >= 0`, `mortgageInterestPct === 0 || 10`, player `balance >= -meta.negativeLimit` when `status === 'active'`, and positive/non-negative transaction amounts.

- [ ] **Step 4: Write and run smoke test**

```ts
// src/smoke.test.ts
import { describe, it, expect } from 'vitest';
describe('setup', () => {
  it('runs vitest', () => expect(1 + 1).toBe(2));
});
```

Run: `npx vitest run src/smoke.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html public/manifest.webmanifest .env.example firebase.rules.json src/smoke.test.ts
git commit -m "chore: scaffold Vite React PWA and Firebase RTDB rules"
```

---

### Task 2: Domain Types, Currency Formatting, and Pure Ledger Engine

**Files:**
- Create: `src/types/game.ts`, `src/lib/format.ts`, `src/lib/ledger.ts`
- Test: `src/lib/ledger.test.ts`

**Interfaces:**
- Produces in `src/types/game.ts`: `PlayerStatus`, `TransactionType`, `RoomMeta`, `Player`, `Mortgage`, `Transaction`, `RoomState`, `LocalSession`.
- Produces in `src/lib/format.ts`:
  - `formatCurrency(amount: number, symbol: string, locale: string): string`
  - `computeQuickChips(startingCash: number, passStartAmount: number): number[]`
- Produces in `src/lib/ledger.ts`:
  - `LedgerError` (Error subclass with `code` + user-friendly message)
  - `generateRoomCode(): string`
  - `createInitialRoom(input: CreateRoomInput): RoomState`
  - `joinOrReclaimPlayer(room: RoomState, input: { playerId: string; name: string; reclaimPlayerId?: string }): { room: RoomState; playerId: string }`
  - `applyPayment(room: RoomState, input: { fromId: string; toId: string; amount: number; actorId: string; note?: string; type?: 'transfer' | 'bank_pay' | 'pass_start' }): RoomState`
  - `issueMortgage(room: RoomState, input: { playerId: string; propertyName: string; principal: number; actorId: string }): RoomState`
  - `clearMortgage(room: RoomState, input: { mortgageId: string; actorId: string }): RoomState`
  - `markPlayerExit(room: RoomState, input: { targetPlayerId: string; status: 'bankrupt' | 'removed'; actorId: string }): RoomState`
  - `reassignBanker(room: RoomState, input: { newBankerId: string; actorId: string }): RoomState`
  - `undoLastTransaction(room: RoomState, input: { actorId: string }): RoomState`

- [ ] **Step 1: Write `src/types/game.ts` with exact domain types**

Define `RoomMeta`, `Player` (`status: 'active' | 'bankrupt' | 'removed'`), `Mortgage`, `Transaction`, `RoomState`, and `LocalSession`.

- [ ] **Step 2: Write failing tests in `src/lib/ledger.test.ts`**

Cover:
1. `formatCurrency(-2500, '₹', 'en-IN')` returns `'-₹2,500'`; `formatCurrency(150000, '₹', 'en-IN')` returns `'₹1,50,000'`.
2. `createInitialRoom` sets creator as active player with `startingCash` and `bankerId === creatorId`.
3. `joinOrReclaimPlayer` blocks case-insensitive/whitespace-trimmed duplicate names (`" raj "` vs `"Raj"`), and `reclaimPlayerId` returns existing seat ID without altering balances.
4. `applyPayment` allows landing exactly on `-negativeLimit`, throws `LedgerError` when `1` unit past `-negativeLimit`, and rejects `0`, `-10`, `12.5`, `NaN`, or `fromId === toId`.
5. Bank payouts (`bank_pay`, `pass_start`) require `actorId === meta.bankerId`.
6. `issueMortgage` computes `payoffAmount` (`principal` at `0%`, `Math.round(principal * 1.1)` at `10%`) and credits player; `clearMortgage` deducts `payoffAmount`, marks `active: false`, and rejects if `balance - payoffAmount < -negativeLimit`.
7. `markPlayerExit` zeros balance, voids active mortgages, and auto-reassigns `bankerId` to active Creator or next active player if the Banker exits.
8. `undoLastTransaction` skips already-undone entries, reverses `transfer` / `mortgage` / `unmortgage`, and rejects if reversal would push former recipient below `-negativeLimit`.

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run src/lib/ledger.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `src/lib/format.ts` and `src/lib/ledger.ts`**

Keep every function pure and immutable. Use `crypto.randomUUID()` with fallback for IDs, unambiguous 6-char alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` for `generateRoomCode()`, and `Intl.NumberFormat` for locale grouping.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/lib/ledger.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Commit**

```bash
git add src/types/game.ts src/lib/format.ts src/lib/ledger.ts src/lib/ledger.test.ts
git commit -m "feat: add pure cash and mortgage ledger engine with unit tests"
```

---

### Task 3: Local Session Storage & Firebase RTDB Sync Layer

**Files:**
- Create: `src/lib/session.ts`, `src/lib/firebase.ts`, `src/lib/roomStore.ts`
- Test: `src/lib/roomStore.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `LocalSession` (`src/types/game.ts`), `createInitialRoom`, `LedgerError` (`src/lib/ledger.ts`).
- Produces in `src/lib/session.ts`: `loadSession()`, `saveSession(session: LocalSession)`, `clearSession()`, `getRoomCodeFromUrl()`.
- Produces in `src/lib/roomStore.ts`: `isFirebaseConfigured()`, `createRoom(input)`, `fetchRoomOnce(code)`, `subscribeRoom(code, onRoom, onError)`, `runRoomMutation(code, mutator)`.

- [ ] **Step 1: Write failing tests in `src/lib/roomStore.test.ts`**

Test `saveSession` / `loadSession` / `clearSession` round-trip, URL `?room=ab34cd` normalization to `'AB34CD'`, and `applyRoomTransactionCallback` (pure wrapper around RTDB `runTransaction` updater: aborts cleanly on `null` room or `LedgerError`, commits updated `RoomState` on success).

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/lib/roomStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/session.ts`, `src/lib/firebase.ts`, and `src/lib/roomStore.ts`**

Guard `firebase.ts` so missing `VITE_FIREBASE_DATABASE_URL` or `VITE_FIREBASE_API_KEY` exposes `isFirebaseConfigured() === false` instead of throwing at module load. Implement `runRoomMutation` using Firebase `runTransaction(ref(db, 'rooms/' + code), ...)` capturing any `LedgerError` thrown inside the updater so callers receive `{ ok: false, error: message }`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/roomStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/firebase.ts src/lib/roomStore.ts src/lib/roomStore.test.ts
git commit -m "feat: add local session persistence and Firebase RTDB transaction store"
```

---

### Task 4: Hallmark / Impeccable Design Tokens, Base Styles, and App Shell

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/App.tsx`, `src/main.tsx`
- Delete: `src/smoke.test.ts` (if present from initial scaffold)

**Interfaces:**
- Consumes: `session.ts`, `roomStore.ts`.
- Produces: styled app shell with `tokens.css` (Hallmark stamp line 1, semantic colors, type scale, radii, spacing, motion durations) and `App.tsx` managing `session`, `room`, `loading`, `error`, active tab (`'table' | 'mortgages' | 'history'`), and offline/reconnecting status banner.

- [ ] **Step 1: Read Hallmark & Impeccable reference files before writing CSS**

Read `C:\Users\utkar\.claude\skills\hallmark\references\gates.md` (§ 1–4) and `C:\Users\utkar\.gemini\skills\impeccable\reference\craft-floor.md` to ensure every Floor rule and `tokens.css` token name complies.

- [ ] **Step 2: Create `src/styles/tokens.css` and `src/styles/base.css`**

Define warm tactile paper surface (`--color-surface`), raised panel (`--color-surface-raised`), crisp ink (`--color-ink`, `--color-ink-muted`), primary emerald/teal accent (`--color-accent`), semantic danger/warning (`--color-danger`, `--color-warning`, `--color-success`), fixed `rem` scale (`1.15` ratio), `tabular-nums` helper, `overflow-x: clip` on `html, body`, `min-h-dvh`, `:focus-visible` ring, `prefers-reduced-motion: reduce`, `>= 44px` button minimum height, `>= 16px` inputs, and safe-area bottom spacing. Start `tokens.css` with the Hallmark `--scope app` stamp comment.

- [ ] **Step 3: Implement `src/main.tsx` and `src/App.tsx`**

Wire `tokens.css` + `base.css`, load `LocalSession` on mount, subscribe to room when in session, render skeleton loading state while fetching room, inline error banner with Retry/Leave on room load error, top bar (room code, QR Share trigger, currency/rules pill, Leave), and 3-tab bottom navigation (`Table`, `Mortgages`, `History`).

- [ ] **Step 4: Verify TypeScript and build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors, clean `dist/`.

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/styles/base.css src/App.tsx src/main.tsx
git commit -m "feat: add design tokens, mobile base styles, and app shell"
```

---

### Task 5: Lobby (Create, Join, Reclaim Seat) & QR Share Sheet

**Files:**
- Create: `src/components/Lobby.tsx`, `src/components/ShareSheet.tsx`, `src/components/Lobby.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `roomStore.ts` (`isFirebaseConfigured`, `createRoom`, `fetchRoomOnce`, `joinRoom`, `reclaimSeat`), `format.ts`, `session.ts` (`getRoomCodeFromUrl`).
- Produces: `Lobby` component (Create tab + Join/Reclaim tab + Firebase setup notice if unconfigured) and `ShareSheet` `<dialog>` (QR SVG + copy invite URL + room code).

- [ ] **Step 1: Implement `src/components/ShareSheet.tsx`**

Use native `<dialog>` with backdrop click / close button, `qrcode.toString(inviteUrl, { type: 'svg', margin: 1 })` rendered safely, copy-link button with brief `Copied` feedback, and visible 6-char code.

- [ ] **Step 2: Implement `src/components/Lobby.tsx` and `src/components/Lobby.css`**

Two clean segmented modes:
- **Join Room:** Uppercase 6-char room code input (prefilled from URL `?room=`), lookup room on submit or 6-char entry -> shows name input to join as new player AND lists existing seats (`Reclaim seat` button per player) if name matches or session was lost.
- **Create Room:** Display name, currency selector (`₹ INR` default, `$ USD`, `€ EUR`, `£ GBP`, custom symbol), starting cash (`15000`), negative limit (`5000`), Pass Start (`2000`), mortgage interest toggle (`0%` vs `10%`).
- If `!isFirebaseConfigured()`, render a concise setup guide naming `.env.local` keys.

- [ ] **Step 3: Wire `Lobby` and `ShareSheet` into `src/App.tsx`**

Open `ShareSheet` from top bar invite icon button (`aria-label="Share room"`).

- [ ] **Step 4: Verify TypeScript and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Lobby.tsx src/components/ShareSheet.tsx src/components/Lobby.css src/App.tsx
git commit -m "feat: add lobby create/join/reclaim flows and QR share sheet"
```

---

### Task 6: Table Wallet, Quick-Pay Sheet, and Banker Controls

**Files:**
- Create: `src/components/TableView.tsx`, `src/components/PaySheet.tsx`, `src/components/BankerBar.tsx`, `src/components/TableView.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ledger.ts`, `format.ts`, `roomStore.ts` (`runRoomMutation`).
- Produces:
  - `TableView`: My Wallet card (balance, debt headroom indicator when `< 0`, active mortgage count), Players list (Pay button per active player, Bank pay CTA, collapsed/muted exited players), Banker controls mount.
  - `PaySheet`: `<dialog>` bottom sheet supporting `'player_pay'` (`me` -> selected player or `BANK`) and `'bank_pay'` (`BANK` -> selected active player), quick-add amount chips (`>= 48px`), large touch numeric keypad (`1–9`, `00`, `0`, backspace), optional note, live post-transfer balance preview, overdraft guard message before/on submit.
  - `BankerBar`: Visible when `me.id === room.meta.bankerId` (plus Creator emergency Banker reclaim if needed? Creator/Banker can reassign Banker). Actions: `Pass Start` (pick player -> 1-tap credit), `Bank Payout`, `Issue Mortgage` (switch/open mortgage sheet), `Undo Last` (with last-tx preview), `Manage Players` (Reassign Banker, Mark Bankrupt, Remove Player with inline confirmation).

- [ ] **Step 1: Implement `src/components/PaySheet.tsx`**

Ensure zero `100vw`, `>= 48px` keypad buttons, `>= 8px` gap, clear loading/disabled/error states, and instant post-transaction balance preview showing `-negativeLimit` warning if insufficient headroom.

- [ ] **Step 2: Implement `src/components/BankerBar.tsx`**

Include Pass Start quick picker, Bank Payout trigger, Undo Last button (disabled when no undoable transaction exists), Reassign Banker picker, and Bankrupt/Remove confirmation flow (never silently wipes a player on accidental tap).

- [ ] **Step 3: Implement `src/components/TableView.tsx` and `src/components/TableView.css`**

Render My Wallet, quick `Pay Bank` / `Pay Player` primary actions, active player rows with tabular balances, and Banker badge.

- [ ] **Step 4: Wire into `src/App.tsx` and run tests + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TableView.tsx src/components/PaySheet.tsx src/components/BankerBar.tsx src/components/TableView.css src/App.tsx
git commit -m "feat: add table wallet, quick-pay keypad sheet, and banker controls"
```

---

### Task 7: Mortgages Tab, History Tab, and Hallmark / Mobile Verification

**Files:**
- Create: `src/components/MortgagesView.tsx`, `src/components/HistoryView.tsx`, `src/components/LedgerViews.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ledger.ts` (`issueMortgage`, `clearMortgage`), `format.ts`, `roomStore.ts`.
- Produces: `MortgagesView` (active & cleared mortgages, Banker inline Issue Mortgage form + 1-tap Clear Mortgage button, empty/loading states) and `HistoryView` (chronological reverse feed, human-readable labels, `Undone` badge, empty/loading states).

- [ ] **Step 1: Implement `src/components/MortgagesView.tsx` and `src/components/HistoryView.tsx`**

Keep layout restrained (no card-inside-card nesting; clean divided rows with tabular numbers). Show clear empty states explaining how mortgages and transactions appear.

- [ ] **Step 2: Wire tabs into `src/App.tsx` and clean up `src/smoke.test.ts` if unused**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: All unit tests and production build pass.

- [ ] **Step 3: Run Hallmark sloplint & mobile viewport verification**

Run `node C:\Users\utkar\.claude\skills\hallmark\scripts\sloplint.mjs src --scope app` (and `--render --url http://localhost:5173` if Puppeteer/Chrome available; report exact output). Fix any `FAIL` findings and verify layout at mobile `375×812` width (`overflow-x: clip`, no horizontal scroll, touch targets `>= 44px`).

- [ ] **Step 4: Commit**

```bash
git add src/components/MortgagesView.tsx src/components/HistoryView.tsx src/components/LedgerViews.css src/App.tsx
git commit -m "feat: add mortgages and history views and verify UI gates"
```

---

## Self-Review Notes
- Spec coverage checked: Lobby create/join/reclaim, currency selector (`₹` default), starting cash, negative limit, Pass Start, `0%`/`10%` mortgage fee, Direct Pay, Banker controls (Pass Start, Payout, Mortgage issue/clear, Bankrupt/Remove, Undo, Reassign), RTDB atomic `runTransaction` + `.validate` rules, QR share, UI skills compliance.
- Consistency check: `Player`, `Mortgage`, `Transaction`, `RoomState`, `LedgerError`, `runRoomMutation`, `formatCurrency` match across all tasks.

