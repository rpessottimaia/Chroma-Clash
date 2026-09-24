# Chroma Clash

A fast neon 1v1 ball duel for phones. The ball never stops bouncing between you and your rival. Every catch fires a power from your color-based card deck (Red / Blue / Black, with a counter triangle). It's a mix of Brazilian queimada, Pong and Magic-style colors, played in the mobile browser with nothing to install.

The full design is in [`docs/GDD.md`](docs/GDD.md).

## How to play

- **Slide** a thumb anywhere to move your chevron (it follows like a slider).
- **Tap** (or tap with a second finger while sliding) to cycle your 3 armed powers. Tap a pip to arm it directly.
- **Catching is automatic** when the ball reaches you inside your reach bar. The bright middle of the bar is a perfect catch (+25% damage). Edge catches angle the throw back.
- A missed ball hits you for the damage it carries, then ricochets straight back at the thrower. It never resets, and the speed only climbs.

Desktop fallback: arrow keys or A/D to move, Space to cycle, 1/2/3 to arm a slot.

## Run it

```bash
npm install
npm run dev        # dev server (also reachable from your phone on the same Wi-Fi)
npm test           # core logic unit tests
npm run build      # typecheck + static build into dist/
```

URL flags: `?debug=1` shows an FPS counter; `?reduceFlashes=1` turns off full-screen flashes (also a toggle on the title screen; `prefers-reduced-motion` is respected automatically).

## Code layout

```
src/
  config.ts        every tunable number (speeds, ramp, reach, damage, AI)
  main.ts          Phaser config (portrait 720x1560, scale FIT)
  settings.ts      reduce-motion / reduce-flashes / debug flags
  core/            pure game logic, no Phaser imports (reusable by a server later)
    ball.ts        ball state, speed ramp, wall bounces, landing prediction
    duel.ts        HP, auto-catch, perfect/edge catches, hit + ricochet rule
    deck.ts        3 power slots, cycling, spend + refill
    cards.ts       the 12 MVP cards
    colors.ts      neon palette + counter triangle
  ai/rival.ts      rival movement and aim
  scenes/          Boot (generated textures), Duel (rendering + input)
  fx/neon.ts       glow line helpers
tests/             Vitest specs for the core
```

## Status

GDD milestones 1 (neon arena, continuous ball, speed ramp, slide to move, auto-catch, AI rival) and 2 (power slots, tap to cycle, world color shift) are done. Card effects beyond damage and speed, counters, ultimates, quests and the roguelike run come next.
