import { describe, expect, it } from 'vitest';
import { ARENA, BALL, CATCH, DUEL, HIT } from '../src/config';
import { predictX, rallySpeed, speedOf, stepBall, type Ball } from '../src/core/ball';
import { PLAYER_TEST_DECK, RIVAL_TEST_DECK } from '../src/core/cards';
import { beats, counterOf } from '../src/core/colors';
import { Deck } from '../src/core/deck';
import { Duel, backY, lineY, type DuelEvent } from '../src/core/duel';
import { createRng } from '../src/core/rng';
import { RivalAI } from '../src/ai/rival';

const newDuel = (seed = 1) => new Duel({ seed, playerDeck: PLAYER_TEST_DECK, rivalDeck: RIVAL_TEST_DECK });

/** Step until an event of the given type fires (or give up). */
function runUntil(duel: Duel, type: DuelEvent['type'], each?: () => void, maxSteps = 20000): DuelEvent[] {
  const seen: DuelEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    each?.();
    duel.step(DUEL.step);
    const ev = duel.drainEvents();
    seen.push(...ev);
    if (ev.some((e) => e.type === type)) return seen;
  }
  throw new Error(`no ${type} event`);
}

describe('speed ramp', () => {
  it('starts at base speed and never decreases with touches or time', () => {
    expect(rallySpeed(0, 0)).toBe(BALL.baseSpeed);
    let prev = 0;
    for (let t = 0; t < 400; t++) {
      const s = rallySpeed(t, t * 1.5);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(prev).toBe(BALL.maxRallySpeed);
  });

  it('keeps climbing across a hit (no reset)', () => {
    const duel = newDuel();
    runUntil(duel, 'serve');
    const before = duel.speed;
    duel.moveTo('player', ARENA.wallLeft); // stand far from the ball so it hits
    duel.ball.x = ARENA.wallRight - 40;
    duel.ball.vx = 0;
    runUntil(duel, 'hit', () => duel.moveTo('player', ARENA.wallLeft));
    expect(duel.speed).toBeGreaterThanOrEqual(before);
  });
});

describe('ball', () => {
  it('bounces off side walls', () => {
    const b: Ball = { x: ARENA.wallRight - 20, y: 800, vx: 500, vy: 0, owner: 'player', color: 'neutral', cardId: null, damage: 0, perfect: false, passed: false };
    stepBall(b, 0.1);
    expect(b.vx).toBeLessThan(0);
    expect(b.x).toBeLessThanOrEqual(ARENA.wallRight - BALL.radius);
  });

  it('predicts the crossing point including bounces', () => {
    const b: Ball = { x: 360, y: 1200, vx: 900, vy: -700, owner: 'player', color: 'neutral', cardId: null, damage: 0, perfect: false, passed: false };
    const predicted = predictX(b, ARENA.rivalY);
    const sim = { ...b };
    while (sim.y > ARENA.rivalY) stepBall(sim, 1 / 2000);
    expect(Math.abs(sim.x - predicted)).toBeLessThan(3);
  });
});

describe('duel', () => {
  it('auto-catches a ball in reach and throws it back with the armed card', () => {
    const duel = newDuel();
    const armed = duel.fighters.player.deck.armedCard;
    const ev = runUntil(duel, 'catch', () => duel.moveTo('player', duel.ball.x));
    const c = ev.find((e) => e.type === 'catch')!;
    expect(c.type === 'catch' && c.side).toBe('player');
    expect(c.type === 'catch' && c.perfect).toBe(true);
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.vy).toBeLessThan(0);
    expect(duel.ball.color).toBe(armed.color);
    expect(duel.ball.damage).toBe(Math.round(armed.damage * CATCH.perfectDamageMul));
  });

  it('edge catches are not perfect and angle the throw', () => {
    const duel = newDuel();
    runUntil(duel, 'serve');
    const ev = runUntil(duel, 'catch', () => duel.moveTo('player', duel.ball.x - CATCH.reach * 0.9));
    const c = ev.find((e) => e.type === 'catch')!;
    expect(c.type === 'catch' && c.perfect).toBe(false);
    expect(duel.ball.vx).toBeGreaterThan(0);
  });

  it('a miss deals the throw damage and ricochets to the attacker instead of resetting', () => {
    const duel = newDuel();
    runUntil(duel, 'serve');
    const dmg = duel.ball.damage;
    const away = () => duel.moveTo('player', duel.ball.x < 360 ? ARENA.wallRight : ARENA.wallLeft);
    const ev = runUntil(duel, 'hit', away);
    expect(ev.some((e) => e.type === 'miss')).toBe(true);
    expect(duel.fighters.player.hp).toBe(100 - dmg);
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.y).toBe(backY('player'));
    expect(duel.ball.vy).toBeLessThan(0); // heading back up at the rival
    expect(duel.ball.damage).toBe(HIT.ricochetDamage);
    expect(duel.state).toBe('play');
  });

  it('ends at 0 HP', () => {
    const duel = newDuel();
    duel.fighters.player.hp = 1;
    runUntil(duel, 'serve');
    const ev = runUntil(duel, 'ko', () => duel.moveTo('player', duel.ball.x < 360 ? ARENA.wallRight : ARENA.wallLeft));
    expect(ev.at(-1)).toEqual({ type: 'ko', winner: 'rival' });
    expect(duel.state).toBe('over');
  });

  it('a rival AI rally runs and stays inside the court', () => {
    const duel = newDuel(7);
    const ai = new RivalAI();
    let catches = 0;
    for (let i = 0; i < 120 * 60 && duel.state !== 'over'; i++) {
      ai.update(duel, DUEL.step);
      duel.moveTo('player', duel.ball.x + 20); // a decent but imperfect player
      duel.step(DUEL.step);
      for (const e of duel.drainEvents()) if (e.type === 'catch' && e.side === 'rival') catches++;
      expect(duel.ball.y).toBeGreaterThanOrEqual(backY('rival') - 30);
      expect(duel.ball.y).toBeLessThanOrEqual(backY('player') + 30);
    }
    expect(catches).toBeGreaterThan(3);
    expect(duel.state === 'over' || speedOf(duel.ball) > 0).toBe(true);
    expect(lineY('rival')).toBe(ARENA.rivalY);
  });
});

describe('deck', () => {
  it('cycles 1-2-3-1 and refills a spent slot', () => {
    const d = new Deck(PLAYER_TEST_DECK, createRng(3));
    expect(d.armed).toBe(0);
    d.cycle(); d.cycle(); expect(d.armed).toBe(2);
    d.cycle(); expect(d.armed).toBe(0);
    const before = d.drawCount;
    d.spend();
    expect(d.slots).toHaveLength(3);
    expect(d.drawCount).toBe(before - 1);
    for (let i = 0; i < 50; i++) d.spend(); // reshuffles the discard
    expect(d.slots.every(Boolean)).toBe(true);
  });
});

describe('colors', () => {
  it('forms a counter triangle', () => {
    expect(beats('red', 'blue')).toBe(true);
    expect(beats('blue', 'black')).toBe(true);
    expect(beats('black', 'red')).toBe(true);
    expect(beats('blue', 'red')).toBe(false);
    expect(beats('red', 'neutral')).toBe(false);
    expect(counterOf('blue')).toBe('red');
  });
});
