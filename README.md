# Chroma Clash

A fast neon 1v1 ball duel for phones. The ball never stops bouncing between you and your rival. Every catch fires a power from your color-based card deck (Red / Blue / Black, with a counter triangle). It's a mix of Brazilian queimada, Pong and Magic-style colors, played in the mobile browser with nothing to install.

The full design is in [`docs/GDD.md`](docs/GDD.md).

## Prototypes (current build)

The menu has two real-time modes to compare. Both use your deck and show your power card at the bottom:

- **A · Strike:** one ball in a shared arena. Drag to move anywhere, tap when the ball is in your ring to strike it at the rival. 3 strikes charge your power card.
- **B · Dodgeball:** three balls. Walk over one to grab it (it carries your power card), tap to throw. Empty hands? Touch as a ball hits you to catch it.

The lane-based mode described below is retired from the menu while the prototypes are tested.

## How to play

Build a deck of 3 to 7 cards from five color decks (Surge, Phase, Void, Growth, Aegis; 8 cards each) on the **Edit deck** screen. Your deck is saved on your device. Then hit **Play** to face a color-themed rival.

It's dodgeball: every throw is aimed at your body.

- **The ball chases you**, then commits to a spot on your body and a landing marker appears. **Slide under the marker** so it's in your hands (the center of your chevron) and **tap to catch** as it closes. A late tap is a perfect catch (+25% damage); too early and you fumble. A catch throws the ball back with your armed power.
- **Slide** a thumb to move. Slide out of the way to **dodge**: safe, but you only get a plain throw back.
- **Get hit** and you lose HP; the ball bounces back at the thrower, who must catch or dodge it.
- **Tap a pip** at the bottom to arm that power. The world takes its color.

Desktop fallback: arrow keys or A/D to move, Space to catch, 1/2/3 or Q/E to arm a power.

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
    ball.ts        ball state, speed ramp, curved flight, wall bounces, landing prediction
    duel.ts        HP, auto-catch, perfect/edge catches, card effects, statuses, hit + ricochet
    deck.ts        3 power slots, cycling, spend + refill
    cards.ts       the 40-card pool (5 colors x 8) built from composable effects
    colors.ts      neon palette + counter wheel
  ai/rival.ts      rival decks, movement, curve prediction, decoy confusion
  meta/profile.ts  saved deck and record (localStorage)
  scenes/          Boot (generated textures), Menu, Deck (builder), Duel (rendering + input)
  fx/              neon glow helpers, buttons, round backdrop
tests/             Vitest specs for the core
```

## Status

Done: GDD milestones 1 (neon arena, continuous ball, speed ramp, slide to move, auto-catch, AI rival) and 2 (power slots, tap to cycle, world color shift), plus deck building with five colors, 40 cards with working effects, and curved ball flight. Next: counter bonuses, ultimates, quests and the roguelike run.
