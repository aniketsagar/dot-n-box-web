import type { GameState, Move, MoveError, PlayerId } from '@dnb/game-core';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export type SessionEvent =
  /** The move was applied. `state` is already what `getState()` returns. */
  | {
      readonly type: 'move-accepted';
      readonly move: Move;
      readonly player: PlayerId;
      readonly claimed: readonly number[];
      readonly state: GameState;
    }
  /** The move was refused; the state did not change. */
  | { readonly type: 'move-rejected'; readonly move: Move; readonly reason: MoveError }
  | { readonly type: 'connection'; readonly status: ConnectionStatus };

export type SessionListener = (event: SessionEvent) => void;
export type Unsubscribe = () => void;

/**
 * What the UI knows about a game. Transport-agnostic: a local session
 * answers synchronously, a future remote one will answer later, so callers
 * must learn the outcome of `submitMove` from events, not from a return value.
 *
 * After `dispose()`:
 *  - `getStatus()` is 'closed' and `getState()` still returns the last state;
 *  - listeners get one final `connection: closed` event, then are dropped;
 *  - `submitMove` does nothing (no state change, no events);
 *  - `subscribe` returns a no-op unsubscribe and never calls the listener;
 *  - calling `dispose()` again is a no-op.
 */
export interface GameSession {
  getState(): GameState;
  getStatus(): ConnectionStatus;
  submitMove(move: Move): void;
  subscribe(listener: SessionListener): Unsubscribe;
  dispose(): void;
}
