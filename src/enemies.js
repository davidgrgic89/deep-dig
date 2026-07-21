import Phaser from 'phaser';
import Sfx from './audio.js';

// Enemy roster. Colour signals toughness so it reads at a glance:
//   Grub    (green)  — soft floor crawler, 2 hits
//   Beetle  (steel)  — armoured: 2 hits crack the shell, then it turns red and
//                      one more hit kills it (3 total, regardless of pickaxe)
//   Crawler (purple) — clings to a wall and lunges out to attack, then retracts
//   Bat     — sleeps, then swoops     Spitter — rooted, lobs acid
//   Wraith  — drifts through the dark toward you
const STATS = {
  grub: { hp: 2, dmg: 1, speed: 28 },
  beetle: { hp: 1, dmg: 1, speed: 18, armor: 2 },
  crawler: { hp: 3, dmg: 1, lungeRange: 100, cooldown: 1700 },
  bat: { hp: 2, dmg: 1, speed: 55 },
  spitter: { hp: 3, dmg: 1, range: 120, cooldown: 1800 },
  wraith: { hp: 4, dmg: 1, speed: 26 },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type) {
    super(scene, x, y, type, 0);
    this.type = type;
    this.stats = STATS[type];
    this.hp = this.stats.hp;
    this.armor = this.stats.armor || 0;
    this.exposed = false;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(8);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.awake = false;
    this.nextShotAt = 0;
    this.moanAt = 0;
    this.baseY = y;
    this.t = Math.random() * 10;

    if (type === 'grub' || type === 'beetle') {
      this.body.setSize(12, 9);
      this.body.setOffset(1, 3);
    } else if (type === 'bat') {
      this.body.setSize(12, 5);
      this.body.setAllowGravity(false);
    } else if (type === 'spitter') {
      this.body.setSize(12, 7);
      this.body.setImmovable(true);
    } else if (type === 'wraith') {
      this.body.setSize(12, 9);
      this.body.setAllowGravity(false);
    } else if (type === 'crawler') {
      this.body.setSize(12, 9);
      this.body.setOffset(1, 0);
      this.body.setAllowGravity(false);
      this.cs = 'idle';               // idle | windup | lunge | retract
      this.nextLungeAt = 800;
      this.dangerous = false;
      // anchor against the nearest wall within a few tiles
      let side = 0, ax = x;
      for (let d = 1; d <= 4; d++) {
        if (scene.isSolidAt(x - d * 16, y)) { side = -1; ax = x - (d - 1) * 16 - 3; break; }
        if (scene.isSolidAt(x + d * 16, y)) { side = 1; ax = x + (d - 1) * 16 + 3; break; }
      }
      this.wallSide = side || (Math.random() < 0.5 ? -1 : 1);
      this.anchorX = side ? ax : x;
      this.anchorY = y;
      this.setPosition(this.anchorX, this.anchorY);
    }
    this.anims.play(`${type}-move`, true);
  }

  update(time, dt, player) {
    if (!this.active) return;
    this.t += dt / 1000;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    switch (this.type) {
      case 'grub':
      case 'beetle': {
        // amble along the floor, turning at walls and at ledges
        if (this.body.blocked.left) this.dir = 1;
        else if (this.body.blocked.right) this.dir = -1;
        else if (this.body.blocked.down) {
          const aheadX = this.x + this.dir * 8;
          if (!this.scene.isSolidAt(aheadX, this.y + 10)) this.dir *= -1;
        }
        this.setVelocityX(this.dir * this.stats.speed);
        this.setFlipX(this.dir === -1);
        break;
      }
      case 'crawler': {
        const aligned = Math.abs(player.y - this.y) < 42;
        if (this.cs === 'idle') {
          this.dangerous = false;
          this.setVelocity(0, 0);
          this.setPosition(this.anchorX, this.anchorY + Math.sin(this.t * 3) * 1.5);
          this.setFlipX(player.x < this.x);
          if (time > this.nextLungeAt && dist < this.stats.lungeRange && aligned) {
            this.cs = 'windup';
            this.windupEnd = time + 420;
            this.setTint(0xff5a5a); // telegraph the attack
          }
        } else if (this.cs === 'windup') {
          this.setVelocity(0, 0);
          this.setScale(1 + Math.sin(time / 35) * 0.08);
          if (time > this.windupEnd) {
            this.cs = 'lunge';
            this.lungeEnd = time + 300;
            this.dangerous = true;
            this.clearTint();
            this.setScale(1);
            const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            this.setVelocity(Math.cos(a) * 210, Math.sin(a) * 210);
          }
        } else if (this.cs === 'lunge') {
          if (time > this.lungeEnd) { this.cs = 'retract'; this.dangerous = false; }
        } else if (this.cs === 'retract') {
          const a = Phaser.Math.Angle.Between(this.x, this.y, this.anchorX, this.anchorY);
          this.setVelocity(Math.cos(a) * 130, Math.sin(a) * 130);
          if (Phaser.Math.Distance.Between(this.x, this.y, this.anchorX, this.anchorY) < 6) {
            this.cs = 'idle';
            this.nextLungeAt = time + this.stats.cooldown;
            this.setPosition(this.anchorX, this.anchorY);
            this.setVelocity(0, 0);
          }
        }
        break;
      }
      case 'bat': {
        if (!this.awake && dist < 90) {
          this.awake = true;
          this.scene.fx?.ring(this.x, this.y, 0x8c5a9c);
        }
        if (this.awake) {
          const ang = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y - 6);
          this.setVelocity(
            Math.cos(ang) * this.stats.speed,
            Math.sin(ang) * this.stats.speed + Math.sin(this.t * 7) * 30,
          );
          this.setFlipX(player.x < this.x);
        } else {
          this.setVelocity(0, Math.sin(this.t * 2) * 4);
        }
        break;
      }
      case 'spitter': {
        this.setVelocity(0, 0);
        if (dist < this.stats.range && time > this.nextShotAt && this.scene.hasLineOfSight(this, player)) {
          this.nextShotAt = time + this.stats.cooldown;
          this.scene.spitAt(this, player);
          this.anims.play('spitter-move', true);
        }
        break;
      }
      case 'wraith': {
        // drifts toward you, faster the darker it is; passes through terrain
        if (dist < 160) {
          const ang = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
          const spd = this.stats.speed * (dist < 60 ? 1.5 : 1);
          this.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd + Math.sin(this.t * 3) * 12);
          this.setFlipX(player.x < this.x);
          if (time > this.moanAt && dist < 120) {
            this.moanAt = time + 4000 + Math.random() * 3000;
            Sfx.wraithMoan();
          }
        } else {
          this.setVelocity(Math.sin(this.t) * 8, Math.cos(this.t * 0.7) * 8);
        }
        this.setAlpha(0.75 + Math.sin(this.t * 4) * 0.2);
        break;
      }
    }
  }

  hit(fromX, dmg, time) {
    this.awake = true;
    // white flash on every hit; restores to red if the shell is already cracked
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      this.clearTint();
      if (this.exposed) this.setTint(0xff7a5a);
    });

    // armour absorbs one hit at a time, independent of pickaxe strength
    if (this.armor > 0) {
      this.armor -= 1;
      Sfx.clank();
      this.scene.fx?.burst(this.x, this.y, 0xc0c8d0, 4);
      if (this.armor === 0) {
        this.exposed = true;
        this.scene.fx?.ring(this.x, this.y, 0xff7a5a);
      }
      return false;
    }

    this.hp -= dmg;
    Sfx.enemyHit();
    // knockback (not for rooted spitters or wall-anchored crawlers)
    if (this.type !== 'spitter' && this.type !== 'crawler') {
      const dir = this.x < fromX ? -1 : 1;
      this.setVelocity(dir * 120, (this.type === 'grub' || this.type === 'beetle') ? -80 : 0);
    }
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    Sfx.enemyDie();
    this.scene.fx?.burst(this.x, this.y, 0xc94f38, 10);
    this.scene.onEnemyDied(this);
    this.destroy();
  }
}

export function makeEnemyAnims(scene) {
  for (const type of ['grub', 'beetle', 'crawler', 'bat', 'spitter', 'wraith']) {
    if (scene.anims.exists(`${type}-move`)) continue;
    scene.anims.create({
      key: `${type}-move`,
      frames: [{ key: type, frame: 0 }, { key: type, frame: 1 }],
      frameRate: type === 'bat' ? 10 : type === 'crawler' ? 6 : 4,
      repeat: -1,
    });
  }
}
