import Phaser from 'phaser';
import Sfx from '../audio.js';

const FONT = '"Press Start 2P"';
const TXT = (size, color = '#f2e6c9') => ({
  fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#14100a', strokeThickness: 4,
});

export default class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const { width: SW, height: SH } = this.scale;

    // warm desert-evening backdrop
    const g = this.add.graphics();
    const bands = [[0x2a1a3e, 0], [0x5c2f52, 0.35], [0xa8484a, 0.6], [0xe08a4a, 0.8], [0xf2c66a, 0.95]];
    for (let i = 0; i < bands.length; i++) {
      const y0 = SH * bands[i][1];
      const y1 = i + 1 < bands.length ? SH * bands[i + 1][1] : SH;
      g.fillStyle(bands[i][0]);
      g.fillRect(0, y0, SW, y1 - y0);
    }
    this.add.circle(SW * 0.75, SH * 0.62, 46, 0xffe8b0, 0.9);
    this.add.tileSprite(SW / 2, SH - 40, SW, 120, 'dunes').setScale(1, 2).setTint(0x4a2618);
    for (let i = 0; i < 40; i++) {
      this.add.circle(Math.random() * SW, Math.random() * SH * 0.5, 1, 0xffffff,
        0.3 + Math.random() * 0.5);
    }

    this.add.text(SW / 2, SH * 0.24, 'DEEP DIG', TXT(56, '#f2d75c')).setOrigin(0.5)
      .setShadow(0, 6, '#5c2f16', 0, true, true);
    this.add.text(SW / 2, SH * 0.35, "an explorer's dream", TXT(14, '#f2e6c9')).setOrigin(0.5);

    // the explorer, gazing at the horizon
    const dusty = this.add.image(SW * 0.72, SH - 96, 'player', 0).setScale(6);
    this.tweens.add({ targets: dusty, y: dusty.y - 4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const hasSave = !!localStorage.getItem('deepdig-save-v2');
    this.options = hasSave ? ['CONTINUE', 'NEW DREAM'] : ['NEW DREAM'];
    this.sel = 0;
    this.optTexts = this.options.map((o, i) =>
      this.add.text(SW / 2, SH * 0.52 + i * 40, o, TXT(16)).setOrigin(0.5));
    this.paint();

    this.add.text(SW / 2, SH * 0.72,
      'Dig for riches under the town. Sell, upgrade, dig deeper.\n' +
      'Find the Portal Stones to open the sealed gates below.\n' +
      'The deeper you go, the darker it gets...',
      { ...TXT(9, '#d8c8a8'), align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.add.text(SW / 2, SH * 0.86,
      'MOVE ←→/AD   JUMP SPACE   DIG X or J (+↑/↓ to aim)   INTERACT E\n' +
      'MAP TAB   QUESTS Q   DASH SHIFT   DYNAMITE K   TELE-KIT T   RECALL hold R   MUTE M',
      { ...TXT(8, '#b8a888'), align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.add.text(SW / 2, SH - 18, '↑↓ / tap to choose — ENTER / SPACE / tap to start', TXT(9, '#f2d75c')).setOrigin(0.5);

    // tap an option (mobile): select it and start
    this.optTexts.forEach((t, i) => {
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.sel = i; this.paint(); this.start();
      });
    });

    this.input.keyboard.on('keydown-UP', () => this.move(-1));
    this.input.keyboard.on('keydown-DOWN', () => this.move(1));
    this.input.keyboard.on('keydown-W', () => this.move(-1));
    this.input.keyboard.on('keydown-S', () => this.move(1));
    this.input.keyboard.on('keydown-ENTER', () => this.start());
    this.input.keyboard.on('keydown-SPACE', () => this.start());
  }

  move(d) {
    this.sel = (this.sel + d + this.options.length) % this.options.length;
    Sfx.select();
    this.paint();
  }

  paint() {
    this.optTexts.forEach((t, i) => {
      t.setColor(i === this.sel ? '#f2d75c' : '#f2e6c9');
      t.setText((i === this.sel ? '> ' : '') + this.options[i] + (i === this.sel ? ' <' : ''));
    });
  }

  start() {
    const choice = this.options[this.sel];
    if (choice === 'NEW DREAM') {
      localStorage.removeItem('deepdig-save-v2');
      this.registry.set('freshRun', true);
    }
    Sfx.ensure();
    Sfx.select();
    this.scene.start('Game');
    this.scene.launch('UI');
  }
}
