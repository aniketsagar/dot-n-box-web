export type PlayerId = 0 | 1;

/** Board size in boxes. The board has (width + 1) x (height + 1) dots. */
export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

export type GameConfig = Dimensions;

export const MIN_BOARD_SIZE = 3;
export const MAX_BOARD_SIZE = 8;
export const DEFAULT_BOARD_SIZE = 5;
export const MAX_NAME_LENGTH = 16;

/** 0 = unclaimed, 1 = drawn by player 0, 2 = drawn by player 1. */
export type EdgeOwner = 0 | 1 | 2;
/** Same encoding as EdgeOwner: 0 = unclaimed, otherwise player + 1. */
export type BoxOwner = EdgeOwner;

/**
 * Authoritative game state. Treat as immutable: `applyMove` returns a new
 * state and never modifies its input. The typed arrays are copied on write.
 *
 * Scores, winner and finished status are derived (see `getScores`,
 * `isFinished`, `getWinner`) so they cannot disagree with `boxes`.
 */
export interface GameState {
  readonly dimensions: Dimensions;
  readonly players: readonly [string, string];
  /** Per edge, indexed by the convention in edges.ts. Values are EdgeOwner. */
  readonly edges: Uint8Array;
  /** Per box (row * width + col). Values are BoxOwner. */
  readonly boxes: Uint8Array;
  readonly current: PlayerId;
}

export interface Move {
  readonly edge: number;
}

export type Result<T, E> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: E };

export type CreateGameError = 'invalid-dimensions' | 'invalid-player-name';
export type MoveError = 'game-over' | 'invalid-edge' | 'edge-taken';

export interface MoveApplied {
  readonly state: GameState;
  /** Box indices claimed by this move (0, 1 or 2 of them). */
  readonly claimed: readonly number[];
}
