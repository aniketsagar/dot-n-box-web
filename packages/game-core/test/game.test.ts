import { describe, expect, it } from 'vitest';
import {
  applyMove,
  boxCount,
  createGame,
  edgeCount,
  edgeEndpoints,
  getScores,
  getWinner,
  horizontalEdge,
  isFinished,
  isLegalMove,
  verticalEdge,
  type Dimensions,
  type GameState,
  type PlayerId,
} from '../src/index.ts';

const dims = (width: number, height: number): Dimensions => ({ width, height });

function newGame(width = 3, height = 3, names: [string, string] = ['Ann', 'Bob']): GameState {
  const r = createGame({ width, height }, names);
  if (!r.ok) throw new Error(`createGame failed: ${r.error}`);
  return r.state;
}

/** Play the edges in order, asserting each is accepted. */
function play(state: GameState, edges: number[]): GameState {
  let s = state;
  for (const edge of edges) {
    const r = applyMove(s, { edge });
    if (!r.ok) throw new Error(`move ${edge} rejected: ${r.error}`);
    s = r.state;
  }
  return s;
}

const snapshot = (s: GameState) => ({
  edges: Array.from(s.edges),
  boxes: Array.from(s.boxes),
  current: s.current,
  players: [...s.players],
  dimensions: { ...s.dimensions },
});

describe('createGame', () => {
  it.each([
    [3, 3, 24, 9],
    [5, 5, 60, 25],
    [8, 8, 144, 64],
    [3, 8, 59, 24],
  ])('initial state for %i x %i', (w, h, edges, boxes) => {
    const s = newGame(w, h);
    expect(s.dimensions).toEqual({ width: w, height: h });
    expect(s.edges.length).toBe(edges);
    expect(s.boxes.length).toBe(boxes);
    expect(Array.from(s.edges).every((v) => v === 0)).toBe(true);
    expect(Array.from(s.boxes).every((v) => v === 0)).toBe(true);
    expect(s.current).toBe(0);
    expect(getScores(s)).toEqual([0, 0]);
    expect(isFinished(s)).toBe(false);
    expect(getWinner(s)).toBeNull();
  });

  it.each([
    ['width below minimum', 2, 3],
    ['height below minimum', 3, 2],
    ['width above maximum', 9, 3],
    ['height above maximum', 3, 9],
    ['fractional', 3.5, 3],
    ['NaN', Number.NaN, 3],
    ['negative', -5, 3],
    ['zero', 0, 0],
    ['Infinity', Infinity, 3],
  ])('rejects invalid dimensions: %s', (_n, width, height) => {
    expect(createGame({ width, height }, ['A', 'B'])).toEqual({
      ok: false,
      error: 'invalid-dimensions',
    });
  });

  it('rejects malformed config', () => {
    expect(createGame(null as never, ['A', 'B']).ok).toBe(false);
    expect(createGame({ width: '5', height: 5 } as never, ['A', 'B']).ok).toBe(false);
    expect(createGame({} as never, ['A', 'B']).ok).toBe(false);
  });

  it('accepts the 3..8 limits', () => {
    expect(createGame({ width: 3, height: 8 }, ['A', 'B']).ok).toBe(true);
    expect(createGame({ width: 8, height: 3 }, ['A', 'B']).ok).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['too long', 'x'.repeat(17)],
    ['not a string', 42],
    ['null', null],
  ])('rejects invalid player name: %s', (_n, bad) => {
    expect(createGame({ width: 3, height: 3 }, [bad as never, 'B'])).toEqual({
      ok: false,
      error: 'invalid-player-name',
    });
    expect(createGame({ width: 3, height: 3 }, ['A', bad as never]).ok).toBe(false);
  });

  it('rejects a missing players tuple', () => {
    expect(createGame({ width: 3, height: 3 }, undefined as never).ok).toBe(false);
  });

  it('trims names and collapses inner whitespace; 16 chars is allowed', () => {
    const s = newGame(3, 3, ['  Ann   Lee ', 'x'.repeat(16)]);
    expect(s.players).toEqual(['Ann Lee', 'x'.repeat(16)]);
  });
});

describe('move rejection', () => {
  it.each([-1, 24, 1.5, Number.NaN, Infinity, '3', null, undefined])(
    'rejects invalid edge %j and leaves state untouched',
    (edge) => {
      const s = play(newGame(), [0]);
      const before = snapshot(s);
      const r = applyMove(s, { edge: edge as never });
      expect(r).toEqual({ ok: false, error: 'invalid-edge' });
      expect(snapshot(s)).toEqual(before);
      expect(isLegalMove(s, { edge: edge as never })).toBe(false);
    },
  );

  it('rejects a malformed move object', () => {
    const s = newGame();
    expect(applyMove(s, null as never)).toEqual({ ok: false, error: 'invalid-edge' });
    expect(applyMove(s, {} as never)).toEqual({ ok: false, error: 'invalid-edge' });
  });

  it('rejects an already drawn edge, regardless of who drew it', () => {
    const s = play(newGame(), [5]);
    const before = snapshot(s);
    expect(applyMove(s, { edge: 5 })).toEqual({ ok: false, error: 'edge-taken' });
    expect(snapshot(s)).toEqual(before);
    expect(s.current).toBe(1); // a rejected move does not pass the turn
  });
});

describe('turns and scoring (3x3, hand-derived edges)', () => {
  // Box 0 sides: top 0, bottom 3, left 12, right 13.
  // Box 1 sides: top 1, bottom 4, left 13, right 14.

  it('records edge ownership by player and switches turn after a non-scoring move', () => {
    let s = newGame();
    const r0 = applyMove(s, { edge: 0 });
    expect(r0.ok && r0.claimed).toEqual([]);
    s = (r0 as { state: GameState }).state;
    expect(s.current).toBe(1);
    expect(s.edges[0]).toBe(1); // player 0
    s = play(s, [3]);
    expect(s.edges[3]).toBe(2); // player 1
    expect(s.current).toBe(0);
    expect(getScores(s)).toEqual([0, 0]);
  });

  it('completing one box awards it to the mover, who keeps the turn', () => {
    const s3 = play(newGame(), [0, 3, 12]); // P0, P1, P0 -> P1 to move
    expect(s3.current).toBe(1);
    const r = applyMove(s3, { edge: 13 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.claimed).toEqual([0]);
    expect(Array.from(r.state.boxes)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(getScores(r.state)).toEqual([0, 1]);
    expect(r.state.current).toBe(1); // retained
    expect(r.state.edges[13]).toBe(2);
  });

  it('can take consecutive boxes, then passes the turn on the next miss', () => {
    // P0 sets up boxes 0 and 1 (not sharing 13 yet), then P0 scores both separately.
    // Moves: 0(P0) 3(P1) 12(P0) 1(P1) 4(P0) 14(P1) -> P0 to move, boxes 0,1 each 3-sided.
    let s = play(newGame(), [0, 3, 12, 1, 4, 14]);
    expect(s.current).toBe(0);
    // Box 2 (top 2, bottom 5, left 14, right 15): 14 already drawn.
    s = play(s, [2, 5]); // P0 plays 2 (no score), P1 plays 5 (no score)
    expect(s.current).toBe(0);
    const r = applyMove(s, { edge: 15 }); // P0 completes box 2
    expect(r.ok && r.claimed).toEqual([2]);
    const after = (r as { state: GameState }).state;
    expect(after.current).toBe(0);
    const r2 = applyMove(after, { edge: 13 }); // P0 completes boxes 0 and 1
    expect(r2.ok && r2.claimed).toEqual([0, 1]);
    const after2 = (r2 as { state: GameState }).state;
    expect(getScores(after2)).toEqual([3, 0]);
    expect(after2.current).toBe(0);
    const r3 = applyMove(after2, { edge: 16 }); // box 3 left side: not a completion
    expect(r3.ok && r3.claimed).toEqual([]);
    expect((r3 as { state: GameState }).state.current).toBe(1);
  });

  it('one edge can complete two boxes and both go to the mover', () => {
    const s = play(newGame(), [0, 3, 12, 1, 4, 14]); // P0 to move
    const r = applyMove(s, { edge: 13 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.claimed).toEqual([0, 1]);
    expect(Array.from(r.state.boxes)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(getScores(r.state)).toEqual([2, 0]);
    expect(r.state.current).toBe(0);
  });

  it('a boundary edge completing a box claims exactly that one box', () => {
    // Box 8: top 8, bottom 11, left 22, right 23.
    const s = play(newGame(), [8, 11, 22]); // P0, P1, P0 -> P1 to move
    const r = applyMove(s, { edge: 23 });
    expect(r.ok && r.claimed).toEqual([8]);
    expect((r as { state: GameState }).state.boxes[8]).toBe(2);
  });

  it('does not claim a box when the 4th side comes from a neighbour with a missing side', () => {
    // Edge 3 is bottom of box 0 and top of box 3; draw 3 sides of box 0 except 3,
    // plus 3, but leave box 3 mostly empty -> only box 0 claimed.
    const s = play(newGame(), [0, 12, 13, 6]); // P0 0, P1 12, P0 13, P1 6; P0 to move
    const r = applyMove(s, { edge: 3 });
    expect(r.ok && r.claimed).toEqual([0]);
  });
});

describe('does not mutate input', () => {
  it('leaves the previous state intact and returns fresh arrays', () => {
    const s0 = newGame();
    const before = snapshot(s0);
    const r = applyMove(s0, { edge: 7 });
    expect(r.ok).toBe(true);
    expect(snapshot(s0)).toEqual(before);
    if (!r.ok) return;
    expect(r.state.edges).not.toBe(s0.edges);
    expect(r.state.boxes).not.toBe(s0.boxes);
    expect(s0.edges[7]).toBe(0);
    expect(r.state.edges[7]).toBe(1);
  });

  it('earlier states in a history remain valid after later moves (scoring included)', () => {
    const s0 = newGame();
    const states = [s0];
    for (const e of [0, 3, 12, 13]) {
      const r = applyMove(states[states.length - 1]!, { edge: e });
      if (!r.ok) throw new Error('unexpected');
      states.push(r.state);
    }
    expect(states.map((s) => getScores(s))).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 1],
    ]);
    expect(states.map((s) => Array.from(s.edges).filter((v) => v !== 0).length)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });
});

/**
 * A 3x3 position with every edge drawn except 23 (right side of box 8).
 * Boxes 0..7 are claimed. Built directly because it is a fixture for the
 * final-move behaviour, not a reachable-by-hand sequence.
 */
function almostFinished(boxOwners: number[], current: PlayerId): GameState {
  const base = newGame();
  const edges = new Uint8Array(base.edges.length).fill(1);
  edges[23] = 0;
  const boxes = new Uint8Array(9);
  boxOwners.forEach((o, i) => (boxes[i] = o));
  return { ...base, edges, boxes, current };
}

describe('final move, winner and draw', () => {
  it('the last box ends the game and decides the winner', () => {
    // Boxes 0-4 -> P0 (5 incl. none yet: 5 boxes), 5-7 -> P1 (3), box 8 open.
    const s = almostFinished([1, 1, 1, 1, 1, 2, 2, 2], 1);
    expect(isFinished(s)).toBe(false);
    expect(getWinner(s)).toBeNull();
    const r = applyMove(s, { edge: 23 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.claimed).toEqual([8]);
    expect(isFinished(r.state)).toBe(true);
    expect(getScores(r.state)).toEqual([5, 4]);
    expect(getWinner(r.state)).toBe(0);
  });

  it('the last box can swing the result to the mover', () => {
    const s = almostFinished([1, 1, 1, 1, 2, 2, 2, 2], 1);
    expect(getScores(s)).toEqual([4, 4]);
    const r = applyMove(s, { edge: 23 });
    expect(r.ok && getWinner(r.state)).toBe(1);
    expect(r.ok && getScores(r.state)).toEqual([4, 5]);
  });

  it('reports a draw on equal scores (3x4 board, 12 boxes)', () => {
    const base = newGame(3, 4);
    const lastEdge = verticalEdge(dims(3, 4), 3, 3); // right side of last box 11
    const edges = new Uint8Array(base.edges.length).fill(1);
    edges[lastEdge] = 0;
    const boxes = new Uint8Array(12);
    for (let i = 0; i < 11; i++) boxes[i] = i < 5 ? 1 : 2; // 5 vs 6
    const s: GameState = { ...base, edges, boxes, current: 0 };
    const r = applyMove(s, { edge: lastEdge });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getScores(r.state)).toEqual([6, 6]);
    expect(isFinished(r.state)).toBe(true);
    expect(getWinner(r.state)).toBe('draw');
  });

  it('rejects every move after completion with game-over', () => {
    const s = almostFinished([1, 1, 1, 1, 1, 2, 2, 2], 1);
    const done = (applyMove(s, { edge: 23 }) as { state: GameState }).state;
    const before = snapshot(done);
    for (const edge of [0, 23, 24, -1, 1.5]) {
      expect(applyMove(done, { edge })).toEqual({ ok: false, error: 'game-over' });
      expect(isLegalMove(done, { edge })).toBe(false);
    }
    expect(snapshot(done)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Independent reference model: re-implements the rules from dot coordinates
// with its own edge list, sharing no code with the core's index maths.
// ---------------------------------------------------------------------------

type DotPair = string;
const key = (r1: number, c1: number, r2: number, c2: number): DotPair =>
  `${r1},${c1}-${r2},${c2}`;

/** Edge list in the documented order, built with plain nested loops. */
function referenceEdges(w: number, h: number): DotPair[] {
  const list: DotPair[] = [];
  for (let r = 0; r <= h; r++) for (let c = 0; c < w; c++) list.push(key(r, c, r, c + 1));
  for (let r = 0; r < h; r++) for (let c = 0; c <= w; c++) list.push(key(r, c, r + 1, c));
  return list;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RefResult {
  edges: number[];
  boxes: number[];
  scores: [number, number];
  current: PlayerId;
  claimedPerMove: number[][];
  moves: number[];
}

/** Plays a random game on the reference model; returns the move list and final facts. */
function referenceGame(w: number, h: number, seed: number): RefResult {
  const list = referenceEdges(w, h);
  const rand = mulberry32(seed);
  const drawn = new Map<DotPair, number>(); // dot pair -> owner code
  const boxes = new Array<number>(w * h).fill(0);
  const remaining = list.map((_, i) => i);
  let current: PlayerId = 0;
  const claimedPerMove: number[][] = [];
  const moves: number[] = [];

  while (boxes.some((b) => b === 0)) {
    const pick = Math.floor(rand() * remaining.length);
    const idx = remaining.splice(pick, 1)[0]!;
    drawn.set(list[idx]!, current + 1);
    moves.push(idx);
    const claimed: number[] = [];
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const b = r * w + c;
        if (boxes[b] !== 0) continue;
        const sides = [
          key(r, c, r, c + 1),
          key(r + 1, c, r + 1, c + 1),
          key(r, c, r + 1, c),
          key(r, c + 1, r + 1, c + 1),
        ];
        if (sides.every((s) => drawn.has(s))) {
          boxes[b] = current + 1;
          claimed.push(b);
        }
      }
    }
    claimedPerMove.push(claimed);
    if (claimed.length === 0) current = current === 0 ? 1 : 0;
  }

  return {
    edges: list.map((k) => drawn.get(k) ?? 0),
    boxes,
    scores: [boxes.filter((b) => b === 1).length, boxes.filter((b) => b === 2).length],
    current,
    claimedPerMove,
    moves,
  };
}

describe('core agrees with an independent reference model', () => {
  it('edge indices map to the same dot pairs as the reference edge list', () => {
    for (const [w, h] of [[3, 3], [5, 5], [8, 8], [4, 7], [7, 3]] as const) {
      const list = referenceEdges(w, h);
      expect(list.length).toBe(edgeCount(dims(w, h)));
      list.forEach((expected, i) => {
        const [a, b] = edgeEndpoints(dims(w, h), i)!;
        expect(key(a.row, a.col, b.row, b.col)).toBe(expected);
      });
    }
  });

  const sizes: [number, number][] = [[3, 3], [5, 5], [8, 8], [3, 8], [8, 3], [4, 6]];
  for (const [w, h] of sizes) {
    it(`replays random full games on ${w}x${h}`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const ref = referenceGame(w, h, seed * 7919 + w * 31 + h);
        let s = newGame(w, h);
        const mover: PlayerId[] = [];

        ref.moves.forEach((edge, i) => {
          expect(isFinished(s)).toBe(false);
          mover.push(s.current);
          const r = applyMove(s, { edge });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(Array.from(r.claimed)).toEqual(ref.claimedPerMove[i]);
          s = r.state;

          // Invariants that must hold after every move:
          // 1. box owners are consistent with scores
          const [a, b] = getScores(s);
          expect(a + b).toBe(Array.from(s.boxes).filter((x) => x !== 0).length);
          // 2. a box is claimed iff all four sides are drawn
          // (checked via the reference at the end; here check count of drawn edges)
          expect(Array.from(s.edges).filter((x) => x !== 0).length).toBe(i + 1);
        });

        expect(Array.from(s.edges)).toEqual(ref.edges);
        expect(Array.from(s.boxes)).toEqual(ref.boxes);
        expect(getScores(s)).toEqual(ref.scores);
        expect(s.current).toBe(ref.current);
        expect(isFinished(s)).toBe(true);
        expect(s.boxes.length).toBe(boxCount(dims(w, h)));
        expect(ref.scores[0] + ref.scores[1]).toBe(w * h);

        const expectedWinner =
          ref.scores[0] === ref.scores[1] ? 'draw' : ref.scores[0] > ref.scores[1] ? 0 : 1;
        expect(getWinner(s)).toBe(expectedWinner);
        // The game cannot have ended before every edge needed for the last box was drawn,
        // and every edge is drawn once the last box is claimed (boundary-complete boards).
        expect(Array.from(s.edges).every((x) => x !== 0)).toBe(true);
      }
    });
  }

  it('produces both decisive games and draws across seeds on an even-box board', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 200 && outcomes.size < 3; seed++) {
      const ref = referenceGame(3, 4, seed);
      outcomes.add(
        ref.scores[0] === ref.scores[1] ? 'draw' : ref.scores[0] > ref.scores[1] ? 'p0' : 'p1',
      );
    }
    expect(outcomes).toEqual(new Set(['draw', 'p0', 'p1']));
  });

  it('a drawn game played through the core reports draw', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ref = referenceGame(3, 4, seed);
      if (ref.scores[0] !== ref.scores[1]) continue;
      let s = newGame(3, 4);
      for (const edge of ref.moves) s = (applyMove(s, { edge }) as { state: GameState }).state;
      expect(getScores(s)).toEqual([6, 6]);
      expect(getWinner(s)).toBe('draw');
      return;
    }
    throw new Error('no drawn game found');
  });
});

describe('helper sanity', () => {
  it('horizontal/vertical helpers agree with the hand-derived indices used above', () => {
    const d = dims(3, 3);
    expect(horizontalEdge(d, 1, 0)).toBe(3);
    expect(verticalEdge(d, 0, 1)).toBe(13);
    expect(verticalEdge(d, 2, 3)).toBe(23);
  });
});
