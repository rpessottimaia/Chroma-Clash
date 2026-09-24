export type PowerColor = 'red' | 'blue' | 'black';

/** The ball's color when it carries no power (the opening serve, ricochets). */
export type BallColor = PowerColor | 'neutral';

export interface ColorInfo {
  name: string;
  /** Neon tone used for the world, pips and trails. */
  hex: number;
}

export const COLORS: Record<BallColor, ColorInfo> = {
  red: { name: 'Surge', hex: 0xff3d2e },
  blue: { name: 'Phase', hex: 0x2f7bff },
  black: { name: 'Void', hex: 0xa04dff },
  neutral: { name: 'Neutral', hex: 0xe8f4ff },
};

export const SIDE_COLORS = {
  player: 0x00f0ff,
  rival: 0xff2bd6,
} as const;

/** Counter triangle: Red beats Blue, Blue beats Black, Black beats Red. */
const BEATS: Record<PowerColor, PowerColor> = {
  red: 'blue',
  blue: 'black',
  black: 'red',
};

export function beats(attacker: PowerColor, defender: BallColor): boolean {
  return defender !== 'neutral' && BEATS[attacker] === defender;
}

export function counterOf(color: PowerColor): PowerColor {
  return (Object.keys(BEATS) as PowerColor[]).find((c) => BEATS[c] === color)!;
}
