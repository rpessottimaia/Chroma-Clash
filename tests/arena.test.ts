import { describe, expect, it } from 'vitest';
import { COURT, DODGE, DUEL, MOVE, STRIKE } from '../src/config';
import { StrikeGame } from '../src/arena/strike';
import { DodgeGame } from '../src/arena/dodge';
import { DodgeAI, StrikeAI } from '../src/arena/ai';
import { BODY, speedOf, type ArenaEvent, type ArenaGame } from '../src/arena/common';
import type { CardId } from '../src/core/cards';

const DECK: CardId[] = ['fastball', 'curve', 'leech'];
const dt = DUEL.step;

function run(g: ArenaGame, until: (e: ArenaEvent) => boolean, each?: () => void, max = 60 * 120): ArenaEvent[] {
  const seen: ArenaEvent[] = [];
  for (let i = 0; i < max; i++) {
    each?.();
    g.step(dt);
    const ev = g.drainEvents();
    seen.push(...ev);
    if (ev.some(until)) return seen;
  }
  throw new Error('condition never met');
}
const started = (g: ArenaGame) => run(g, (e) => e.type === 'serve');

describe('A: strike', () => {
  const put = (g: StrikeGame, x: number, y: number) => { g.ball.x = x; g.ball.y = y; g.ball.vx = 0; g.ball.vy = 0; };

  it('a tap does nothing unless the ball is inside your ring', () => {
    const g = new StrikeGame({ seed: 1, playerDeck: DECK, rivalDeck: DECK });
    started(g);
    const p = g.fighters.player;
    put(g, p.x, p.y - STRIKE.swingRadius - 40);
    expect(g.action('player')).toBe(false);
    put(g, p.x, p.y - STRIKE.swingRadius + 20);
    expect(g.action('player')).toBe(true);
  });

  it('a strike sends the ball at the rival and it hurts them on contact', () => {
    const g = new StrikeGame({ seed: 2, playerDeck: DECK, rivalDeck: DECK });
    started(g);
    const p = g.fighters.player;
    const r = g.fighters.rival;
    put(g, p.x, p.y - 60);
    g.action('player');
    expect(g.ball.owner).toBe('player');
    expect(g.ball.vy).toBeLessThan(0);
    const ev = run(g, (e) => e.type === 'hit');
    const hit = ev.find((e) => e.type === 'hit')!;
    expect(hit.type === 'hit' && hit.victim).toBe('rival');
    expect(r.hp).toBeLessThan(100);
    // After a hit the ball is neutral: nobody's weapon until someone strikes it.
    expect(g.ball.owner).toBe(null);
  });

  it('three strikes charge the meter; the fourth fires the power card', () => {
    const g = new StrikeGame({ seed: 3, playerDeck: ['cannon', 'cannon', 'cannon'], rivalDeck: DECK });
    started(g);
    const p = g.fighters.player;
    const cards: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      put(g, p.x, p.y - 60);
      p.cooldown = 0;
      g.action('player');
      const ev = g.drainEvents().find((e) => e.type === 'strike');
      cards.push(ev && ev.type === 'strike' ? ev.card?.id ?? null : null);
    }
    expect(cards).toEqual([null, null, null, 'cannon']);
    expect(g.meter.player).toBe(0);
  });

  it('the ball never stops and only gets faster', () => {
    const g = new StrikeGame({ seed: 4, playerDeck: DECK, rivalDeck: DECK });
    started(g);
    const s0 = g.speed;
    for (let i = 0; i < 600; i++) g.step(dt);
    expect(speedOf(g.ball)).toBeGreaterThan(0);
    expect(g.speed).toBeGreaterThan(s0);
    expect(g.ball.x).toBeGreaterThanOrEqual(COURT.left);
    expect(g.ball.y).toBeLessThanOrEqual(COURT.bottom);
  });

  it('AI vs a chasing player produces a real duel', () => {
    const g = new StrikeGame({ seed: 5, playerDeck: DECK, rivalDeck: DECK });
    const ai = new StrikeAI();
    const p = g.fighters.player;
    let hits = 0;
    for (let i = 0; i < 120 * 240 && g.state !== 'over'; i++) {
      ai.update(g, dt);
      const b = g.ball;
      if (b.owner !== 'player') {
        // Simple bot: chase the ball when it's in our half, strike when in range.
        const inHalf = b.y > COURT.mid;
        const tx = inHalf ? b.x : 360;
        const ty = inHalf ? b.y + 40 : COURT.bottom - 250;
        const d = Math.hypot(tx - p.x, ty - p.y);
        const k = Math.min(1, (MOVE.playerSpeed * 0.5 * dt) / (d || 1));
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
        if (g.inRange('player') && b.safeTime === 0) g.action('player');
      }
      g.step(dt);
      hits += g.drainEvents().filter((e) => e.type === 'hit').length;
    }
    expect(hits).toBeGreaterThan(3);
  });
});

describe('B: dodgeball', () => {
  const walkTo = (g: DodgeGame, x: number, y: number) => {
    const p = g.fighters.player;
    p.x = x;
    p.y = Math.max(g.bounds('player').minY, y);
  };

  it('starts with three balls on the midline; walking onto one picks it up with your power loaded', () => {
    const g = new DodgeGame({ seed: 1, playerDeck: ['curve', 'curve', 'curve'], rivalDeck: DECK });
    expect(g.shots).toHaveLength(DODGE.balls);
    expect(g.shots.every((s) => s.state === 'ground' && s.y === COURT.mid)).toBe(true);
    started(g);
    const s = g.shots[0];
    walkTo(g, s.x, s.y + BODY);
    g.step(dt);
    expect(g.holding('player')).toBe(s);
    expect(s.card?.id).toBe('curve');
  });

  it('tap throws the held ball at the rival; a hit hurts them and the ball drops on their side', () => {
    const g = new DodgeGame({ seed: 2, playerDeck: ['fastball', 'fastball', 'fastball'], rivalDeck: DECK });
    started(g);
    const s = g.shots[1];
    walkTo(g, s.x, s.y + BODY);
    g.step(dt);
    g.fighters.rival.x = s.x;
    expect(g.action('player')).toBe(true);
    expect(s.state).toBe('flying');
    expect(s.vy).toBeLessThan(0);
    run(g, (e) => e.type === 'hit');
    expect(g.fighters.rival.hp).toBe(100 - s.damage);
    expect(s.state).toBe('ground');
    expect(s.y).toBeLessThan(COURT.mid);
  });

  it('with empty hands, a tap as a ball arrives catches it and stings the thrower', () => {
    const g = new DodgeGame({ seed: 3, playerDeck: DECK, rivalDeck: DECK });
    started(g);
    const s = g.shots[0];
    // Give the rival a ball and have it throw straight at the player.
    const r = g.fighters.rival;
    r.x = s.x; r.y = COURT.mid - BODY; g.fighters.player.x = s.x;
    g.step(dt);
    expect(g.holding('rival')).toBe(s);
    g.action('rival');
    const ev = run(g, (e) => e.type === 'catch' || e.type === 'hit', () => {
      const t = g.threat('player');
      if (t && t.time < 0.1) g.action('player');
    });
    expect(ev.some((e) => e.type === 'catch' && e.side === 'player')).toBe(true);
    expect(g.holding('player')).toBe(s);
    expect(g.fighters.player.hp).toBe(100);
    expect(r.hp).toBe(100 - DODGE.caughtDamage);
  });

  it('a tap with empty hands and no ball coming does nothing', () => {
    const g = new DodgeGame({ seed: 4, playerDeck: DECK, rivalDeck: DECK });
    started(g);
    expect(g.action('player')).toBe(false);
  });

  it('AI vs a simple player produces a real duel with throws, hits and catches', () => {
    const g = new DodgeGame({ seed: 5, playerDeck: DECK, rivalDeck: DECK });
    const ai = new DodgeAI();
    const p = g.fighters.player;
    const counts = { throw: 0, hit: 0, catch: 0 };
    for (let i = 0; i < 120 * 240 && g.state !== 'over'; i++) {
      ai.update(g, dt);
      const held = g.holding('player');
      const t = g.threat('player');
      if (held) g.action('player');
      else if (t && t.time < 0.1 && i % 2 === 0) g.action('player');
      else {
        const loose = g.shots.find((s) => s.state === 'ground' && s.y >= COURT.mid - 1);
        if (loose) { p.x += Math.sign(loose.x - p.x) * Math.min(Math.abs(loose.x - p.x), 8); p.y += Math.sign(loose.y + BODY - p.y) * Math.min(Math.abs(loose.y + BODY - p.y), 8); }
        p.y = Math.max(g.bounds('player').minY, Math.min(g.bounds('player').maxY, p.y));
      }
      g.step(dt);
      for (const e of g.drainEvents()) if (e.type in counts) counts[e.type as keyof typeof counts]++;
    }
    expect(counts.throw).toBeGreaterThan(10);
    expect(counts.hit).toBeGreaterThan(3);
    expect(counts.catch).toBeGreaterThan(0);
  });
});
