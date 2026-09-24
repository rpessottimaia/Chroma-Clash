import * as Phaser from 'phaser';

/** Generates the few textures the game needs (no image assets to download). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeGlow('glow', 128);
    this.makeSpark('spark', 6);
    this.makeScanlines('scanlines');
    this.makeDots('dots', 48);
    this.scene.start('Menu');
  }

  /** Soft white radial falloff, tinted and additively blended for every neon halo. */
  private makeGlow(key: string, size: number): void {
    const tex = this.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** A hard square pixel for particle bursts. */
  private makeSpark(key: string, size: number): void {
    const tex = this.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** One soft dot per tile, tiled into the backdrop's dot matrix. */
  private makeDots(key: string, size: number): void {
    const tex = this.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }

  /** One dark line every 4px, tiled over the screen for a light CRT feel. */
  private makeScanlines(key: string): void {
    const tex = this.textures.createCanvas(key, 4, 4)!;
    const ctx = tex.getContext();
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, 4, 1);
    tex.refresh();
  }
}
