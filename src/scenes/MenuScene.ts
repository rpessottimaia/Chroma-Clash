import * as Phaser from 'phaser';
import { ARENA } from '../config';
import { CARDS } from '../core/cards';
import { COLORS, SIDE_COLORS } from '../core/colors';
import { hexString, neonCircle } from '../fx/neon';
import { addDots, button, drawRings, text } from '../fx/ui';
import { loadProfile } from '../meta/profile';
import { setReduceFlashes, settings } from '../settings';

const CX = ARENA.width / 2;

/** Title screen: your saved deck at a glance, then PLAY or EDIT DECK. */
export class MenuScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    const profile = loadProfile();
    addDots(this).setTint(SIDE_COLORS.player).setAlpha(0.35);
    this.bg = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    text(this, CX, 330, 96, '#e8f4ff', 'CHROMA\nCLASH').setLetterSpacing(8).setLineSpacing(-6)
      .setShadow(0, 0, hexString(SIDE_COLORS.player), 28, true, true);
    text(this, CX, 530, 26, '#8aa0b8', 'a neon ball duel');

    // Deck preview
    text(this, CX, 650, 24, '#8aa0b8', `YOUR DECK · ${profile.deck.length} CARDS`);
    const pips = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const gap = Math.min(92, 600 / profile.deck.length);
    profile.deck.forEach((id, i) => {
      const x = CX + (i - (profile.deck.length - 1) / 2) * gap;
      const col = COLORS[CARDS[id].color].hex;
      pips.fillStyle(col, 0.8);
      pips.fillCircle(x, 730, 20);
      neonCircle(pips, x, 730, 30, col, 0.8, 2);
      text(this, x, 785, 15, hexString(col), CARDS[id].name.toUpperCase().slice(0, 8));
    });

    button(this, CX, 930, 440, 116, '▶  PLAY', SIDE_COLORS.player, () => this.scene.start('Duel'), 44);
    button(this, CX, 1080, 440, 92, 'EDIT DECK', 0xe8f4ff, () => this.scene.start('Deck'), 30);

    const games = profile.wins + profile.losses;
    if (games > 0) {
      text(this, CX, 1210, 22, '#8aa0b8',
        `WINS ${profile.wins} · LOSSES ${profile.losses}${profile.bestSpeed ? ` · TOP SPEED ${profile.bestSpeed.toFixed(1)}x` : ''}`);
    }

    const toggle = text(this, CX, 1300, 22, '#8aa0b8');
    const renderToggle = () => {
      const forced = settings.reduceMotion ? ' (system)' : '';
      toggle.setText(`[ reduce flashes: ${settings.reduceFlashes || settings.reduceMotion ? 'ON' : 'OFF'}${forced} ]`);
    };
    renderToggle();
    toggle.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      setReduceFlashes(!settings.reduceFlashes);
      renderToggle();
    });

    text(this, CX, 1440, 22, '#5d7087', 'slide to move · tap to switch power\ncatching is automatic').setLineSpacing(8);

    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('Duel'));
    this.input.keyboard?.on('keydown-SPACE', () => this.scene.start('Duel'));
    this.input.keyboard?.on('keydown-D', () => this.scene.start('Deck'));
    this.add.tileSprite(0, 0, ARENA.width, ARENA.height, 'scanlines').setOrigin(0).setDepth(30).setAlpha(0.2);
  }

  update(time: number): void {
    this.bg.clear();
    drawRings(this.bg, SIDE_COLORS.player, settings.reduceMotion ? 0 : time);
  }
}
