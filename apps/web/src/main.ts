import './styles.css';
import { createGame } from '@dnb/game-core';
import { LocalSession } from './session/index.ts';
import { renderGame } from './ui/game.ts';
import { DEFAULT_SETTINGS, renderHome, type Settings } from './ui/home.ts';

const app = document.getElementById('app')!;
let settings: Settings = DEFAULT_SETTINGS;
let cleanup: (() => void) | null = null;

function leave(): void {
  cleanup?.();
  cleanup = null;
}

function showHome(): void {
  leave();
  renderHome(app, settings, start);
}

/** Returns an error message for the home screen, or null once the game has started. */
function start(next: Settings): string | null {
  const names: [string, string] = [
    next.names[0].trim() || 'Player 1',
    next.names[1].trim() || 'Player 2',
  ];
  if (names[0].toLowerCase() === names[1].toLowerCase()) {
    return 'Please give the players different names.';
  }
  const created = createGame({ width: next.size, height: next.size }, names);
  if (!created.ok) {
    return created.error === 'invalid-player-name'
      ? 'Names must be 1–16 characters.'
      : 'Choose a board size from 3×3 to 8×8.';
  }
  settings = next;
  leave();
  cleanup = renderGame(app, new LocalSession(created.state), {
    onRematch: () => start(settings),
    onMenu: showHome,
  });
  return null;
}

showHome();
