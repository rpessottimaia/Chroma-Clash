import * as Phaser from 'phaser';
import { ARENA } from '../config';
import { FONT, hexString } from './neon';

export interface Button {
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
  setVisible(on: boolean): void;
  destroy(): void;
}

/** A rounded neon button. Fires on release so a slide off the button cancels it. */
export function button(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  label: string, color: number, onTap: () => void, size = 34,
): Button {
  const g = scene.add.graphics().setDepth(20);
  const text = scene.add.text(x, y, label, { fontFamily: FONT, fontSize: `${size}px`, color: hexString(color), fontStyle: 'bold' })
    .setOrigin(0.5).setDepth(21).setLetterSpacing(3);
  const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(22);
  let enabled = true;
  let pressed = false;

  const draw = () => {
    g.clear();
    const a = enabled ? 1 : 0.3;
    g.fillStyle(color, (pressed ? 0.3 : 0.1) * a);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    g.lineStyle(10, color, 0.12 * a);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    g.lineStyle(3, color, 0.9 * a);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    text.setAlpha(a);
  };
  zone.on('pointerdown', () => { pressed = true; draw(); });
  zone.on('pointerout', () => { pressed = false; draw(); });
  zone.on('pointerup', () => {
    const was = pressed;
    pressed = false;
    draw();
    if (was && enabled) onTap();
  });
  draw();

  return {
    setEnabled(on) { enabled = on; draw(); },
    setLabel(t) { text.setText(t); },
    setVisible(on) { g.setVisible(on); text.setVisible(on); zone.setVisible(on); if (on) zone.setInteractive(); else zone.disableInteractive(); },
    destroy() { g.destroy(); text.destroy(); zone.destroy(); },
  };
}

/** Dot matrix backdrop (one tiled texture, tinted to the world color). */
export function addDots(scene: Phaser.Scene): Phaser.GameObjects.TileSprite {
  return scene.add.tileSprite(0, 0, ARENA.width, ARENA.height, 'dots')
    .setOrigin(0).setDepth(-1).setBlendMode(Phaser.BlendModes.ADD);
}

/** Concentric rings breathing out from the center: the arena's round heartbeat. */
export function drawRings(g: Phaser.GameObjects.Graphics, color: number, time: number, pulse = 0): void {
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  const drift = (time / 1000) * 40;
  for (let i = 0; i < 7; i++) {
    const r = ((i * 150 + drift) % 1050) + 40;
    const fade = 1 - r / 1090;
    g.lineStyle(2, color, (0.08 + pulse * 0.12) * fade);
    g.strokeCircle(cx, cy, r);
  }
}

export function text(
  scene: Phaser.Scene, x: number, y: number, size: number, color = '#e8f4ff', str = '',
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center', fontStyle: 'bold' })
    .setOrigin(0.5).setDepth(6);
}
