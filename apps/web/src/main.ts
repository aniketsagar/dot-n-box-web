import { createGame } from '@dnb/game-core';

const app = document.getElementById('app');
if (app) {
  const game = createGame({ width: 5, height: 5 }, ['Player 1', 'Player 2']);
  app.textContent = game.ok ? 'Dots & Boxes' : game.error;
}
