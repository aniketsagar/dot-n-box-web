/**
 * Edge indexing convention (the single source of truth for the whole project).
 *
 * Board is W x H boxes, (W + 1) x (H + 1) dots. Dot (r, c): row r in 0..H,
 * column c in 0..W. Box (r, c): row r in 0..H-1, column c in 0..W-1, index
 * r * W + c.
 *
 * Horizontal edges come first, W * (H + 1) of them:
 *   horizontal edge at row r (0..H), col c (0..W-1) = r * W + c
 *   joins dot (r, c) and dot (r, c + 1)
 *
 * Vertical edges follow, (W + 1) * H of them:
 *   vertical edge at row r (0..H-1), col c (0..W) = W * (H + 1) + r * (W + 1) + c
 *   joins dot (r, c) and dot (r + 1, c)
 *
 * Total edges: W * (H + 1) + (W + 1) * H.
 */
import type { Dimensions } from './types.ts';

export interface Dot {
  readonly row: number;
  readonly col: number;
}

export interface EdgeInfo {
  readonly orientation: 'h' | 'v';
  readonly row: number;
  readonly col: number;
}

export function boxCount({ width, height }: Dimensions): number {
  return width * height;
}

export function horizontalEdgeCount({ width, height }: Dimensions): number {
  return width * (height + 1);
}

export function verticalEdgeCount({ width, height }: Dimensions): number {
  return (width + 1) * height;
}

export function edgeCount(d: Dimensions): number {
  return horizontalEdgeCount(d) + verticalEdgeCount(d);
}

export function isValidEdge(d: Dimensions, edge: unknown): edge is number {
  return Number.isInteger(edge) && (edge as number) >= 0 && (edge as number) < edgeCount(d);
}

/** Index of horizontal edge at (row, col), or -1 if out of range. */
export function horizontalEdge(d: Dimensions, row: number, col: number): number {
  if (!inRange(row, d.height + 1) || !inRange(col, d.width)) return -1;
  return row * d.width + col;
}

/** Index of vertical edge at (row, col), or -1 if out of range. */
export function verticalEdge(d: Dimensions, row: number, col: number): number {
  if (!inRange(row, d.height) || !inRange(col, d.width + 1)) return -1;
  return horizontalEdgeCount(d) + row * (d.width + 1) + col;
}

/** Decode an edge index, or null if it is not a valid edge. */
export function edgeInfo(d: Dimensions, edge: number): EdgeInfo | null {
  if (!isValidEdge(d, edge)) return null;
  const h = horizontalEdgeCount(d);
  if (edge < h) {
    return { orientation: 'h', row: Math.floor(edge / d.width), col: edge % d.width };
  }
  const v = edge - h;
  return { orientation: 'v', row: Math.floor(v / (d.width + 1)), col: v % (d.width + 1) };
}

/** The two dots an edge connects, or null if the edge is invalid. */
export function edgeEndpoints(d: Dimensions, edge: number): [Dot, Dot] | null {
  const info = edgeInfo(d, edge);
  if (!info) return null;
  const { orientation, row, col } = info;
  return orientation === 'h'
    ? [{ row, col }, { row, col: col + 1 }]
    : [{ row, col }, { row: row + 1, col }];
}

/** Box indices that have this edge as a side (1 on the boundary, else 2). */
export function edgeBoxes(d: Dimensions, edge: number): number[] {
  const info = edgeInfo(d, edge);
  if (!info) return [];
  const { orientation, row, col } = info;
  const boxes: number[] = [];
  if (orientation === 'h') {
    if (row > 0) boxes.push((row - 1) * d.width + col);
    if (row < d.height) boxes.push(row * d.width + col);
  } else {
    if (col > 0) boxes.push(row * d.width + (col - 1));
    if (col < d.width) boxes.push(row * d.width + col);
  }
  return boxes;
}

/** The four sides of a box as [top, bottom, left, right], or null if invalid. */
export function boxEdges(d: Dimensions, box: number): [number, number, number, number] | null {
  if (!Number.isInteger(box) || box < 0 || box >= boxCount(d)) return null;
  const row = Math.floor(box / d.width);
  const col = box % d.width;
  return [
    horizontalEdge(d, row, col),
    horizontalEdge(d, row + 1, col),
    verticalEdge(d, row, col),
    verticalEdge(d, row, col + 1),
  ];
}

function inRange(n: number, limit: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < limit;
}
