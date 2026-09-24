import { COURT, DODGE, DUEL, PLAYER, RIVAL } from '../config';
import type { Card, CardId } from '../core/cards';
import { createRng, type Rng } from '../core/rng';
import {
  BODY, aimCurved, applyHit, applyLaunch, bounceWalls, courtBounds, dist, flyShot, newFighter, newShot, other,
  reachMul, speedOf, tickFighter, type ArenaEvent, type ArenaGame, type Bounds, type Fighter, type Shot, type Side,
} from './common';

/**
 * Prototype B: dodgeball with three balls and a midline.
 * Walk over a ball on your side to pick it up; it gets loaded with your next power card.
 * Tap to throw it at the rival. With empty hands, tap as a ball reaches you to catch it
 * (you keep it, and the thrower gets stung). Balls that hit or miss drop on the target's side,
 * so they keep flowing back and forth, and both players act at the same time.
 */
export class DodgeGame implements ArenaGame {
  readonly kind = 'dodge' as const;
  state: 'ready' | 'play' | 'over' = 'ready';
  winner: Side | null = null;
  elapsed = 0;
  readyTimer: number = DUEL.readyTime;
  throws = 0;
  readonly fighters: Record<Side, Fighter>;
  readonly shots: Shot[] = [];
  readonly rng: Rng;
  readonly baseSpeed = DODGE.baseSpeed;
  private events: ArenaEvent[] = [];

  constructor(opts: { seed?: number; playerDeck: CardId[]; rivalDeck: CardId[] }) {
    this.rng = createRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    const cx = (COURT.left + COURT.right) / 2;
    this.fighters = {
      player: newFighter('player', cx, COURT.bottom - 170, PLAYER.maxHp, opts.playerDeck, this.rng),
      rival: newFighter('rival', cx, COURT.top + 170, RIVAL.maxHp, opts.rivalDeck, this.rng),
    };
    // Opening rush: balls on the midline, reachable by both.
    for (let i = 0; i < DODGE.balls; i++) {
      const s = newShot(COURT.left + ((i + 1) * (COURT.right - COURT.left)) / (DODGE.balls + 1), COURT.mid, DODGE.ballRadius);
      s.state = 'ground';
      this.shots.push(s);
    }
  }

  get speed(): number {
    return Math.min(DODGE.maxSpeed, DODGE.baseSpeed + this.throws * DODGE.rampPerThrow + this.elapsed * DODGE.rampPerSecond);
  }

  bounds(side: Side): Bounds {
    const b = courtBounds(BODY * 0.8);
    // Each fighter stays in their half, but can reach the midline to grab balls.
    return side === 'player' ? { ...b, minY: COURT.mid + BODY * 0.4 } : { ...b, maxY: COURT.mid - BODY * 0.4 };
  }

  holding(side: Side): Shot | null {
    return this.shots.find((s) => s.state === 'held' && s.holder === side) ?? null;
  }

  /** The nearest enemy ball flying at this fighter, and seconds until it arrives. */
  threat(side: Side): { shot: Shot; time: number } | null {
    const f = this.fighters[side];
    let best: { shot: Shot; time: number } | null = null;
    for (const s of this.shots) {
      if (s.state !== 'flying' || s.owner === side) continue;
      const toward = (f.x - s.x) * s.vx + (f.y - s.y) * s.vy;
      if (toward <= 0) continue;
      const t = (dist(f.x, f.y, s.x, s.y) - BODY - s.r) / Math.max(1, speedOf(s));
      if (!best || t < best.time) best = { shot: s, time: Math.max(0, t) };
    }
    return best;
  }

  drainEvents(): ArenaEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  power(side: Side) {
    const f = this.fighters[side];
    const held = this.holding(side);
    if (held) {
      return {
        card: held.card, ready: true, meter: null, next: f.deck.armedCard,
        label: held.card ? 'LOADED: tap to throw' : 'PLAIN BALL: tap to throw',
      };
    }
    return {
      card: f.deck.armedCard, ready: false, meter: null, next: null,
      label: f.fizzled ? 'HEXED: next ball is plain' : 'NEXT BALL YOU GRAB',
    };
  }

  step(dt: number): void {
    if (this.state === 'over') return;
    if (this.state === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) {
        this.state = 'play';
        this.events.push({ type: 'serve' });
      }
      return;
    }
    this.elapsed += dt;
    for (const side of ['player', 'rival'] as const) {
      if (tickFighter(this.fighters[side], dt)) return this.ko(other(side));
    }

    for (const s of this.shots) {
      if (s.state === 'held') {
        const f = this.fighters[s.holder!];
        s.x = f.x;
        s.y = f.y + (s.holder === 'player' ? -BODY - 6 : BODY + 6);
        continue;
      }
      if (s.state === 'ground') {
        const k = Math.max(0, 1 - DODGE.friction * dt);
        s.vx *= k;
        s.vy *= k;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        bounceWalls(s, true);
        this.tryPickup(s);
        continue;
      }
      // Flying
      flyShot(s, dt);
      bounceWalls(s, false);
      const target = this.fighters[other(s.owner!)];
      const d = dist(target.x, target.y, s.x, s.y);
      const canCatch = target.catchTime > 0 && !this.holding(target.side) && d <= this.catchReach(target.side) + s.r;
      if (canCatch || d <= BODY + s.r) {
        if (this.arrive(s, target, canCatch)) return;
        continue;
      }
      if (s.y < COURT.top + s.r || s.y > COURT.bottom - s.r) this.drop(s, s.y < COURT.mid ? 1 : -1);
    }
  }

  private tryPickup(s: Shot): void {
    for (const side of ['player', 'rival'] as const) {
      const f = this.fighters[side];
      const mySide = side === 'player' ? s.y >= COURT.mid - 1 : s.y <= COURT.mid + 1;
      if (!mySide || this.holding(side) || dist(f.x, f.y, s.x, s.y) > BODY + s.r + DODGE.pickupReach) continue;
      this.grab(s, side);
      this.events.push({ type: 'pickup', side, card: s.card });
      return;
    }
  }

  /** Put a ball in a fighter's hands, loaded with their next power card. */
  private grab(s: Shot, side: Side): void {
    const f = this.fighters[side];
    s.state = 'held';
    s.holder = side;
    s.owner = null;
    s.vx = 0;
    s.vy = 0;
    let card: Card | null = f.deck.spend();
    if (f.fizzled) {
      f.fizzled = false;
      card = null;
      this.events.push({ type: 'status', side, text: 'FIZZLED', good: false });
    }
    s.card = card;
    s.color = card ? card.color : 'neutral';
  }

  action(side: Side): boolean {
    const f = this.fighters[side];
    if (this.state !== 'play' || f.cooldown > 0) return false;
    const held = this.holding(side);
    if (held) {
      this.throwBall(held, side);
      return true;
    }
    // Empty hands: raise them to catch, but only if a ball is actually coming.
    const threat = this.threat(side);
    if (!threat || threat.time > 0.6) return false;
    f.catchTime = DODGE.catchWindow;
    f.cooldown = DODGE.catchCooldown;
    return true;
  }

  private throwBall(s: Shot, side: Side): void {
    const f = this.fighters[side];
    const foe = this.fighters[other(side)];
    f.cooldown = DODGE.throwCooldown;
    this.throws++;
    s.state = 'flying';
    s.holder = null;
    s.owner = side;
    const card = s.card;
    const fx = applyLaunch(s, card, f, foe, this.rng, (e) => this.events.push(e));
    const overBase = Math.max(0, this.speed - DODGE.baseSpeed);
    let damage = card ? card.damage * (1 + overBase / 2800) : DODGE.plainDamage;
    damage += (fx.speedDamage ?? 0) * (overBase / DODGE.baseSpeed);
    s.damage = Math.round(damage);
    const speed = Math.min(2400, this.speed * (card ? card.speedMul : 1) * f.nextThrowMul);
    f.nextThrowMul = 1;
    s.maxSpeed = 2400;
    const t = dist(s.x, s.y, foe.x, foe.y) / Math.max(1, speed);
    aimCurved(s, foe.x + foe.vx * t * DODGE.lead, foe.y + foe.vy * t * DODGE.lead, speed);
    s.flipAfter = dist(s.x, s.y, foe.x, foe.y) * 0.45;
    this.events.push({ type: 'throw', side, card, x: s.x, y: s.y });
  }

  /** Resolve a ball reaching a fighter. Returns true if it ended the duel. */
  private arrive(s: Shot, target: Fighter, caught: boolean): boolean {
    const thrower = this.fighters[s.owner!];
    // Hands up and empty: catch it. You keep the ball (reloaded with your power), the thrower gets stung.
    if (caught) {
      target.catchTime = 0;
      target.cooldown = 0;
      this.grab(s, target.side);
      this.events.push({ type: 'catch', side: target.side, x: s.x, y: s.y });
      thrower.hp = Math.max(0, thrower.hp - DODGE.caughtDamage);
      this.events.push({ type: 'status', side: thrower.side, text: `CAUGHT -${DODGE.caughtDamage}`, good: false });
      if (thrower.hp <= 0) this.ko(target.side);
      return thrower.hp <= 0;
    }
    const landed = applyHit(s, target, thrower, (e) => this.events.push(e));
    if (landed && target.hp <= 0) {
      this.ko(thrower.side);
      return true;
    }
    // The ball drops at the victim's feet: it's theirs now.
    const away = target.side === 'player' ? 1 : -1;
    s.x = target.x + (this.rng() * 2 - 1) * 30;
    s.y = target.y + away * (BODY + s.r + 4);
    this.settle(s, (this.rng() * 2 - 1) * 120, away * 90);
    return false;
  }

  /** A missed ball bounces off the back wall and rolls back into that half. */
  private drop(s: Shot, dirY: number): void {
    s.y = dirY > 0 ? COURT.top + s.r + 2 : COURT.bottom - s.r - 2;
    this.settle(s, s.vx * 0.2, dirY * 260);
  }

  private settle(s: Shot, vx: number, vy: number): void {
    s.state = 'ground';
    s.owner = null;
    s.card = null;
    s.color = 'neutral';
    s.curve = 0;
    s.zigzag = 0;
    s.accel = 0;
    s.ghost = false;
    s.sCurve = false;
    s.vx = vx;
    s.vy = vy;
  }

  catchReach(side: Side): number {
    return (BODY + DODGE.catchReach) * reachMul(this.fighters[side]);
  }

  private ko(winner: Side): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winner;
    this.events.push({ type: 'ko', winner });
  }
}
