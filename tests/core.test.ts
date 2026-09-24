import { describe, expect, it } from 'vitest';
import { ARENA, BALL, CATCH, DECK, DUEL, HIT } from '../src/config';
import { newBall, predictX, rallySpeed, speedOf, stepBall, type Ball } from '../src/core/ball';
import { ALL_CARD_IDS, CARDS, STARTER_DECK, cardsOfColor, type CardId } from '../src/core/cards';
import { POWER_COLORS, beats, counterOf } from '../src/core/colors';
import { Deck } from '../src/core/deck';
import { Duel, backY, lineY, type DuelEvent } from '../src/core/duel';
import { createRng } from '../src/core/rng';
import { RivalAI, makeRivalLoadout } from '../src/ai/rival';
import { normalizeDeck } from '../src/meta/profile';

const RIVAL_DECK: CardId[] = ['curve', 'shade', 'leech', 'fastball', 'guard'];
const newDuel = (seed = 1, playerDeck: CardId[] = STARTER_DECK, rivalDeck: CardId[] = RIVAL_DECK) =>
  new Duel({ seed, playerDeck, rivalDeck });

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

const dodge = (duel: Duel, side: 'player' | 'rival' = 'player') => () =>
  duel.moveTo(side, duel.ball.x < 360 ? ARENA.wallRight : ARENA.wallLeft);
const track = (duel: Duel, side: 'player' | 'rival' = 'player') => () => duel.moveTo(side, duel.ball.x);

/** Player catches the serve dead-center; the rival then dodges so the throw lands. */
function landPlayerThrow(duel: Duel): DuelEvent[] {
  runUntil(duel, 'catch', track(duel));
  return runUntil(duel, 'hit', dodge(duel, 'rival'));
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
});

describe('ball flight', () => {
  const upBall = (vx: number, curve = 0): Ball => ({ ...newBall(360, 1200, 'player'), vx, vy: -700, curve });

  it('bounces off side walls', () => {
    const b = { ...newBall(ARENA.wallRight - 20, 800, 'player'), vx: 500 };
    stepBall(b, 0.1);
    expect(b.vx).toBeLessThan(0);
    expect(b.x).toBeLessThanOrEqual(ARENA.wallRight - BALL.radius);
  });

  it('curves: positive curve bends toward +x while keeping speed', () => {
    const straight = upBall(0);
    const bent = upBall(0, 0.8);
    for (let i = 0; i < 60; i++) {
      stepBall(straight, 1 / 120);
      stepBall(bent, 1 / 120);
    }
    expect(straight.x).toBeCloseTo(360, 5);
    expect(bent.x).toBeGreaterThan(370);
    expect(speedOf(bent)).toBeCloseTo(700, 3);
  });

  it('never turns sideways or back, however hard it curves', () => {
    const b = upBall(0, 50);
    for (let i = 0; i < 240; i++) {
      stepBall(b, 1 / 120);
      expect(b.vy).toBeLessThan(0);
    }
  });

  it('predicts the crossing point of a curving, bouncing ball', () => {
    const b = { ...upBall(900, -1.2), sCurve: true };
    const predicted = predictX(b, ARENA.rivalY);
    const sim = { ...b };
    while (sim.y > ARENA.rivalY) stepBall(sim, 1 / 2000);
    expect(Math.abs(sim.x - predicted)).toBeLessThan(8);
  });
});

describe('duel', () => {
  it('auto-catches a ball in reach and throws it back with the armed card', () => {
    const duel = newDuel();
    const armed = duel.fighters.player.deck.armedCard;
    const ev = runUntil(duel, 'catch', track(duel));
    const c = ev.find((e) => e.type === 'catch')!;
    expect(c.type === 'catch' && c.side).toBe('player');
    expect(c.type === 'catch' && c.perfect).toBe(true);
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.vy).toBeLessThan(0);
    expect(duel.ball.color).toBe(armed.color);
    expect(duel.ball.damage).toBe(Math.round(armed.damage * CATCH.perfectDamageMul));
  });

  it('edge catches are not perfect, angle the throw and bend it', () => {
    const duel = newDuel(1, ['lance', 'lance', 'fastball']);
    duel.fighters.player.deck.arm(2); // fastball: not straight
    runUntil(duel, 'serve');
    const ev = runUntil(duel, 'catch', () => duel.moveTo('player', duel.ball.x - CATCH.reach * 0.9));
    const c = ev.find((e) => e.type === 'catch')!;
    expect(c.type === 'catch' && c.perfect).toBe(false);
    expect(duel.ball.vx).toBeGreaterThan(0);
    expect(duel.ball.curve).toBeGreaterThan(0.2);
  });

  it('a miss deals the throw damage and ricochets to the attacker instead of resetting', () => {
    const duel = newDuel();
    runUntil(duel, 'serve');
    const dmg = duel.ball.damage;
    const ev = runUntil(duel, 'hit', dodge(duel));
    expect(ev.some((e) => e.type === 'miss')).toBe(true);
    expect(duel.fighters.player.hp).toBe(100 - dmg);
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.y).toBe(backY('player'));
    expect(duel.ball.vy).toBeLessThan(0);
    expect(duel.ball.damage).toBe(HIT.ricochetDamage);
    expect(duel.state).toBe('play');
  });

  it('ends at 0 HP', () => {
    const duel = newDuel();
    duel.fighters.player.hp = 1;
    runUntil(duel, 'serve');
    const ev = runUntil(duel, 'ko', dodge(duel));
    expect(ev.at(-1)).toEqual({ type: 'ko', winner: 'rival' });
    expect(duel.state).toBe('over');
  });

  it('a rival AI rally runs and stays inside the court', () => {
    const duel = newDuel(7);
    const ai = new RivalAI();
    let catches = 0;
    for (let i = 0; i < 120 * 60 && duel.state !== 'over'; i++) {
      ai.update(duel, DUEL.step);
      duel.steer('player', duel.ball.x + 20, 3000, DUEL.step);
      duel.step(DUEL.step);
      for (const e of duel.drainEvents()) if (e.type === 'catch' && e.side === 'rival') catches++;
      expect(duel.ball.y).toBeGreaterThanOrEqual(backY('rival') - 30);
      expect(duel.ball.y).toBeLessThanOrEqual(backY('player') + 30);
    }
    expect(catches).toBeGreaterThan(3);
    expect(lineY('rival')).toBe(ARENA.rivalY);
  });
});

describe('card effects', () => {
  it('Guard shields the thrower from the next hit', () => {
    const duel = newDuel(3, ['guard', 'guard', 'guard']);
    runUntil(duel, 'catch', track(duel));
    expect(duel.fighters.player.shield).toBe(true);
    // Rival returns it; player dodges; the shield eats the hit.
    const ev = runUntil(duel, 'block', () => {
      if (duel.ball.owner === 'player') track(duel, 'rival')();
      else dodge(duel)();
    });
    expect(ev.some((e) => e.type === 'hit' && e.victim === 'player')).toBe(false);
    expect(duel.fighters.player.hp).toBe(100);
    expect(duel.fighters.player.shield).toBe(false);
  });

  it('Leech heals the thrower when it lands', () => {
    const duel = newDuel(4, ['leech', 'leech', 'leech']);
    duel.fighters.player.hp = 50;
    landPlayerThrow(duel);
    expect(duel.fighters.player.hp).toBe(60);
  });

  it('Sacrifice costs HP on the throw', () => {
    const duel = newDuel(5, ['sacrifice', 'sacrifice', 'sacrifice']);
    runUntil(duel, 'catch', track(duel));
    expect(duel.fighters.player.hp).toBe(85);
    expect(duel.ball.damage).toBe(Math.round(35 * CATCH.perfectDamageMul));
  });

  it("Hex makes the rival's next throw fizzle into a plain ball", () => {
    const duel = newDuel(6, ['hex', 'hex', 'hex']);
    runUntil(duel, 'catch', track(duel));
    expect(duel.fighters.rival.fizzled).toBe(true);
    const ev = runUntil(duel, 'catch', track(duel, 'rival'));
    const c = ev.find((e) => e.type === 'catch' && e.side === 'rival');
    expect(c && c.type === 'catch' && c.fizzled).toBe(true);
    expect(duel.ball.color).toBe('neutral');
    expect(duel.ball.damage).toBeLessThanOrEqual(Math.ceil(HIT.ricochetDamage * CATCH.perfectDamageMul));
  });

  it('Sprout grows with the rally', () => {
    const duel = newDuel(8, ['sprout', 'sprout', 'sprout'], ['lance', 'lance', 'lance']);
    runUntil(duel, 'catch', track(duel));
    const first = duel.ball.damage;
    runUntil(duel, 'catch', track(duel, 'rival'));
    runUntil(duel, 'catch', track(duel));
    expect(duel.ball.damage).toBe(first + Math.round(2 * 3 * CATCH.perfectDamageMul));
  });

  it('Rot poisons over time and can finish a duel', () => {
    const duel = newDuel(9, ['rot', 'rot', 'rot']);
    duel.fighters.rival.hp = 12;
    landPlayerThrow(duel);
    expect(duel.fighters.rival.poisonTime).toBeGreaterThan(0);
    runUntil(duel, 'ko', () => {
      track(duel)();
      track(duel, 'rival')();
    });
    expect(duel.winner).toBe('player');
  });

  it('Mirage throws two decoys that never score', () => {
    const duel = newDuel(10, ['mirage', 'mirage', 'mirage']);
    runUntil(duel, 'catch', track(duel));
    expect(duel.decoys).toHaveLength(2);
    expect(duel.decoys.every((d) => d.decoy && d.vy < 0)).toBe(true);
    runUntil(duel, 'catch', track(duel, 'rival'));
    expect(duel.fighters.rival.hp).toBe(100);
  });

  it('Chill slows the rival', () => {
    const duel = newDuel(11, ['chill', 'chill', 'chill']);
    runUntil(duel, 'catch', track(duel));
    const r = duel.fighters.rival;
    expect(r.slowTime).toBeGreaterThan(0);
    const x0 = r.x;
    duel.steer('rival', x0 + 500, 1000, 0.1);
    expect(r.x - x0).toBeCloseTo(50, 5);
  });
});

describe('deck', () => {
  it('cycles 1-2-3-1 and refills a spent slot', () => {
    const d = new Deck(STARTER_DECK, createRng(3));
    expect(d.armed).toBe(0);
    d.cycle(); d.cycle(); expect(d.armed).toBe(2);
    d.cycle(); expect(d.armed).toBe(0);
    const before = d.drawCount;
    d.spend();
    expect(d.slots).toHaveLength(3);
    expect(d.drawCount).toBe(before - 1);
    for (let i = 0; i < 50; i++) d.spend();
    expect(d.slots.every(Boolean)).toBe(true);
  });

  it('a 3-card deck keeps the same three powers all duel', () => {
    const d = new Deck(['fastball', 'curve', 'guard'], createRng(1));
    const set = [...d.slots].sort();
    for (let i = 0; i < 20; i++) {
      d.arm(i % 3);
      d.spend();
      expect([...d.slots].sort()).toEqual(set);
    }
  });

  it('normalizes saved decks', () => {
    expect(normalizeDeck(['fastball', 'fastball', 'curve', 'nope', 'guard'])).toEqual(['fastball', 'curve', 'guard']);
    expect(normalizeDeck(['fastball'])).toEqual(STARTER_DECK);
    expect(normalizeDeck(ALL_CARD_IDS)).toHaveLength(DECK.max);
  });
});

describe('card pool', () => {
  it('has five colors of eight unique cards', () => {
    expect(POWER_COLORS).toHaveLength(5);
    for (const c of POWER_COLORS) expect(cardsOfColor(c)).toHaveLength(8);
    for (const id of ALL_CARD_IDS) expect(CARDS[id].id).toBe(id);
  });

  it('builds color-themed rival decks', () => {
    for (let s = 0; s < 20; s++) {
      const r = makeRivalLoadout(createRng(s));
      expect(new Set(r.deck).size).toBe(DECK.rivalSize);
      expect(r.deck.filter((id) => CARDS[id].color === r.color).length).toBe(DECK.rivalSize - 1);
    }
  });
});

describe('colors', () => {
  it('forms a counter wheel', () => {
    expect(beats('red', 'blue')).toBe(true);
    expect(beats('blue', 'black')).toBe(true);
    expect(beats('white', 'red')).toBe(true);
    expect(beats('blue', 'red')).toBe(false);
    expect(beats('red', 'neutral')).toBe(false);
    expect(counterOf('blue')).toBe('red');
    for (const c of POWER_COLORS) expect(beats(counterOf(c), c)).toBe(true);
  });
});
