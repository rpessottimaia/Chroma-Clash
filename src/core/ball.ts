import { ARENA, BALL } from '../config';
import type { BallColor } from './colors';
import type { CardId } from './cards';

export type Side = 'player' | 'rival';

export const other = (side: Side): Side => (side === 'player' ? 'rival' : 'player');

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Who threw it; the ball is heading at the other side. */
  owner: Side;
  color: BallColor;
  cardId: CardId | null;
  damage: number;
  perfect: boolean;
  /** True once the ball has crossed the target's catch line out of reach. */
  passed: boolean;
}

export const DEG = Math.PI / 180;

/** The side a ball is travelling toward. */
export const targetOf = (ball: Ball): Side => other(ball.owner);

/** Rally speed from touches and elapsed time. Monotonic in both, so it never drops within a duel. */
export function rallySpeed(touches: number, elapsed: number, hitBonus = 0): number {
  return Math.min(
    BALL.maxRallySpeed,
    BALL.baseSpeed + touches * BALL.rampPerTouch + elapsed * BALL.rampPerSecond + hitBonus,
  );
}

/** Point the ball at the target side with an angle (radians from vertical, + = rightward). */
export function launch(ball: Ball, speed: number, angle: number): void {
  const s = Math.min(speed, BALL.maxBallSpeed);
  const dirY = targetOf(ball) === 'rival' ? -1 : 1;
  ball.vx = Math.sin(angle) * s;
  ball.vy = Math.cos(angle) * s * dirY;
}

export function speedOf(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vy);
}

const minX = ARENA.wallLeft + BALL.radius;
const maxX = ARENA.wallRight - BALL.radius;

/** Advance the ball and bounce it off the side walls. */
export function stepBall(ball: Ball, dt: number): void {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.x < minX) {
    ball.x = minX + (minX - ball.x);
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x > maxX) {
    ball.x = maxX - (ball.x - maxX);
    ball.vx = -Math.abs(ball.vx);
  }
}

/** Where the ball will be on the horizontal line `lineY`, folding in side-wall bounces. */
export function predictX(ball: Ball, lineY: number): number {
  if (ball.vy === 0) return ball.x;
  const t = (lineY - ball.y) / ball.vy;
  if (t < 0) return ball.x;
  const span = maxX - minX;
  let x = ball.x + ball.vx * t - minX;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  if (x > span) x = 2 * span - x;
  return x + minX;
}
