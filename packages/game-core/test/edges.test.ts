import { describe, expect, it } from 'vitest';
import {
  boxCount,
  boxEdges,
  edgeBoxes,
  edgeCount,
  edgeEndpoints,
  edgeInfo,
  horizontalEdge,
  horizontalEdgeCount,
  isValidEdge,
  verticalEdge,
  verticalEdgeCount,
  type Dimensions,
} from '../src/index.ts';

const dims = (width: number, height: number): Dimensions => ({ width, height });

// Counts derived by hand from the spec formulas:
//   horizontal = W * (H + 1), vertical = (W + 1) * H
const COUNTS: [number, number, number, number, number][] = [
  // W, H, horizontal, vertical, boxes
  [3, 3, 12, 12, 9],
  [5, 5, 30, 30, 25],
  [8, 8, 72, 72, 64],
  [4, 3, 16, 15, 12],
  [3, 4, 15, 16, 12],
];

describe('edge counts', () => {
  it.each(COUNTS)('%i x %i boxes', (w, h, hor, ver, boxes) => {
    const d = dims(w, h);
    expect(horizontalEdgeCount(d)).toBe(hor);
    expect(verticalEdgeCount(d)).toBe(ver);
    expect(edgeCount(d)).toBe(hor + ver);
    expect(boxCount(d)).toBe(boxes);
  });
});

describe('index formulas at the boundaries', () => {
  // Hand-computed. 3x3: horizontal 0..11, vertical 12..23.
  // 4x3 (W=4, H=3): horizontal 0..15, vertical 16..30.
  const cases: [string, Dimensions, 'h' | 'v', number, number, number][] = [
    ['3x3 first horizontal', dims(3, 3), 'h', 0, 0, 0],
    ['3x3 last horizontal row, last col', dims(3, 3), 'h', 3, 2, 11],
    ['3x3 first vertical', dims(3, 3), 'v', 0, 0, 12],
    ['3x3 first row last vertical col', dims(3, 3), 'v', 0, 3, 15],
    ['3x3 second vertical row first col', dims(3, 3), 'v', 1, 0, 16],
    ['3x3 last vertical', dims(3, 3), 'v', 2, 3, 23],
    ['5x5 first vertical', dims(5, 5), 'v', 0, 0, 30],
    ['5x5 last vertical', dims(5, 5), 'v', 4, 5, 59],
    ['4x3 last horizontal', dims(4, 3), 'h', 3, 3, 15],
    ['4x3 first vertical', dims(4, 3), 'v', 0, 0, 16],
    ['4x3 last vertical', dims(4, 3), 'v', 2, 4, 30],
  ];

  it.each(cases)('%s', (_name, d, orientation, row, col, expected) => {
    const index = orientation === 'h' ? horizontalEdge(d, row, col) : verticalEdge(d, row, col);
    expect(index).toBe(expected);
    expect(edgeInfo(d, expected)).toEqual({ orientation, row, col });
  });

  it('rejects out-of-range coordinates', () => {
    const d = dims(3, 3);
    expect(horizontalEdge(d, -1, 0)).toBe(-1);
    expect(horizontalEdge(d, 4, 0)).toBe(-1); // rows 0..3 valid
    expect(horizontalEdge(d, 0, 3)).toBe(-1); // cols 0..2 valid
    expect(horizontalEdge(d, 0, -1)).toBe(-1);
    expect(verticalEdge(d, 3, 0)).toBe(-1); // rows 0..2 valid
    expect(verticalEdge(d, 0, 4)).toBe(-1); // cols 0..3 valid
    expect(verticalEdge(d, -1, 0)).toBe(-1);
    expect(horizontalEdge(d, 0.5, 0)).toBe(-1);
    expect(verticalEdge(d, 0, Number.NaN)).toBe(-1);
  });
});

describe('isValidEdge / edgeInfo', () => {
  it('accepts exactly 0..edgeCount-1', () => {
    const d = dims(3, 3);
    expect(isValidEdge(d, 0)).toBe(true);
    expect(isValidEdge(d, 23)).toBe(true);
    expect(isValidEdge(d, 24)).toBe(false);
    expect(isValidEdge(d, -1)).toBe(false);
  });

  it.each([1.5, Number.NaN, Infinity, '3', null, undefined, {}, [3]])('rejects %j', (v) => {
    expect(isValidEdge(dims(3, 3), v)).toBe(false);
    expect(edgeInfo(dims(3, 3), v as number)).toBeNull();
    expect(edgeEndpoints(dims(3, 3), v as number)).toBeNull();
    expect(edgeBoxes(dims(3, 3), v as number)).toEqual([]);
  });

  it('is a bijection with (orientation, row, col) for every board size', () => {
    for (let w = 3; w <= 8; w++) {
      for (let h = 3; h <= 8; h++) {
        const d = dims(w, h);
        const seen = new Set<number>();
        for (let r = 0; r <= h; r++) {
          for (let c = 0; c < w; c++) seen.add(horizontalEdge(d, r, c));
        }
        for (let r = 0; r < h; r++) {
          for (let c = 0; c <= w; c++) seen.add(verticalEdge(d, r, c));
        }
        // Every coordinate pair produced a distinct index covering 0..n-1 exactly.
        expect(seen.size).toBe(edgeCount(d));
        expect(Math.min(...seen)).toBe(0);
        expect(Math.max(...seen)).toBe(edgeCount(d) - 1);
      }
    }
  });
});

describe('edgeEndpoints', () => {
  const cases: [Dimensions, number, [number, number], [number, number]][] = [
    [dims(3, 3), 0, [0, 0], [0, 1]],
    [dims(3, 3), 3, [1, 0], [1, 1]],
    [dims(3, 3), 11, [3, 2], [3, 3]],
    [dims(3, 3), 12, [0, 0], [1, 0]],
    [dims(3, 3), 13, [0, 1], [1, 1]],
    [dims(3, 3), 23, [2, 3], [3, 3]],
    [dims(4, 3), 30, [2, 4], [3, 4]],
  ];
  it.each(cases)('%j edge %i', (d, edge, a, b) => {
    expect(edgeEndpoints(d, edge)).toEqual([
      { row: a[0], col: a[1] },
      { row: b[0], col: b[1] },
    ]);
  });

  it('endpoints are adjacent dots inside the dot grid', () => {
    const d = dims(4, 6);
    for (let e = 0; e < edgeCount(d); e++) {
      const [a, b] = edgeEndpoints(d, e)!;
      expect(Math.abs(a.row - b.row) + Math.abs(a.col - b.col)).toBe(1);
      for (const dot of [a, b]) {
        expect(dot.row).toBeGreaterThanOrEqual(0);
        expect(dot.row).toBeLessThanOrEqual(d.height);
        expect(dot.col).toBeGreaterThanOrEqual(0);
        expect(dot.col).toBeLessThanOrEqual(d.width);
      }
    }
  });
});

describe('adjacency on a 3x3 board', () => {
  const d = dims(3, 3);

  // [top, bottom, left, right], derived by hand from the convention.
  const boxCases: [string, number, [number, number, number, number]][] = [
    ['top-left corner', 0, [0, 3, 12, 13]],
    ['top-right corner', 2, [2, 5, 14, 15]],
    ['bottom-left corner', 6, [6, 9, 20, 21]],
    ['bottom-right corner', 8, [8, 11, 22, 23]],
    ['top boundary', 1, [1, 4, 13, 14]],
    ['left boundary', 3, [3, 6, 16, 17]],
    ['interior', 4, [4, 7, 17, 18]],
  ];
  it.each(boxCases)('boxEdges: %s', (_n, box, expected) => {
    expect(boxEdges(d, box)).toEqual(expected);
  });

  const edgeCases: [string, number, number[]][] = [
    ['top boundary edge', 0, [0]],
    ['bottom boundary edge', 11, [8]],
    ['left boundary edge', 12, [0]],
    ['right boundary edge', 23, [8]],
    ['interior horizontal', 3, [0, 3]],
    ['interior vertical', 13, [0, 1]],
    ['central horizontal', 7, [4, 7]],
    ['central vertical', 18, [4, 5]],
  ];
  it.each(edgeCases)('edgeBoxes: %s', (_n, edge, expected) => {
    expect(edgeBoxes(d, edge)).toEqual(expected);
  });

  it('rejects invalid boxes', () => {
    for (const box of [-1, 9, 1.5, Number.NaN]) expect(boxEdges(d, box)).toBeNull();
  });
});

describe('adjacency invariants (all board sizes)', () => {
  for (let w = 3; w <= 8; w++) {
    for (let h = 3; h <= 8; h++) {
      it(`${w}x${h}`, () => {
        const d = dims(w, h);
        const incidence = new Map<number, number[]>();
        for (let b = 0; b < boxCount(d); b++) {
          const sides = boxEdges(d, b)!;
          expect(sides).toHaveLength(4);
          expect(new Set(sides).size).toBe(4);
          for (const e of sides) {
            expect(isValidEdge(d, e)).toBe(true);
            incidence.set(e, [...(incidence.get(e) ?? []), b]);
          }
        }
        // The box -> edges map and the edge -> boxes map must be inverses.
        let boundary = 0;
        for (let e = 0; e < edgeCount(d); e++) {
          const fromBoxes = (incidence.get(e) ?? []).sort((x, y) => x - y);
          expect(edgeBoxes(d, e)).toEqual(fromBoxes);
          expect(fromBoxes.length === 1 || fromBoxes.length === 2).toBe(true);
          if (fromBoxes.length === 1) boundary++;
        }
        // Perimeter has 2 * (W + H) edges, each touching exactly one box.
        expect(boundary).toBe(2 * (w + h));
        // Every box side is counted once: 4 * boxes = 2 * interior + boundary.
        expect(4 * boxCount(d)).toBe(2 * (edgeCount(d) - boundary) + boundary);
      });
    }
  }
});
