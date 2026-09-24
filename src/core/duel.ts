import { ARENA, BALL, CATCH, CURVE, DUEL, HIT, PLAYER, RIVAL, STATUS } from '../config';
import {
  DEG, clearThrow, launch, newBall, other, rallySpeed, stepBall, targetOf, type Ball, type Side,
} from './ball';
import type { Card, CardId } from './cards';
import type { BallColor } from './colors';
import { Deck } from './deck';
import { createRng, type Rng } from './rng';

export interface Fighter {
  x: number;
  /** Sideways velocity from the last steer() call; bends throws caught on the move. */
  vx: number;
  hp: number;
  maxHp: number;
  deck: Deck;
  shield: boolean;
  /** Next throw becomes a plain ball. */
  fizzled: boolean;
  /** Next throw's speed multiplier (1 = normal). */
  nextThrowMul: number;
  slowTime: number;
  reachTime: number;
  poisonDps: number;
  poisonTime: number;
}

export type DuelState = 'ready' | 'play' | 'over';

export type DuelEvent =
  | { type: 'serve' }
  | { type: 'catch'; side: Side; card: Card; fizzled: boolean; perfect: boolean; offset: number; x: number; y: number }
  | { type: 'miss'; side: Side }
  | { type: 'hit'; victim: Side; damage: number; color: BallColor; x: number; y: number }
  | { type: 'block'; victim: Side; x: number; y: number }
  | { type: 'status'; side: Side; text: string; good: boolean }
  | { type: 'ko'; winner: Side };

export interface DuelOptions {
  seed?: number;
  playerDeck: CardId[];
  rivalDeck: CardId[];
}

export const lineY = (side: Side): number => (side === 'player' ? ARENA.playerY : ARENA.rivalY);
export const backY = (side: Side): number => (side === 'player' ? ARENA.playerBackY : ARENA.rivalBackY);
export const courtCenterX = (ARENA.wallLeft + ARENA.wallRight) / 2;

const crossed = (prev: number, next: number, line: number): boolean =>
  (prev - line) * (next - line) <= 0 && prev !== next;

function newFighter(hp: number, deck: Deck): Fighter {
  return {
    x: courtCenterX, vx: 0, hp, maxHp: hp, deck, shield: false, fizzled: false, nextThrowMul: 1,
    slowTime: 0, reachTime: 0, poisonDps: 0, poisonTime: 0,
  };
}

/**
 * One duel as pure state. No rendering, no input devices, no timers: the caller steers
 * the fighters, calls step() at a fixed rate, and drains events for feedback.
 */
export class Duel {
  state: DuelState = 'ready';
  readyTimer: number = DUEL.readyTime;
  /** Seconds of live play. Drives the time half of the speed ramp. */
  elapsed = 0;
  /** Catches so far. Drives the touch half of the speed ramp. */
  touches = 0;
  /** Catches since the last hit. Green cards scale with it. */
  rally = 0;
  hitBonus = 0;
  /** Increments on every serve, throw and ricochet, so observers can tell launches apart. */
  launches = 0;
  winner: Side | null = null;
  readonly fighters: Record<Side, Fighter>;
  readonly ball: Ball;
  /** Fake balls from Split/Mirage. They fly and fade; they never score. */
  decoys: Ball[] = [];
  readonly rng: Rng;
  private events: DuelEvent[] = [];

  constructor(opts: DuelOptions) {
    this.rng = createRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.fighters = {
      player: newFighter(PLAYER.maxHp, new Deck(opts.playerDeck, this.rng)),
      rival: newFighter(RIVAL.maxHp, new Deck(opts.rivalDeck, this.rng)),
    };
    this.ball = newBall(courtCenterX, ARENA.height / 2, 'rival');
    this.ball.damage = HIT.ricochetDamage;
  }

  /** Current rally speed (never decreases during a duel). */
  get speed(): number {
    return rallySpeed(this.touches, this.elapsed, this.hitBonus);
  }

  reachOf(side: Side): number {
    return CATCH.reach * (this.fighters[side].reachTime > 0 ? STATUS.reachMul : 1);
  }

  drainEvents(): DuelEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Clamp and set a fighter's position directly. */
  moveTo(side: Side, x: number): void {
    const min = ARENA.wallLeft + ARENA.moveMargin;
    const max = ARENA.wallRight - ARENA.moveMargin;
    this.fighters[side].x = Math.max(min, Math.min(max, x));
  }

  /** Move a fighter toward targetX at up to maxSpeed (halved while slowed), tracking its velocity. */
  steer(side: Side, targetX: number, maxSpeed: number, dt: number): void {
    const f = this.fighters[side];
    const cap = maxSpeed * (f.slowTime > 0 ? STATUS.slowMul : 1) * dt;
    const before = f.x;
    this.moveTo(side, f.x + Math.max(-cap, Math.min(cap, targetX - f.x)));
    f.vx = (f.x - before) / dt;
  }

  step(dt: number): void {
    if (this.state === 'over') return;
    if (this.state === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) this.serve();
      return;
    }

    this.elapsed += dt;
    this.tickStatus(dt);
    if (this.state !== 'play') return;

    for (const d of this.decoys) this.stepDecoy(d, dt);
    this.decoys = this.decoys.filter((d) => !d.passed);

    const ball = this.ball;
    const prevY = ball.y;
    stepBall(ball, dt);

    const target = targetOf(ball);
    if (!ball.passed && crossed(prevY, ball.y, lineY(target))) {
      const offset = (ball.x - this.fighters[target].x) / this.reachOf(target);
      if (Math.abs(offset) <= 1) {
        this.catchBall(target, offset);
        return;
      }
      ball.passed = true;
      this.events.push({ type: 'miss', side: target });
    }
    if (ball.passed && crossed(prevY, ball.y, backY(target))) this.hit(target);
  }

  private tickStatus(dt: number): void {
    for (const side of ['player', 'rival'] as const) {
      const f = this.fighters[side];
      f.slowTime = Math.max(0, f.slowTime - dt);
      f.reachTime = Math.max(0, f.reachTime - dt);
      if (f.poisonTime > 0) {
        f.poisonTime = Math.max(0, f.poisonTime - dt);
        f.hp = Math.max(0, f.hp - f.poisonDps * dt);
        if (f.hp <= 0) this.ko(other(side));
      }
    }
  }

  private stepDecoy(d: Ball, dt: number): void {
    const prevY = d.y;
    stepBall(d, dt);
    if (crossed(prevY, d.y, lineY(targetOf(d)))) d.passed = true;
  }

  private serve(): void {
    const ball = this.ball;
    ball.x = courtCenterX;
    ball.y = ARENA.height / 2;
    ball.owner = 'rival';
    clearThrow(ball);
    ball.curve = (this.rng() * 2 - 1) * CURVE.jitter * 2;
    const angle = (this.rng() * 2 - 1) * BALL.serveAngleDeg * DEG;
    launch(ball, this.speed, angle);
    this.launches++;
    this.state = 'play';
    this.events.push({ type: 'serve' });
  }

  private catchBall(side: Side, offset: number): void {
    const ball = this.ball;
    const me = this.fighters[side];
    const foeSide = other(side);
    const foe = this.fighters[foeSide];
    const card = me.deck.spend();
    const fizzled = me.fizzled;
    me.fizzled = false;
    const fx = fizzled ? {} : card.fx;
    const perfect = Math.abs(offset) <= CATCH.perfectZone;
    this.touches++;
    this.rally++;

    // Damage
    let damage = fizzled ? HIT.ricochetDamage : card.damage;
    damage += (fx.rallyDamage ?? 0) * (this.rally - 1);
    damage += (fx.speedDamage ?? 0) * Math.max(0, this.speed / BALL.baseSpeed - 1);
    if (perfect) damage *= fx.perfectMul ?? CATCH.perfectDamageMul;

    // Effects on the thrower
    if (fx.selfCost) {
      me.hp = Math.max(1, me.hp - fx.selfCost);
      this.events.push({ type: 'status', side, text: `-${fx.selfCost} HP`, good: false });
    }
    if (fx.heal) {
      me.hp = Math.min(me.maxHp, me.hp + fx.heal);
      this.events.push({ type: 'status', side, text: `+${fx.heal} HP`, good: true });
    }
    if (fx.shield) me.shield = true;
    if (fx.reachBoost) me.reachTime = fx.reachBoost;

    // Effects on the target, applied as the ball leaves
    if (fx.slowTarget) {
      foe.slowTime = fx.slowTarget;
      this.events.push({ type: 'status', side: foeSide, text: 'SLOWED', good: false });
    }
    if (fx.slowNextThrow) foe.nextThrowMul = fx.slowNextThrow;
    if (fx.fizzle) {
      foe.fizzled = true;
      this.events.push({ type: 'status', side: foeSide, text: 'HEXED', good: false });
    }

    // The throw
    ball.owner = side;
    ball.y = lineY(side);
    clearThrow(ball);
    ball.card = fizzled ? null : card;
    ball.color = fizzled ? 'neutral' : card.color;
    ball.damage = Math.round(damage);
    ball.perfect = perfect;
    ball.zigzag = fx.zigzag ?? 0;
    ball.accel = fx.accel ?? 0;
    ball.ghost = !!fx.ghost;
    ball.blind = !!fx.blind;
    ball.sCurve = !!fx.sCurve;

    // Every throw bends: edge catches and catching on the move add curve, cards add more.
    let curve = 0;
    if (!fx.straight) {
      curve = offset * CURVE.edgeCurve + me.vx * CURVE.moveCurve + (this.rng() * 2 - 1) * CURVE.jitter;
      if (fx.curve) curve += fx.curve * (ball.x >= foe.x ? 1 : -1);
    }
    ball.curve = Math.max(-CURVE.maxCurve, Math.min(CURVE.maxCurve, curve));

    const speedMul = (fizzled ? 1 : card.speedMul) * me.nextThrowMul;
    me.nextThrowMul = 1;
    // Edge catches angle the throw toward the side the ball touched: aiming costs the perfect bonus.
    launch(ball, this.speed * speedMul, offset * CATCH.maxDeflectDeg * DEG);
    this.launches++;

    for (let i = 0; i < (fx.decoys ?? 0); i++) this.spawnDecoy(i);

    if (fizzled) this.events.push({ type: 'status', side, text: 'FIZZLED', good: false });
    this.events.push({ type: 'catch', side, card, fizzled, perfect, offset, x: ball.x, y: ball.y });
  }

  private spawnDecoy(i: number): void {
    const b = this.ball;
    const d: Ball = { ...b, card: b.card, decoy: true, passed: false };
    // Mirror the real ball's sideways motion (alternating), with its own bend.
    const spread = (i % 2 === 0 ? -1 : 1) * (0.5 + this.rng() * 0.5);
    d.vx = b.vx * -0.8 + spread * Math.abs(b.vy) * 0.35;
    const s = Math.hypot(b.vx, b.vy) / Math.hypot(d.vx, d.vy);
    d.vx *= s;
    d.vy *= s;
    d.curve = -b.curve + spread * 0.4;
    this.decoys.push(d);
  }

  private hit(victim: Side): void {
    const ball = this.ball;
    const attacker = other(victim);
    const f = this.fighters[victim];
    const y = backY(victim);

    if (f.shield) {
      f.shield = false;
      this.events.push({ type: 'block', victim, x: ball.x, y });
    } else {
      f.hp = Math.max(0, f.hp - ball.damage);
      this.events.push({ type: 'hit', victim, damage: ball.damage, color: ball.color, x: ball.x, y });
      const fx = ball.card?.fx;
      if (fx?.healOnHit) {
        const a = this.fighters[attacker];
        a.hp = Math.min(a.maxHp, a.hp + fx.healOnHit);
        this.events.push({ type: 'status', side: attacker, text: `+${fx.healOnHit} HP`, good: true });
      }
      if (fx?.poison) {
        f.poisonDps = fx.poison;
        f.poisonTime = fx.poisonTime ?? 4;
        this.events.push({ type: 'status', side: victim, text: 'POISONED', good: false });
      }
      if (f.hp <= 0) {
        this.ko(attacker);
        return;
      }
    }
    this.rally = 0;

    // No reset: the ball ricochets off the victim's end wall straight back at the attacker.
    this.hitBonus += BALL.hitSpeedBonus;
    ball.owner = victim;
    ball.y = y;
    clearThrow(ball);
    ball.damage = HIT.ricochetDamage;
    const aimX = this.fighters[attacker].x + (this.rng() * 2 - 1) * HIT.ricochetSpread;
    const dist = Math.abs(lineY(attacker) - ball.y);
    const maxA = HIT.ricochetMaxDeg * DEG;
    const angle = Math.max(-maxA, Math.min(maxA, Math.atan2(aimX - ball.x, dist)));
    launch(ball, this.speed, angle);
    this.launches++;
  }

  private ko(winner: Side): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winner;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.decoys = [];
    this.events.push({ type: 'ko', winner });
  }
}
