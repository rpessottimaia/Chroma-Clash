import * as Phaser from 'phaser';
import { ARENA } from './config';
import { ArenaScene } from './scenes/ArenaScene';
import { BootScene } from './scenes/BootScene';
import { DeckScene } from './scenes/DeckScene';
import { DuelScene } from './scenes/DuelScene';
import { MenuScene } from './scenes/MenuScene';

// Stop iOS pinch-zoom and double-tap zoom; the canvas owns every touch.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width,
  height: ARENA.height,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  fps: {
    target: 60,
  },
  scene: [BootScene, MenuScene, DeckScene, DuelScene, ArenaScene],
});
