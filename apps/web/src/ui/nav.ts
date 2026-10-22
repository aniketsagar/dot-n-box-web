/**
 * Keyboard navigation between board edges. Pure so it can be unit tested.
 *
 * Left/Right (and Home/End) walk edges in reading order (top to bottom, left
 * to right), which visits every edge. Up/Down jump to the nearest available
 * edge above/below, preferring the same column.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type NavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export function isNavKey(key: string): key is NavKey {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
}

/** Edge indices sorted by centre y, then x (ties broken by index). */
export function readingOrder(centers: readonly Point[]): number[] {
  return centers
    .map((_, i) => i)
    .sort((a, b) => centers[a]!.y - centers[b]!.y || centers[a]!.x - centers[b]!.x || a - b);
}

/**
 * Next edge to focus from `from` for `key`, or null if nothing is available
 * in that direction. `from` itself need not be available.
 */
export function navigate(
  centers: readonly Point[],
  order: readonly number[],
  from: number,
  key: NavKey,
  isAvailable: (edge: number) => boolean,
): number | null {
  switch (key) {
    case 'Home':
      return order.find(isAvailable) ?? null;
    case 'End':
      return [...order].reverse().find(isAvailable) ?? null;
    case 'ArrowRight':
    case 'ArrowLeft': {
      const pos = order.indexOf(from);
      if (pos === -1) return null;
      const step = key === 'ArrowRight' ? 1 : -1;
      for (let i = pos + step; i >= 0 && i < order.length; i += step) {
        const e = order[i]!;
        if (isAvailable(e)) return e;
      }
      return null;
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const origin = centers[from];
      if (!origin) return null;
      const dir = key === 'ArrowDown' ? 1 : -1;
      let best: number | null = null;
      let bestCost = Infinity;
      for (const e of order) {
        const c = centers[e]!;
        const dy = (c.y - origin.y) * dir;
        if (dy <= 0 || !isAvailable(e)) continue;
        const cost = 4 * Math.abs(c.x - origin.x) + dy;
        if (cost < bestCost) {
          best = e;
          bestCost = cost;
        }
      }
      return best;
    }
  }
}
