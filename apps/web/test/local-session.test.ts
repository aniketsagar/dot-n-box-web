import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGame,
  edgeCount,
  getScores,
  isFinished,
  type GameState,
} from '@dnb/game-core';
import { LocalSession, type SessionEvent } from '../src/session/index.ts';

function newState(width = 3, height = 3): GameState {
  const r = createGame({ width, height }, ['Ann', 'Bob']);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function newSession(): LocalSession {
  return new LocalSession(newState());
}

function record(session: LocalSession): SessionEvent[] {
  const events: SessionEvent[] = [];
  session.subscribe((e) => events.push(e));
  return events;
}

afterEach(() => vi.restoreAllMocks());

describe('state access', () => {
  it('returns the initial state and a connected status', () => {
    const initial = newState();
    const s = new LocalSession(initial);
    expect(s.getState()).toBe(initial);
    expect(s.getStatus()).toBe('connected');
  });

  it('does not notify on subscribe', () => {
    const s = newSession();
    const events = record(s);
    expect(events).toEqual([]);
  });
});

describe('accepted moves', () => {
  it('updates state before notifying and reports mover and claims', () => {
    const s = newSession();
    const seen: { event: SessionEvent; current: GameState }[] = [];
    s.subscribe((event) => seen.push({ event, current: s.getState() }));

    s.submitMove({ edge: 0 });

    expect(seen).toHaveLength(1);
    const { event, current } = seen[0]!;
    expect(event.type).toBe('move-accepted');
    if (event.type !== 'move-accepted') return;
    expect(event.player).toBe(0);
    expect(event.move).toEqual({ edge: 0 });
    expect(event.claimed).toEqual([]);
    expect(event.state).toBe(current); // listener already sees the new state
    expect(s.getState().edges[0]).toBe(1);
    expect(s.getState().current).toBe(1);
  });

  it('reports claimed boxes and keeps the turn (3x3: box 0 = edges 0, 3, 12, 13)', () => {
    const s = newSession();
    const events = record(s);
    for (const edge of [0, 3, 12, 13]) s.submitMove({ edge });

    expect(events.map((e) => e.type)).toEqual(Array(4).fill('move-accepted'));
    const last = events[3]!;
    if (last.type !== 'move-accepted') throw new Error('unexpected');
    expect(last.player).toBe(1);
    expect(last.claimed).toEqual([0]);
    expect(getScores(s.getState())).toEqual([0, 1]);
    expect(s.getState().current).toBe(1);
  });

  it('reaches game over when every edge is drawn', () => {
    const s = newSession();
    const events = record(s);
    for (let e = 0; e < edgeCount(s.getState().dimensions); e++) s.submitMove({ edge: e });
    expect(isFinished(s.getState())).toBe(true);
    expect(events.every((e) => e.type === 'move-accepted')).toBe(true);
    expect(events).toHaveLength(24);
    const [a, b] = getScores(s.getState());
    expect(a + b).toBe(9);
  });
});

describe('rejected moves', () => {
  it.each([
    ['edge-taken', { edge: 5 }],
    ['invalid-edge', { edge: 99 }],
    ['invalid-edge', { edge: Number.NaN }],
  ] as const)('%s leaves state untouched and emits move-rejected', (reason, move) => {
    const s = newSession();
    s.submitMove({ edge: 5 });
    const before = s.getState();
    const events = record(s);

    s.submitMove(move);

    expect(s.getState()).toBe(before); // same reference: nothing replaced
    expect(events).toEqual([{ type: 'move-rejected', move, reason }]);
  });

  it('rejects moves after the game is over', () => {
    const s = newSession();
    for (let e = 0; e < 24; e++) s.submitMove({ edge: e });
    const finished = s.getState();
    const events = record(s);
    s.submitMove({ edge: 0 });
    expect(events).toEqual([
      { type: 'move-rejected', move: { edge: 0 }, reason: 'game-over' },
    ]);
    expect(s.getState()).toBe(finished);
  });
});

describe('subscribers', () => {
  it('notifies every subscriber, in subscription order, with the same event', () => {
    const s = newSession();
    const order: string[] = [];
    const a: SessionEvent[] = [];
    const b: SessionEvent[] = [];
    s.subscribe((e) => (order.push('a'), a.push(e)));
    s.subscribe((e) => (order.push('b'), b.push(e)));
    s.submitMove({ edge: 1 });
    expect(order).toEqual(['a', 'b']);
    expect(a).toHaveLength(1);
    expect(a[0]).toBe(b[0]);
  });

  it('stops notifying after unsubscribe, without affecting others', () => {
    const s = newSession();
    const a: SessionEvent[] = [];
    const b: SessionEvent[] = [];
    const offA = s.subscribe((e) => a.push(e));
    s.subscribe((e) => b.push(e));
    s.submitMove({ edge: 0 });
    offA();
    s.submitMove({ edge: 1 });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });

  it('unsubscribe is idempotent', () => {
    const s = newSession();
    const events: SessionEvent[] = [];
    const off = s.subscribe((e) => events.push(e));
    off();
    expect(() => off()).not.toThrow();
    s.submitMove({ edge: 0 });
    expect(events).toEqual([]);
  });

  it('treats subscribing the same function twice as two subscriptions', () => {
    const s = newSession();
    const fn = vi.fn();
    const off1 = s.subscribe(fn);
    s.subscribe(fn);
    s.submitMove({ edge: 0 });
    expect(fn).toHaveBeenCalledTimes(2);
    off1();
    s.submitMove({ edge: 1 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('a listener removed by an earlier listener in the same round is skipped', () => {
    const s = newSession();
    const second = vi.fn();
    let offSecond: () => void = () => {};
    s.subscribe(() => offSecond());
    offSecond = s.subscribe(second);
    s.submitMove({ edge: 0 });
    expect(second).not.toHaveBeenCalled();
  });

  it('a listener added during a round is not called until the next one', () => {
    const s = newSession();
    const late = vi.fn();
    let added = false;
    s.subscribe(() => {
      if (!added) {
        added = true;
        s.subscribe(late);
      }
    });
    s.submitMove({ edge: 0 });
    expect(late).not.toHaveBeenCalled();
    s.submitMove({ edge: 1 });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener does not block others or corrupt state', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = newSession();
    const after = vi.fn();
    s.subscribe(() => {
      throw new Error('boom');
    });
    s.subscribe(after);
    s.submitMove({ edge: 0 });
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(s.getState().edges[0]).toBe(1);
  });
});

describe('disposal', () => {
  it('closes the session and tells subscribers once', () => {
    const s = newSession();
    const events = record(s);
    s.dispose();
    expect(s.getStatus()).toBe('closed');
    expect(events).toEqual([{ type: 'connection', status: 'closed' }]);
  });

  it('is idempotent', () => {
    const s = newSession();
    const events = record(s);
    s.dispose();
    s.dispose();
    expect(events).toHaveLength(1);
  });

  it('keeps the last state readable', () => {
    const s = newSession();
    s.submitMove({ edge: 0 });
    const last = s.getState();
    s.dispose();
    expect(s.getState()).toBe(last);
  });

  it('ignores moves afterwards: no state change, no events', () => {
    const s = newSession();
    const events = record(s);
    s.dispose();
    const before = s.getState();
    events.length = 0;
    s.submitMove({ edge: 0 });
    s.submitMove({ edge: 999 });
    expect(s.getState()).toBe(before);
    expect(events).toEqual([]);
  });

  it('never calls listeners subscribed afterwards, and unsubscribe is safe', () => {
    const s = newSession();
    s.dispose();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    expect(() => off()).not.toThrow();
    s.submitMove({ edge: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribing after dispose is safe', () => {
    const s = newSession();
    const off = s.subscribe(() => {});
    s.dispose();
    expect(() => off()).not.toThrow();
  });

  it('a move submitted from the closing notification is ignored', () => {
    const s = newSession();
    const before = s.getState();
    s.subscribe((e) => {
      if (e.type === 'connection') s.submitMove({ edge: 0 });
    });
    s.dispose();
    expect(s.getState()).toBe(before);
  });
});
