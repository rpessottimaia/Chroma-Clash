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
  rampPerTouch: 10,
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
  /** A ball closer than this to your center hits you (plus the ball's radius). */
  bodyRadius: 60,
  /** Your hands: with hands up, you catch balls this close to your center (plus the ball's radius). */
  handsRadius: 22,
  /** Hands stay up this long after a tap: the ball must arrive inside it. */
  window: 0.3,
  /** After a tap you can't tap again for this long (a fumble leaves you exposed). */
  cooldown: 0.45,
  /** Tap within this many seconds of impact for a perfect catch. */
  perfectWindow: 0.1,
  perfectDamageMul: 1.25,
  /** Taps only count when the incoming ball is at most this many seconds away. */
  pressZone: 0.9,
} as const

/** Throwing: every throw is aimed at the opponent's body. */
export const AIM = {
  /** Widest launch angle, degrees from vertical. */
  maxDeg: 55,
  /** Every throw lands on the body but off the hands: offset range from the target's center. */
  minOffset: 20,
  maxOffset: 62,
  /** Fraction of the target's sideways velocity x remaining flight time to lead by at commit. */
  lead: 0.35,
  /** While homing, the ball turns toward its target at up to this many rad/s. */
  homingTurn: 1.6,
  /** The ball commits (stops chasing, starts its curve) this far from the target's line. */
  commitDistance: 520,
} as const

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
  /** Hands radius multiplier while a reach boost (Halo) is active. */
  reachMul: 1.4,
  /** Rival AI error multipliers when it can't read the ball well. */
  blindErrorMul: 2.2,
  ghostErrorMul: 1.6,
} as const;

export const HIT = {
  /** Damage carried by a ricochet (the ball bouncing off a victim's end wall). */
  ricochetDamage: 6,
  /** Damage of a plain throw after picking up a dodged ball. */
  plainDamage: 8,
  /** Seconds to pick up a dodged ball from the back wall before throwing it. */
  pickupTime: 0.45,
} as const;

export const PLAYER = {
  maxHp: 100,
  /** Drag gain: 1 = the chevron moves exactly as far as the thumb. */
  dragGain: 1.25,
  /** Max chase speed toward the finger target (smooths jitter). */
  maxSpeed: 3200,
  /** Keyboard movement speed (desktop fallback). */
  keySpeed: 1100,
} as const;

export const RIVAL = {
  maxHp: 100,
  /** 0..1: chance to catch a plain, slow ball (harder balls lower it). */
  skill: 0.62,
  moveSpeed: 900,
  /** Seconds before the rival reacts to a new throw. */
  reactionTime: 0.16,
  /** How much faster balls cut the rival's catch chance (per unit of speed over base). */
  errorSpeedFactor: 0.0011,
} as const;

export const DUEL = {
  /** Countdown before the serve. */
  readyTime: 2.2,
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

// ---------------------------------------------------------------------------
// Arena modes (prototypes A and B). Both use the full court and 2D movement.

/** The court both arena modes play in. */
export const COURT = {
  left: 36,
  right: 684,
  top: 150,
  bottom: 1340,
  /** Midline between the halves (dodgeball only). */
  mid: 745,
} as const;

export const MOVE = {
  /** Fighter body radius: balls closer than this (plus their radius) hit you. */
  bodyRadius: 44,
  /** Player top speed toward the finger target, and the rival's top speed. */
  playerSpeed: 1600,
  rivalSpeed: 820,
  /** Drag gain: 1 = the fighter moves exactly as far as the thumb. */
  dragGain: 1.35,
  keySpeed: 900,
} as const;

/** Prototype A: one loose ball in a shared arena; strike it at the rival. */
export const STRIKE = {
  ballRadius: 15,
  baseSpeed: 620,
  rampPerHit: 30,
  rampPerSecond: 3,
  maxSpeed: 2100,
  /** Tap to strike when the ball is inside this ring around you. */
  swingRadius: 125,
  /** Inner fraction of the ring that counts as a sweet-spot strike (+25% damage). */
  sweetSpot: 0.45,
  /** A tap with the ball out of range does nothing; after a strike you wait this long. */
  swingCooldown: 0.2,
  /** Charge per strike; a full meter makes the next strike fire your power card. */
  meterPerHit: 0.34,
  /** After hitting someone the ball goes neutral (harmless, slower) for this long. */
  neutralTime: 0.7,
  neutralSpeedMul: 0.5,
  /** A struck ball that misses goes neutral after this many wall bounces. */
  bouncesToNeutral: 3,
  /** Plain strike damage: base plus this per unit of speed over base. */
  baseDamage: 6,
  speedDamage: 1 / 150,
  /** Speed of the neutral ball at the start. */
  drift: 180,
} as const;

/** Prototype B: dodgeball with three balls and a midline. */
export const DODGE = {
  balls: 3,
  ballRadius: 14,
  baseSpeed: 760,
  rampPerThrow: 14,
  rampPerSecond: 3,
  maxSpeed: 2000,
  /** Walk within this of a ball on your side to pick it up. */
  pickupReach: 16,
  /** Tap with a ball close: hands up this long. */
  catchWindow: 0.28,
  catchCooldown: 0.5,
  /** Extra reach of your hands beyond your body when catching. */
  catchReach: 26,
  throwCooldown: 0.25,
  /** Ground balls slow down by this factor per second. */
  friction: 2.4,
  plainDamage: 8,
  /** Catching a ball stings the thrower for this much. */
  caughtDamage: 6,
  /** Fraction of the target's velocity x flight time to lead throws by. */
  lead: 0.4,
} as const;

export const ARENA_AI = {
  strikeSkill: 0.6,
  dodgeSkill: 0.55,
  reaction: 0.16,
  /** Seconds the dodgeball rival holds a ball before throwing (min, max). */
  holdMin: 0.35,
  holdMax: 0.9,
} as const;
