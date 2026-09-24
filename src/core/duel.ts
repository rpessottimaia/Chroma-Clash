import { ARENA, BALL, CATCH, DUEL, HIT, PLAYER, RIVAL } from '../config';
import { DEG, launch, other, rallySpeed, stepBall, targetOf, type Ball, type Side } from './ball';
import type { Card, CardId } from './cards';
import type { BallColor } from './colors';
import { Deck } from './deck';
import { createRng, type Rng } from './rng';

export interface Fighter {
  x: number;
  hp: number;
  maxHp: number;
  deck: Deck;
}

export type DuelState = 'ready' | 'play' | 'over';

export type DuelEvent =
  | { type: 'serve' }
  | { type: 'catch'; side: Side; card: Card; perfect: boolean; offset: number; x: number; y: number }
  | { type: 'miss'; side: Side }
  | { type: 'hit'; victim: Side; damage: number; color: BallColor; x: number; y: number }
  | { type: 'ko'; winner: Side };

export interface DuelOptions {
  seed?: number;
  playerDeck: CardId[];
  rivalDeck: CardId[];
}

export const lineY = (side: Side): number => (side === 'player' ? ARENA.playerY : ARENA.rivalY);
export const backY = (side: Side): number => (side === 'player' ? ARENA.playerBackY : ARENA.rivalBackY);

const crossed = (prev: number, next: number, line: number): boolean =>
  (prev - line) * (next - line) <= 0 && prev !== next;

/**
 * One duel as pure state. No rendering, no input devices, no timers: the caller moves
 * the fighters, calls step() at a fixed rate, and drains events for feedback.
 */
export class Duel {
  state: DuelState = 'ready';
  readyTimer: number = DUEL.readyTime;
  /** Seconds of live play. Drives the time half of the speed ramp. */
  elapsed = 0;
  /** Catches so far. Drives the touch half of the speed ramp. */
  touches = 0;
  hitBonus = 0;
  /** Increments on every serve, throw and ricochet, so observers can tell launches apart. */
  launches = 0;
  winner: Side | null = null;
  readonly fighters: Record<Side, Fighter>;
  readonly ball: Ball;
  readonly rng: Rng;
  private events: DuelEvent[] = [];

  constructor(opts: DuelOptions) {
    this.rng = createRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    const cx = (ARENA.wallLeft + ARENA.wallRight) / 2;
    this.fighters = {
      player: { x: cx, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, deck: new Deck(opts.playerDeck, this.rng) },
      rival: { x: cx, hp: RIVAL.maxHp, maxHp: RIVAL.maxHp, deck: new Deck(opts.rivalDeck, this.rng) },
    };
    this.ball = {
      x: cx, y: ARENA.height / 2, vx: 0, vy: 0,
      owner: 'rival', color: 'neutral', cardId: null,
      damage: HIT.ricochetDamage, perfect: false, passed: false,
    };
  }

  /** Current rally speed (never decreases during a duel). */
  get speed(): number {
    return rallySpeed(this.touches, this.elapsed, this.hitBonus);
  }

  drainEvents(): DuelEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Clamp and set a fighter's position. */
  moveTo(side: Side, x: number): void {
    const min = ARENA.wallLeft + ARENA.moveMargin;
    const max = ARENA.wallRight - ARENA.moveMargin;
    this.fighters[side].x = Math.max(min, Math.min(max, x));
  }

  step(dt: number): void {
    if (this.state === 'over') return;
    if (this.state === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) this.serve();
      return;
    }

    this.elapsed += dt;
    const ball = this.ball;
    const prevY = ball.y;
    stepBall(ball, dt);

    const target = targetOf(ball);
    if (!ball.passed && crossed(prevY, ball.y, lineY(target))) {
      const offset = (ball.x - this.fighters[target].x) / CATCH.reach;
      if (Math.abs(offset) <= 1) {
        this.catchBall(target, offset);
        return;
      }
      ball.passed = true;
      this.events.push({ type: 'miss', side: target });
    }
    if (ball.passed && crossed(prevY, ball.y, backY(target))) this.hit(target);
  }

  private serve(): void {
    const ball = this.ball;
    ball.x = (ARENA.wallLeft + ARENA.wallRight) / 2;
    ball.y = ARENA.height / 2;
    ball.owner = 'rival';
    const angle = (this.rng() * 2 - 1) * BALL.serveAngleDeg * DEG;
    launch(ball, this.speed, angle);
    this.launches++;
    this.state = 'play';
    this.events.push({ type: 'serve' });
  }

  private catchBall(side: Side, offset: number): void {
    const ball = this.ball;
    const perfect = Math.abs(offset) <= CATCH.perfectZone;
    const card = this.fighters[side].deck.spend();
    this.touches++;

    ball.owner = side;
    ball.y = lineY(side);
    ball.color = card.color;
    ball.cardId = card.id as CardId;
    ball.damage = Math.round(card.damage * (perfect ? CATCH.perfectDamageMul : 1));
    ball.perfect = perfect;
    ball.passed = false;
    // Edge catches angle the throw toward the side the ball touched: aiming costs the perfect bonus.
    launch(ball, this.speed * card.speedMul, offset * CATCH.maxDeflectDeg * DEG);
    this.launches++;

    this.events.push({ type: 'catch', side, card, perfect, offset, x: ball.x, y: ball.y });
  }

  private hit(victim: Side): void {
    const ball = this.ball;
    const attacker = other(victim);
    const f = this.fighters[victim];
    f.hp = Math.max(0, f.hp - ball.damage);
    this.events.push({ type: 'hit', victim, damage: ball.damage, color: ball.color, x: ball.x, y: backY(victim) });

    if (f.hp <= 0) {
      this.state = 'over';
      this.winner = attacker;
      ball.vx = 0;
      ball.vy = 0;
      this.events.push({ type: 'ko', winner: attacker });
      return;
    }

    // No reset: the ball ricochets off the victim's end wall straight back at the attacker.
    this.hitBonus += BALL.hitSpeedBonus;
    ball.owner = victim;
    ball.y = backY(victim);
    ball.color = 'neutral';
    ball.cardId = null;
    ball.damage = HIT.ricochetDamage;
    ball.perfect = false;
    ball.passed = false;
    const aimX = this.fighters[attacker].x + (this.rng() * 2 - 1) * HIT.ricochetSpread;
    const dist = Math.abs(lineY(attacker) - ball.y);
    const maxA = HIT.ricochetMaxDeg * DEG;
    const angle = Math.max(-maxA, Math.min(maxA, Math.atan2(aimX - ball.x, dist)));
    launch(ball, this.speed, angle);
    this.launches++;
  }
}
