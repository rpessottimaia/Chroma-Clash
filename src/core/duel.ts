import { AIM, ARENA, BALL, CATCH, CURVE, DUEL, HIT, PLAYER, RIVAL, STATUS } from '../config';
import {
  DEG, clearThrow, launchAt, newBall, other, rallySpeed, stepBall, targetOf, timeTo, type Ball, type Side,
} from './ball';
import type { Card, CardFx, CardId } from './cards';
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
  /** Hands up: seconds left in the catch window. */
  catchTime: number;
  /** Seconds before the next catch attempt is allowed. */
  catchCooldown: number;
  /** Seconds since the last tap (for perfect-catch timing). */
  sincePress: number;
  shield: boolean;
  /** Next power throw becomes a plain ball. */
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
  | { type: 'catch'; side: Side; card: Card; fizzled: boolean; perfect: boolean; x: number; y: number }
  | { type: 'whiff'; side: Side }
  | { type: 'dodge'; side: Side }
  | { type: 'pickup'; side: Side; x: number; y: number }
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
    x: courtCenterX, vx: 0, hp, maxHp: hp, deck, catchTime: 0, catchCooldown: 0, sincePress: 99,
    shield: false, fizzled: false, nextThrowMul: 1, slowTime: 0, reachTime: 0, poisonDps: 0, poisonTime: 0,
  };
}

/**
 * One dodgeball duel as pure state. Every throw is aimed at the other fighter's body.
 * When it arrives: hands up (tryCatch) and close enough = catch and throw back with your
 * armed power; otherwise touching your body = hit; otherwise you dodged it, and you pick it
 * up from the back wall for a plain throw. No rendering or input devices here: the caller
 * steers fighters, calls tryCatch on taps, calls step() at a fixed rate and drains events.
 */
export class Duel {
  state: DuelState = 'ready';
  readyTimer: number = DUEL.readyTime;
  /** Seconds of live play. Drives the time half of the speed ramp. */
  elapsed = 0;
  /** Throws so far. Drives the touch half of the speed ramp. */
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
  /** A dodged ball waiting at the back wall to be picked up. */
  pickup: { side: Side; time: number } | null = null;
  readonly rng: Rng;
  private events: DuelEvent[] = [];

  constructor(opts: DuelOptions) {
    this.rng = createRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.fighters = {
      player: newFighter(PLAYER.maxHp, new Deck(opts.playerDeck, this.rng)),
      rival: newFighter(RIVAL.maxHp, new Deck(opts.rivalDeck, this.rng)),
    };
    this.ball = newBall(courtCenterX, ARENA.height / 2, 'rival');
    this.ball.damage = HIT.plainDamage;
  }

  /** Current rally speed (never decreases during a duel). */
  get speed(): number {
    return rallySpeed(this.touches, this.elapsed, this.hitBonus);
  }

  catchRadiusOf(side: Side): number {
    return CATCH.catchRadius * (this.fighters[side].reachTime > 0 ? STATUS.reachMul : 1);
  }

  /** Seconds until the live ball reaches `side`, or Infinity if it isn't coming at them. */
  incomingTime(side: Side): number {
    const b = this.ball;
    if (this.state !== 'play' || this.pickup || b.passed || targetOf(b) !== side) return Infinity;
    return timeTo(b, lineY(side));
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

  /**
   * Hands up. Only counts while a ball is coming at you and close (pressZone); a tap that
   * expires before the ball arrives is a fumble and starts the cooldown.
   */
  tryCatch(side: Side): boolean {
    const f = this.fighters[side];
    if (f.catchCooldown > 0 || f.catchTime > 0) return false;
    if (this.incomingTime(side) > CATCH.pressZone) return false;
    f.catchTime = CATCH.window;
    f.catchCooldown = CATCH.cooldown;
    f.sincePress = 0;
    return true;
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

    if (this.pickup) {
      this.pickup.time -= dt;
      if (this.pickup.time <= 0) this.plainThrow(this.pickup.side);
      return;
    }

    const ball = this.ball;
    const prevY = ball.y;
    stepBall(ball, dt);

    const target = targetOf(ball);
    if (!ball.passed && crossed(prevY, ball.y, lineY(target))) {
      this.arrive(target);
      return;
    }
    if (ball.passed && crossed(prevY, ball.y, backY(target))) {
      // Dodged: the ball dies at the back wall and the dodger picks it up.
      ball.y = backY(target);
      ball.vx = 0;
      ball.vy = 0;
      this.pickup = { side: target, time: HIT.pickupTime };
      this.events.push({ type: 'pickup', side: target, x: ball.x, y: ball.y });
    }
  }

  private arrive(side: Side): void {
    const ball = this.ball;
    const f = this.fighters[side];
    const dx = Math.abs(ball.x - f.x);
    if (f.catchTime > 0 && dx <= this.catchRadiusOf(side)) {
      this.catchBall(side, (ball.x - f.x) / this.catchRadiusOf(side), f.sincePress <= CATCH.perfectWindow);
    } else if (dx <= CATCH.bodyRadius + BALL.radius) {
      this.hit(side);
    } else {
      ball.passed = true;
      this.events.push({ type: 'dodge', side });
    }
  }

  private tickStatus(dt: number): void {
    for (const side of ['player', 'rival'] as const) {
      const f = this.fighters[side];
      f.sincePress += dt;
      if (f.catchTime > 0) {
        f.catchTime = Math.max(0, f.catchTime - dt);
        if (f.catchTime === 0) this.events.push({ type: 'whiff', side });
      }
      f.catchCooldown = Math.max(0, f.catchCooldown - dt);
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

  /** Aim the live ball from `side` at the other fighter's body (with lead and error). */
  private throwAt(side: Side, speed: number, error: number, lead: number): void {
    const ball = this.ball;
    const foe = this.fighters[other(side)];
    const flight = Math.abs(lineY(other(side)) - ball.y) / Math.max(1, speed);
    const aimX = foe.x + foe.vx * flight * lead + (this.rng() * 2 - 1) * error;
    launchAt(ball, speed, aimX, lineY(other(side)), AIM.maxDeg * DEG);
    this.launches++;
  }

  private serve(): void {
    const ball = this.ball;
    ball.x = courtCenterX;
    ball.y = ARENA.height / 2;
    ball.owner = 'rival';
    clearThrow(ball);
    ball.damage = HIT.plainDamage;
    ball.curve = (this.rng() * 2 - 1) * CURVE.jitter * 3;
    this.throwAt('rival', this.speed, 0, 0);
    this.state = 'play';
    this.events.push({ type: 'serve' });
  }

  private plainThrow(side: Side): void {
    const ball = this.ball;
    this.pickup = null;
    this.touches++;
    ball.owner = side;
    ball.y = lineY(side);
    ball.x = this.fighters[side].x;
    clearThrow(ball);
    ball.damage = HIT.plainDamage;
    ball.curve = (this.rng() * 2 - 1) * CURVE.jitter;
    const f = this.fighters[side];
    const speed = this.speed * f.nextThrowMul;
    f.nextThrowMul = 1;
    this.throwAt(side, speed, side === 'player' ? AIM.playerError : AIM.rivalError, side === 'player' ? AIM.playerLead : AIM.rivalLead);
  }

  private catchBall(side: Side, offset: number, perfect: boolean): void {
    const ball = this.ball;
    const me = this.fighters[side];
    const foeSide = other(side);
    const foe = this.fighters[foeSide];
    me.catchTime = 0;
    me.catchCooldown = 0;
    const card = me.deck.spend();
    const fizzled = me.fizzled;
    me.fizzled = false;
    const fx: CardFx = fizzled ? {} : card.fx;
    this.touches++;
    this.rally++;

    // Damage
    let damage = fizzled ? HIT.plainDamage : card.damage;
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
    ball.x = me.x + offset * CATCH.bodyRadius * 0.5;
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

    // Every throw bends: catching off-center and catching on the move add curve, cards add more.
    // The aim solver still lands it on the target's body.
    let curve = 0;
    if (!fx.straight) {
      curve = offset * CURVE.edgeCurve + me.vx * CURVE.moveCurve + (this.rng() * 2 - 1) * CURVE.jitter;
      if (fx.curve) curve += fx.curve * (this.rng() < 0.5 ? 1 : -1);
    }
    ball.curve = Math.max(-CURVE.maxCurve, Math.min(CURVE.maxCurve, curve));

    const speed = this.speed * (fizzled ? 1 : card.speedMul) * me.nextThrowMul;
    me.nextThrowMul = 1;
    const isPlayer = side === 'player';
    this.throwAt(side, speed, (isPlayer ? AIM.playerError : AIM.rivalError) * (perfect ? 0.5 : 1), isPlayer ? AIM.playerLead : AIM.rivalLead);

    for (let i = 0; i < (fx.decoys ?? 0); i++) this.spawnDecoy(i);

    if (fizzled) this.events.push({ type: 'status', side, text: 'FIZZLED', good: false });
    this.events.push({ type: 'catch', side, card, fizzled, perfect, x: ball.x, y: ball.y });
  }

  private spawnDecoy(i: number): void {
    const b = this.ball;
    const d: Ball = { ...b, decoy: true, passed: false };
    // Fan out to one side of the real ball, with its own bend.
    const spread = (i % 2 === 0 ? -1 : 1) * (0.25 + this.rng() * 0.2);
    const s = Math.hypot(b.vx, b.vy);
    const a = Math.atan2(b.vx, Math.abs(b.vy)) + spread;
    d.vx = Math.sin(a) * s;
    d.vy = Math.sign(b.vy) * Math.cos(a) * s;
    d.curve = -b.curve * 0.5 - spread * 0.8;
    this.decoys.push(d);
  }

  private hit(victim: Side): void {
    const ball = this.ball;
    const attacker = other(victim);
    const f = this.fighters[victim];
    const y = lineY(victim);

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

    // The ball bounces off the victim straight back at the thrower, who must catch or dodge it.
    this.hitBonus += BALL.hitSpeedBonus;
    ball.owner = victim;
    ball.y = y;
    clearThrow(ball);
    ball.damage = HIT.ricochetDamage;
    ball.curve = (this.rng() * 2 - 1) * CURVE.jitter;
    this.throwAt(victim, this.speed, AIM.rivalError, 0);
  }

  private ko(winner: Side): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winner;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.decoys = [];
    this.pickup = null;
    this.events.push({ type: 'ko', winner });
  }
}
