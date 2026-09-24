import { BALL, CATCH, DECK, RIVAL, STATUS } from '../config';
import { predictX, speedOf, targetOf, type Ball } from '../core/ball';
import { cardsOfColor, ALL_CARD_IDS, type CardId } from '../core/cards';
import { POWER_COLORS, type PowerColor } from '../core/colors';
import { courtCenterX, lineY, type Duel } from '../core/duel';
import { shuffle, type Rng } from '../core/rng';

export interface RivalProfile {
  /** 0..1: chance to read and catch a plain, slow ball. */
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
  const offColor = shuffle(ALL_CARD_IDS.filter((id) => !cardsOfColor(color).includes(id)), rng);
  return { color, deck: [...own, offColor[0]] };
}

type Plan = 'catch' | 'dodge' | 'fumble';

/**
 * Rival brain for dodgeball. For each incoming throw it decides once: catch it cleanly,
 * try to dodge, or fumble (tap too early and eat it). The odds come from its skill and
 * how hard the ball is to read (speed, curve, ghosting, darkness, decoys).
 * Pure logic, so the same rival can run on a server later.
 */
export class RivalAI {
  private throwId = -1;
  private sinceThrow = 0;
  private plan: Plan = 'catch';
  private dodgeDir = 1;
  /** Which ball it believes is real: -1 = the real one, else an index into duel.decoys. */
  private tracking = -1;
  private predicted = courtCenterX;
  private repredict = 0;
  private pressAt = 0.1;

  constructor(private readonly profile: RivalProfile = DEFAULT_RIVAL) {}

  update(duel: Duel, dt: number): void {
    const ball = duel.ball;
    let target = courtCenterX;
    const incoming = duel.incomingTime('rival');

    if (incoming < Infinity) {
      if (duel.launches !== this.throwId) {
        this.throwId = duel.launches;
        this.sinceThrow = 0;
        this.repredict = 0;
        this.decide(duel);
      }
      this.sinceThrow += dt;
      if (this.sinceThrow < this.profile.reactionTime) return;
      this.repredict -= dt;
      if (this.repredict <= 0) {
        this.repredict = 0.05;
        const tracked: Ball = (this.tracking >= 0 && duel.decoys[this.tracking]) || ball;
        this.predicted = predictX(tracked, lineY('rival'));
      }
      if (ball.homing && this.tracking < 0) {
        // Still being chased: dodging now is pointless, just hold and read.
        target = duel.fighters.rival.x;
      } else if (this.plan === 'dodge') {
        target = this.predicted + this.dodgeDir * (CATCH.bodyRadius + BALL.radius + 60);
        if (target < 90 || target > 630) target = this.predicted - this.dodgeDir * (CATCH.bodyRadius + BALL.radius + 60);
      } else {
        target = this.predicted;
      }
      if (this.plan !== 'dodge' && incoming <= this.pressAt) duel.tryCatch('rival');
    } else if (duel.state === 'play' && targetOf(ball) !== 'rival') {
      // Ball going away: drift back toward center.
      target = courtCenterX + (ball.x - courtCenterX) * 0.2;
    } else {
      target = duel.fighters.rival.x;
    }

    duel.steer('rival', target, this.profile.moveSpeed, dt);
  }

  private decide(duel: Duel): void {
    const rng = duel.rng;
    const ball = duel.ball;
    let chance = this.profile.skill;
    const overBase = Math.max(0, speedOf(ball) - BALL.baseSpeed);
    chance *= 1 - Math.min(0.45, overBase * RIVAL.errorSpeedFactor * 0.4);
    chance *= 1 - Math.min(0.3, Math.abs(ball.curve) * 0.15);
    if (ball.zigzag) chance *= 0.75;
    if (ball.ghost) chance /= STATUS.ghostErrorMul;
    if (ball.blind) chance /= STATUS.blindErrorMul;
    if (ball.perfect) chance *= 0.9;

    const roll = rng();
    if (roll < chance) this.plan = 'catch';
    else if (roll < chance + (1 - chance) * 0.45) this.plan = 'dodge';
    else this.plan = 'fumble';

    // A clean catch taps close to impact (sometimes perfect); a fumble taps far too early.
    this.pressAt = this.plan === 'catch' ? 0.04 + rng() * 0.16 : CATCH.window + 0.1 + rng() * 0.3;
    this.dodgeDir = rng() < 0.5 ? -1 : 1;
    // Decoys: the less skilled the rival, the likelier it follows a fake.
    const fooled = duel.decoys.length > 0 && rng() < (1 - this.profile.skill) * 0.9;
    this.tracking = fooled ? Math.floor(rng() * duel.decoys.length) : -1;
    // Placeholder power choice: arm a random slot (counter-picking comes with milestone 3).
    duel.fighters.rival.deck.arm(Math.floor(rng() * duel.fighters.rival.deck.slots.length));
  }
}
