import { BALL, CATCH, DECK, RIVAL, STATUS } from '../config';
import { predictX, speedOf, targetOf, type Ball } from '../core/ball';
import { cardsOfColor, ALL_CARD_IDS, type CardId } from '../core/cards';
import { POWER_COLORS, type PowerColor } from '../core/colors';
import { courtCenterX, lineY, type Duel } from '../core/duel';
import { shuffle, type Rng } from '../core/rng';

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

export interface RivalLoadout {
  color: PowerColor;
  deck: CardId[];
}

/** A color-themed rival: mostly its own color, plus one off-color card. */
export function makeRivalLoadout(rng: Rng): RivalLoadout {
  const color = POWER_COLORS[Math.floor(rng() * POWER_COLORS.length)];
  const own = shuffle(cardsOfColor(color), rng).slice(0, DECK.rivalSize - 1);
  const offColor = shuffle(ALL_CARD_IDS.filter((id) => !own.includes(id) && !cardsOfColor(color).includes(id)), rng);
  return { color, deck: [...own, offColor[0]] };
}

/**
 * Rival brain: simulates the incoming ball's curved flight to find where it crosses its line,
 * then walks there with a speed cap, a reaction delay and a per-throw error that grows with
 * ball speed, ghosting and darkness. Decoys can fool it. Pure logic for a future server.
 */
export class RivalAI {
  private throwId = -1;
  private sinceThrow = 0;
  private error = 0;
  private aim = 0;
  /** Which ball it believes is real: -1 = the real one, else an index into duel.decoys. */
  private tracking = -1;
  private predicted = courtCenterX;
  private repredict = 0;

  constructor(private readonly profile: RivalProfile = DEFAULT_RIVAL) {}

  update(duel: Duel, dt: number): void {
    const ball = duel.ball;
    let target = courtCenterX;

    if (duel.state === 'play' && targetOf(ball) === 'rival' && !ball.passed) {
      // A new throw is heading our way: roll a fresh error, aim, belief and armed slot.
      if (duel.launches !== this.throwId) {
        this.throwId = duel.launches;
        this.sinceThrow = 0;
        this.repredict = 0;
        this.rollThrow(duel);
      }
      this.sinceThrow += dt;
      if (this.sinceThrow < this.profile.reactionTime) return;
      this.repredict -= dt;
      if (this.repredict <= 0) {
        this.repredict = 0.05;
        const tracked: Ball = (this.tracking >= 0 && duel.decoys[this.tracking]) || ball;
        this.predicted = predictX(tracked, lineY('rival'));
      }
      target = this.predicted + this.error - this.aim * duel.reachOf('rival');
    } else if (duel.state === 'play') {
      // Ball going away: drift back toward center, shading toward where it is.
      target = courtCenterX + (ball.x - courtCenterX) * 0.25;
    }

    duel.steer('rival', target, this.profile.moveSpeed, dt);
  }

  private rollThrow(duel: Duel): void {
    const rng = duel.rng;
    const ball = duel.ball;
    const skill = this.profile.skill;
    const overBase = Math.max(0, speedOf(ball) - BALL.baseSpeed);
    let spread = RIVAL.maxError * (1 - skill) * (1 + overBase * RIVAL.errorSpeedFactor);
    if (ball.ghost) spread *= STATUS.ghostErrorMul;
    if (ball.blind) spread *= STATUS.blindErrorMul;
    // Curves are harder to read than straight balls.
    spread *= 1 + Math.min(1, Math.abs(ball.curve)) * 0.5;
    this.error = (rng() * 2 - 1) * spread;
    this.aim = rng() < 0.5 ? 0 : (rng() * 2 - 1) * RIVAL.aimOffset;
    this.aim *= CATCH.reach / duel.reachOf('rival');
    // Decoys: the less skilled the rival, the likelier it chases a fake.
    const fooled = duel.decoys.length > 0 && rng() < (1 - skill) * 0.9;
    this.tracking = fooled ? Math.floor(rng() * duel.decoys.length) : -1;
    // Placeholder power choice: arm a random slot (counter-picking comes with milestone 3).
    duel.fighters.rival.deck.arm(Math.floor(rng() * duel.fighters.rival.deck.slots.length));
  }
}
