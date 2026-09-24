import { ARENA_AI, COURT, MOVE, STRIKE } from '../config';
import { BODY, dist, speedOf, steer, type Shot } from './common';
import type { DodgeGame } from './dodge';
import type { StrikeGame } from './strike';

const CX = (COURT.left + COURT.right) / 2;

/** How hard a ball is to read: speed, curve, zigzag and ghosting all lower the odds. */
function difficulty(s: Shot, base: number): number {
  let k = 1;
  k *= 1 - Math.min(0.5, Math.max(0, speedOf(s) - base) / 3000);
  k *= 1 - Math.min(0.3, Math.abs(s.curve) * 0.15);
  if (s.zigzag) k *= 0.75;
  if (s.ghost) k *= 0.6;
  return k;
}

/**
 * Strike rival: chases loose balls; for each incoming shot, decides once whether to strike it
 * back (moves to meet it and taps when it's in range) or to dodge sideways.
 */
export class StrikeAI {
  private shotKey = '';
  private plan: 'strike' | 'dodge' = 'strike';
  private wait = 0;
  private rethink = 0;

  constructor(private readonly skill = ARENA_AI.strikeSkill) {}

  update(g: StrikeGame, dt: number): void {
    const me = g.fighters.rival;
    const b = g.ball;
    const bounds = g.bounds('rival');
    if (g.state !== 'play') return steer(me, me.x, me.y, MOVE.rivalSpeed, dt, bounds);

    let tx = CX;
    let ty = COURT.top + 260;
    if (b.owner === 'player') {
      // Incoming: decide once per shot.
      const key = `${g.strikes}`;
      this.rethink -= dt;
      if (key !== this.shotKey || this.rethink <= 0) {
        if (key !== this.shotKey) this.wait = ARENA_AI.reaction;
        this.shotKey = key;
        this.rethink = 1;
        this.plan = g.rng() < this.skill * difficulty(b, STRIKE.baseSpeed) ? 'strike' : 'dodge';
      }
      // A ball moving away is safe to chase down.
      if ((me.x - b.x) * b.vx + (me.y - b.y) * b.vy < 0) this.plan = 'strike';
      this.wait -= dt;
      if (this.wait > 0) return steer(me, me.x, me.y, MOVE.rivalSpeed, dt, bounds);
      if (this.plan === 'strike') {
        // Meet the ball a little ahead of where it is.
        tx = b.x + b.vx * 0.12;
        ty = b.y + b.vy * 0.12;
        if (g.inRange('rival')) g.action('rival');
      } else {
        // Step off the ball's line.
        const sp = speedOf(b) || 1;
        const px = -b.vy / sp;
        const py = b.vx / sp;
        const side = (me.x - b.x) * px + (me.y - b.y) * py >= 0 ? 1 : -1;
        tx = me.x + px * side * 200;
        ty = me.y + py * side * 200;
      }
    } else if (b.owner === null) {
      // Loose ball: race for it and strike it.
      tx = b.x + b.vx * 0.1;
      ty = b.y + b.vy * 0.1;
      if (g.inRange('rival') && b.safeTime === 0) g.action('rival');
    } else {
      // Our own ball is in flight: get back to a guarding spot, shading toward the ball.
      tx = CX + (b.x - CX) * 0.3;
      ty = COURT.top + 280;
    }
    steer(me, tx, ty, MOVE.rivalSpeed, dt, bounds);
  }
}

/**
 * Dodgeball rival: grabs the nearest ball on its side, holds it briefly, throws. When a ball
 * comes at it with empty hands, it decides once to catch (steps into it, hands up) or dodge.
 */
export class DodgeAI {
  private threatId = -1;
  private plan: 'catch' | 'dodge' = 'dodge';
  private holdTimer = 0;
  private dodgeDir = 1;

  constructor(private readonly skill = ARENA_AI.dodgeSkill) {}

  update(g: DodgeGame, dt: number): void {
    const me = g.fighters.rival;
    const bounds = g.bounds('rival');
    if (g.state !== 'play') return steer(me, me.x, me.y, MOVE.rivalSpeed, dt, bounds);

    const held = g.holding('rival');
    const threat = g.threat('rival');
    let tx = me.x;
    let ty = COURT.top + 220;

    if (threat && threat.time < 0.9) {
      if (threat.shot.id !== this.threatId) {
        this.threatId = threat.shot.id;
        const canCatch = !held;
        this.plan = canCatch && g.rng() < this.skill * difficulty(threat.shot, g.baseSpeed) ? 'catch' : 'dodge';
        this.dodgeDir = g.rng() < 0.5 ? -1 : 1;
      }
      const s = threat.shot;
      if (this.plan === 'catch') {
        tx = s.x + s.vx * threat.time;
        if (threat.time < 0.18) g.action('rival');
      } else {
        const sp = speedOf(s) || 1;
        tx = me.x + (-s.vy / sp) * this.dodgeDir * 220;
        if (tx < bounds.minX + 20 || tx > bounds.maxX - 20) tx = me.x - (-s.vy / sp) * this.dodgeDir * 220;
      }
      ty = me.y;
    } else if (held) {
      // Hold a moment, strafe, then throw.
      this.holdTimer -= dt;
      tx = CX + Math.sin(g.elapsed * 1.7) * 180;
      ty = COURT.top + 240;
      if (this.holdTimer <= 0) {
        g.action('rival');
        this.holdTimer = ARENA_AI.holdMin + g.rng() * (ARENA_AI.holdMax - ARENA_AI.holdMin);
      }
    } else {
      // Go get the nearest loose ball on our side.
      const loose = g.shots
        .filter((s) => s.state === 'ground' && s.y <= COURT.mid + 1)
        .sort((a, b) => dist(me.x, me.y, a.x, a.y) - dist(me.x, me.y, b.x, b.y))[0];
      if (loose) {
        tx = loose.x;
        ty = loose.y - BODY * 0.5;
        this.holdTimer = ARENA_AI.holdMin + g.rng() * (ARENA_AI.holdMax - ARENA_AI.holdMin);
      } else {
        tx = CX + Math.sin(g.elapsed * 1.3) * 150;
      }
    }
    steer(me, tx, ty, MOVE.rivalSpeed, dt, bounds);
  }
}
