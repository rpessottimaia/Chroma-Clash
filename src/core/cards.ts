import type { PowerColor } from './colors';

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Card {
  id: string;
  name: string;
  color: PowerColor;
  rarity: Rarity;
  damage: number;
  /** Multiplier on the rally speed for this throw. */
  speedMul: number;
  /** GDD effect text. Only damage and speed are active in milestones 1-2. */
  effect: string;
}

const card = (c: Card): Card => c;

export const CARDS = {
  fastball: card({ id: 'fastball', name: 'Fastball', color: 'red', rarity: 'common', damage: 12, speedMul: 1.4, effect: '40% faster throw' }),
  heavy: card({ id: 'heavy', name: 'Heavy', color: 'red', rarity: 'common', damage: 22, speedMul: 0.85, effect: 'Slower, thick wake, shakes the screen' }),
  cannon: card({ id: 'cannon', name: 'Cannon', color: 'red', rarity: 'rare', damage: 30, speedMul: 1.3, effect: 'Fast and heavy' }),
  overheat: card({ id: 'overheat', name: 'Overheat', color: 'red', rarity: 'uncommon', damage: 15, speedMul: 1.1, effect: 'More damage the faster the ball; costs 5 HP' }),
  curve: card({ id: 'curve', name: 'Curve', color: 'blue', rarity: 'common', damage: 14, speedMul: 1.05, effect: 'Bends in the air' }),
  zigzag: card({ id: 'zigzag', name: 'Zigzag', color: 'blue', rarity: 'uncommon', damage: 14, speedMul: 1.05, effect: 'Snaps side to side' }),
  ghost: card({ id: 'ghost', name: 'Ghost', color: 'blue', rarity: 'rare', damage: 15, speedMul: 1.1, effect: 'Flickers and fades mid-court' }),
  split: card({ id: 'split', name: 'Split', color: 'blue', rarity: 'uncommon', damage: 12, speedMul: 1.1, effect: 'Throws a decoy alongside' }),
  leech: card({ id: 'leech', name: 'Leech', color: 'black', rarity: 'common', damage: 12, speedMul: 1.0, effect: 'Heals you 10 if it lands' }),
  hex: card({ id: 'hex', name: 'Hex', color: 'black', rarity: 'uncommon', damage: 10, speedMul: 1.0, effect: "Rival's next armed power fizzles" }),
  sacrifice: card({ id: 'sacrifice', name: 'Sacrifice', color: 'black', rarity: 'rare', damage: 35, speedMul: 1.0, effect: 'You lose 15 HP to throw it' }),
  shade: card({ id: 'shade', name: 'Shade', color: 'black', rarity: 'common', damage: 12, speedMul: 1.0, effect: 'Dims the arena for the rival' }),
} satisfies Record<string, Card>;

export type CardId = keyof typeof CARDS;

/** Placeholder decks for milestones 1-2 (starter-deck rules come with the roguelike run). */
export const PLAYER_TEST_DECK: CardId[] = [
  'fastball', 'fastball', 'fastball', 'heavy', 'heavy', 'curve', 'curve', 'leech',
];

export const RIVAL_TEST_DECK: CardId[] = [
  'curve', 'curve', 'shade', 'shade', 'leech', 'fastball', 'heavy', 'zigzag',
];
