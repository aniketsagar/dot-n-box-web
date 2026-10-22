import { DEFAULT_BOARD_SIZE, MAX_BOARD_SIZE, MAX_NAME_LENGTH, MIN_BOARD_SIZE } from '@dnb/game-core';
import { el } from './dom.ts';

export interface Settings {
  /** Raw text from the inputs; blank means "use the default name". */
  readonly names: readonly [string, string];
  readonly size: number;
}

export const DEFAULT_SETTINGS: Settings = { names: ['', ''], size: DEFAULT_BOARD_SIZE };

/** `onStart` returns an error message to show, or null if the game started. */
export function renderHome(
  root: HTMLElement,
  settings: Settings,
  onStart: (settings: Settings) => string | null,
): void {
  const nameInput = (index: 0 | 1) =>
    el('input', {
      name: `p${index}`,
      type: 'text',
      maxlength: MAX_NAME_LENGTH,
      autocomplete: 'off',
      autocapitalize: 'words',
      placeholder: `Player ${index + 1}`,
      value: settings.names[index],
    });
  const p0 = nameInput(0);
  const p1 = nameInput(1);

  const field = (index: 0 | 1, input: HTMLInputElement) =>
    el(
      'label',
      { class: `field p${index}` },
      el('span', { class: 'swatch', 'aria-hidden': 'true' }),
      el('span', { class: 'field-label' }, `Player ${index + 1} name`),
      input,
    );

  const chips = el('div', { class: 'chips' });
  for (let n = MIN_BOARD_SIZE; n <= MAX_BOARD_SIZE; n++) {
    chips.append(
      el(
        'label',
        { class: 'chip' },
        el('input', {
          type: 'radio',
          name: 'size',
          value: n,
          checked: n === settings.size,
          class: 'sr-only',
        }),
        el('span', {}, `${n}×${n}`),
      ),
    );
  }

  const error = el('p', { class: 'error', role: 'alert' });
  const form = el(
    'form',
    { class: 'home-form', novalidate: true },
    el('fieldset', {}, el('legend', {}, 'Players'), field(0, p0), field(1, p1)),
    el('fieldset', {}, el('legend', {}, 'Board size'), chips),
    error,
    el('button', { class: 'primary', type: 'submit' }, 'Start game'),
  );

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const size = Number(form.querySelector<HTMLInputElement>('input[name="size"]:checked')?.value);
    error.textContent =
      onStart({ names: [p0.value, p1.value], size: Number.isFinite(size) ? size : settings.size }) ??
      '';
  });

  root.replaceChildren(
    el(
      'main',
      { class: 'home' },
      el('h1', {}, 'Dots & Boxes'),
      el(
        'p',
        { class: 'lede' },
        'Two players, one screen. Take turns drawing lines. Close a box to claim it and go again.',
      ),
      form,
    ),
  );
  p0.focus();
}
