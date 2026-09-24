// Every tunable number lives here. Units are game units (the canvas is
// ARENA.width x ARENA.height and scaled to fit the screen) and seconds.

export const ARENA = {
  width: 720,
  height: 1560,
  /** Side walls the ball bounces off. */
  wallLeft: 36,
  wallRight: 684,
  /** Catch lines: where each player stands. */
  playerY: 1235,
  rivalY: 255,
  /** End walls behind each player: a missed ball lands here and ricochets. */
  playerBackY: 1340,
  rivalBackY: 150,
  /** Closest a player's center can get to a side wall. */
  moveMargin: 40,
} as const;

export const BALL = {
  radius: 13,
  /** Rally speed at the start of a duel (units per second). */
  baseSpeed: 560,
  /** Added to the rally speed on every catch. */
  rampPerTouch: 16,
  /** Added to the rally speed every second of play. */
  rampPerSecond: 3.2,
  /** The rally speed never exceeds this. */
  maxRallySpeed: 2000,
  /** Hard cap for any single throw after card multipliers. */
  maxBallSpeed: 2400,
  /** Open question in the GDD: extra rally speed when a hit lands. 0 = off. */
  hitSpeedBonus: 0,
  /** Angle of the opening serve, in degrees from vertical (random +/-). */
  serveAngleDeg: 14,
} as const;

export const CATCH = {
  /** Half-width of the catch zone around a player's center. */
  reach: 96,
  /** Fraction of reach (from center) that counts as a perfect catch. */
  perfectZone: 0.28,
  perfectDamageMul: 1.25,
  /** Angle of the return throw at the very edge of reach, degrees from vertical. */
  maxDeflectDeg: 40,
} as const;

/** Curved flight: every throw bends a little, and cards bend it a lot. Curve is in rad/s of heading change. */
export const CURVE = {
  /** Curve from an edge catch, at the very edge of reach (sign follows the side the ball touched). */
  edgeCurve: 0.55,
  /** Curve per unit/s of the catcher's sideways movement at the moment of the catch. */
  moveCurve: 0.0005,
  /** Random curve every throw gets (+/-), so no two rallies trace the same line. */
  jitter: 0.18,
  /** Fraction of curve lost per second of flight. */
  decay: 0.2,
  /** Fraction of curve kept (mirrored) after a side-wall bounce. */
  bounceKeep: 0.7,
  /** The ball never heads flatter than this, degrees from vertical. */
  maxHeadingDeg: 62,
  /** Hard cap on curve magnitude. */
  maxCurve: 2.4,
} as const;

/** Status effects applied by cards. */
export const STATUS = {
  /** Movement speed multiplier while slowed. */
  slowMul: 0.5,
  /** Catch reach multiplier while a reach boost is active. */
  reachMul: 1.4,
  /** Rival AI error multipliers when it can't read the ball well. */
  blindErrorMul: 2.2,
  ghostErrorMul: 1.6,
} as const;

export const HIT = {
  /** Damage carried by a ricochet (the ball bouncing off a victim's end wall). */
  ricochetDamage: 6,
  /** Random spread (units) around the attacker when the ball ricochets back. */
  ricochetSpread: 70,
  /** Steepest angle a ricochet can take, degrees from vertical. */
  ricochetMaxDeg: 30,
} as const;

export const PLAYER = {
  maxHp: 100,
  /** Drag gain: 1 = the chevron moves exactly as far as the thumb. */
  dragGain: 1.25,
  /** Max chase speed toward the finger target (smooths jitter). */
  maxSpeed: 3200,
  /** Keyboard movement speed (desktop fallback). */
  keySpeed: 1100,
  /** A touch shorter than this, moving less than tapSlop, counts as a tap. */
  tapMaxMs: 180,
  tapSlop: 14,
} as const;

export const RIVAL = {
  maxHp: 100,
  /** 0..1, higher = smaller prediction error and faster reaction. */
  skill: 0.62,
  moveSpeed: 900,
  /** Seconds before the rival reacts to a new throw. */
  reactionTime: 0.16,
  /** Prediction error at skill 0, in units, scaled up with ball speed. */
  maxError: 190,
  /** How much faster balls make the rival's error grow (per unit of speed over base). */
  errorSpeedFactor: 0.0011,
  /** How hard the rival tries to hit off-center to angle its throws (0..1 of reach). */
  aimOffset: 0.55,
} as const;

export const DUEL = {
  /** Countdown before the serve. */
  readyTime: 1.4,
  /** Fixed physics step. Small enough that fast balls cannot tunnel through lines. */
  step: 1 / 120,
} as const;

export const DECK = {
  /** Power slots in a duel. */
  slots: 3,
  /** Deck size limits in the deck builder (cards are unique). */
  min: 3,
  max: 7,
  /** Cards in a generated rival deck. */
  rivalSize: 5,
} as const;

export const FX = {
  /** Screen flash on each throw (skipped when reduceFlashes is on). */
  throwFlashMs: 80,
  throwFlashAlpha: 0.16,
  shakeMs: 150,
  shakeIntensity: 0.009,
  hitParticles: 28,
  trailLength: 16,
  /** Seconds for the world tint to fade to a newly armed color. */
  colorShiftTime: 0.14,
} as const;
