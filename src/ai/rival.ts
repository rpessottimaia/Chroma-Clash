import { ARENA, BALL, CATCH, RIVAL } from '../config';
import { predictX, speedOf, targetOf } from '../core/ball';
import { lineY, type Duel } from '../core/duel';

export interface RivalProfile {
  skill: number;
  moveSpeed: number;
  reactionTime: number;
}

export const DEFAULT_RIVAL: RivalProfile = {
  skill: RIVAL.skill,
  moveSpeed: RIVAL.moveSpeed,
  reactionTime: RIVAL.reactionTime,
};

/**
 * Rival brain: predicts where the incoming ball crosses its line (including wall bounces),
 * then walks there with a speed cap, a reaction delay and a per-throw error that grows with ball speed.
 * Pure logic so the same rival can run on a server later.
 */
export class RivalAI {
  private throwId = -1;
  private sinceThrow = 0;
  private error = 0;
  private aim = 0;

  constructor(private readonly profile: RivalProfile = DEFAULT_RIVAL) {}

  update(duel: Duel, dt: number): void {
    const me = duel.fighters.rival;
    const ball = duel.ball;
    const center = (ARENA.wallLeft + ARENA.wallRight) / 2;
    let target = center;

    if (duel.state === 'play' && targetOf(ball) === 'rival' && !ball.passed) {
      // A new throw is heading our way: roll a fresh error, aim and armed slot.
      if (duel.launches !== this.throwId) {
        this.throwId = duel.launches;
        this.sinceThrow = 0;
        this.rollThrow(duel);
      }
      this.sinceThrow += dt;
      if (this.sinceThrow < this.profile.reactionTime) return;
      target = predictX(ball, lineY('rival')) + this.error - this.aim * CATCH.reach;
    } else if (duel.state === 'play') {
      // Ball going away: drift back toward center, shading toward where it is.
      target = center + (ball.x - center) * 0.25;
    }

    const step = this.profile.moveSpeed * dt;
    const dx = Math.max(-step, Math.min(step, target - me.x));
    duel.moveTo('rival', me.x + dx);
  }

  private rollThrow(duel: Duel): void {
    const rng = duel.rng;
    const skill = this.profile.skill;
    const overBase = Math.max(0, speedOf(duel.ball) - BALL.baseSpeed);
    const spread = RIVAL.maxError * (1 - skill) * (1 + overBase * RIVAL.errorSpeedFactor);
    this.error = (rng() * 2 - 1) * spread;
    // Sometimes go for an angled return instead of the safe center catch.
    this.aim = rng() < 0.5 ? 0 : (rng() * 2 - 1) * RIVAL.aimOffset;
    // Placeholder power choice: arm a random slot (counter-picking comes with milestone 3).
    duel.fighters.rival.deck.arm(Math.floor(rng() * duel.fighters.rival.deck.slots.length));
  }
}
