import {
  boxCount,
  edgeCount,
  edgeEndpoints,
  edgeInfo,
  isFinished,
  type GameState,
} from '@dnb/game-core';
import { initial, svgEl } from './dom.ts';
import { isNavKey, navigate, readingOrder, type Point } from './nav.ts';

const CELL = 100;
const PAD = 30;
/** Hit areas stop short of the dots so neighbouring edges do not fight over corners. */
const HIT_INSET = 14;
const HIT_WIDTH = 52;

export interface Board {
  readonly element: SVGSVGElement;
  /** Render `state`. `fresh` marks the edge just drawn, for its animation. */
  update(state: GameState, fresh?: number): void;
}

const ownerClass = (owner: number): string => (owner === 1 ? 'p0' : 'p1');

export function createBoard(initialState: GameState, onEdge: (edge: number) => void): Board {
  const d = initialState.dimensions;
  const total = edgeCount(d);
  let state = initialState;
  let focusEdge: number | null = null;
  let freshEdge: number | null = null;

  const svg = svgEl('svg', {
    class: 'board',
    viewBox: `0 0 ${d.width * CELL + PAD * 2} ${d.height * CELL + PAD * 2}`,
    role: 'group',
    'aria-label': 'Game board',
  });

  // Boxes (drawn first, underneath).
  const boxRects: SVGRectElement[] = [];
  const boxLabels: SVGTextElement[] = [];
  for (let b = 0; b < boxCount(d); b++) {
    const x = PAD + (b % d.width) * CELL;
    const y = PAD + Math.floor(b / d.width) * CELL;
    const rect = svgEl('rect', { class: 'box', x, y, width: CELL, height: CELL });
    const label = svgEl('text', { class: 'box-label', x: x + CELL / 2, y: y + CELL / 2 });
    boxRects.push(rect);
    boxLabels.push(label);
    svg.append(rect, label);
  }

  // Edges.
  const centers: Point[] = [];
  const groups: SVGGElement[] = [];
  for (let e = 0; e < total; e++) {
    const [a, b] = edgeEndpoints(d, e)!;
    const x1 = PAD + a.col * CELL;
    const y1 = PAD + a.row * CELL;
    const x2 = PAD + b.col * CELL;
    const y2 = PAD + b.row * CELL;
    const ux = Math.sign(x2 - x1);
    const uy = Math.sign(y2 - y1);
    centers.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
    const g = svgEl(
      'g',
      { class: 'edge', 'data-edge': e, role: 'button', tabindex: -1 },
      svgEl('line', { class: 'track', x1, y1, x2, y2 }),
      svgEl('line', { class: 'stroke', x1, y1, x2, y2 }),
      svgEl('line', {
        class: 'hit',
        x1: x1 + ux * HIT_INSET,
        y1: y1 + uy * HIT_INSET,
        x2: x2 - ux * HIT_INSET,
        y2: y2 - uy * HIT_INSET,
        'stroke-width': HIT_WIDTH,
      }),
    );
    groups.push(g);
    svg.append(g);
  }

  // Dots (on top, not interactive).
  for (let r = 0; r <= d.height; r++) {
    for (let c = 0; c <= d.width; c++) {
      svg.append(svgEl('circle', { class: 'dot', cx: PAD + c * CELL, cy: PAD + r * CELL, r: 7 }));
    }
  }

  const order = readingOrder(centers);
  const available = (e: number): boolean => !isFinished(state) && state.edges[e] === 0;

  function edgeLabel(e: number): string {
    const info = edgeInfo(d, e)!;
    const kind = info.orientation === 'h' ? 'Horizontal' : 'Vertical';
    const owner = state.edges[e] ?? 0;
    const base = `${kind} line, row ${info.row + 1}, column ${info.col + 1}`;
    return owner === 0 ? base : `${base}, drawn by ${state.players[owner - 1]}`;
  }

  function syncTabStops(): void {
    groups.forEach((g, e) => g.setAttribute('tabindex', e === focusEdge ? '0' : '-1'));
  }

  function moveFocusTo(e: number, focus: boolean): void {
    focusEdge = e;
    syncTabStops();
    if (focus) groups[e]?.focus({ preventScroll: true });
  }

  function update(next: GameState, fresh?: number): void {
    state = next;
    const hadFocus = svg.contains(document.activeElement);

    svg.setAttribute('class', `board turn-${ownerClass(next.current + 1)}`);
    if (isFinished(next)) svg.classList.add('finished');

    if (freshEdge !== null) groups[freshEdge]?.classList.remove('fresh');
    freshEdge = fresh ?? null;

    for (let e = 0; e < total; e++) {
      const owner = next.edges[e] ?? 0;
      const g = groups[e]!;
      g.setAttribute('class', owner === 0 ? 'edge' : `edge drawn ${ownerClass(owner)}`);
      g.setAttribute('aria-label', edgeLabel(e));
      if (owner === 0 && !isFinished(next)) g.removeAttribute('aria-disabled');
      else g.setAttribute('aria-disabled', 'true');
    }
    if (fresh !== undefined) groups[fresh]?.classList.add('fresh');

    for (let b = 0; b < boxRects.length; b++) {
      const owner = next.boxes[b] ?? 0;
      boxRects[b]!.setAttribute('class', owner === 0 ? 'box' : `box claimed ${ownerClass(owner)}`);
      boxLabels[b]!.setAttribute('class', owner === 0 ? 'box-label' : `box-label ${ownerClass(owner)}`);
      boxLabels[b]!.textContent = owner === 0 ? '' : initial(next.players[owner - 1] ?? '');
    }

    // Roving tabindex: keep exactly one available edge tabbable.
    if (isFinished(next)) {
      focusEdge = null;
    } else if (focusEdge === null || !available(focusEdge)) {
      const from = focusEdge;
      focusEdge =
        (from !== null
          ? (navigate(centers, order, from, 'ArrowRight', available) ??
            navigate(centers, order, from, 'ArrowLeft', available))
          : null) ?? navigate(centers, order, 0, 'Home', available);
    }
    syncTabStops();
    if (hadFocus && focusEdge !== null) groups[focusEdge]?.focus({ preventScroll: true });
  }

  const edgeOf = (target: EventTarget | null): number | null => {
    const g = target instanceof Element ? target.closest('[data-edge]') : null;
    return g ? Number(g.getAttribute('data-edge')) : null;
  };

  svg.addEventListener('click', (ev) => {
    const e = edgeOf(ev.target);
    if (e !== null && available(e)) onEdge(e);
  });

  svg.addEventListener('keydown', (ev) => {
    const e = edgeOf(ev.target);
    if (e === null) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (available(e)) onEdge(e);
    } else if (isNavKey(ev.key)) {
      ev.preventDefault();
      const next = navigate(centers, order, e, ev.key, available);
      if (next !== null) moveFocusTo(next, true);
    }
  });

  update(initialState);
  return { element: svg, update };
}
