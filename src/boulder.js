import Phaser from 'phaser';
import Sfx from './audio.js';

// A heavy rock that rests on solid ground. Dig out the block beneath it and it
// wobbles for a beat (your warning), then crashes straight down — crushing you
// if you're underneath. Lands and rests again; can be smashed with the pickaxe.
const SHAKE_MS = 1400;

export class Boulder extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'boulder');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(7);
    this.body.setSize(14, 14).setOffset(1, 1);
    this.body.setAllowGravity(true);
    this.phase = 'rest';        // rest | shake | fall
    this.shakeUntil = 0;
    this.homeX = x;
    this.hp = 5;                // pickaxe can break it (no soft-locks)
  }

  update(time) {
    if (!this.active) return;
    const b = this.body;
    if (this.phase === 'rest') {
      this.setVelocityX(0);
      if (!b.blocked.down && !b.touching.down) {
        // support was just dug away — freeze and warn before dropping
        this.phase = 'shake';
        this.shakeUntil = time + SHAKE_MS;
        this.homeX = this.x;
        this.body.setAllowGravity(false);
        this.setVelocity(0, 0);
        Sfx.rumble();
      }
    } else if (this.phase === 'shake') {
      this.setVelocity(0, 0);
      this.setPosition(this.homeX + Math.sin(time / 35) * 1.6, this.y);
      this.setAngle(Math.sin(time / 55) * 4);
      if (time > this.shakeUntil) {
        this.phase = 'fall';
        this.setPosition(this.homeX, this.y);
        this.setAngle(0);
        this.body.setAllowGravity(true);
      }
    } else if (this.phase === 'fall') {
      if ((b.blocked.down || b.touching.down) && Math.abs(b.velocity.y) < 24) {
        this.phase = 'rest';
        this.setVelocity(0, 0);
        Sfx.thud();
        this.scene.cameras.main.shake(120, 0.006);
        this.scene.fx?.dust(this.x, this.y + 8, 6);
      }
    }
  }

  hit(dmg) {
    this.hp -= dmg;
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(60, () => this.active && this.clearTint());
    Sfx.clank();
    if (this.hp <= 0) {
      Sfx.breakTile();
      this.scene.fx?.burst(this.x, this.y, 0x8a94a2, 12);
      // small reward for the effort
      if (Math.random() < 0.6) {
        const p = this.scene.pickups.create(this.x, this.y, 'coin');
        p.ore = 'coin'; p.coinValue = Phaser.Math.Between(2, 8);
        p.setDepth(12); p.setVelocity(0, -80); p.setBounce(0.3);
      }
      this.destroy();
      return true;
    }
    return false;
  }
}
