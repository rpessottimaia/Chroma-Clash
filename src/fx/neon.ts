import * as Phaser from 'phaser';

/** Linear blend between two 0xRRGGBB colors. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 0xff) + ((((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * k);
  const g = ((a >> 8) & 0xff) + ((((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * k);
  const bl = (a & 0xff) + (((b & 0xff) - (a & 0xff)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * Neon line: a wide faint pass and a thin bright pass, drawn into an ADD-blended Graphics.
 * Cheaper and more predictable on phones than a bloom post-process.
 */
export function neonLine(
  g: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number,
  color: number, alpha: number, width = 2,
): void {
  g.lineStyle(width * 5, color, alpha * 0.12);
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(width, color, alpha);
  g.lineBetween(x1, y1, x2, y2);
}

export function neonPoly(
  g: Phaser.GameObjects.Graphics,
  points: Phaser.Types.Math.Vector2Like[],
  color: number, alpha: number, width = 3,
): void {
  g.lineStyle(width * 4, color, alpha * 0.15);
  g.strokePoints(points, true, true);
  g.lineStyle(width, color, alpha);
  g.strokePoints(points, true, true);
}

export function neonCircle(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, r: number,
  color: number, alpha: number, width = 2,
): void {
  g.lineStyle(width * 4, color, alpha * 0.15);
  g.strokeCircle(x, y, r);
  g.lineStyle(width, color, alpha);
  g.strokeCircle(x, y, r);
}

export const FONT = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Roboto Mono", monospace';

export function hexString(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
