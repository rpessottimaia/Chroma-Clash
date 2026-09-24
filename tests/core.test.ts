import { describe, expect, it } from 'vitest';
import { ARENA, BALL, CATCH, DECK, DUEL, HIT } from '../src/config';
import { DEG, launchAt, newBall, predictX, rallySpeed, speedOf, stepBall, type Ball, type Side } from '../src/core/ball';
import { ALL_CARD_IDS, CARDS, STARTER_DECK, cardsOfColor, type CardId } from '../src/core/cards';
import { POWER_COLORS, beats, counterOf } from '../src/core/colors';
import { Deck } from '../src/core/deck';
import { Duel, lineY, type DuelEvent } from '../src/core/duel';
import { createRng } from '../src/core/rng';
import { RivalAI, makeRivalLoadout } from '../src/ai/rival';
import { normalizeDeck } from '../src/meta/profile';

const RIVAL_DECK: CardId[] = ['lance', 'lance', 'lance'];
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

/** Stand still and tap just before impact. */
const catcher = (duel: Duel, side: Side, lead = 0.05) => () => {
  if (duel.incomingTime(side) <= lead) duel.tryCatch(side);
};
/** Never tap: get hit (the ball is aimed at you). */
const idle = () => {};
/** Step aside once the ball is close. */
const dodger = (duel: Duel, side: Side) => () => {
  if (duel.incomingTime(side) < 0.5) duel.moveTo(side, duel.ball.x < 360 ? duel.ball.x + 200 : duel.ball.x - 200);
};
const both = (...fs: (() => void)[]) => () => fs.forEach((f) => f());

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

  it('aims a curving throw so it still lands on the target', () => {
    for (const [curve, target] of [[1.4, 200], [-1.6, 520], [0.9, 360], [0, 150]] as const) {
      const b = { ...newBall(360, lineY('player'), 'player'), curve, sCurve: curve === 0.9 };
      launchAt(b, 900, target, lineY('rival'), 55 * DEG);
      const sim = { ...b };
      while (sim.y > lineY('rival')) stepBall(sim, DUEL.step);
      expect(Math.abs(sim.x - target)).toBeLessThan(6);
      expect(Math.abs(predictX(b, lineY('rival')) - target)).toBeLessThan(6);
    }
  });
});

describe('dodgeball rules', () => {
  it('every throw is aimed at the target: standing still gets you hit', () => {
    const duel = newDuel();
    const ev = runUntil(duel, 'hit', idle);
    const h = ev.find((e) => e.type === 'hit')!;
    expect(h.type === 'hit' && h.victim).toBe('player');
    expect(duel.fighters.player.hp).toBe(100 - HIT.plainDamage);
    // The ball bounces back at the thrower, it never resets.
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.vy).toBeLessThan(0);
    expect(duel.ball.damage).toBe(HIT.ricochetDamage);
  });

  it('a timed tap catches the ball and throws it back with the armed power', () => {
    const duel = newDuel();
    const armed = duel.fighters.player.deck.armedCard;
    const ev = runUntil(duel, 'catch', catcher(duel, 'player'));
    const c = ev.find((e) => e.type === 'catch')!;
    expect(c.type === 'catch' && c.side).toBe('player');
    expect(c.type === 'catch' && c.perfect).toBe(true);
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.color).toBe(armed.color);
    expect(duel.ball.damage).toBe(Math.round(armed.damage * CATCH.perfectDamageMul));
    expect(duel.fighters.player.hp).toBe(100);
  });

  it('an early tap (not perfect) still catches if the ball arrives in the window', () => {
    const duel = newDuel();
    const ev = runUntil(duel, 'catch', catcher(duel, 'player', CATCH.window - 0.05));
    const c = ev.find((e) => e.type === 'catch')!;
    expect(c.type === 'catch' && c.perfect).toBe(false);
  });

  it('tapping far too early fumbles: whiff, cooldown, then the hit', () => {
    const duel = newDuel();
    runUntil(duel, 'serve');
    let tapped = false;
    const ev = runUntil(duel, 'hit', () => {
      if (!tapped && duel.incomingTime('player') < CATCH.window + 0.25) tapped = duel.tryCatch('player');
    });
    expect(ev.some((e) => e.type === 'whiff')).toBe(true);
    expect(ev.some((e) => e.type === 'catch')).toBe(false);
  });

  it('taps do nothing unless a ball is coming at you and close', () => {
    const duel = newDuel();
    expect(duel.tryCatch('player')).toBe(false); // before the serve
    runUntil(duel, 'catch', catcher(duel, 'player'));
    expect(duel.tryCatch('player')).toBe(false); // ball flying away
    expect(duel.tryCatch('rival')).toBe(false); // still far from the rival
  });

  it('dodging avoids damage and you pick the ball up for a plain throw', () => {
    const duel = newDuel();
    const ev = runUntil(duel, 'pickup', dodger(duel, 'player'));
    expect(ev.some((e) => e.type === 'dodge' && e.side === 'player')).toBe(true);
    expect(duel.fighters.player.hp).toBe(100);
    for (let i = 0; i < Math.ceil(HIT.pickupTime / DUEL.step) + 2; i++) duel.step(DUEL.step);
    expect(duel.ball.owner).toBe('player');
    expect(duel.ball.color).toBe('neutral');
    expect(duel.ball.damage).toBe(HIT.plainDamage);
    expect(duel.ball.vy).toBeLessThan(0);
  });

  it('a caught throw flies at the rival and hits it if it does nothing', () => {
    const duel = newDuel();
    runUntil(duel, 'catch', catcher(duel, 'player'));
    const dmg = duel.ball.damage;
    const ev = runUntil(duel, 'hit', idle);
    const h = ev.find((e) => e.type === 'hit')!;
    expect(h.type === 'hit' && h.victim).toBe('rival');
    expect(duel.fighters.rival.hp).toBe(100 - dmg);
  });

  it('ends at 0 HP', () => {
    const duel = newDuel();
    duel.fighters.player.hp = 1;
    const ev = runUntil(duel, 'ko', idle);
    expect(ev.at(-1)).toEqual({ type: 'ko', winner: 'rival' });
    expect(duel.state).toBe('over');
  });

  it('the rival AI catches, dodges and fumbles over a long rally', () => {
    const duel = newDuel(7, STARTER_DECK, RIVAL_DECK);
    const ai = new RivalAI();
    const counts = { catch: 0, dodge: 0, hit: 0 };
    for (let i = 0; i < 120 * 90 && duel.state !== 'over'; i++) {
      ai.update(duel, DUEL.step);
      catcher(duel, 'player')();
      duel.step(DUEL.step);
      for (const e of duel.drainEvents()) {
        if (e.type === 'catch' && e.side === 'rival') counts.catch++;
        if (e.type === 'dodge' && e.side === 'rival') counts.dodge++;
        if (e.type === 'hit' && e.victim === 'rival') counts.hit++;
      }
    }
    expect(counts.catch).toBeGreaterThan(3);
    expect(counts.hit).toBeGreaterThan(0);
  });
});

describe('card effects', () => {
  /** Player catches the serve; the rival then eats the throw. */
  function landPlayerThrow(duel: Duel): DuelEvent[] {
    runUntil(duel, 'catch', catcher(duel, 'player'));
    return runUntil(duel, 'hit', idle);
  }

  it('Guard shields the thrower from the next hit', () => {
    const duel = newDuel(3, ['guard', 'guard', 'guard']);
    runUntil(duel, 'catch', catcher(duel, 'player'));
    expect(duel.fighters.player.shield).toBe(true);
    const ev = runUntil(duel, 'block', catcher(duel, 'rival'));
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
    runUntil(duel, 'catch', catcher(duel, 'player'));
    expect(duel.fighters.player.hp).toBe(85);
    expect(duel.ball.damage).toBe(Math.round(35 * CATCH.perfectDamageMul));
  });

  it("Hex makes the rival's next throw fizzle into a plain ball", () => {
    const duel = newDuel(6, ['hex', 'hex', 'hex']);
    runUntil(duel, 'catch', catcher(duel, 'player'));
    expect(duel.fighters.rival.fizzled).toBe(true);
    const ev = runUntil(duel, 'catch', catcher(duel, 'rival'));
    const c = ev.find((e) => e.type === 'catch' && e.side === 'rival');
    expect(c && c.type === 'catch' && c.fizzled).toBe(true);
    expect(duel.ball.color).toBe('neutral');
  });

  it('Sprout grows with the rally', () => {
    const duel = newDuel(8, ['sprout', 'sprout', 'sprout']);
    runUntil(duel, 'catch', catcher(duel, 'player'));
    const first = duel.ball.damage;
    runUntil(duel, 'catch', catcher(duel, 'rival'));
    runUntil(duel, 'catch', catcher(duel, 'player'));
    expect(duel.ball.damage).toBe(first + Math.round(2 * 3 * CATCH.perfectDamageMul));
  });

  it('Rot poisons over time and can finish a duel', () => {
    const duel = newDuel(9, ['rot', 'rot', 'rot']);
    duel.fighters.rival.hp = 12;
    landPlayerThrow(duel);
    expect(duel.fighters.rival.poisonTime).toBeGreaterThan(0);
    runUntil(duel, 'ko', both(catcher(duel, 'player'), catcher(duel, 'rival')));
    expect(duel.winner).toBe('player');
  });

  it('Mirage throws two decoys that never score', () => {
    const duel = newDuel(10, ['mirage', 'mirage', 'mirage']);
    runUntil(duel, 'catch', catcher(duel, 'player'));
    expect(duel.decoys).toHaveLength(2);
    expect(duel.decoys.every((d) => d.decoy && d.vy < 0)).toBe(true);
    runUntil(duel, 'catch', catcher(duel, 'rival'));
    expect(duel.fighters.rival.hp).toBe(100);
  });

  it('Chill slows the rival', () => {
    const duel = newDuel(11, ['chill', 'chill', 'chill']);
    runUntil(duel, 'catch', catcher(duel, 'player'));
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
    expect(beats('white', 'red')).toBe(true);
    expect(beats('blue', 'red')).toBe(false);
    expect(beats('red', 'neutral')).toBe(false);
    for (const c of POWER_COLORS) expect(beats(counterOf(c), c)).toBe(true);
  });
});
