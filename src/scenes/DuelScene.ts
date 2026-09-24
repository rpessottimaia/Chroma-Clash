import * as Phaser from 'phaser';
import { ARENA, BALL, CATCH, DUEL, FX, PLAYER } from '../config';
import { RivalAI } from '../ai/rival';
import type { Side } from '../core/ball';
import { CARDS, PLAYER_TEST_DECK, RIVAL_TEST_DECK } from '../core/cards';
import { COLORS, SIDE_COLORS } from '../core/colors';
import { Duel, type DuelEvent } from '../core/duel';
import { FONT, hexString, lerpColor, neonCircle, neonLine, neonPoly } from '../fx/neon';
import { flashesAllowed, setReduceFlashes, settings } from '../settings';

type Phase = 'title' | 'duel' | 'over';

const W = ARENA.width;
const CX = (ARENA.wallLeft + ARENA.wallRight) / 2;
const PIP_Y = 1428;
const PIP_GAP = 170;
const PIP_X = [CX - PIP_GAP, CX, CX + PIP_GAP];
const HP_TOP_Y = 84;
const HP_BOTTOM_Y = 1512;

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

export class DuelScene extends Phaser.Scene {
  duel!: Duel;
  private ai!: RivalAI;
  private phase: Phase = 'title';
  private acc = 0;

  // Rendering
  private world!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private ballGlow!: Phaser.GameObjects.Image;
  private playerGlow!: Phaser.GameObjects.Image;
  private rivalGlow!: Phaser.GameObjects.Image;
  private pipGlow!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail: { x: number; y: number }[] = [];
  private worldColor = COLORS.red.hex;
  private fromColor = COLORS.red.hex;
  private toColor = COLORS.red.hex;
  private colorT = 1;
  private pulse = 0;
  private hurt: Record<Side, number> = { player: 0, rival: 0 };
  private shownHp: Record<Side, number> = { player: 1, rival: 1 };

  // HUD
  private rivalHpText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private pipLabels: Phaser.GameObjects.Text[] = [];
  private msg!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private toggle!: Phaser.GameObjects.Text;
  private fpsText?: Phaser.GameObjects.Text;

  // Input
  private targetX = CX;
  private dragId: number | null = null;
  private anchorX = 0;
  private dragFromX = 0;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Duel');
  }

  create(): void {
    this.world = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(0);
    this.playerGlow = this.glowImage(1);
    this.rivalGlow = this.glowImage(1).setTint(SIDE_COLORS.rival);
    this.pipGlow = this.glowImage(1);
    this.actors = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
    this.ballGlow = this.glowImage(3);
    this.top = this.add.graphics().setDepth(4);

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

    const text = (x: number, y: number, size: number, color = '#e8f4ff') =>
      this.add.text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(6);

    this.rivalHpText = text(60, HP_TOP_Y - 36, 26, hexString(SIDE_COLORS.rival)).setOrigin(0, 0.5);
    this.speedText = text(W - 60, HP_TOP_Y - 36, 22, '#8aa0b8').setOrigin(1, 0.5);
    this.playerHpText = text(60, HP_BOTTOM_Y + 34, 26, hexString(SIDE_COLORS.player)).setOrigin(0, 0.5);
    this.pipLabels = PIP_X.map((x) => text(x, PIP_Y + 50, 20));
    this.msg = text(CX, 540, 84).setLetterSpacing(6).setShadow(0, 0, '#00f0ff', 24, true, true);
    this.sub = text(CX, 870, 28).setLineSpacing(10);
    this.toggle = text(CX, 1080, 24, '#8aa0b8');
    if (settings.debug) this.fpsText = text(W - 60, HP_BOTTOM_Y + 34, 20, '#8aa0b8').setOrigin(1, 0.5);

    this.setupInput();
    this.newDuel();
    if (settings.debug) (window as unknown as { __duelScene: DuelScene }).__duelScene = this;
    this.showTitle();
  }

  private glowImage(depth: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
  }

  // ---------------------------------------------------------------- flow

  private newDuel(): void {
    this.duel = new Duel({ playerDeck: PLAYER_TEST_DECK, rivalDeck: RIVAL_TEST_DECK });
    this.ai = new RivalAI();
    this.targetX = CX;
    this.acc = 0;
    this.trail = [];
    this.shownHp = { player: 1, rival: 1 };
    this.worldColor = this.fromColor = this.toColor = COLORS[this.duel.fighters.player.deck.armedCard.color].hex;
    this.colorT = 1;
  }

  private showTitle(): void {
    this.phase = 'title';
    this.msg.setText('CHROMA\nCLASH').setVisible(true).setShadow(0, 0, '#00f0ff', 24, true, true);
    this.sub.setText('SLIDE  to move\nTAP  to switch power\ncatching is automatic\n\n▶ TAP TO START').setVisible(true);
    this.updateToggle();
    this.toggle.setVisible(true);
  }

  private updateToggle(): void {
    const forced = settings.reduceMotion ? ' (system)' : '';
    this.toggle.setText(`[ reduce flashes: ${settings.reduceFlashes || settings.reduceMotion ? 'ON' : 'OFF'}${forced} ]`);
  }

  private startDuel(): void {
    this.newDuel();
    this.phase = 'duel';
    this.toggle.setVisible(false);
    this.sub.setVisible(false);
    this.msg.setText('READY').setVisible(true).setAlpha(1).setShadow(0, 0, '#00f0ff', 24, true, true);
  }

  private endDuel(winner: Side): void {
    this.time.delayedCall(900, () => {
      this.phase = 'over';
      this.msg.setText(winner === 'player' ? 'YOU WIN' : 'K.O.').setAlpha(1).setVisible(true)
        .setShadow(0, 0, hexString(SIDE_COLORS[winner]), 24, true, true);
      this.sub.setText(`rally speed reached ${(this.duel.speed / BALL.baseSpeed).toFixed(1)}x\n${Math.floor(this.duel.elapsed / 60)}m ${Math.floor(this.duel.elapsed % 60)}s\n\n▶ TAP TO PLAY AGAIN`).setVisible(true);
      this.updateToggle();
      this.toggle.setVisible(true);
    });
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' }) as typeof this.keys;
    kb.on('keydown-SPACE', () => (this.phase === 'duel' ? this.cycle() : this.startDuel()));
    kb.on('keydown-ENTER', () => {
      if (this.phase !== 'duel') this.startDuel();
    });
    kb.on('keydown-ONE', () => this.arm(0));
    kb.on('keydown-TWO', () => this.arm(1));
    kb.on('keydown-THREE', () => this.arm(2));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'duel') {
      if (this.toggle.visible && this.toggle.getBounds().contains(p.x, p.y)) {
        setReduceFlashes(!settings.reduceFlashes);
        this.updateToggle();
        return;
      }
      if (this.phase === 'over' || this.phase === 'title') this.startDuel();
      // The starting finger becomes the slider right away, but never counts as a tap.
      this.beginDrag(p);
      this.downAt = -Infinity;
      return;
    }
    if (this.dragId === null) {
      this.beginDrag(p);
      return;
    }
    // A second finger while one is sliding: switch power immediately.
    this.tapAt(p.x, p.y);
  }

  private beginDrag(p: Phaser.Input.Pointer): void {
    this.dragId = p.id;
    this.anchorX = p.x;
    this.dragFromX = this.targetX;
    this.downAt = this.time.now;
    this.downX = p.x;
    this.downY = p.y;
    this.moved = false;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId || !p.isDown) return;
    if (Math.abs(p.x - this.downX) > PLAYER.tapSlop || Math.abs(p.y - this.downY) > PLAYER.tapSlop) this.moved = true;
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
    if (p.id !== this.dragId) return;
    this.dragId = null;
    if (this.phase === 'duel' && !this.moved && this.time.now - this.downAt <= PLAYER.tapMaxMs) this.tapAt(p.x, p.y);
  }

  /** A tap on a pip arms that slot; a tap anywhere else cycles. */
  private tapAt(x: number, y: number): void {
    if (y > PIP_Y - 70) {
      const i = PIP_X.findIndex((px) => Math.abs(px - x) < PIP_GAP / 2);
      if (i >= 0) return this.arm(i);
    }
    this.cycle();
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
    if (this.phase !== 'title') {
      this.acc += dt;
      while (this.acc >= DUEL.step) {
        this.fixedStep(DUEL.step);
        this.acc -= DUEL.step;
      }
      for (const e of this.duel.drainEvents()) this.onEvent(e);
    }
    this.animate(dt);
    this.render();
  }

  private fixedStep(dt: number): void {
    const dir = (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0) - (this.keys.left.isDown || this.keys.a.isDown ? 1 : 0);
    if (dir !== 0 && this.phase === 'duel') {
      this.targetX = Phaser.Math.Clamp(this.targetX + dir * PLAYER.keySpeed * dt,
        ARENA.wallLeft + ARENA.moveMargin, ARENA.wallRight - ARENA.moveMargin);
    }
    const me = this.duel.fighters.player;
    const step = PLAYER.maxSpeed * dt;
    this.duel.moveTo('player', me.x + Phaser.Math.Clamp(this.targetX - me.x, -step, step));
    this.ai.update(this.duel, dt);
    this.duel.step(dt);
  }

  private onEvent(e: DuelEvent): void {
    switch (e.type) {
      case 'serve':
        this.tweens.add({ targets: this.msg, alpha: 0, duration: 350, onComplete: () => this.msg.setVisible(false) });
        break;
      case 'catch': {
        const color = COLORS[e.card.color].hex;
        if (!settings.reduceMotion) this.pulse = 1;
        this.throwFlash(color);
        this.sparks.setParticleTint(color);
        this.sparks.explode(e.perfect ? 16 : 8, e.x, e.y);
        const dy = e.side === 'player' ? -70 : 70;
        const label = e.side === 'player' && e.perfect ? `PERFECT  ${e.card.name}` : e.card.name;
        this.floatText(e.x, e.y + dy, label.toUpperCase(), color, e.perfect ? 30 : 24);
        if (e.side === 'player') this.onArmedChanged();
        break;
      }
      case 'hit': {
        const sideColor = SIDE_COLORS[e.victim];
        this.hurt[e.victim] = 0.3;
        this.sparks.setParticleTint([sideColor, e.color === 'neutral' ? 0xffffff : COLORS[e.color].hex, 0xffffff]);
        this.sparks.explode(FX.hitParticles, e.x, e.y);
        if (!settings.reduceMotion) this.cameras.main.shake(FX.shakeMs, FX.shakeIntensity);
        this.floatText(e.x, e.y + (e.victim === 'player' ? -60 : 60), `-${e.damage}`, 0xffffff, 44);
        break;
      }
      case 'ko':
        this.endDuel(e.winner);
        break;
      case 'miss':
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
    this.tweens.add({ targets: t, y: y + (y > ARENA.height / 2 ? -40 : 40), alpha: 0, duration: 800, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
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
    const b = this.duel.ball;
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > FX.trailLength) this.trail.shift();
    if (this.fpsText) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const duel = this.duel;
    const wc = this.worldColor;
    const g = this.world;
    g.clear();

    // Grid
    const gridAlpha = 0.09 + this.pulse * 0.12;
    g.lineStyle(1, wc, gridAlpha);
    for (let x = ARENA.wallLeft; x <= ARENA.wallRight + 1; x += 72) g.lineBetween(x, 0, x, ARENA.height);
    for (let y = ARENA.height / 2 % 72; y <= ARENA.height; y += 72) g.lineBetween(0, y, W, y);

    // Court
    const top = ARENA.rivalBackY;
    const bottom = ARENA.playerBackY;
    neonLine(g, ARENA.wallLeft, top, ARENA.wallLeft, bottom, wc, 0.5);
    neonLine(g, ARENA.wallRight, top, ARENA.wallRight, bottom, wc, 0.5);
    neonLine(g, ARENA.wallLeft, top, ARENA.wallRight, top, wc, 0.6, 3);
    neonLine(g, ARENA.wallLeft, bottom, ARENA.wallRight, bottom, wc, 0.6, 3);
    neonLine(g, ARENA.wallLeft, ARENA.height / 2, ARENA.wallRight, ARENA.height / 2, wc, 0.28);
    neonCircle(g, CX, ARENA.height / 2, 76, wc, 0.25);
    g.lineStyle(1, wc, 0.14);
    g.lineBetween(ARENA.wallLeft, ARENA.rivalY, ARENA.wallRight, ARENA.rivalY);
    g.lineBetween(ARENA.wallLeft, ARENA.playerY, ARENA.wallRight, ARENA.playerY);

    // HP bars
    this.hpBar(g, HP_TOP_Y, this.shownHp.rival, SIDE_COLORS.rival);
    this.hpBar(g, HP_BOTTOM_Y, this.shownHp.player, SIDE_COLORS.player);
    this.rivalHpText.setText(`RIVAL  ${duel.fighters.rival.hp}`);
    this.playerHpText.setText(`YOU  ${duel.fighters.player.hp}`);
    this.speedText.setText(`SPEED ${(duel.speed / BALL.baseSpeed).toFixed(1)}x`);

    const a = this.actors;
    a.clear();
    const player = duel.fighters.player;
    const rival = duel.fighters.rival;

    // Reach bars: the bright middle is the perfect-catch zone.
    const reachY = ARENA.playerY + 40;
    neonLine(a, player.x - CATCH.reach, reachY, player.x + CATCH.reach, reachY, wc, 0.3, 2);
    neonLine(a, player.x - CATCH.reach * CATCH.perfectZone, reachY, player.x + CATCH.reach * CATCH.perfectZone, reachY, wc, 0.9, 4);
    a.lineStyle(2, SIDE_COLORS.rival, 0.22);
    a.lineBetween(rival.x - CATCH.reach, ARENA.rivalY - 42, rival.x + CATCH.reach, ARENA.rivalY - 42);

    // Fighters
    const pc = this.hurt.player > 0 ? 0xffffff : SIDE_COLORS.player;
    const rc = this.hurt.rival > 0 ? 0xffffff : SIDE_COLORS.rival;
    neonPoly(a, offsetPoints(CHEVRON, player.x, ARENA.playerY), pc, 0.95, 4);
    neonPoly(a, offsetPoints(HEXAGON, rival.x, ARENA.rivalY), rc, 0.95, 4);
    this.playerGlow.setPosition(player.x, ARENA.playerY).setTint(wc).setScale(2.2, 1.4).setAlpha(0.55);
    this.rivalGlow.setPosition(rival.x, ARENA.rivalY).setScale(1.9, 1.4).setAlpha(0.4);

    // Ball trail
    const ball = duel.ball;
    const bc = COLORS[ball.color].hex;
    for (let i = 1; i < this.trail.length; i++) {
      const r = i / this.trail.length;
      const p0 = this.trail[i - 1];
      const p1 = this.trail[i];
      a.lineStyle(BALL.radius * 2.2 * r, bc, 0.5 * r);
      a.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }

    // Power pips
    const deck = player.deck;
    for (let i = 0; i < PIP_X.length; i++) {
      const card = CARDS[deck.slots[i] as keyof typeof CARDS];
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

    // Ball: tinted halo plus a white-hot core, always the brightest thing on screen.
    const t = this.top;
    t.clear();
    this.ballGlow.setVisible(this.phase !== 'title');
    if (this.phase === 'title') return;
    const idle = duel.state === 'ready';
    const pulse = idle ? 0.8 + Math.sin(this.time.now / 120) * 0.2 : 1;
    this.ballGlow.setPosition(ball.x, ball.y).setTint(bc).setScale(1.5 * pulse).setAlpha(1);
    t.fillStyle(bc, 0.9);
    t.fillCircle(ball.x, ball.y, BALL.radius + 4);
    t.fillStyle(0xffffff, 1);
    t.fillCircle(ball.x, ball.y, BALL.radius - 2);
  }

  private hpBar(g: Phaser.GameObjects.Graphics, y: number, frac: number, color: number): void {
    const x0 = 60;
    const w = W - 120;
    g.lineStyle(2, color, 0.45);
    g.strokeRect(x0, y - 8, w, 16);
    g.fillStyle(color, 0.75);
    g.fillRect(x0 + 3, y - 5, Math.max(0, (w - 6) * frac), 10);
  }
}
