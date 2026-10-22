import { describe, expect, it } from 'vitest';
import { edgeCount, edgeEndpoints } from '@dnb/game-core';
import { isNavKey, navigate, readingOrder, type Point } from '../src/ui/nav.ts';

// 3x3 board, edge centres in cell units (dot spacing 1).
const d = { width: 3, height: 3 };
const centers: Point[] = Array.from({ length: edgeCount(d) }, (_, e) => {
  const [a, b] = edgeEndpoints(d, e)!;
  return { x: (a.col + b.col) / 2, y: (a.row + b.row) / 2 };
});
const order = readingOrder(centers);
const all = () => true;

describe('readingOrder', () => {
  it('visits every edge once, row by row', () => {
    expect(new Set(order).size).toBe(24);
    // First row of horizontals (0,1,2), then first row of verticals (12..15), then horizontals row 1.
    expect(order.slice(0, 11)).toEqual([0, 1, 2, 12, 13, 14, 15, 3, 4, 5, 16]);
    expect(order[order.length - 1]).toBe(11); // bottom row of horizontals is lowest
  });
});

describe('navigate', () => {
  it('Left/Right walk reading order and stop at the ends', () => {
    expect(navigate(centers, order, 2, 'ArrowRight', all)).toBe(12);
    expect(navigate(centers, order, 12, 'ArrowLeft', all)).toBe(2);
    expect(navigate(centers, order, 11, 'ArrowRight', all)).toBeNull();
    expect(navigate(centers, order, 0, 'ArrowLeft', all)).toBeNull();
  });

  it('skips unavailable edges', () => {
    const taken = new Set([12, 13]);
    expect(navigate(centers, order, 2, 'ArrowRight', (e) => !taken.has(e))).toBe(14);
  });

  it('Up/Down stay in the same column when possible', () => {
    expect(navigate(centers, order, 0, 'ArrowDown', all)).toBe(3); // h(0,0) -> h(1,0)
    expect(navigate(centers, order, 3, 'ArrowUp', all)).toBe(0);
    expect(navigate(centers, order, 12, 'ArrowDown', all)).toBe(16); // v(0,0) -> v(1,0)
    expect(navigate(centers, order, 0, 'ArrowUp', all)).toBeNull();
    expect(navigate(centers, order, 11, 'ArrowDown', all)).toBeNull();
  });

  it('Up/Down skip a taken edge in the column', () => {
    expect(navigate(centers, order, 0, 'ArrowDown', (e) => e !== 3)).toBe(6);
  });

  it('Home/End find first/last available', () => {
    expect(navigate(centers, order, 5, 'Home', all)).toBe(0);
    expect(navigate(centers, order, 5, 'End', all)).toBe(11);
    expect(navigate(centers, order, 5, 'Home', (e) => e > 4)).toBe(12);
    expect(navigate(centers, order, 5, 'Home', () => false)).toBeNull();
  });

  it('returns null for an unknown origin', () => {
    expect(navigate(centers, order, 99, 'ArrowRight', all)).toBeNull();
    expect(navigate(centers, order, 99, 'ArrowDown', all)).toBeNull();
  });
});

describe('isNavKey', () => {
  it('recognises navigation keys only', () => {
    expect(isNavKey('ArrowUp')).toBe(true);
    expect(isNavKey('Home')).toBe(true);
    expect(isNavKey('a')).toBe(false);
    expect(isNavKey('Enter')).toBe(false);
  });
});
