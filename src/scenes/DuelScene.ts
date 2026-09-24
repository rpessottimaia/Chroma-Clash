import * as Phaser from 'phaser';
import { ARENA, BALL, CATCH, DUEL, FX, PLAYER } from '../config';
import { RivalAI, makeRivalLoadout, type RivalLoadout } from '../ai/rival';
import { targetOf, type Ball, type Side } from '../core/ball';
import { CARDS } from '../core/cards';
import { COLORS, SIDE_COLORS } from '../core/colors';
import { Duel, type DuelEvent } from '../core/duel';
import { createRng } from '../core/rng';
import { FONT, hexString, lerpColor, neonCircle, neonLine, neonPoly } from '../fx/neon';
import { addDots, button, drawRings, text } from '../fx/ui';
import { loadProfile, saveProfile, type Profile } from '../meta/profile';
import { flashesAllowed, settings } from '../settings';

type Phase = 'duel' | 'over';

const W = ARENA.width;
const CX = (ARENA.wallLeft + ARENA.wallRight) / 2;
const PIP_Y = 1428;
const PIP_GAP = 170;
const PIP_X = [CX - PIP_GAP, CX, CX + PIP_GAP];
const HP_TOP_Y = 84;
const HP_BOTTOM_Y = 1512;
const COURT_RADIUS = 64;
const MID_Y = ARENA.height / 2;

const CHEVRON = [
  { x: -52, y: 20 }, { x: 0, y: -24 }, { x: 52, y: 20 },
  { x: 30, y: 20 }, { x: 0, y: -2 }, { x: -30, y: 20 },
];
const HEXAGON = Array.from({ length: 6 }, (_, i) => ({
  x: Math.cos((Math.PI / 3) * i) * 40,
  y: Math.sin((Math.PI / 3) * i) * 34,
}));

const offsetPoints = (pts: { x: number; y: number }[], x: number, y: number) =>
  pts.map((p) => ({ x: p.x + x, y: p.y + y }));

type Trail = { x: number; y: number }[];

export class DuelScene extends Phaser.Scene {
  duel!: Duel;
  private ai!: RivalAI;
  private rival!: RivalLoadout;
  private profile!: Profile;
  private phase: Phase = 'duel';
  private acc = 0;

  // Rendering
  private dots!: Phaser.GameObjects.TileSprite;
  private world!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private shade!: Phaser.GameObjects.Graphics;
  private ballGlow!: Phaser.GameObjects.Image;
  private playerGlow!: Phaser.GameObjects.Image;
  private rivalGlow!: Phaser.GameObjects.Image;
  private pipGlow!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail: Trail = [];
  private decoyTrails = new Map<Ball, Trail>();
  private worldColor = COLORS.red.hex;
  private fromColor = COLORS.red.hex;
  private toColor = COLORS.red.hex;
  private colorT = 1;
  private pulse = 0;
  private darkness = 0;
  private hurt: Record<Side, number> = { player: 0, rival: 0 };
  private shownHp: Record<Side, number> = { player: 1, rival: 1 };

  // HUD
  private rivalHpText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private statusText!: Record<Side, Phaser.GameObjects.Text>;
  private speedText!: Phaser.GameObjects.Text;
  private pipLabels: Phaser.GameObjects.Text[] = [];
  private msg!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private fpsText?: Phaser.GameObjects.Text;

  // Input
  private targetX = CX;
  private dragId: number | null = null;
  private anchorX = 0;
  private dragFromX = 0;
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Duel');
  }

  create(): void {
    this.profile = loadProfile();
    this.rival = makeRivalLoadout(createRng((Math.random() * 2 ** 32) >>> 0));
    this.duel = new Duel({ playerDeck: this.profile.deck, rivalDeck: this.rival.deck });
    this.ai = new RivalAI();
    this.phase = 'duel';
    this.acc = 0;
    this.targetX = CX;
    this.dragId = null;
    this.trail = [];
    this.decoyTrails.clear();
    this.shownHp = { player: 1, rival: 1 };
    this.hurt = { player: 0, rival: 0 };
    this.darkness = 0;
    this.worldColor = this.fromColor = this.toColor = COLORS[this.duel.fighters.player.deck.armedCard.color].hex;
    this.colorT = 1;

    this.dots = addDots(this).setAlpha(0.3);
    this.world = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(0);
    this.playerGlow = this.glowImage(1);
    this.rivalGlow = this.glowImage(1).setTint(SIDE_COLORS.rival);
    this.pipGlow = this.glowImage(1);
    this.actors = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
    this.ballGlow = this.glowImage(3);
    this.top = this.add.graphics().setDepth(4);
    this.shade = this.add.graphics().setDepth(5);

    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 180, max: 820 },
      lifespan: { min: 260, max: 700 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(3);

    this.flash = this.add.rectangle(0, 0, ARENA.width, ARENA.height, 0xffffff, 0)
      .setOrigin(0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.add.tileSprite(0, 0, ARENA.width, ARENA.height, 'scanlines')
      .setOrigin(0).setDepth(9).setAlpha(0.22);

    this.rivalHpText = text(this, 60, HP_TOP_Y - 36, 26, hexString(SIDE_COLORS.rival)).setOrigin(0, 0.5);
    this.speedText = text(this, CX, HP_TOP_Y - 36, 22, '#8aa0b8');
    this.playerHpText = text(this, 60, HP_BOTTOM_Y + 34, 26, hexString(SIDE_COLORS.player)).setOrigin(0, 0.5);
    this.statusText = {
      rival: text(this, W - 60, HP_TOP_Y - 36, 20, '#e8f4ff').setOrigin(1, 0.5),
      player: text(this, W - 60, HP_BOTTOM_Y + 34, 20, '#e8f4ff').setOrigin(1, 0.5),
    };
    this.pipLabels = PIP_X.map((x) => text(this, x, PIP_Y + 50, 20));
    this.msg = text(this, CX, 480, 84).setLetterSpacing(6).setDepth(10);
    this.sub = text(this, CX, 560, 26).setOrigin(0.5, 0).setLineSpacing(10).setDepth(10);
    if (settings.debug) this.fpsText = text(this, CX, HP_BOTTOM_Y + 34, 18, '#5d7087');

    const rc = COLORS[this.rival.color];
    this.msg.setText(`VS ${rc.name.toUpperCase()}`).setColor(hexString(rc.hex)).setShadow(0, 0, hexString(rc.hex), 24, true, true);
    this.sub.setText(`${rc.identity.toLowerCase()}\n\nTAP as the ring closes to CATCH\nSLIDE to dodge`).setColor('#8aa0b8');

    this.setupInput();
    if (settings.debug) (window as unknown as { __duelScene: DuelScene }).__duelScene = this;
  }

  private glowImage(depth: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
  }

  // ---------------------------------------------------------------- flow

  private endDuel(winner: Side): void {
    const p = this.profile;
    if (winner === 'player') p.wins++;
    else p.losses++;
    p.bestSpeed = Math.max(p.bestSpeed, this.duel.speed / BALL.baseSpeed);
    saveProfile(p);

    this.time.delayedCall(900, () => {
      this.phase = 'over';
      const col = hexString(SIDE_COLORS[winner]);
      this.msg.setText(winner === 'player' ? 'YOU WIN' : 'K.O.').setColor('#e8f4ff').setAlpha(1).setVisible(true)
        .setShadow(0, 0, col, 24, true, true);
      const t = this.duel.elapsed;
      this.sub.setText(`top speed ${(this.duel.speed / BALL.baseSpeed).toFixed(1)}x · ${Math.floor(t / 60)}m ${Math.floor(t % 60)}s`)
        .setColor('#8aa0b8').setAlpha(1).setVisible(true);
      button(this, CX, 880, 420, 104, '▶  REMATCH', SIDE_COLORS.player, () => this.scene.restart(), 38);
      button(this, CX - 110, 1010, 200, 84, 'DECK', 0xe8f4ff, () => this.scene.start('Deck'), 26);
      button(this, CX + 110, 1010, 200, 84, 'MENU', 0xe8f4ff, () => this.scene.start('Menu'), 26);
    });
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' }) as typeof this.keys;
    kb.on('keydown-SPACE', () => (this.phase === 'duel' ? this.duel.tryCatch('player') : this.scene.restart()));
    kb.on('keydown-Q', () => this.cycle());
    kb.on('keydown-E', () => this.cycle());
    kb.on('keydown-ENTER', () => { if (this.phase === 'over') this.scene.restart(); });
    kb.on('keydown-ESC', () => this.scene.start('Menu'));
    kb.on('keydown-ONE', () => this.arm(0));
    kb.on('keydown-TWO', () => this.arm(1));
    kb.on('keydown-THREE', () => this.arm(2));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  /** Every new touch is a catch attempt (or arms a pip); the first finger also becomes the slider. */
  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'duel') return;
    const pip = this.pipAt(p.x, p.y);
    if (pip >= 0) {
      this.arm(pip);
      return;
    }
    this.duel.tryCatch('player');
    if (this.dragId === null) this.beginDrag(p);
  }

  private beginDrag(p: Phaser.Input.Pointer): void {
    this.dragId = p.id;
    this.anchorX = p.x;
    this.dragFromX = this.targetX;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId || !p.isDown) return;
    const min = ARENA.wallLeft + ARENA.moveMargin;
    const max = ARENA.wallRight - ARENA.moveMargin;
    const want = this.dragFromX + (p.x - this.anchorX) * PLAYER.dragGain;
    this.targetX = Phaser.Math.Clamp(want, min, max);
    // Re-anchor at the edges so reversing direction responds instantly, like a slider.
    if (want !== this.targetX) {
      this.anchorX = p.x;
      this.dragFromX = this.targetX;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.dragId) this.dragId = null;
  }

  /** Index of the power pip under a touch, or -1. */
  private pipAt(x: number, y: number): number {
    if (y < PIP_Y - 70) return -1;
    return PIP_X.findIndex((px) => Math.abs(px - x) < PIP_GAP / 2);
  }

  private cycle(): void {
    if (this.phase !== 'duel') return;
    this.duel.fighters.player.deck.cycle();
    this.onArmedChanged();
  }

  private arm(i: number): void {
    if (this.phase !== 'duel') return;
    this.duel.fighters.player.deck.arm(i);
    this.onArmedChanged();
  }

  private onArmedChanged(): void {
    const next = COLORS[this.duel.fighters.player.deck.armedCard.color].hex;
    if (next === this.toColor) return;
    this.fromColor = this.worldColor;
    this.toColor = next;
    this.colorT = 0;
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.acc += dt;
    while (this.acc >= DUEL.step) {
      this.fixedStep(DUEL.step);
      this.acc -= DUEL.step;
    }
    for (const e of this.duel.drainEvents()) this.onEvent(e);
    this.animate(dt);
    this.render();
  }

  private fixedStep(dt: number): void {
    const dir = (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0) - (this.keys.left.isDown || this.keys.a.isDown ? 1 : 0);
    if (dir !== 0 && this.phase === 'duel') {
      this.targetX = Phaser.Math.Clamp(this.targetX + dir * PLAYER.keySpeed * dt,
        ARENA.wallLeft + ARENA.moveMargin, ARENA.wallRight - ARENA.moveMargin);
    }
    this.duel.steer('player', this.targetX, PLAYER.maxSpeed, dt);
    this.ai.update(this.duel, dt);
    this.duel.step(dt);
  }

  private onEvent(e: DuelEvent): void {
    switch (e.type) {
      case 'serve':
        this.tweens.add({ targets: [this.msg, this.sub], alpha: 0, duration: 350, onComplete: () => { this.msg.setVisible(false); this.sub.setVisible(false); } });
        break;
      case 'catch': {
        const color = e.fizzled ? 0xe8f4ff : COLORS[e.card.color].hex;
        if (!settings.reduceMotion) this.pulse = 1;
        this.throwFlash(color);
        this.sparks.setParticleTint(color);
        this.sparks.explode(e.perfect ? 16 : 8, e.x, e.y);
        const dy = e.side === 'player' ? -70 : 70;
        const name = e.fizzled ? 'FIZZLE' : e.card.name.toUpperCase();
        this.floatText(e.x, e.y + dy, e.side === 'player' && e.perfect ? `PERFECT  ${name}` : name, color, e.perfect ? 30 : 24);
        if (e.side === 'player') this.onArmedChanged();
        break;
      }
      case 'hit': {
        const sideColor = SIDE_COLORS[e.victim];
        this.hurt[e.victim] = 0.3;
        this.sparks.setParticleTint([sideColor, COLORS[e.color].hex, 0xffffff]);
        this.sparks.explode(FX.hitParticles, e.x, e.y);
        if (!settings.reduceMotion) this.cameras.main.shake(FX.shakeMs, FX.shakeIntensity * (e.damage > 20 ? 1.6 : 1));
        this.floatText(e.x, e.y + (e.victim === 'player' ? -60 : 60), `-${e.damage}`, 0xffffff, 44);
        break;
      }
      case 'block':
        this.sparks.setParticleTint([COLORS.white.hex, 0xffffff]);
        this.sparks.explode(18, e.x, e.y);
        this.floatText(e.x, e.y + (e.victim === 'player' ? -60 : 60), 'BLOCKED', COLORS.white.hex, 34);
        break;
      case 'status': {
        const x = this.duel.fighters[e.side].x;
        const y = e.side === 'player' ? ARENA.playerY - 110 : ARENA.rivalY + 110;
        this.floatText(x, y, e.text, e.good ? 0x39ff6a : 0xff6b8a, 24);
        break;
      }
      case 'ko':
        this.endDuel(e.winner);
        break;
      case 'whiff':
        if (e.side === 'player') this.floatText(this.duel.fighters.player.x, ARENA.playerY - 90, 'TOO EARLY', 0x8aa0b8, 22);
        break;
      case 'dodge': {
        const f = this.duel.fighters[e.side];
        this.floatText(f.x, e.side === 'player' ? ARENA.playerY - 90 : ARENA.rivalY + 90, 'DODGE', 0xe8f4ff, 24);
        break;
      }
      case 'pickup':
        break;
    }
  }

  private throwFlash(color: number): void {
    if (!flashesAllowed()) return;
    this.flash.setFillStyle(color, FX.throwFlashAlpha);
    this.flash.setAlpha(1);
    this.tweens.killTweensOf(this.flash);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: FX.throwFlashMs, ease: 'Quad.easeOut' });
  }

  private floatText(x: number, y: number, str: string, color: number, size: number): void {
    const t = this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: hexString(color), fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(7).setShadow(0, 0, hexString(color), 12, true, true);
    t.x = Phaser.Math.Clamp(x, t.width / 2 + 20, W - t.width / 2 - 20);
    this.tweens.add({ targets: t, y: y + (y > MID_Y ? -40 : 40), alpha: 0, duration: 900, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
  }

  private animate(dt: number): void {
    if (this.colorT < 1) {
      this.colorT = Math.min(1, this.colorT + dt / FX.colorShiftTime);
      this.worldColor = lerpColor(this.fromColor, this.toColor, this.colorT);
    }
    this.pulse = Math.max(0, this.pulse - dt * 3);
    this.hurt.player = Math.max(0, this.hurt.player - dt);
    this.hurt.rival = Math.max(0, this.hurt.rival - dt);
    for (const side of ['player', 'rival'] as const) {
      const f = this.duel.fighters[side];
      this.shownHp[side] += (f.hp / f.maxHp - this.shownHp[side]) * Math.min(1, dt * 8);
    }
    const ball = this.duel.ball;
    const dark = ball.blind && targetOf(ball) === 'player' && !ball.passed ? 1 : 0;
    this.darkness += (dark - this.darkness) * Math.min(1, dt * 6);

    this.pushTrail(this.trail, ball);
    const live = new Set(this.duel.decoys);
    for (const d of this.decoyTrails.keys()) if (!live.has(d)) this.decoyTrails.delete(d);
    for (const d of this.duel.decoys) {
      if (!this.decoyTrails.has(d)) this.decoyTrails.set(d, []);
      this.pushTrail(this.decoyTrails.get(d)!, d);
    }
    if (this.fpsText) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
  }

  private pushTrail(trail: Trail, b: Ball): void {
    trail.push({ x: b.x, y: b.y });
    if (trail.length > FX.trailLength) trail.shift();
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const duel = this.duel;
    const wc = this.worldColor;
    const g = this.world;
    g.clear();

    // Round backdrop: tinted dot matrix plus rings breathing out from the center.
    this.dots.setTint(wc).setAlpha(0.22 + this.pulse * 0.2);
    drawRings(g, wc, settings.reduceMotion ? 0 : this.time.now, this.pulse);

    // Court: a rounded arena
    const top = ARENA.rivalBackY;
    const bottom = ARENA.playerBackY;
    const cw = ARENA.wallRight - ARENA.wallLeft;
    g.lineStyle(14, wc, 0.07);
    g.strokeRoundedRect(ARENA.wallLeft, top, cw, bottom - top, COURT_RADIUS);
    g.lineStyle(3, wc, 0.6);
    g.strokeRoundedRect(ARENA.wallLeft, top, cw, bottom - top, COURT_RADIUS);
    neonLine(g, ARENA.wallLeft, MID_Y, ARENA.wallRight, MID_Y, wc, 0.25);
    neonCircle(g, CX, MID_Y, 76, wc, 0.3);
    neonCircle(g, CX, MID_Y, 8, wc, 0.5);
    g.lineStyle(1, wc, 0.14);
    g.lineBetween(ARENA.wallLeft, ARENA.rivalY, ARENA.wallRight, ARENA.rivalY);
    g.lineBetween(ARENA.wallLeft, ARENA.playerY, ARENA.wallRight, ARENA.playerY);

    // HP bars
    this.hpBar(g, HP_TOP_Y, this.shownHp.rival, SIDE_COLORS.rival);
    this.hpBar(g, HP_BOTTOM_Y, this.shownHp.player, SIDE_COLORS.player);
    const rc = COLORS[this.rival.color];
    this.rivalHpText.setText(`${rc.name.toUpperCase()}  ${Math.ceil(duel.fighters.rival.hp)}`);
    this.playerHpText.setText(`YOU  ${Math.ceil(duel.fighters.player.hp)}`);
    this.speedText.setText(`${(duel.speed / BALL.baseSpeed).toFixed(1)}x`);
    this.statusText.player.setText(this.statusLine('player'));
    this.statusText.rival.setText(this.statusLine('rival'));

    const a = this.actors;
    a.clear();
    const player = duel.fighters.player;
    const rival = duel.fighters.rival;

    // Catch rings: hands up glows; an incoming ball draws a ring that closes on you.
    this.catchRing(a, 'player', ARENA.playerY, wc);
    this.catchRing(a, 'rival', ARENA.rivalY, SIDE_COLORS.rival);

    // Fighters, with shield rings
    const pc = this.hurt.player > 0 ? 0xffffff : SIDE_COLORS.player;
    const rcol = this.hurt.rival > 0 ? 0xffffff : SIDE_COLORS.rival;
    neonPoly(a, offsetPoints(CHEVRON, player.x, ARENA.playerY), pc, 0.95, 4);
    neonPoly(a, offsetPoints(HEXAGON, rival.x, ARENA.rivalY), rcol, 0.95, 4);
    const ringPulse = 1 + Math.sin(this.time.now / 160) * 0.06;
    if (player.shield) neonCircle(a, player.x, ARENA.playerY, 66 * ringPulse, COLORS.white.hex, 0.8, 3);
    if (rival.shield) neonCircle(a, rival.x, ARENA.rivalY, 62 * ringPulse, COLORS.white.hex, 0.8, 3);
    this.playerGlow.setPosition(player.x, ARENA.playerY).setTint(wc).setScale(2.2, 1.4).setAlpha(0.55);
    this.rivalGlow.setPosition(rival.x, ARENA.rivalY).setScale(1.9, 1.4).setAlpha(0.4);

    // Balls: decoys first, then the real one on top.
    const t = this.top;
    t.clear();
    for (const d of duel.decoys) this.drawBall(d, this.decoyTrails.get(d) ?? [], false);
    this.drawBall(duel.ball, this.trail, true);

    // Power pips
    const deck = player.deck;
    for (let i = 0; i < PIP_X.length; i++) {
      const card = CARDS[deck.slots[i]];
      const col = COLORS[card.color].hex;
      const armed = i === deck.armed;
      if (armed) {
        a.fillStyle(col, 0.85);
        a.fillCircle(PIP_X[i], PIP_Y, 24);
        neonCircle(a, PIP_X[i], PIP_Y, 36, col, 0.9, 3);
      } else {
        neonCircle(a, PIP_X[i], PIP_Y, 20, col, 0.5, 2);
      }
      this.pipLabels[i].setText(card.name.toUpperCase()).setColor(hexString(col)).setAlpha(armed ? 1 : 0.5);
    }
    this.pipGlow.setPosition(PIP_X[deck.armed], PIP_Y).setTint(COLORS[deck.armedCard.color].hex).setScale(1.3).setAlpha(0.8);

    // Shade / Eclipse: the lights go out between you and the rival.
    const s = this.shade;
    s.clear();
    if (this.darkness > 0.01) {
      const y0 = ARENA.rivalY + 70;
      const y1 = ARENA.playerY - 200;
      s.fillStyle(0x000000, 0.9 * this.darkness);
      s.fillRect(0, y0, W, y1 - y0);
      s.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.9 * this.darkness, 0.9 * this.darkness, 0, 0);
      s.fillRect(0, y1, W, 90);
    }
  }

  private drawBall(ball: Ball, trail: Trail, real: boolean): void {
    const t = this.top;
    const bc = COLORS[ball.color].hex;
    const idle = this.duel.state === 'ready';
    // Ghost balls fade out through the middle of the court (you still see your own faintly).
    let alpha = 1;
    if (ball.ghost && !ball.passed) {
      const f = (ball.y - ARENA.rivalY) / (ARENA.playerY - ARENA.rivalY);
      if (f > 0.28 && f < 0.72) alpha = targetOf(ball) === 'player' ? 0.05 : 0.3;
    }
    const r = BALL.radius * (0.85 + Math.min(ball.damage, 40) / 80);

    const a = this.actors;
    for (let i = 1; i < trail.length; i++) {
      const k = i / trail.length;
      a.lineStyle(r * 2.2 * k, bc, 0.5 * k * alpha);
      a.lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
    }
    const pulse = idle ? 0.8 + Math.sin(this.time.now / 120) * 0.2 : 1;
    if (real) this.ballGlow.setPosition(ball.x, ball.y).setTint(bc).setScale(1.5 * pulse * (r / BALL.radius)).setAlpha(alpha);
    t.fillStyle(bc, 0.9 * alpha);
    t.fillCircle(ball.x, ball.y, r + 4);
    t.fillStyle(0xffffff, alpha);
    t.fillCircle(ball.x, ball.y, r - 2);
  }

  private catchRing(a: Phaser.GameObjects.Graphics, side: Side, y: number, color: number): void {
    const duel = this.duel;
    const f = duel.fighters[side];
    const r = duel.catchRadiusOf(side);
    if (f.catchTime > 0) {
      neonCircle(a, f.x, y, r, color, 0.95, 4);
    } else {
      a.lineStyle(2, color, f.catchCooldown > 0 ? 0.08 : 0.22);
      a.strokeCircle(f.x, y, r);
    }
    if (side !== 'player') return;
    // Timing ring: shrinks onto your catch circle as the ball arrives. Tap as it closes.
    const t = duel.incomingTime(side);
    if (t > CATCH.pressZone) return;
    const k = t / CATCH.pressZone;
    const now = t <= CATCH.window;
    const perfect = t <= CATCH.perfectWindow;
    const ringColor = perfect ? 0xffffff : now ? color : 0x8aa0b8;
    neonCircle(a, f.x, y, r + k * 260, ringColor, now ? 0.9 : 0.35 + (1 - k) * 0.3, now ? 4 : 2);
  }

  private statusLine(side: Side): string {
    const f = this.duel.fighters[side];
    const tags: string[] = [];
    if (f.shield) tags.push('SHIELD');
    if (f.reachTime > 0) tags.push('REACH+');
    if (f.slowTime > 0) tags.push('SLOW');
    if (f.poisonTime > 0) tags.push('POISON');
    if (f.fizzled) tags.push('HEXED');
    if (f.nextThrowMul < 1) tags.push('FROST');
    return tags.join(' · ');
  }

  private hpBar(g: Phaser.GameObjects.Graphics, y: number, frac: number, color: number): void {
    const x0 = 60;
    const w = W - 120;
    g.lineStyle(2, color, 0.45);
    g.strokeRoundedRect(x0, y - 9, w, 18, 9);
    g.fillStyle(color, 0.75);
    const fw = Math.max(0, (w - 8) * frac);
    if (fw > 12) g.fillRoundedRect(x0 + 4, y - 5, fw, 10, 5);
  }
}
