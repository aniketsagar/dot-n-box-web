import { applyMove, type GameState, type Move } from '@dnb/game-core';
import type {
  ConnectionStatus,
  GameSession,
  SessionEvent,
  SessionListener,
  Unsubscribe,
} from './types.ts';

/** Both players share one device; every move is validated by the game core. */
export class LocalSession implements GameSession {
  private state: GameState;
  private status: ConnectionStatus = 'connected';
  // One entry per subscribe() call, so subscribing the same function twice
  // yields two independent subscriptions.
  private listeners: { readonly fn: SessionListener }[] = [];

  constructor(initial: GameState) {
    this.state = initial;
  }

  getState(): GameState {
    return this.state;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  submitMove(move: Move): void {
    if (this.status === 'closed') return;
    const player = this.state.current;
    const result = applyMove(this.state, move);
    if (!result.ok) {
      this.emit({ type: 'move-rejected', move, reason: result.error });
      return;
    }
    this.state = result.state;
    this.emit({
      type: 'move-accepted',
      move,
      player,
      claimed: result.claimed,
      state: result.state,
    });
  }

  subscribe(listener: SessionListener): Unsubscribe {
    if (this.status === 'closed') return () => {};
    const entry = { fn: listener };
    this.listeners.push(entry);
    return () => {
      const i = this.listeners.indexOf(entry);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  dispose(): void {
    if (this.status === 'closed') return;
    this.status = 'closed';
    this.emit({ type: 'connection', status: 'closed' });
    this.listeners = [];
  }

  private emit(event: SessionEvent): void {
    // Snapshot so (un)subscribing inside a listener cannot disturb this round,
    // but skip listeners removed earlier in the same round.
    for (const entry of [...this.listeners]) {
      if (!this.listeners.includes(entry)) continue;
      try {
        entry.fn(event);
      } catch (error) {
        console.error('Session listener threw:', error);
      }
    }
  }
}
