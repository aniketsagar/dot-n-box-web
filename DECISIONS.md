# Design Decisions Log

**Append-only.** Add a new entry at the bottom for every major decision. Never edit or delete an existing entry. To change a decision, add a new entry that says it supersedes the old one (by number). Each entry: date, decision, why, consequences.

Entries 1-9 were written after the fact on 2026-10-22 to record decisions already made during the first implementation.

---

## 001 — Monorepo with npm workspaces (2026-10-22)
**Decision:** `apps/web` (Vite app) and `packages/game-core` (pure rules), managed with npm workspaces.
**Why:** the future multiplayer server must run the exact same rules as the browser. A shared package guarantees that.
**Consequences:** the server in Phase 2 becomes another workspace that imports `@dnb/game-core`. Root scripts fan out with `--workspaces`.

## 002 — Vanilla TypeScript, SVG board, plain CSS (2026-10-22)
**Decision:** no UI framework; board rendered as SVG; styling with CSS custom properties.
**Why:** smallest bundle (target < 50 KB gzipped JS), and the UI is simple enough not to need a framework.
**Consequences:** DOM is built with a tiny `el`/`svgEl` helper. Revisit (e.g. Preact) only if UI state grows past what is easy to reason about.

## 003 — Game core is pure, immutable and returns typed results (2026-10-22)
**Decision:** `applyMove` and `createGame` never mutate input and never throw for invalid input; they return `{ ok: true, ... } | { ok: false, error }`.
**Why:** deterministic and testable; the same code can validate moves on a server.
**Consequences:** callers must handle the failure branch. Typed arrays are copied on every move.

## 004 — Edge indexing convention (2026-10-22)
**Decision:** horizontal edges first (`r * W + c`), then vertical (`W * (H + 1) + r * (W + 1) + c`). Documented only in `packages/game-core/src/edges.ts`.
**Why:** one convention shared by UI, core and (later) wire protocol.
**Consequences:** changing it is a breaking change for any stored or transmitted move. Tests check it against an independently built edge list.

## 005 — Store edge and box ownership; derive everything else (2026-10-22)
**Decision:** edges and boxes use 0 = unclaimed, 1 = player 0, 2 = player 1. Box ownership is stored; scores, finished status and winner are derived from it.
**Why:** box owner cannot be derived from edges (it depends on who drew the last side), but scores can be derived from boxes, so they can never disagree.
**Consequences:** `getScores`/`isFinished` scan the box array (at most 64 entries).

## 006 — Board size 3x3 to 8x8, default 5x5, exactly two players (2026-10-22)
**Decision:** core accepts rectangular boards with each side 3-8; the UI offers square sizes only. `PlayerId` is `0 | 1`.
**Why:** product scope for the first version.
**Consequences:** supporting N players later changes `PlayerId`, the ownership encoding and the turn logic.

## 007 — Player-name rules (2026-10-22)
**Decision:** the core trims names, collapses inner whitespace and requires 1-16 characters. The UI substitutes "Player 1"/"Player 2" for blank input and rejects two names equal ignoring case.
**Why:** predictable, safe display text; avoids two indistinguishable players.
**Consequences:** names are always rendered as text, never HTML.

## 008 — GameSession abstraction lives in `apps/web`, outcomes come via events (2026-10-22)
**Decision:** `GameSession` has `getState`, `getStatus`, `submitMove`, `subscribe`, `dispose`. `submitMove` returns nothing; results arrive as `move-accepted`, `move-rejected` or `connection` events. After `dispose()`: one final `closed` event, listeners dropped, moves ignored, later subscriptions inert, repeat disposal is a no-op.
**Why:** a remote session answers asynchronously, so the UI must not depend on a synchronous return value. Keeping it in `apps/web` avoids putting client-only code in the shared package.
**Consequences:** `RemoteSession` (Phase 2) can implement the same interface. Throwing listeners are isolated and logged with `console.error`. A rematch creates a new session rather than resetting one.

## 009 — Keyboard navigation and game-over view (2026-10-22)
**Decision:** edges use a roving tabindex (one tab stop). Left/Right walk edges in reading order, Up/Down jump within a column, Home/End go to the ends, Enter/Space draws. The game-over result is an inline panel above the board, not a separate screen or modal dialog.
**Why:** a board has up to 144 edges, so one tab stop per edge is unusable by keyboard; an inline panel keeps the final board visible.
**Consequences:** navigation logic is pure and unit tested (`ui/nav.ts`). Screen-reader behaviour has not been verified with real assistive technology.

## 010 — Verification status after first playable build (2026-10-22)
**Decision:** milestones for the board and screens are treated as working on desktop, based on the owner's manual browser check plus automated tests (141 core, 31 web) and a jsdom run of the production bundle. Mobile/touch behaviour is explicitly **not yet verified**.
**Why:** do not claim what has not been checked.
**Consequences:** before calling the responsive/touch milestone done, test on a real phone, particularly edge hit areas on 8x8 boards.
