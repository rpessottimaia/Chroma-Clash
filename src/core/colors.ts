export type PowerColor = 'red' | 'blue' | 'black' | 'green' | 'white';

/** The ball's color when it carries no power (the opening serve, ricochets, fizzled throws). */
export type BallColor = PowerColor | 'neutral';

export interface ColorInfo {
  name: string;
  /** One-line identity shown in the deck builder. */
  identity: string;
  /** Neon tone used for the world, pips and trails. */
  hex: number;
}

export const POWER_COLORS: PowerColor[] = ['red', 'blue', 'black', 'green', 'white'];

export const COLORS: Record<BallColor, ColorInfo> = {
  red: { name: 'Surge', identity: 'Raw speed and damage', hex: 0xff3d2e },
  blue: { name: 'Phase', identity: 'Curves and tricks, hard to read', hex: 0x2f7bff },
  black: { name: 'Void', identity: 'Drain and sacrifice, power at a price', hex: 0xa04dff },
  green: { name: 'Growth', identity: 'Momentum that scales over a rally', hex: 0x39ff6a },
  white: { name: 'Aegis', identity: 'Shields, slowing and control', hex: 0xfff3c4 },
  neutral: { name: 'Neutral', identity: '', hex: 0xe8f4ff },
};

export const SIDE_COLORS = {
  player: 0x00f0ff,
  rival: 0xff2bd6,
} as const;

/**
 * Counter wheel: each color beats the next one around the circle
 * (Red > Blue > Black > Green > White > Red). Keeps the GDD's Red > Blue > Black;
 * counter bonuses themselves arrive with milestone 3.
 */
const BEATS: Record<PowerColor, PowerColor> = {
  red: 'blue',
  blue: 'black',
  black: 'green',
  green: 'white',
  white: 'red',
};

export function beats(attacker: PowerColor, defender: BallColor): boolean {
  return defender !== 'neutral' && BEATS[attacker] === defender;
}

export function counterOf(color: PowerColor): PowerColor {
  return POWER_COLORS.find((c) => BEATS[c] === color)!;
}
