import { ARENA, BALL, CURVE } from '../config';
import type { Card } from './cards';
import type { BallColor } from './colors';

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
  /** The card this throw carries (null for serves, ricochets and fizzles). */
  card: Card | null;
  damage: number;
  perfect: boolean;
  /** True once the ball has crossed the target's catch line out of reach. */
  passed: boolean;
  /** Heading change in rad/s. Positive bends toward +x on screen. */
  curve: number;
  /** Flip the curve once at midcourt. */
  sCurve: boolean;
  /** Seconds between sideways snaps (0 = none). */
  zigzag: number;
  zigTimer: number;
  /** Speed multiplier growth per second (0 = none). */
  accel: number;
  ghost: boolean;
  blind: boolean;
  /** Fake ball: never caught, never hits. */
  decoy: boolean;
}

export const DEG = Math.PI / 180;

export function newBall(x: number, y: number, owner: Side): Ball {
  return {
    x, y, vx: 0, vy: 0, owner, color: 'neutral', card: null, damage: 0,
    perfect: false, passed: false, curve: 0, sCurve: false, zigzag: 0, zigTimer: 0,
    accel: 0, ghost: false, blind: false, decoy: false,
  };
}

/** Reset every per-throw modifier (keeps position, velocity and owner). */
export function clearThrow(ball: Ball): void {
  ball.card = null;
  ball.color = 'neutral';
  ball.perfect = false;
  ball.passed = false;
  ball.curve = 0;
  ball.sCurve = false;
  ball.zigzag = 0;
  ball.zigTimer = 0;
  ball.accel = 0;
  ball.ghost = false;
  ball.blind = false;
}

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
const midY = ARENA.height / 2;
const maxHeading = CURVE.maxHeadingDeg * DEG;

/** Advance the ball: curve, zigzag and acceleration, then side-wall bounces. */
export function stepBall(ball: Ball, dt: number): void {
  const prevY = ball.y;

  if (ball.accel > 0) {
    const s = speedOf(ball);
    const k = Math.min(BALL.maxBallSpeed / s, 1 + ball.accel * dt);
    ball.vx *= k;
    ball.vy *= k;
  }

  if (ball.curve !== 0) {
    // Rotate the velocity so speed is kept and the path is a true arc.
    const theta = ball.curve * dt * (ball.vy < 0 ? 1 : -1);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const vx = ball.vx * c - ball.vy * s;
    const vy = ball.vx * s + ball.vy * c;
    ball.vx = vx;
    ball.vy = vy;
    // Never let a curve turn the ball sideways or back on itself.
    const heading = Math.atan2(ball.vx, Math.abs(ball.vy));
    if (Math.abs(heading) > maxHeading) {
      const sp = speedOf(ball);
      const dirY = Math.sign(ball.vy) || 1;
      ball.vx = Math.sign(heading) * Math.sin(maxHeading) * sp;
      ball.vy = dirY * Math.cos(maxHeading) * sp;
      if (Math.sign(ball.curve) === Math.sign(heading)) ball.curve = 0;
    }
    ball.curve *= 1 - CURVE.decay * dt;
  }

  if (ball.zigzag > 0) {
    ball.zigTimer += dt;
    if (ball.zigTimer >= ball.zigzag) {
      ball.zigTimer = 0;
      ball.vx = -ball.vx;
    }
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.sCurve && (prevY - midY) * (ball.y - midY) <= 0 && prevY !== ball.y) {
    ball.curve = -ball.curve * 1.3;
    ball.sCurve = false;
  }

  if (ball.x < minX) {
    ball.x = minX + (minX - ball.x);
    ball.vx = Math.abs(ball.vx);
    ball.curve = -ball.curve * CURVE.bounceKeep;
  } else if (ball.x > maxX) {
    ball.x = maxX - (ball.x - maxX);
    ball.vx = -Math.abs(ball.vx);
    ball.curve = -ball.curve * CURVE.bounceKeep;
  }
}

/**
 * Where the ball will cross the horizontal line `lineY`, found by simulating its flight
 * (curves make a closed form impractical). Returns the current x if it never gets there.
 */
export function predictX(ball: Ball, lineY: number, dt = 1 / 60, maxTime = 5): number {
  if (ball.vy === 0 || (lineY - ball.y) / ball.vy < 0) return ball.x;
  const sim: Ball = { ...ball };
  for (let t = 0; t < maxTime; t += dt) {
    const prevY = sim.y;
    const prevX = sim.x;
    stepBall(sim, dt);
    if ((prevY - lineY) * (sim.y - lineY) <= 0) {
      const f = (lineY - prevY) / (sim.y - prevY || 1);
      return prevX + (sim.x - prevX) * f;
    }
  }
  return sim.x;
}
