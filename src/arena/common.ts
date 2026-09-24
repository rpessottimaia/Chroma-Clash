import { COURT, CURVE, MOVE, STATUS } from '../config';
import type { Card, CardFx, CardId } from '../core/cards';
import type { BallColor } from '../core/colors';
import { Deck } from '../core/deck';
import type { Rng } from '../core/rng';

export type Side = 'player' | 'rival';
export const other = (s: Side): Side => (s === 'player' ? 'rival' : 'player');

export interface Fighter {
  side: Side;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  deck: Deck;
  /** Seconds before the next action (strike, throw, catch) is allowed. */
  cooldown: number;
  /** Dodgeball: hands up for this long. */
  catchTime: number;
  shield: boolean;
  /** The next power fizzles into a plain ball. */
  fizzled: boolean;
  /** Next throw's speed multiplier (Frost). */
  nextThrowMul: number;
  slowTime: number;
  reachTime: number;
  poisonDps: number;
  poisonTime: number;
}

export type ShotState = 'free' | 'flying' | 'held' | 'ground';

/** A ball. In Strike there is one; in Dodgeball there are three. */
export interface Shot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  state: ShotState;
  /** Who threw or struck it; null = neutral, harmless to both. */
  owner: Side | null;
  /** Who is holding it (dodgeball). */
  holder: Side | null;
  card: Card | null;
  color: BallColor;
  damage: number;
  /** Heading change in rad/s (counter-clockwise positive). */
  curve: number;
  sCurve: boolean;
  flipAfter: number;
  travelled: number;
  zigzag: number;
  zigTimer: number;
  /** Alternates the zigzag snap direction. */
  zigLeft: boolean;
  accel: number;
  maxSpeed: number;
  ghost: boolean;
  /** Seconds left before a neutral ball can be struck for damage again (strike). */
  safeTime: number;
  perfect: boolean;
}

export type ArenaEvent =
  | { type: 'serve' }
  | { type: 'strike'; side: Side; card: Card | null; perfect: boolean; x: number; y: number }
  | { type: 'throw'; side: Side; card: Card | null; x: number; y: number }
  | { type: 'pickup'; side: Side; card: Card | null }
  | { type: 'catch'; side: Side; x: number; y: number }
  | { type: 'hit'; victim: Side; damage: number; color: BallColor; x: number; y: number }
  | { type: 'block'; victim: Side; x: number; y: number }
  | { type: 'status'; side: Side; text: string; good: boolean }
  | { type: 'ko'; winner: Side };

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

export function newFighter(side: Side, x: number, y: number, hp: number, cards: CardId[], rng: Rng): Fighter {
  return {
    side, x, y, vx: 0, vy: 0, hp, maxHp: hp, deck: new Deck(cards, rng), cooldown: 0, catchTime: 0,
    shield: false, fizzled: false, nextThrowMul: 1, slowTime: 0, reachTime: 0, poisonDps: 0, poisonTime: 0,
  };
}

let nextShotId = 1;
export function newShot(x: number, y: number, r: number): Shot {
  return {
    id: nextShotId++, x, y, vx: 0, vy: 0, r, state: 'free', owner: null, holder: null, card: null,
    color: 'neutral', damage: 0, curve: 0, sCurve: false, flipAfter: 0, travelled: 0, zigzag: 0, zigTimer: 0, zigLeft: false,
    accel: 0, maxSpeed: 2400, ghost: false, safeTime: 0, perfect: false,
  };
}

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
export const speedOf = (s: { vx: number; vy: number }): number => Math.hypot(s.vx, s.vy);

/** Steer a fighter toward a point with a speed cap (halved while slowed), clamped to bounds. */
export function steer(f: Fighter, tx: number, ty: number, maxSpeed: number, dt: number, b: Bounds): void {
  const cap = maxSpeed * (f.slowTime > 0 ? STATUS.slowMul : 1) * dt;
  const dx = tx - f.x;
  const dy = ty - f.y;
  const d = Math.hypot(dx, dy);
  const k = d > cap ? cap / d : 1;
  const nx = Math.max(b.minX, Math.min(b.maxX, f.x + dx * k));
  const ny = Math.max(b.minY, Math.min(b.maxY, f.y + dy * k));
  f.vx = (nx - f.x) / dt;
  f.vy = (ny - f.y) / dt;
  f.x = nx;
  f.y = ny;
}

export function courtBounds(margin: number): Bounds {
  return { minX: COURT.left + margin, maxX: COURT.right - margin, minY: COURT.top + margin, maxY: COURT.bottom - margin };
}

/** Rotate a velocity by an angle (radians). */
function rotate(s: { vx: number; vy: number }, a: number): void {
  const c = Math.cos(a);
  const n = Math.sin(a);
  const vx = s.vx * c - s.vy * n;
  s.vy = s.vx * n + s.vy * c;
  s.vx = vx;
}

/**
 * Move a flying ball: curve (true arcs), S-bends, zigzag and acceleration.
 * Walls are handled by each mode.
 */
export function flyShot(s: Shot, dt: number): void {
  if (s.accel > 0) {
    const sp = speedOf(s);
    const k = Math.min(s.maxSpeed / Math.max(1, sp), 1 + s.accel * dt);
    s.vx *= k;
    s.vy *= k;
  }
  if (s.curve !== 0) {
    rotate(s, s.curve * dt);
    s.curve *= 1 - CURVE.decay * dt;
  }
  if (s.zigzag > 0) {
    s.zigTimer += dt;
    if (s.zigTimer >= s.zigzag) {
      // Snap sideways, alternating, relative to the direction of travel.
      s.zigTimer = 0;
      rotate(s, s.zigLeft ? -0.7 : 0.7);
      s.zigLeft = !s.zigLeft;
    }
  }
  const step = speedOf(s) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.travelled += step;
  if (s.sCurve && s.travelled >= s.flipAfter) {
    s.curve = -s.curve * 1.3;
    s.sCurve = false;
  }
}

/** Bounce off the court's side walls (and optionally top/bottom), mirroring the curve. */
export function bounceWalls(s: Shot, ends: boolean): boolean {
  let hit = false;
  if (s.x < COURT.left + s.r) { s.x = COURT.left + s.r; s.vx = Math.abs(s.vx); hit = true; }
  if (s.x > COURT.right - s.r) { s.x = COURT.right - s.r; s.vx = -Math.abs(s.vx); hit = true; }
  if (ends) {
    if (s.y < COURT.top + s.r) { s.y = COURT.top + s.r; s.vy = Math.abs(s.vy); hit = true; }
    if (s.y > COURT.bottom - s.r) { s.y = COURT.bottom - s.r; s.vy = -Math.abs(s.vy); hit = true; }
  }
  if (hit) s.curve = -s.curve * CURVE.bounceKeep;
  return hit;
}

/** Launch a ball from `from` toward (tx, ty) at `speed`. */
export function aimShot(s: Shot, tx: number, ty: number, speed: number): void {
  const dx = tx - s.x;
  const dy = ty - s.y;
  const d = Math.hypot(dx, dy) || 1;
  s.vx = (dx / d) * speed;
  s.vy = (dy / d) * speed;
  s.travelled = 0;
}

/**
 * Launch a curving ball so its path still reaches (tx, ty): simulate the flight (curve, S-bend,
 * zigzag, acceleration; walls ignored) and bisect the launch angle on the signed miss distance
 * where the ball passes the target's depth. Call after the ball's effects are loaded.
 */
export function aimCurved(s: Shot, tx: number, ty: number, speed: number): void {
  const d = Math.hypot(tx - s.x, ty - s.y) || 1;
  const ux = (tx - s.x) / d;
  const uy = (ty - s.y) / d;
  const base = Math.atan2(uy, ux);
  if (s.curve === 0 && s.zigzag === 0) return aimShot(s, tx, ty, speed);
  const miss = (offset: number): number => {
    const sim: Shot = { ...s };
    sim.vx = Math.cos(base + offset) * speed;
    sim.vy = Math.sin(base + offset) * speed;
    sim.travelled = 0;
    const dt = 1 / 120;
    for (let t = 0; t < 4; t += dt) {
      flyShot(sim, dt);
      const along = (sim.x - s.x) * ux + (sim.y - s.y) * uy;
      if (along >= d) break;
    }
    // Signed perpendicular offset from the target (positive = counter-clockwise side).
    return ux * (sim.y - ty) - uy * (sim.x - tx);
  };
  let lo = -0.9;
  let hi = 0.9;
  let mLo = miss(lo);
  const mHi = miss(hi);
  if (Math.sign(mLo) === Math.sign(mHi)) {
    // Can't bracket (curve too strong): soften it and aim straight.
    s.curve *= 0.4;
    return aimShot(s, tx, ty, speed);
  }
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const m = miss(mid);
    if (Math.sign(m) === Math.sign(mLo)) { lo = mid; mLo = m; } else hi = mid;
  }
  const a = base + (lo + hi) / 2;
  s.vx = Math.cos(a) * speed;
  s.vy = Math.sin(a) * speed;
  s.travelled = 0;
}

/** Load a ball with a card's flight effects and apply its effects on the thrower and target. */
export function applyLaunch(
  s: Shot, card: Card | null, shooter: Fighter, target: Fighter, rng: Rng, push: (e: ArenaEvent) => void,
): CardFx {
  const fx: CardFx = card?.fx ?? {};
  s.card = card;
  s.color = card ? card.color : 'neutral';
  s.zigzag = fx.zigzag ?? 0;
  s.zigTimer = s.zigzag / 2;
  s.zigLeft = rng() < 0.5;
  s.accel = fx.accel ?? 0;
  s.ghost = !!fx.ghost;
  s.sCurve = !!fx.sCurve;
  const sign = rng() < 0.5 ? -1 : 1;
  s.curve = fx.straight ? 0 : sign * ((fx.curve ?? 0) + (rng() * 2 - 1) * CURVE.jitter);
  s.flipAfter = 0;
  if (fx.selfCost) {
    shooter.hp = Math.max(1, shooter.hp - fx.selfCost);
    push({ type: 'status', side: shooter.side, text: `-${fx.selfCost} HP`, good: false });
  }
  if (fx.heal) {
    shooter.hp = Math.min(shooter.maxHp, shooter.hp + fx.heal);
    push({ type: 'status', side: shooter.side, text: `+${fx.heal} HP`, good: true });
  }
  if (fx.shield) shooter.shield = true;
  if (fx.reachBoost) shooter.reachTime = fx.reachBoost;
  if (fx.slowTarget) {
    target.slowTime = fx.slowTarget;
    push({ type: 'status', side: target.side, text: 'SLOWED', good: false });
  }
  if (fx.slowNextThrow) target.nextThrowMul = fx.slowNextThrow;
  if (fx.fizzle) {
    target.fizzled = true;
    push({ type: 'status', side: target.side, text: 'HEXED', good: false });
  }
  return fx;
}

/**
 * A ball reaches a fighter's body. Returns true if damage landed (false = shield blocked it).
 * Applies on-hit card effects (heal the thrower, poison).
 */
export function applyHit(
  s: Shot, victim: Fighter, attacker: Fighter, push: (e: ArenaEvent) => void,
): boolean {
  if (victim.shield) {
    victim.shield = false;
    push({ type: 'block', victim: victim.side, x: s.x, y: s.y });
    return false;
  }
  victim.hp = Math.max(0, victim.hp - s.damage);
  push({ type: 'hit', victim: victim.side, damage: s.damage, color: s.color, x: s.x, y: s.y });
  const fx = s.card?.fx;
  if (fx?.healOnHit) {
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + fx.healOnHit);
    push({ type: 'status', side: attacker.side, text: `+${fx.healOnHit} HP`, good: true });
  }
  if (fx?.poison) {
    victim.poisonDps = fx.poison;
    victim.poisonTime = fx.poisonTime ?? 4;
    push({ type: 'status', side: victim.side, text: 'POISONED', good: false });
  }
  return true;
}

/** Tick timers and poison. Returns the side knocked out by poison, if any. */
export function tickFighter(f: Fighter, dt: number): boolean {
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.catchTime = Math.max(0, f.catchTime - dt);
  f.slowTime = Math.max(0, f.slowTime - dt);
  f.reachTime = Math.max(0, f.reachTime - dt);
  if (f.poisonTime > 0) {
    f.poisonTime = Math.max(0, f.poisonTime - dt);
    f.hp = Math.max(0, f.hp - f.poisonDps * dt);
    return f.hp <= 0;
  }
  return false;
}

export const reachMul = (f: Fighter): number => (f.reachTime > 0 ? STATUS.reachMul : 1);
export const BODY = MOVE.bodyRadius;

/** Common surface both modes expose to the renderer and the input layer. */
export interface ArenaGame {
  readonly kind: 'strike' | 'dodge';
  state: 'ready' | 'play' | 'over';
  winner: Side | null;
  elapsed: number;
  readonly fighters: Record<Side, Fighter>;
  readonly shots: Shot[];
  /** Current rally speed (for the HUD). */
  readonly speed: number;
  readonly baseSpeed: number;
  bounds(side: Side): Bounds;
  step(dt: number): void;
  /** The one action button: strike / throw / catch, depending on mode and situation. */
  action(side: Side): boolean;
  drainEvents(): ArenaEvent[];
  /** The power card shown on the HUD and whether it's ready. */
  power(side: Side): { card: Card | null; ready: boolean; label: string; next: Card | null; meter: number | null };
}
