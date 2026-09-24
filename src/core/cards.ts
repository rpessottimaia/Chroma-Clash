import type { PowerColor } from './colors';

export type Rarity = 'common' | 'uncommon' | 'rare';

/** Effect building blocks. A card is a damage/speed pair plus any mix of these. */
export interface CardFx {
  /** Curve away from the rival's position, rad/s of heading change. */
  curve?: number;
  /** The curve flips direction at midcourt (an S-bend). */
  sCurve?: boolean;
  /** Snap the sideways direction every this many seconds. */
  zigzag?: number;
  /** Speed multiplier gained per second of flight (starts at the card's speedMul). */
  accel?: number;
  /** Throw dead straight: ignores edge, movement and jitter curve. */
  straight?: boolean;
  /** Fades out mid-court. */
  ghost?: boolean;
  /** Fake balls thrown alongside. */
  decoys?: number;
  /** Arena goes dark for the target while this ball flies. */
  blind?: boolean;
  /** Extra damage per 1x of rally speed above the starting speed. */
  speedDamage?: number;
  /** Extra damage per catch earlier in the current rally (resets when anyone is hit). */
  rallyDamage?: number;
  /** Damage multiplier on a perfect catch, replacing the usual +25%. */
  perfectMul?: number;
  /** HP the thrower pays to throw it. */
  selfCost?: number;
  /** HP the thrower gains on throwing it. */
  heal?: number;
  /** HP the thrower gains if it lands. */
  healOnHit?: number;
  /** Poison on the target if it lands: damage per second for `poisonTime` seconds. */
  poison?: number;
  poisonTime?: number;
  /** The thrower blocks the next hit. */
  shield?: boolean;
  /** Thrower's catch reach grows for this many seconds. */
  reachBoost?: number;
  /** Target moves slower for this many seconds. */
  slowTarget?: number;
  /** Target's next throw flies at this fraction of its speed. */
  slowNextThrow?: number;
  /** Target's next armed power fizzles into a plain ball. */
  fizzle?: boolean;
}

export interface Card {
  id: string;
  name: string;
  color: PowerColor;
  rarity: Rarity;
  damage: number;
  /** Multiplier on the rally speed for this throw. */
  speedMul: number;
  /** Rules text shown in the deck builder. */
  text: string;
  fx: CardFx;
}

const card = (c: Omit<Card, 'fx'> & { fx?: CardFx }): Card => ({ fx: {}, ...c });

export const CARDS = {
  // Red · Surge: raw speed and damage
  fastball: card({ id: 'fastball', name: 'Fastball', color: 'red', rarity: 'common', damage: 12, speedMul: 1.4, text: '40% faster throw' }),
  heavy: card({ id: 'heavy', name: 'Heavy', color: 'red', rarity: 'common', damage: 22, speedMul: 0.85, text: 'Slow but hits hard' }),
  blitz: card({ id: 'blitz', name: 'Blitz', color: 'red', rarity: 'common', damage: 8, speedMul: 1.65, text: 'Blinding speed, light hit', fx: { straight: true } }),
  comet: card({ id: 'comet', name: 'Comet', color: 'red', rarity: 'common', damage: 15, speedMul: 1.2, text: 'Fast with a burning arc', fx: { curve: 0.6 } }),
  afterburner: card({ id: 'afterburner', name: 'Afterburner', color: 'red', rarity: 'uncommon', damage: 14, speedMul: 0.7, text: 'Starts slow, then rockets', fx: { accel: 1.1 } }),
  overheat: card({ id: 'overheat', name: 'Overheat', color: 'red', rarity: 'uncommon', damage: 10, speedMul: 1.1, text: '+6 dmg per 1x of speed. Costs 5 HP', fx: { speedDamage: 6, selfCost: 5 } }),
  scorch: card({ id: 'scorch', name: 'Scorch', color: 'red', rarity: 'uncommon', damage: 20, speedMul: 1.25, text: 'Costs 5 HP', fx: { selfCost: 5 } }),
  cannon: card({ id: 'cannon', name: 'Cannon', color: 'red', rarity: 'rare', damage: 30, speedMul: 1.3, text: 'Fast and heavy' }),

  // Blue · Phase: curves and tricks
  curve: card({ id: 'curve', name: 'Curve', color: 'blue', rarity: 'common', damage: 14, speedMul: 1.05, text: 'Bends hard away from the rival', fx: { curve: 1.1 } }),
  tide: card({ id: 'tide', name: 'Tide', color: 'blue', rarity: 'common', damage: 12, speedMul: 1.0, text: 'A huge sweeping arc', fx: { curve: 1.7 } }),
  swerve: card({ id: 'swerve', name: 'Swerve', color: 'blue', rarity: 'common', damage: 13, speedMul: 1.1, text: 'S-bend: flips its curve at midcourt', fx: { curve: 1.0, sCurve: true } }),
  zigzag: card({ id: 'zigzag', name: 'Zigzag', color: 'blue', rarity: 'uncommon', damage: 14, speedMul: 1.05, text: 'Snaps side to side', fx: { zigzag: 0.24 } }),
  split: card({ id: 'split', name: 'Split', color: 'blue', rarity: 'uncommon', damage: 12, speedMul: 1.1, text: 'Throws a decoy alongside', fx: { decoys: 1, curve: 0.4 } }),
  riptide: card({ id: 'riptide', name: 'Riptide', color: 'blue', rarity: 'uncommon', damage: 16, speedMul: 1.15, text: 'Violent S-bend', fx: { curve: 1.6, sCurve: true } }),
  ghost: card({ id: 'ghost', name: 'Ghost', color: 'blue', rarity: 'rare', damage: 15, speedMul: 1.1, text: 'Fades out mid-court', fx: { ghost: true, curve: 0.5 } }),
  mirage: card({ id: 'mirage', name: 'Mirage', color: 'blue', rarity: 'rare', damage: 12, speedMul: 1.05, text: 'Two decoys, one real ball', fx: { decoys: 2, curve: 0.8 } }),

  // Black · Void: drain and sacrifice
  leech: card({ id: 'leech', name: 'Leech', color: 'black', rarity: 'common', damage: 12, speedMul: 1.0, text: 'Heal 10 if it lands', fx: { healOnHit: 10 } }),
  shade: card({ id: 'shade', name: 'Shade', color: 'black', rarity: 'common', damage: 12, speedMul: 1.0, text: 'Darkens the arena for the rival', fx: { blind: true } }),
  bloodpact: card({ id: 'bloodpact', name: 'Blood Pact', color: 'black', rarity: 'common', damage: 20, speedMul: 1.05, text: 'Costs 6 HP', fx: { selfCost: 6 } }),
  hex: card({ id: 'hex', name: 'Hex', color: 'black', rarity: 'uncommon', damage: 10, speedMul: 1.0, text: "Rival's next power fizzles", fx: { fizzle: true } }),
  rot: card({ id: 'rot', name: 'Rot', color: 'black', rarity: 'uncommon', damage: 8, speedMul: 1.0, text: 'Poison: 3 dmg/s for 5s if it lands', fx: { poison: 3, poisonTime: 5 } }),
  siphon: card({ id: 'siphon', name: 'Siphon', color: 'black', rarity: 'uncommon', damage: 8, speedMul: 1.05, text: 'Heal 16 if it lands', fx: { healOnHit: 16, curve: 0.4 } }),
  eclipse: card({ id: 'eclipse', name: 'Eclipse', color: 'black', rarity: 'rare', damage: 16, speedMul: 1.05, text: 'Darkness, and heal 8 if it lands', fx: { blind: true, healOnHit: 8 } }),
  sacrifice: card({ id: 'sacrifice', name: 'Sacrifice', color: 'black', rarity: 'rare', damage: 35, speedMul: 1.0, text: 'Costs 15 HP', fx: { selfCost: 15 } }),

  // Green · Growth: momentum over a rally
  sprout: card({ id: 'sprout', name: 'Sprout', color: 'green', rarity: 'common', damage: 8, speedMul: 1.0, text: '+3 dmg per catch this rally', fx: { rallyDamage: 3 } }),
  bramble: card({ id: 'bramble', name: 'Bramble', color: 'green', rarity: 'common', damage: 10, speedMul: 1.05, text: 'Arcs, +2 dmg per catch this rally', fx: { rallyDamage: 2, curve: 0.8 } }),
  regrow: card({ id: 'regrow', name: 'Regrow', color: 'green', rarity: 'common', damage: 8, speedMul: 1.0, text: 'Heal 6 when thrown', fx: { heal: 6 } }),
  thornwhip: card({ id: 'thornwhip', name: 'Thornwhip', color: 'green', rarity: 'common', damage: 11, speedMul: 1.1, text: 'Whips in an S-bend, +2 per catch', fx: { rallyDamage: 2, curve: 1.0, sCurve: true } }),
  bloom: card({ id: 'bloom', name: 'Bloom', color: 'green', rarity: 'uncommon', damage: 6, speedMul: 0.95, text: 'Heal 12 when thrown', fx: { heal: 12 } }),
  stampede: card({ id: 'stampede', name: 'Stampede', color: 'green', rarity: 'uncommon', damage: 12, speedMul: 0.8, text: 'Gathers speed, +2 per catch', fx: { accel: 0.8, rallyDamage: 2 } }),
  harvest: card({ id: 'harvest', name: 'Harvest', color: 'green', rarity: 'uncommon', damage: 8, speedMul: 1.0, text: '+3 per catch, heal 8 if it lands', fx: { rallyDamage: 3, healOnHit: 8 } }),
  overgrowth: card({ id: 'overgrowth', name: 'Overgrowth', color: 'green', rarity: 'rare', damage: 4, speedMul: 1.05, text: '+6 dmg per catch this rally', fx: { rallyDamage: 6 } }),

  // White · Aegis: shields, slowing and control
  guard: card({ id: 'guard', name: 'Guard', color: 'white', rarity: 'common', damage: 8, speedMul: 1.0, text: 'Block the next hit on you', fx: { shield: true } }),
  frost: card({ id: 'frost', name: 'Frost', color: 'white', rarity: 'common', damage: 10, speedMul: 1.0, text: "Rival's next throw is 30% slower", fx: { slowNextThrow: 0.7 } }),
  lance: card({ id: 'lance', name: 'Lance', color: 'white', rarity: 'common', damage: 14, speedMul: 1.3, text: 'Dead straight and true', fx: { straight: true } }),
  mend: card({ id: 'mend', name: 'Mend', color: 'white', rarity: 'common', damage: 8, speedMul: 1.0, text: 'Heal 8 when thrown', fx: { heal: 8 } }),
  chill: card({ id: 'chill', name: 'Chill', color: 'white', rarity: 'uncommon', damage: 12, speedMul: 1.0, text: 'Rival moves at half speed for 2.5s', fx: { slowTarget: 2.5 } }),
  halo: card({ id: 'halo', name: 'Halo', color: 'white', rarity: 'uncommon', damage: 12, speedMul: 1.0, text: 'Your reach +40% for 5s', fx: { reachBoost: 5 } }),
  smite: card({ id: 'smite', name: 'Smite', color: 'white', rarity: 'rare', damage: 16, speedMul: 1.15, text: 'Perfect catch doubles its damage', fx: { perfectMul: 2 } }),
  sanctuary: card({ id: 'sanctuary', name: 'Sanctuary', color: 'white', rarity: 'rare', damage: 6, speedMul: 0.95, text: 'Block the next hit and heal 12', fx: { shield: true, heal: 12 } }),
} satisfies Record<string, Card>;

export type CardId = keyof typeof CARDS;

export const ALL_CARD_IDS = Object.keys(CARDS) as CardId[];

export function isCardId(id: string): id is CardId {
  return id in CARDS;
}

export function cardsOfColor(color: PowerColor): CardId[] {
  return ALL_CARD_IDS.filter((id) => CARDS[id].color === color);
}

/** The deck new players start with (editable in the deck builder). */
export const STARTER_DECK: CardId[] = ['fastball', 'curve', 'leech', 'sprout', 'guard'];
