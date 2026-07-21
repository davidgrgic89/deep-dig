import Phaser from 'phaser';
import { makeTiles, makeSprites, makeProps } from '../art.js';

// No files to load — every texture is generated here at boot.
export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    makeTiles(this);
    makeSprites(this);
    makeProps(this);
    // give the pixel font a beat to be ready before any text renders
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.scene.start('Menu'));
      document.fonts.load('10px "Press Start 2P"');
    } else {
      this.scene.start('Menu');
    }
  }
}
