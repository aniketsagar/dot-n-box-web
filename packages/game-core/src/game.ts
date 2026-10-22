import { boxCount, boxEdges, edgeBoxes, edgeCount, isValidEdge } from './edges.ts';
import {
  MAX_BOARD_SIZE,
  MAX_NAME_LENGTH,
  MIN_BOARD_SIZE,
  type CreateGameError,
  type EdgeOwner,
  type GameConfig,
  type GameState,
  type Move,
  type MoveApplied,
  type MoveError,
  type PlayerId,
  type Result,
} from './types.ts';

function ownerCode(player: PlayerId): EdgeOwner {
  return (player + 1) as EdgeOwner;
}

function isBoardSize(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= MIN_BOARD_SIZE && (n as number) <= MAX_BOARD_SIZE;
}

function normalizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

/** Create a new game. Player 0 moves first. Names are trimmed and validated. */
export function createGame(
  config: GameConfig,
  players: readonly [string, string],
): Result<{ state: GameState }, CreateGameError> {
  if (
    typeof config !== 'object' ||
    config === null ||
    !isBoardSize(config.width) ||
    !isBoardSize(config.height)
  ) {
    return { ok: false, error: 'invalid-dimensions' };
  }
  const name0 = normalizeName(players?.[0]);
  const name1 = normalizeName(players?.[1]);
  if (name0 === null || name1 === null) return { ok: false, error: 'invalid-player-name' };

  const dimensions = { width: config.width, height: config.height };
  return {
    ok: true,
    state: {
      dimensions,
      players: [name0, name1],
      edges: new Uint8Array(edgeCount(dimensions)),
      boxes: new Uint8Array(boxCount(dimensions)),
      current: 0,
    },
  };
}

export function isLegalMove(state: GameState, move: Move): boolean {
  return validateMove(state, move) === null;
}

function validateMove(state: GameState, move: Move): MoveError | null {
  if (isFinished(state)) return 'game-over';
  const edge: unknown = move?.edge;
  if (!isValidEdge(state.dimensions, edge)) return 'invalid-edge';
  if (state.edges[edge] !== 0) return 'edge-taken';
  return null;
}

/**
 * Apply a move by the current player. Pure: on success returns a new state
 * (typed arrays copied); on failure the input is untouched.
 *
 * A move that completes at least one box claims it and keeps the turn.
 */
export function applyMove(state: GameState, move: Move): Result<MoveApplied, MoveError> {
  const error = validateMove(state, move);
  if (error !== null) return { ok: false, error };

  const d = state.dimensions;
  const edge = move.edge;
  const edges = state.edges.slice();
  const boxes = state.boxes.slice();
  edges[edge] = ownerCode(state.current);

  const claimed: number[] = [];
  for (const box of edgeBoxes(d, edge)) {
    const sides = boxEdges(d, box);
    if (sides && sides.every((e) => edges[e] !== 0)) {
      boxes[box] = ownerCode(state.current);
      claimed.push(box);
    }
  }

  const current: PlayerId = claimed.length > 0 ? state.current : state.current === 0 ? 1 : 0;
  return {
    ok: true,
    state: { dimensions: d, players: state.players, edges, boxes, current },
    claimed,
  };
}

/** Boxes owned by each player, derived from box ownership. */
export function getScores(state: GameState): [number, number] {
  const scores: [number, number] = [0, 0];
  for (const owner of state.boxes) {
    if (owner === 1) scores[0]++;
    else if (owner === 2) scores[1]++;
  }
  return scores;
}

/** The game ends when every box is claimed. */
export function isFinished(state: GameState): boolean {
  return state.boxes.every((owner) => owner !== 0);
}

/** Winning player, 'draw' on equal scores, or null while the game is in progress. */
export function getWinner(state: GameState): PlayerId | 'draw' | null {
  if (!isFinished(state)) return null;
  const [a, b] = getScores(state);
  return a === b ? 'draw' : a > b ? 0 : 1;
}
