import { getScores, getWinner, isFinished, type GameState, type MoveError } from '@dnb/game-core';
import type { GameSession, SessionEvent } from '../session/index.ts';
import { createBoard } from './board.ts';
import { el, initial } from './dom.ts';

export interface GameViewOptions {
  onRematch(): void;
  onMenu(): void;
}

const REJECTION: Record<MoveError, string> = {
  'edge-taken': 'That line is already drawn.',
  'invalid-edge': 'That is not a valid line.',
  'game-over': 'The game is over.',
};

/** Render a game for `session`. Returns a cleanup function that disposes the session. */
export function renderGame(
  root: HTMLElement,
  session: GameSession,
  options: GameViewOptions,
): () => void {
  const first = session.getState();

  const board = createBoard(first, (edge) => session.submitMove({ edge }));

  const playerCard = (index: 0 | 1) => {
    const score = el('span', { class: 'score' }, '0');
    const turn = el('span', { class: 'turn' }, 'to move');
    const card = el(
      'div',
      { class: `player p${index}` },
      el('span', { class: 'badge', 'aria-hidden': 'true' }, initial(first.players[index])),
      el('span', { class: 'name' }, first.players[index]),
      turn,
      score,
    );
    return { card, score, turn };
  };
  const cards = [playerCard(0), playerCard(1)] as const;

  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const resultTitle = el('h2', { tabindex: -1 });
  const resultText = el('p');
  const rematch = el('button', { class: 'primary', type: 'button' }, 'Play again');
  const newPlayers = el('button', { class: 'secondary', type: 'button' }, 'New players');
  const result = el(
    'section',
    { class: 'result', hidden: true, 'aria-labelledby': 'result-title' },
    resultTitle,
    resultText,
    el('div', { class: 'actions' }, rematch, newPlayers),
  );
  resultTitle.id = 'result-title';

  const menu = el('button', { class: 'link', type: 'button' }, '← Menu');
  menu.addEventListener('click', () => {
    const state = session.getState();
    const started = state.edges.some((v) => v !== 0);
    if (!started || isFinished(state) || confirm('Leave this game? Progress will be lost.')) {
      options.onMenu();
    }
  });
  rematch.addEventListener('click', options.onRematch);
  newPlayers.addEventListener('click', options.onMenu);

  root.replaceChildren(
    el(
      'main',
      { class: 'game' },
      el('header', { class: 'topbar' }, menu),
      el('section', { class: 'scoreboard', 'aria-label': 'Scoreboard' }, cards[0].card, cards[1].card),
      status,
      el('div', { class: 'board-wrap' }, board.element),
      result,
    ),
  );

  function render(state: GameState, event?: Extract<SessionEvent, { type: 'move-accepted' }>): void {
    board.update(state, event?.move.edge);
    const scores = getScores(state);
    const finished = isFinished(state);
    for (const i of [0, 1] as const) {
      cards[i].score.textContent = String(scores[i]);
      const active = !finished && state.current === i;
      cards[i].card.classList.toggle('active', active);
      cards[i].turn.hidden = !active;
      if (active) cards[i].card.setAttribute('aria-current', 'true');
      else cards[i].card.removeAttribute('aria-current');
    }

    const mover = event ? state.players[event.player] : undefined;
    const n = event?.claimed.length ?? 0;
    if (finished) {
      status.textContent = 'Game over.';
      const winner = getWinner(state);
      resultTitle.textContent = winner === 'draw' ? "It's a draw!" : `${state.players[winner ?? 0]} wins!`;
      resultText.textContent = `${state.players[0]} ${scores[0]} – ${scores[1]} ${state.players[1]}`;
      result.hidden = false;
      rematch.focus();
    } else if (n > 0) {
      status.textContent = `${mover} completed ${n === 1 ? 'a box' : '2 boxes'} and goes again.`;
    } else {
      status.textContent = `${state.players[state.current]}'s turn.`;
    }
  }

  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'move-accepted') render(event.state, event);
    else if (event.type === 'move-rejected') status.textContent = REJECTION[event.reason];
  });
  render(first);

  return () => {
    unsubscribe();
    session.dispose();
  };
}
