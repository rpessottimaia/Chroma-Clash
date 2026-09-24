import * as Phaser from 'phaser';
import { ARENA, DECK } from '../config';
import { CARDS, cardsOfColor, type Card, type CardId } from '../core/cards';
import { COLORS, POWER_COLORS, SIDE_COLORS, type PowerColor } from '../core/colors';
import { FONT, hexString, neonCircle } from '../fx/neon';
import { addDots, button, text, type Button } from '../fx/ui';
import { loadProfile, saveProfile, type Profile } from '../meta/profile';

const W = ARENA.width;
const CX = W / 2;
const TAB_Y = 230;
const TAB_GAP = 132;
const GRID_Y = 350;
const TILE_W = 322;
const TILE_H = 178;
const TILE_GAP = 14;
const COL_X = [30, 30 + TILE_W + 16];
const DECK_Y = 1290;
const DECK_GAP = 92;
const RARITY_DOTS = { common: '●', uncommon: '●●', rare: '●●●' } as const;

/** Pick 3-7 unique cards from the five color decks. The deck is saved on every change. */
export class DeckScene extends Phaser.Scene {
  private profile!: Profile;
  private color: PowerColor = 'red';
  private g!: Phaser.GameObjects.Graphics;
  private tabLabels: Phaser.GameObjects.Text[] = [];
  private tabCounts: Phaser.GameObjects.Text[] = [];
  private tiles: { name: Phaser.GameObjects.Text; stats: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text; check: Phaser.GameObjects.Text }[] = [];
  private identity!: Phaser.GameObjects.Text;
  private deckTitle!: Phaser.GameObjects.Text;
  private deckNames: Phaser.GameObjects.Text[] = [];
  private toast!: Phaser.GameObjects.Text;
  private play!: Button;

  constructor() {
    super('Deck');
  }

  create(): void {
    this.profile = loadProfile();
    this.color = CARDS[this.profile.deck[0]]?.color ?? 'red';
    addDots(this).setTint(0xe8f4ff).setAlpha(0.18);
    this.g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    text(this, CX, 70, 44, '#e8f4ff', 'BUILD YOUR DECK').setLetterSpacing(4);
    text(this, CX, 124, 22, '#8aa0b8', `pick ${DECK.min} to ${DECK.max} cards · tap to add or remove`);

    POWER_COLORS.forEach((c, i) => {
      const x = CX + (i - 2) * TAB_GAP;
      this.tabCounts.push(text(this, x, TAB_Y, 24, '#000000'));
      this.tabLabels.push(text(this, x, TAB_Y + 58, 18, hexString(COLORS[c].hex), COLORS[c].name.toUpperCase()));
      this.add.zone(x, TAB_Y + 20, TAB_GAP, 120).setInteractive({ useHandCursor: true })
        .on('pointerup', () => { this.color = c; this.refresh(); });
    });

    for (let i = 0; i < 8; i++) {
      const { x, y } = this.tilePos(i);
      const pad = 18;
      this.tiles.push({
        name: this.add.text(x + pad, y + pad, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#e8f4ff' }).setDepth(6),
        check: this.add.text(x + TILE_W - pad, y + pad, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#e8f4ff' }).setOrigin(1, 0).setDepth(6),
        stats: this.add.text(x + pad, y + 58, '', { fontFamily: FONT, fontSize: '19px', color: '#8aa0b8' }).setDepth(6),
        body: this.add.text(x + pad, y + 92, '', { fontFamily: FONT, fontSize: '21px', color: '#d6e4f0', wordWrap: { width: TILE_W - pad * 2 }, lineSpacing: 4 }).setDepth(6),
      });
      this.add.zone(x + TILE_W / 2, y + TILE_H / 2, TILE_W, TILE_H).setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.toggle(cardsOfColor(this.color)[i]));
    }

    this.identity = text(this, CX, GRID_Y + 4 * (TILE_H + TILE_GAP) + 16, 22, '#8aa0b8');
    this.deckTitle = text(this, CX, DECK_Y - 72, 26, '#e8f4ff');
    for (let i = 0; i < DECK.max; i++) {
      const x = this.deckX(i);
      this.deckNames.push(text(this, x, DECK_Y + 48, 15, '#8aa0b8'));
      this.add.zone(x, DECK_Y + 10, DECK_GAP, 110).setInteractive({ useHandCursor: true })
        .on('pointerup', () => { const id = this.profile.deck[i]; if (id) this.toggle(id); });
    }
    this.toast = text(this, CX, DECK_Y + 96, 20, '#ff6b8a');

    button(this, 150, 1460, 220, 96, 'BACK', 0xe8f4ff, () => this.scene.start('Menu'), 28);
    this.play = button(this, 470, 1460, 380, 96, '▶  PLAY', SIDE_COLORS.player, () => this.scene.start('Duel'), 36);

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Menu'));
    this.add.tileSprite(0, 0, ARENA.width, ARENA.height, 'scanlines').setOrigin(0).setDepth(30).setAlpha(0.2);
    this.refresh();
  }

  private tilePos(i: number): { x: number; y: number } {
    return { x: COL_X[i % 2], y: GRID_Y + Math.floor(i / 2) * (TILE_H + TILE_GAP) };
  }

  private deckX(i: number): number {
    return CX + (i - (DECK.max - 1) / 2) * DECK_GAP;
  }

  private toggle(id: CardId | undefined): void {
    if (!id) return;
    const deck = this.profile.deck;
    const at = deck.indexOf(id);
    if (at >= 0) {
      deck.splice(at, 1);
    } else if (deck.length >= DECK.max) {
      this.flashToast(`deck is full (${DECK.max}) · tap a card below to remove it`);
      return;
    } else {
      deck.push(id);
    }
    // Only a playable deck is saved, so the menu never loads a broken one.
    if (deck.length >= DECK.min) saveProfile(this.profile);
    this.refresh();
  }

  private flashToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 400 });
  }

  private refresh(): void {
    const g = this.g;
    g.clear();
    const deck = this.profile.deck;

    // Color tabs
    POWER_COLORS.forEach((c, i) => {
      const x = CX + (i - 2) * TAB_GAP;
      const col = COLORS[c].hex;
      const count = deck.filter((id) => CARDS[id].color === c).length;
      const on = c === this.color;
      g.fillStyle(col, on ? 0.9 : 0.18);
      g.fillCircle(x, TAB_Y, 32);
      neonCircle(g, x, TAB_Y, on ? 42 : 34, col, on ? 1 : 0.5, on ? 3 : 2);
      this.tabCounts[i].setText(count ? String(count) : '').setColor(on ? '#000000' : hexString(col));
      this.tabLabels[i].setAlpha(on ? 1 : 0.55);
    });

    // Card tiles
    const col = COLORS[this.color].hex;
    cardsOfColor(this.color).forEach((id, i) => {
      const c: Card = CARDS[id];
      const { x, y } = this.tilePos(i);
      const picked = deck.includes(id);
      g.fillStyle(col, picked ? 0.2 : 0.05);
      g.fillRoundedRect(x, y, TILE_W, TILE_H, 26);
      g.lineStyle(picked ? 3 : 2, col, picked ? 1 : 0.4);
      g.strokeRoundedRect(x, y, TILE_W, TILE_H, 26);
      const t = this.tiles[i];
      t.name.setText(c.name.toUpperCase()).setColor(hexString(col));
      t.check.setText(picked ? '✓' : RARITY_DOTS[c.rarity]).setColor(picked ? '#e8f4ff' : hexString(col)).setAlpha(picked ? 1 : 0.6);
      t.stats.setText(`DMG ${c.damage} · SPD ${c.speedMul.toFixed(2).replace(/0$/, '')}x`);
      t.body.setText(c.text);
    });
    this.identity.setText(`${COLORS[this.color].name.toUpperCase()} · ${COLORS[this.color].identity.toLowerCase()}`)
      .setColor(hexString(col));

    // Deck strip
    this.deckTitle.setText(`YOUR DECK  ${deck.length} / ${DECK.max}`);
    for (let i = 0; i < DECK.max; i++) {
      const x = this.deckX(i);
      const id = deck[i];
      if (id) {
        const cc = COLORS[CARDS[id].color].hex;
        g.fillStyle(cc, 0.85);
        g.fillCircle(x, DECK_Y, 26);
        neonCircle(g, x, DECK_Y, 34, cc, 0.8, 2);
        this.deckNames[i].setText(CARDS[id].name.toUpperCase().slice(0, 8)).setColor(hexString(cc));
      } else {
        neonCircle(g, x, DECK_Y, 26, 0xe8f4ff, i < DECK.min ? 0.35 : 0.15, 2);
        this.deckNames[i].setText('');
      }
    }

    const ok = deck.length >= DECK.min;
    this.play.setEnabled(ok);
    if (!ok) this.toast.setText(`add ${DECK.min - deck.length} more to play`).setAlpha(1);
    else if (this.toast.text.startsWith('add ')) this.toast.setAlpha(0);
  }
}
