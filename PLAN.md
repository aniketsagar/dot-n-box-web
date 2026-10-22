# Dots and Boxes — Plan & Architecture

Status: **Phase 1: core, session layer and a first playable UI are implemented. Works in a desktop browser (owner-verified); mobile/touch is not yet verified. Design decisions are logged in `DECISIONS.md` (append-only).**

## Finalized decisions (supersede anything below that disagrees)

- Monorepo with npm workspaces: `apps/web` (Vite, vanilla TS, SVG, plain CSS) and `packages/game-core` (pure rules, shared with the future server). Vitest for tests; strict TypeScript.
- Exactly 2 players (`PlayerId = 0 | 1`). Board 3x3 to 8x8 boxes (rectangular allowed), default 5x5.
- Edge indexing (documented in `packages/game-core/src/edges.ts`): horizontal edges first (`r * W + c`), then vertical (`W * (H + 1) + r * (W + 1) + c`).
- Edges store ownership: 0 = empty, 1 = player 0, 2 = player 1. Boxes use the same encoding. Box ownership is stored because it cannot be derived from edges (who drew the last side matters); scores, finished and winner are derived from it.
- State is immutable; `applyMove` returns a typed result (`{ ok: true, state, claimed } | { ok: false, error }`), never throws for invalid moves. `createGame` validates config and names the same way.
- UI talks to a `GameSession` (accepted state / rejected move / connection status / `dispose()`). Pending interaction and animation state live in the UI, not in game state. `LocalSession` first, `RemoteSession` in Phase 2.
- Bundle target: < 50 KB gzipped JS, measured from the real build.
- Out of scope in Phase 1: backend, accounts, AI, chat, rankings, database, ads.

## Milestones

1. [x] Scaffold workspaces, Vite, TypeScript, Vitest
2. [x] Core types and edge helpers
3. [x] Reducer, scoring, turns, winner
4. [x] Core tests (141 passing, including an independent reference-model replay)
5. [x] `GameSession` + `LocalSession` (`apps/web/src/session`, 23 tests)
6. [x] SVG board: works in desktop browser (owner-verified), keyboard nav unit-tested, DOM checked in jsdom; touch not yet checked on a phone
7. [x] Home screen, scoreboard, game-over view, rematch: works in desktop browser (owner-verified)
8. [ ] Responsive styling, animations, a11y pass: CSS written; mobile and assistive tech not yet verified
9. [x] Full test run, typecheck, production build, bundle size (4.8 KB gzipped JS at this point)

---

# Original draft (historical; the sections below pre-date the decisions above)


## 1. Goals

- Lightweight: open a URL, type a name, play. No accounts, no install, no signup.
- Phase 1: local 2-player (hot-seat, same screen).
- Phase 2: online multiplayer via a shareable room link.
- Small payload (target < 50 KB gzipped JS), works on mobile and desktop, touch-friendly.

Non-goals (for now): accounts, ranking/ELO, chat, AI opponent, spectators.

## 2. Game rules (what the core must implement)

- Grid of `W x H` boxes, i.e. `(W+1) x (H+1)` dots. Default 5x5 boxes; configurable (3x3 to 8x8).
- Players alternate drawing one edge between two adjacent dots.
- Completing the 4th side of a box claims it for the current player, who **moves again**.
- Completing two boxes with one edge claims both; still moves again.
- Game ends when all edges are drawn. Most boxes wins; equal is a draw.

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Core logic shared between client and future server |
| Build | Vite | Tiny config, fast dev, small output |
| UI | Vanilla TS + SVG (no framework) | Smallest bundle; board is simple. Reconsider Preact (3 KB) if UI state grows |
| Styling | Plain CSS with variables | No dependency |
| Tests | Vitest | Core logic is pure, easy to test |
| Hosting (Phase 1) | Any static host (Cloudflare Pages / GitHub Pages / Netlify) | Zero backend |
| Multiplayer (Phase 2) | WebSocket server, see section 7 | Decided later, design is transport-agnostic |

Open choice: SVG vs Canvas. Recommendation: **SVG** (crisp at any size, easy hit-testing per edge, accessible, CSS animations).

## 4. Architecture

Key principle: **a pure, deterministic game core** with no DOM and no I/O. The UI and the network are thin layers around it.

```
 ┌───────────────┐   intents    ┌──────────────────┐
 │   UI (SVG)    │ ───────────▶ │   GameSession    │
 │ screens/board │ ◀─────────── │ (transport iface)│
 └───────────────┘    state     └────────┬─────────┘
                                         │
                      ┌──────────────────┴─────────────────┐
                      │                                    │
              LocalSession (Phase 1)             RemoteSession (Phase 2)
              applies moves in-memory            sends moves over WebSocket,
                                                 server is authoritative
                                         │
                                 ┌───────▼────────┐
                                 │  core/ (pure)  │
                                 │ state, reducer │
                                 └────────────────┘
```

### 4.1 Core (`src/core/`)

State:

```ts
type PlayerId = 0 | 1;           // extend to N players later
interface GameState {
  width: number; height: number;       // boxes
  edges: Uint8Array;                   // 0 = empty, 1 = drawn (horizontal then vertical edges)
  boxOwner: (PlayerId | null)[];       // per box
  players: { name: string }[];
  current: PlayerId;
  scores: number[];
  status: 'playing' | 'finished';
}
type Move = { edge: number };          // edge index
```

Functions (all pure):
- `createGame(config, players): GameState`
- `isLegal(state, move): boolean`
- `applyMove(state, move): { state, claimed: number[] }` — handles box completion, extra turn, game end
- `getWinner(state)`
- Helpers: edge index <-> endpoints, edge -> adjacent boxes, box -> its 4 edges.

Edge indexing: horizontal edges first (`H * (W+1)`... per row), then vertical edges. Documented and unit-tested in one place so UI and server agree.

### 4.2 Session interface (`src/session/`)

```ts
interface GameSession {
  getState(): GameState;
  play(move: Move): void;                       // UI intent
  subscribe(fn: (s: GameState, ev: Event) => void): () => void;
}
```

- `LocalSession`: wraps core, both players on one screen.
- `RemoteSession` (Phase 2): same interface, but `play` sends to the server and state arrives from server messages. The UI does not change between phases.

### 4.3 UI (`src/ui/`)

- `Board`: renders SVG dots, edges, boxes. Edge hit areas are wider than the visible line (min 24 px touch target). Hover/tap preview, drawn-edge colour per player, box fill with owner initial.
- `Scoreboard`: names, scores, highlight on current turn.
- Screens: **Home** (name inputs / board size) -> **Game** -> **Result** (winner, rematch).
- No router needed in Phase 1. Phase 2 adds `/r/<roomId>` handled by a tiny hash/path check.

### 4.4 Folder layout

```
dot-n-box-web/
├─ index.html
├─ package.json, tsconfig.json, vite.config.ts
├─ src/
│  ├─ main.ts            # bootstrap, screen switching
│  ├─ core/              # pure logic (+ *.test.ts)
│  ├─ session/           # LocalSession (later RemoteSession)
│  ├─ ui/                # board, scoreboard, screens
│  └─ styles.css
├─ server/               # Phase 2 only
└─ PLAN.md
```

In Phase 2, `core/` is imported by both `src/` and `server/` (npm workspace or shared path alias).

## 5. Phase 1 — Local 2-player (the only thing to build first)

Milestones:
1. **Scaffold**: Vite + TS + Vitest, lint/format config.
2. **Core + tests**: edge indexing, legal moves, box completion, extra turn, double-box moves, game end, draw. Target: full rule coverage before any UI.
3. **Board UI**: SVG render, click/tap to draw an edge, owner colours, turn indicator.
4. **Flow**: Home screen (two names, board size) -> game -> result with "Play again".
5. **Polish**: responsive layout, touch targets, small animations, keyboard accessibility (focusable edges), prefers-color-scheme.
6. **Deploy**: static build to chosen host.

Definition of done: two people can finish a full game on one device, with correct scoring, on phone and desktop.

Optional small extras (only if you want them): undo last move, `localStorage` for remembered names.

## 6. Name entry & identity (applies to both phases)

- Only a display name (1-16 chars, trimmed, sanitized, rendered as text never HTML).
- Phase 2: client generates a random `playerToken` stored in `localStorage`, so a refresh or dropped connection rejoins the same seat. No login.

## 7. Phase 2 — Online multiplayer (design only, not for now)

Flow:
1. Player A opens the site, enters name, clicks **Create game** -> server returns room id, URL becomes `/r/k7f2xq`.
2. A shares the URL. Player B opens it, enters a name, joins as player 2.
3. Game starts; moves are exchanged live.

Server design:
- **Authoritative**: server holds the `GameState`, validates each move with the same `core/` code, then broadcasts the new state (or the move plus a version number). Clients cannot cheat or desync.
- Messages (JSON over WebSocket): `join {room, name, token}`, `move {edge}`, `state {state}`, `error {code}`, `rematch`.
- Room = in-memory object keyed by id; expires after inactivity. No database needed for v1.
- Handle: reconnect with token, opponent disconnect notice, invalid/out-of-turn move rejection, room full.

Hosting options (pick later):
- **Cloudflare Workers + Durable Objects** (one DO per room, serves static assets too, very cheap, scales to zero). Recommended for "lightweight".
- Small Node server with `ws` on Fly.io/Railway. Simpler to reason about, needs an always-on process.

Because the UI talks only to `GameSession`, Phase 2 is: add `RemoteSession`, a room/lobby screen, and the server. No rewrite of Phase 1.

## 8. Risks / decisions for you

1. **Board size**: default 5x5 boxes with a selector, or fixed? (Recommend selector, 3x3–8x8.)
2. **Framework**: vanilla TS (recommended) vs Preact.
3. **Hosting target** for Phase 1 (affects nothing in code, only deploy step).
4. **Phase 2 backend**: Cloudflare Durable Objects (recommended) vs Node `ws`. Not needed until Phase 1 is done.
5. **Players**: strictly 2, or design core for N players now? (Core stores `players[]`, so N is cheap; UI would stay 2 for now.)

## 9. Out of scope / future ideas

Single-player vs AI, chat/emoji reactions, spectator links, themes, sound, game replay from move log (the move list makes this easy since the core is deterministic).
