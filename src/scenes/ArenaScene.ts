import * as Phaser from 'phaser';
import { ARENA, COURT, FX, MOVE } from '../config';
import { DodgeAI, StrikeAI } from '../arena/ai';
import { BODY, steer, type ArenaEvent, type ArenaGame, type Shot, type Side } from '../arena/common';
import { DodgeGame } from '../arena/dodge';
import { StrikeGame } from '../arena/strike';
import { makeRivalLoadout, type RivalLoadout } from '../ai/rival';
import { COLORS, SIDE_COLORS } from '../core/colors';
import { createRng } from '../core/rng';
import { FONT, hexString, neonCircle, neonPoly } from '../fx/neon';
import { addDots, button, drawRings, text } from '../fx/ui';
import { loadProfile, saveProfile, type Profile } from '../meta/profile';
import { flashesAllowed, settings } from '../settings';

export type ArenaMode = 'strike' | 'dodge';

const W = ARENA.width;
const CX = (COURT.left + COURT.right) / 2;
const HP_TOP_Y = 84;
const HP_BOTTOM_Y = 1520;
const PANEL = { x: 36, y: 1358, w: 648, h: 128 };
const TAP_MS = 220;
const TAP_SLOP = 18;

const CHEVRON = [
  { x: -46, y: 18 }, { x: 0, y: -22 }, { x: 46, y: 18 },
  { x: 26, y: 18 }, { x: 0, y: -2 }, { x: -26, y: 18 },
];
const HEXAGON = Array.from({ length: 6 }, (_, i) => ({
  x: Math.cos((Math.PI / 3) * i) * 36,
  y: Math.sin((Math.PI / 3) * i) * 31,
}));
const at = (pts: { x: number; y: number }[], x: number, y: number) => pts.map((p) => ({ x: p.x + x, y: p.y + y }));

const INTRO: Record<ArenaMode, { title: string; lines: string }> = {
  strike: {
    title: 'STRIKE',
    lines: 'drag to move anywhere\nTAP when the ball is in your ring to strike it\nyour strikes hurt the rival, theirs hurt you\n3 strikes charge your POWER card',
  },
  dodge: {
    title: 'DODGEBALL',
    lines: 'drag to move · walk over a ball to grab it\nTAP to throw it at the rival\nempty hands? touch as a ball hits you to CATCH\nevery ball you grab carries your POWER card',
  },
};

/** Arena prototypes A (Strike) and B (Dodgeball): one scene, the mode decides the rules. */
export class ArenaScene extends Phaser.Scene {
  game2!: ArenaGame;
  private mode: ArenaMode = 'strike';
  private strikeAI?: StrikeAI;
  private dodgeAI?: DodgeAI;
  private rival!: RivalLoadout;
  private profile!: Profile;
  private over = false;
  private acc = 0;

  private dots!: Phaser.GameObjects.TileSprite;
  private g!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private glows: Phaser.GameObjects.Image[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flash!: Phaser.GameObjects.Rectangle;
  private trails = new Map<number, { x: number; y: number }[]>();
  private hurt: Record<Side, number> = { player: 0, rival: 0 };
  private shownHp: Record<Side, number> = { player: 1, rival: 1 };
  private pulse = 0;

  private hpText!: Record<Side, Phaser.GameObjects.Text>;
  private speedText!: Phaser.GameObjects.Text;
  private rivalPower!: Phaser.GameObjects.Text;
  private panelLabel!: Phaser.GameObjects.Text;
  private panelName!: Phaser.GameObjects.Text;
  private panelText!: Phaser.GameObjects.Text;
  private panelHint!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private fpsText?: Phaser.GameObjects.Text;

  // Input: first finger drags (relative, 2D); taps act.
  private dragId: number | null = null;
  private anchor = { x: 0, y: 0 };
  private from = { x: 0, y: 0 };
  private target = { x: 0, y: 0 };
  private downAt = 0;
  private downPos = { x: 0, y: 0 };
  private moved = false;
  private keys!: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Arena');
  }

  init(data: { mode?: ArenaMode }): void {
    this.mode = data.mode ?? 'strike';
  }

  create(): void {
    this.profile = loadProfile();
    this.rival = makeRivalLoadout(createRng((Math.random() * 2 ** 32) >>> 0));
    const opts = { playerDeck: this.profile.deck, rivalDeck: this.rival.deck };
    this.game2 = this.mode === 'strike' ? new StrikeGame(opts) : new DodgeGame(opts);
    this.strikeAI = this.mode === 'strike' ? new StrikeAI() : undefined;
    this.dodgeAI = this.mode === 'dodge' ? new DodgeAI() : undefined;
    this.over = false;
    this.acc = 0;
    this.trails.clear();
    this.hurt = { player: 0, rival: 0 };
    this.shownHp = { player: 1, rival: 1 };
    const p = this.game2.fighters.player;
    this.target = { x: p.x, y: p.y };
    this.dragId = null;

    this.dots = addDots(this).setAlpha(0.22);
    this.g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(0);
    this.glows = [0, 1, 2, 3, 4].map(() => this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(3).setVisible(false));
    this.top = this.add.graphics().setDepth(4);
    this.hud = this.add.graphics().setDepth(5);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 180, max: 820 }, lifespan: { min: 260, max: 700 }, scale: { start: 1.6, end: 0 },
      alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(3);
    this.flash = this.add.rectangle(0, 0, ARENA.width, ARENA.height, 0xffffff, 0).setOrigin(0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.add.tileSprite(0, 0, ARENA.width, ARENA.height, 'scanlines').setOrigin(0).setDepth(9).setAlpha(0.2);

    const rc = COLORS[this.rival.color];
    this.hpText = {
      rival: text(this, 60, HP_TOP_Y - 36, 26, hexString(SIDE_COLORS.rival)).setOrigin(0, 0.5),
      player: text(this, 60, HP_BOTTOM_Y + 30, 26, hexString(SIDE_COLORS.player)).setOrigin(0, 0.5),
    };
    this.speedText = text(this, W - 60, HP_TOP_Y - 36, 22, '#8aa0b8').setOrigin(1, 0.5);
    this.rivalPower = text(this, W / 2, HP_TOP_Y + 30, 19, hexString(rc.hex)).setAlpha(0.85);
    this.panelLabel = text(this, PANEL.x + 96, PANEL.y + 24, 18, '#8aa0b8').setOrigin(0, 0.5);
    this.panelName = text(this, PANEL.x + 96, PANEL.y + 58, 32, '#e8f4ff').setOrigin(0, 0.5);
    this.panelText = text(this, PANEL.x + 96, PANEL.y + 96, 20, '#d6e4f0').setOrigin(0, 0.5);
    this.panelHint = text(this, PANEL.x + PANEL.w - 20, PANEL.y + 24, 18, '#8aa0b8').setOrigin(1, 0.5);
    this.msg = text(this, CX, 520, 76).setLetterSpacing(6).setDepth(10);
    this.sub = text(this, CX, 600, 24).setOrigin(0.5, 0).setLineSpacing(12).setDepth(10);
    if (settings.debug) this.fpsText = text(this, W - 60, HP_BOTTOM_Y + 30, 18, '#5d7087').setOrigin(1, 0.5);

    const intro = INTRO[this.mode];
    this.msg.setText(intro.title).setShadow(0, 0, hexString(SIDE_COLORS.player), 24, true, true);
    this.sub.setText(`vs ${rc.name.toUpperCase()} · ${rc.identity.toLowerCase()}\n\n${intro.lines}`).setColor('#8aa0b8');

    this.setupInput();
    if (settings.debug) (window as unknown as { __arena: ArenaScene }).__arena = this;
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN', a: 'A', d: 'D', w: 'W', s: 'S' }) as typeof this.keys;
    kb.on('keydown-SPACE', () => (this.over ? this.scene.restart() : this.game2.action('player')));
    kb.on('keydown-ESC', () => this.scene.start('Menu'));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.over) return;
    const game = this.game2;
    const dodge = game instanceof DodgeGame;
    if (this.dragId !== null) {
      // A second finger always acts.
      game.action('player');
      return;
    }
    // First finger: in Strike every touch is a strike attempt (only counts in range);
    // in Dodgeball a touch with empty hands is a catch attempt (only counts if a ball is coming).
    if (!dodge || !game.holding('player')) game.action('player');
    const f = game.fighters.player;
    this.dragId = p.id;
    this.anchor = { x: p.x, y: p.y };
    this.from = { x: f.x, y: f.y };
    this.target = { x: f.x, y: f.y };
    this.downAt = this.time.now;
    this.downPos = { x: p.x, y: p.y };
    this.moved = false;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId || !p.isDown) return;
    if (Math.hypot(p.x - this.downPos.x, p.y - this.downPos.y) > TAP_SLOP) this.moved = true;
    const b = this.game2.bounds('player');
    const want = {
      x: this.from.x + (p.x - this.anchor.x) * MOVE.dragGain,
      y: this.from.y + (p.y - this.anchor.y) * MOVE.dragGain,
    };
    this.target = { x: Phaser.Math.Clamp(want.x, b.minX, b.maxX), y: Phaser.Math.Clamp(want.y, b.minY, b.maxY) };
    // Re-anchor at the edges so reversing responds instantly.
    if (want.x !== this.target.x) { this.anchor.x = p.x; this.from.x = this.target.x; }
    if (want.y !== this.target.y) { this.anchor.y = p.y; this.from.y = this.target.y; }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId) return;
    this.dragId = null;
    const game = this.game2;
    // Dodgeball: a quick tap (not a drag) throws the ball you're holding.
    if (game instanceof DodgeGame && !this.moved && this.time.now - this.downAt <= TAP_MS && game.holding('player')) {
      game.action('player');
    }
  }

  // ---------------------------------------------------------------- loop

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.acc += dt;
    const step = 1 / 120;
    while (this.acc >= step) {
      this.fixedStep(step);
      this.acc -= step;
    }
    for (const e of this.game2.drainEvents()) this.onEvent(e);
    this.pulse = Math.max(0, this.pulse - dt * 3);
    this.hurt.player = Math.max(0, this.hurt.player - dt);
    this.hurt.rival = Math.max(0, this.hurt.rival - dt);
    for (const side of ['player', 'rival'] as const) {
      const f = this.game2.fighters[side];
      this.shownHp[side] += (f.hp / f.maxHp - this.shownHp[side]) * Math.min(1, dt * 8);
    }
    for (const s of this.game2.shots) {
      const tr = this.trails.get(s.id) ?? [];
      if (s.state === 'flying' || s.state === 'free') tr.push({ x: s.x, y: s.y });
      else tr.length = 0;
      if (tr.length > FX.trailLength) tr.shift();
      this.trails.set(s.id, tr);
    }
    if (this.fpsText) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
    this.render();
  }

  private fixedStep(dt: number): void {
    const game = this.game2;
    const f = game.fighters.player;
    const kx = (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0) - (this.keys.left.isDown || this.keys.a.isDown ? 1 : 0);
    const ky = (this.keys.down.isDown || this.keys.s.isDown ? 1 : 0) - (this.keys.up.isDown || this.keys.w.isDown ? 1 : 0);
    if (kx || ky) this.target = { x: f.x + kx * MOVE.keySpeed * 0.1, y: f.y + ky * MOVE.keySpeed * 0.1 };
    if (!this.over) steer(f, this.target.x, this.target.y, MOVE.playerSpeed, dt, game.bounds('player'));
    if (game instanceof StrikeGame) this.strikeAI!.update(game, dt);
    else if (game instanceof DodgeGame) this.dodgeAI!.update(game, dt);
    game.step(dt);
  }

  private onEvent(e: ArenaEvent): void {
    switch (e.type) {
      case 'serve':
        this.tweens.add({ targets: [this.msg, this.sub], alpha: 0, duration: 400, onComplete: () => { this.msg.setVisible(false); this.sub.setVisible(false); } });
        break;
      case 'strike':
      case 'throw': {
        const col = e.card ? COLORS[e.card.color].hex : SIDE_COLORS[e.side];
        if (!settings.reduceMotion) this.pulse = 1;
        if (e.card) this.throwFlash(col);
        this.sparks.setParticleTint(col);
        this.sparks.explode(e.card ? 18 : 8, e.x, e.y);
        if (e.card) this.floatText(e.x, e.y + (e.side === 'player' ? -60 : 60), e.card.name.toUpperCase(), col, 30);
        else if (e.type === 'strike' && e.perfect) this.floatText(e.x, e.y - 50, 'SWEET', 0xffffff, 22);
        break;
      }
      case 'pickup':
        if (e.side === 'player') {
          const f = this.game2.fighters.player;
          this.floatText(f.x, f.y - 90, e.card ? `${e.card.name.toUpperCase()} LOADED` : 'PLAIN BALL', e.card ? COLORS[e.card.color].hex : 0xe8f4ff, 22);
        }
        break;
      case 'catch':
        this.sparks.setParticleTint([0xffffff, SIDE_COLORS[e.side]]);
        this.sparks.explode(20, e.x, e.y);
        this.floatText(e.x, e.y + (e.side === 'player' ? -70 : 70), 'CATCH!', 0xffffff, 34);
        break;
      case 'hit': {
        this.hurt[e.victim] = 0.3;
        this.sparks.setParticleTint([SIDE_COLORS[e.victim], COLORS[e.color].hex, 0xffffff]);
        this.sparks.explode(FX.hitParticles, e.x, e.y);
        if (!settings.reduceMotion) this.cameras.main.shake(FX.shakeMs, FX.shakeIntensity * (e.damage > 20 ? 1.6 : 1));
        this.floatText(e.x, e.y + (e.victim === 'player' ? -60 : 60), `-${e.damage}`, 0xffffff, 44);
        break;
      }
      case 'block':
        this.sparks.setParticleTint([COLORS.white.hex, 0xffffff]);
        this.sparks.explode(18, e.x, e.y);
        this.floatText(e.x, e.y - 50, 'BLOCKED', COLORS.white.hex, 30);
        break;
      case 'status': {
        const f = this.game2.fighters[e.side];
        this.floatText(f.x, f.y + (e.side === 'player' ? -100 : 100), e.text, e.good ? 0x39ff6a : 0xff6b8a, 22);
        break;
      }
      case 'ko':
        this.endDuel(e.winner);
        break;
    }
  }

  private endDuel(winner: Side): void {
    const p = this.profile;
    if (winner === 'player') p.wins++;
    else p.losses++;
    saveProfile(p);
    this.time.delayedCall(900, () => {
      this.over = true;
      this.msg.setText(winner === 'player' ? 'YOU WIN' : 'K.O.').setAlpha(1).setVisible(true)
        .setShadow(0, 0, hexString(SIDE_COLORS[winner]), 24, true, true);
      const t = this.game2.elapsed;
      this.sub.setText(`${Math.floor(t / 60)}m ${Math.floor(t % 60)}s`).setAlpha(1).setVisible(true);
      button(this, CX, 820, 420, 104, '▶  REMATCH', SIDE_COLORS.player, () => this.scene.restart({ mode: this.mode }), 38);
      button(this, CX - 110, 950, 200, 84, 'DECK', 0xe8f4ff, () => this.scene.start('Deck'), 26);
      button(this, CX + 110, 950, 200, 84, 'MENU', 0xe8f4ff, () => this.scene.start('Menu'), 26);
    });
  }

  private throwFlash(color: number): void {
    if (!flashesAllowed()) return;
    this.flash.setFillStyle(color, FX.throwFlashAlpha).setAlpha(1);
    this.tweens.killTweensOf(this.flash);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: FX.throwFlashMs });
  }

  private floatText(x: number, y: number, str: string, color: number, size: number): void {
    const t = this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: hexString(color), fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(7).setShadow(0, 0, hexString(color), 12, true, true);
    t.x = Phaser.Math.Clamp(x, t.width / 2 + 20, W - t.width / 2 - 20);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- render

  /** Ball color: its card's color, else the color of whoever it's dangerous for (their foe), else white. */
  private ballColor(s: Shot): number {
    if (s.card) return COLORS[s.card.color].hex;
    if (s.owner) return SIDE_COLORS[s.owner];
    return 0xe8f4ff;
  }

  private render(): void {
    const game = this.game2;
    const g = this.g;
    g.clear();
    const player = game.fighters.player;
    const rival = game.fighters.rival;
    const power = game.power('player');
    const wc = power.card ? COLORS[power.card.color].hex : SIDE_COLORS.player;

    // Backdrop and court
    this.dots.setTint(wc).setAlpha(0.2 + this.pulse * 0.15);
    drawRings(g, wc, settings.reduceMotion ? 0 : this.time.now, this.pulse);
    const cw = COURT.right - COURT.left;
    const ch = COURT.bottom - COURT.top;
    if (game.kind === 'dodge') {
      g.fillStyle(SIDE_COLORS.rival, 0.04);
      g.fillRect(COURT.left, COURT.top, cw, COURT.mid - COURT.top);
      g.fillStyle(SIDE_COLORS.player, 0.04);
      g.fillRect(COURT.left, COURT.mid, cw, COURT.bottom - COURT.mid);
      g.lineStyle(3, 0xe8f4ff, 0.35);
      g.lineBetween(COURT.left, COURT.mid, COURT.right, COURT.mid);
    }
    g.lineStyle(12, wc, 0.07);
    g.strokeRoundedRect(COURT.left, COURT.top, cw, ch, 60);
    g.lineStyle(3, wc, 0.55);
    g.strokeRoundedRect(COURT.left, COURT.top, cw, ch, 60);

    // Action rings: the clearest "do something now" cue.
    if (game instanceof StrikeGame) {
      const ready = game.inRange('player') && player.cooldown === 0 && !this.over;
      const r = game.swingRadius('player');
      if (ready) {
        g.fillStyle(wc, 0.1);
        g.fillCircle(player.x, player.y, r);
        neonCircle(g, player.x, player.y, r, 0xffffff, 0.9, 3);
      } else {
        neonCircle(g, player.x, player.y, r, wc, 0.22, 2);
      }
      neonCircle(g, rival.x, rival.y, game.swingRadius('rival'), SIDE_COLORS.rival, 0.12, 2);
    } else if (game instanceof DodgeGame) {
      const threat = game.threat('player');
      const reach = game.catchReach('player');
      const warn = threat && threat.time < 0.6 && !game.holding('player');
      if (player.catchTime > 0) neonCircle(g, player.x, player.y, reach, 0xffffff, 0.95, 4);
      else if (warn) neonCircle(g, player.x, player.y, reach + threat!.time * 160, 0xff6b8a, 0.7, 3);
    }

    // Fighters
    const pc = this.hurt.player > 0 ? 0xffffff : SIDE_COLORS.player;
    const rcol = this.hurt.rival > 0 ? 0xffffff : SIDE_COLORS.rival;
    g.lineStyle(2, SIDE_COLORS.player, 0.15);
    g.strokeCircle(player.x, player.y, BODY);
    g.lineStyle(2, SIDE_COLORS.rival, 0.15);
    g.strokeCircle(rival.x, rival.y, BODY);
    neonPoly(g, at(CHEVRON, player.x, player.y), pc, 0.95, 4);
    neonPoly(g, at(HEXAGON, rival.x, rival.y), rcol, 0.95, 4);
    if (player.shield) neonCircle(g, player.x, player.y, BODY + 14, COLORS.white.hex, 0.8, 3);
    if (rival.shield) neonCircle(g, rival.x, rival.y, BODY + 14, COLORS.white.hex, 0.8, 3);

    // Balls
    const t = this.top;
    t.clear();
    this.glows.forEach((gl) => gl.setVisible(false));
    game.shots.forEach((s, i) => this.drawBall(s, i));

    this.drawHud(power);
  }

  private drawBall(s: Shot, i: number): void {
    const g = this.g;
    const t = this.top;
    const col = this.ballColor(s);
    let alpha = 1;
    if (s.ghost && s.state === 'flying') {
      const total = s.flipAfter / 0.45 || 1;
      const f = s.travelled / total;
      if (f > 0.3 && f < 0.75) alpha = s.owner === 'player' ? 0.3 : 0.06;
    }
    const tr = this.trails.get(s.id) ?? [];
    for (let k = 1; k < tr.length; k++) {
      const q = k / tr.length;
      g.lineStyle(s.r * 2 * q, col, 0.45 * q * alpha);
      g.lineBetween(tr[k - 1].x, tr[k - 1].y, tr[k].x, tr[k].y);
    }
    const dangerous = s.owner === 'rival' && (s.state === 'flying' || s.state === 'free');
    const ground = s.state === 'ground';
    const glow = this.glows[i];
    if (glow) glow.setVisible(true).setPosition(s.x, s.y).setTint(col).setScale(ground ? 0.8 : 1.4).setAlpha((ground ? 0.5 : 1) * alpha);
    if (dangerous) neonCircle(g, s.x, s.y, s.r + 10 + Math.sin(this.time.now / 70) * 3, 0xff6b8a, 0.8 * alpha, 2);
    t.fillStyle(col, (ground ? 0.55 : 0.9) * alpha);
    t.fillCircle(s.x, s.y, s.r + 3);
    t.fillStyle(0xffffff, (ground ? 0.6 : 1) * alpha);
    t.fillCircle(s.x, s.y, s.r - 3);
  }

  private drawHud(power: ReturnType<ArenaGame['power']>): void {
    const game = this.game2;
    const h = this.hud;
    h.clear();
    const bar = (y: number, frac: number, color: number) => {
      h.lineStyle(2, color, 0.45);
      h.strokeRoundedRect(60, y - 9, W - 120, 18, 9);
      h.fillStyle(color, 0.75);
      const fw = Math.max(0, (W - 128) * frac);
      if (fw > 12) h.fillRoundedRect(64, y - 5, fw, 10, 5);
    };
    bar(HP_TOP_Y, this.shownHp.rival, SIDE_COLORS.rival);
    bar(HP_BOTTOM_Y, this.shownHp.player, SIDE_COLORS.player);
    const rc = COLORS[this.rival.color];
    this.hpText.rival.setText(`${rc.name.toUpperCase()}  ${Math.ceil(game.fighters.rival.hp)}`);
    this.hpText.player.setText(`YOU  ${Math.ceil(game.fighters.player.hp)}`);
    this.speedText.setText(`${(game.speed / game.baseSpeed).toFixed(1)}x`);

    // Rival's power, so you can read what's coming.
    const rp = game.power('rival');
    this.rivalPower.setText(rp.card ? `rival ${rp.ready ? 'READY' : 'next'}: ${rp.card.name.toUpperCase()} · ${rp.card.text}` : '')
      .setColor(rp.card ? hexString(COLORS[rp.card.color].hex) : '#8aa0b8');

    // Your power card panel
    const card = power.card;
    const col = card ? COLORS[card.color].hex : 0xe8f4ff;
    const ready = power.ready;
    h.fillStyle(col, ready ? 0.16 : 0.06);
    h.fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
    h.lineStyle(ready ? 3 : 2, col, ready ? 1 : 0.45);
    h.strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
    h.fillStyle(col, ready ? 0.95 : 0.4);
    h.fillCircle(PANEL.x + 50, PANEL.y + PANEL.h / 2, 28);
    if (ready) {
      h.lineStyle(3, 0xffffff, 0.6 + Math.sin(this.time.now / 120) * 0.3);
      h.strokeCircle(PANEL.x + 50, PANEL.y + PANEL.h / 2, 36);
    }
    this.panelLabel.setText(power.label.toUpperCase());
    this.panelName.setText(card ? card.name.toUpperCase() : 'PLAIN BALL').setColor(hexString(col)).setAlpha(ready ? 1 : 0.7);
    this.panelText.setText(card ? `${card.text} · dmg ${card.damage}` : 'no power: grab or catch another ball').setAlpha(ready ? 1 : 0.7);
    if (power.meter !== null) {
      // Strike: three charge segments.
      const segW = 60;
      for (let i = 0; i < 3; i++) {
        const x = PANEL.x + PANEL.w - 20 - (3 - i) * (segW + 8);
        const filled = power.meter >= (i + 1) / 3 - 0.01;
        h.fillStyle(col, filled ? 0.9 : 0.15);
        h.fillRoundedRect(x, PANEL.y + 52, segW, 14, 7);
      }
      this.panelHint.setText('');
    } else {
      this.panelHint.setText(power.next && game.kind === 'dodge' ? `next: ${power.next.name.toUpperCase()}` : '');
    }
  }
}

export const ARENA_MODES: { mode: ArenaMode; title: string; blurb: string }[] = [
  { mode: 'strike', title: 'A · STRIKE', blurb: 'one ball, shared arena, strike it at them' },
  { mode: 'dodge', title: 'B · DODGEBALL', blurb: 'three balls, grab, throw, catch' },
];
