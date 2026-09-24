import { COURT, DUEL, PLAYER, RIVAL, STRIKE } from '../config';
import type { CardId } from '../core/cards';
import { createRng, type Rng } from '../core/rng';
import {
  BODY, aimCurved, applyHit, applyLaunch, bounceWalls, courtBounds, dist, flyShot, newFighter, newShot, other,
  reachMul, speedOf, tickFighter, type ArenaEvent, type ArenaGame, type Bounds, type Fighter, type Shot, type Side,
} from './common';

/**
 * Prototype A: one loose ball in a shared arena (think Lethal League).
 * Tap while the ball is inside your ring to strike it at the rival. A ball struck by one
 * fighter hurts the other on contact; after a hit it goes neutral for a moment. Every strike
 * charges your meter; a full meter makes the next strike fire your power card.
 * The ball bounces off all four walls and only gets faster.
 */
export class StrikeGame implements ArenaGame {
  readonly kind = 'strike' as const;
  state: 'ready' | 'play' | 'over' = 'ready';
  winner: Side | null = null;
  elapsed = 0;
  readyTimer: number = DUEL.readyTime;
  strikes = 0;
  readonly fighters: Record<Side, Fighter>;
  readonly shots: Shot[];
  readonly meter: Record<Side, number> = { player: 0, rival: 0 };
  /** Wall bounces since the last strike. */
  bounces = 0;
  readonly rng: Rng;
  readonly baseSpeed = STRIKE.baseSpeed;
  private events: ArenaEvent[] = [];

  constructor(opts: { seed?: number; playerDeck: CardId[]; rivalDeck: CardId[] }) {
    this.rng = createRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    const cx = (COURT.left + COURT.right) / 2;
    this.fighters = {
      player: newFighter('player', cx, COURT.bottom - 200, PLAYER.maxHp, opts.playerDeck, this.rng),
      rival: newFighter('rival', cx, COURT.top + 200, RIVAL.maxHp, opts.rivalDeck, this.rng),
    };
    this.shots = [newShot(cx, COURT.mid, STRIKE.ballRadius)];
  }

  get ball(): Shot {
    return this.shots[0];
  }

  /** Rally speed: grows with every strike and with time, never drops. */
  get speed(): number {
    return Math.min(STRIKE.maxSpeed, STRIKE.baseSpeed + this.strikes * STRIKE.rampPerHit + this.elapsed * STRIKE.rampPerSecond);
  }

  bounds(_side: Side): Bounds {
    return courtBounds(BODY * 0.8);
  }

  swingRadius(side: Side): number {
    return STRIKE.swingRadius * reachMul(this.fighters[side]);
  }

  /** Is the ball inside this fighter's strike ring right now? */
  inRange(side: Side): boolean {
    const f = this.fighters[side];
    return this.state === 'play' && dist(f.x, f.y, this.ball.x, this.ball.y) <= this.swingRadius(side);
  }

  drainEvents(): ArenaEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  power(side: Side) {
    const f = this.fighters[side];
    const card = f.deck.armedCard;
    const m = this.meter[side];
    const ready = m >= 1;
    return {
      card, ready, meter: Math.min(1, m), next: null,
      label: f.fizzled ? 'hexed: next power fizzles' : ready ? 'power ready: next strike fires it' : 'charging: 3 strikes',
    };
  }

  step(dt: number): void {
    if (this.state === 'over') return;
    if (this.state === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) this.serve();
      return;
    }
    this.elapsed += dt;
    for (const side of ['player', 'rival'] as const) {
      if (tickFighter(this.fighters[side], dt)) return this.ko(other(side));
    }

    const b = this.ball;
    b.safeTime = Math.max(0, b.safeTime - dt);
    flyShot(b, dt);
    if (bounceWalls(b, true) && b.owner) {
      // A missed strike doesn't stay dangerous forever: after a few bounces it's a loose ball again.
      this.bounces++;
      if (this.bounces >= STRIKE.bouncesToNeutral) this.neutralize(0);
    }
    // A neutral ball speeds back up to the rally speed once it's safe again.
    if (b.owner === null && b.safeTime === 0) {
      const sp = speedOf(b);
      const want = Math.max(STRIKE.drift, this.speed * STRIKE.neutralSpeedMul);
      if (sp > 0 && sp < want) { b.vx *= want / sp; b.vy *= want / sp; }
    }

    // A struck ball hurts the other fighter on contact.
    if (b.owner) {
      const victim = this.fighters[other(b.owner)];
      if (dist(victim.x, victim.y, b.x, b.y) <= BODY + b.r) this.hitFighter(victim, this.fighters[b.owner]);
    }
  }

  private serve(): void {
    const b = this.ball;
    const a = this.rng() * Math.PI * 2;
    b.vx = Math.cos(a) * STRIKE.drift;
    b.vy = Math.sin(a) * STRIKE.drift;
    this.state = 'play';
    this.events.push({ type: 'serve' });
  }

  action(side: Side): boolean {
    const f = this.fighters[side];
    if (this.state !== 'play' || f.cooldown > 0 || !this.inRange(side)) return false;
    const foe = this.fighters[other(side)];
    const b = this.ball;
    const d = dist(f.x, f.y, b.x, b.y);
    const perfect = d <= this.swingRadius(side) * STRIKE.sweetSpot;
    f.cooldown = STRIKE.swingCooldown;
    this.strikes++;

    // Power shot when the meter is full: spend the armed card.
    let card = null;
    if (this.meter[side] >= 1) {
      this.meter[side] = 0;
      const spent = f.deck.spend();
      if (f.fizzled) {
        f.fizzled = false;
        this.events.push({ type: 'status', side, text: 'FIZZLED', good: false });
      } else {
        card = spent;
      }
    } else {
      this.meter[side] = Math.min(1, this.meter[side] + STRIKE.meterPerHit);
    }

    b.owner = side;
    b.safeTime = 0;
    b.perfect = perfect;
    this.bounces = 0;
    const fx = applyLaunch(b, card, f, foe, this.rng, (e) => this.events.push(e));
    const overBase = Math.max(0, this.speed - STRIKE.baseSpeed);
    const scale = 1 + overBase / 2800;
    let damage = card ? card.damage * scale : STRIKE.baseDamage + overBase * STRIKE.speedDamage;
    damage += (fx.speedDamage ?? 0) * (overBase / STRIKE.baseSpeed);
    if (perfect) damage *= fx.perfectMul ?? 1.25;
    b.damage = Math.round(damage);

    // Aim at the rival (leading them a little); your own sideways motion bends the shot.
    const speed = Math.min(2400, this.speed * (card ? card.speedMul : 1) * f.nextThrowMul);
    f.nextThrowMul = 1;
    b.maxSpeed = 2400;
    const lead = 0.25 * (dist(b.x, b.y, foe.x, foe.y) / Math.max(1, speed));
    aimCurved(b, foe.x + foe.vx * lead, foe.y + foe.vy * lead, speed);
    if (!fx.straight) b.curve += -f.vx * 0.0006;
    b.flipAfter = dist(b.x, b.y, foe.x, foe.y) * 0.45;

    this.events.push({ type: 'strike', side, card, perfect, x: b.x, y: b.y });
    return true;
  }

  private hitFighter(victim: Fighter, attacker: Fighter): void {
    const b = this.ball;
    const landed = applyHit(b, victim, attacker, (e) => this.events.push(e));
    if (landed && victim.hp <= 0) return this.ko(attacker.side);
    // Bounce off the victim, go neutral and slow for a moment: whoever reaches it first strikes next.
    const dx = b.x - victim.x;
    const dy = b.y - victim.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = this.speed * STRIKE.neutralSpeedMul;
    b.vx = (dx / d) * sp;
    b.vy = (dy / d) * sp;
    b.x = victim.x + (dx / d) * (BODY + b.r + 1);
    b.y = victim.y + (dy / d) * (BODY + b.r + 1);
    this.neutralize(STRIKE.neutralTime);
  }

  /** The ball stops belonging to anyone (harmless until struck again). */
  private neutralize(safeTime: number): void {
    const b = this.ball;
    b.owner = null;
    b.card = null;
    b.color = 'neutral';
    b.curve = 0;
    b.zigzag = 0;
    b.accel = 0;
    b.ghost = false;
    b.sCurve = false;
    b.safeTime = safeTime;
  }

  private ko(winner: Side): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winner;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.events.push({ type: 'ko', winner });
  }
}
