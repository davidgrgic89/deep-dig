// The three region bosses. Each one guards its treasure and is built around
// that region's signature tool, so the thing you bought to get here is the
// thing that wins the fight:
//
//   guardian (desert) — hurls boulders; the BOULDER DRILL smashes them
//   warden   (frost)  — regrows an ice shell; the FIRE PICK chews it twice as fast
//   core     (lava)   — floods the floor with lava; the WATER GUN scalds it
//
// None of them REQUIRE the tool — a bare pickaxe and good dodging always wins,
// it's just slower. That keeps the finales impossible to soft-lock.
import Phaser from 'phaser';
import Sfx from './audio.js';
import { T, arenaBounds } from './world.js';

const HIT_INVULN = 220;     // ms of immunity after each pickaxe hit

export class Boss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, meta, shaftX) {
    const a = arenaBounds(shaftX);
    const x = (shaftX + 5) * T + 8;
    const y = a.floor * T - 14;
    super(scene, x, y, meta.sprite);
    this.meta = meta;
    this.kind = meta.id;
    this.arena = a;
    this.shaftX = shaftX;
    this.maxHp = meta.hp;
    this.hp = meta.hp;
    this.homeY = y;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    this.body.setSize(22, 22).setOffset(3, 2);
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);

    this.awake = false;
    this.dying = false;
    this.contactDmg = 1;
    this.hurtUntil = 0;
    this.state = 'idle';
    this.nextActionAt = 0;
    this.dir = -1;
    this.t = Math.random() * 10;

    // frost only: an ice shell that blunts the pickaxe and grows back
    this.shell = 0;
    this.maxShell = 6;
    this.nextShellAt = 0;

    this.setVisible(false); // revealed when the player walks in
    this.idleTween = null;
  }

  get enraged() { return this.hp <= this.maxHp * 0.4; }

  // ---------------------------------------------------------------- wake up
  wake() {
    if (this.awake) return;
    this.awake = true;
    this.setVisible(true);
    this.setScale(0.2);
    Sfx.bossRoar();
    this.scene.cameras.main.shake(600, 0.014);
    this.scene.tweens.add({
      targets: this, scale: 1, duration: 620, ease: 'Back.Out',
      onComplete: () => this.startIdleBob(),
    });
    this.nextActionAt = this.scene.time.now + 1400;
    if (this.kind === 'warden') this.growShell(true);
    this.scene.onBossWake(this);
  }

  // Back to sleep at full strength — used when the player dies or leaves, so a
  // half-finished fight is never waiting at 2 HP.
  reset() {
    this.hp = this.maxHp;
    this.awake = false;
    this.dying = false;
    this.state = 'idle';
    this.fired = true;
    this.shell = 0;
    this.shellShown = false;
    this.idleTween?.stop();
    this.idleTween = null;
    this.clearTint();
    this.setScale(1).setAlpha(1).setAngle(0);
    this.setVelocity(0, 0);
    this.setPosition((this.shaftX + 5) * T + 8, this.homeY);
    this.setVisible(false);
  }

  startIdleBob() {
    this.idleTween = this.scene.tweens.add({
      targets: this, y: this.homeY - 4, duration: 1100,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  // ---------------------------------------------------------------- update
  update(time, dt, player) {
    if (!this.active || this.dying) return;
    this.t += dt / 1000;

    if (!this.awake) {
      // wake when the player is properly inside the arena, not just overhead
      const inArena = player.y > (this.arena.top - 1) * T &&
        Math.abs(player.x - this.x) < 240;
      if (inArena) this.wake();
      return;
    }

    this.setFlipX(player.x > this.x);
    this.dir = player.x < this.x ? -1 : 1;

    if (this.kind === 'warden' && time > this.nextShellAt && this.shell === 0) {
      this.growShell(false);
    }

    if (time > this.nextActionAt) this.chooseAction(time, player);
    this.runState(time, dt, player);
  }

  chooseAction(time, player) {
    const gap = this.enraged ? 1250 : 1900;
    switch (this.kind) {
      case 'guardian':
        // alternate: drop boulders from the ceiling, then charge across
        this.state = Math.random() < 0.55 ? 'slam' : 'charge';
        break;
      case 'warden':
        this.state = Math.random() < 0.5 ? 'icicles' : 'charge';
        break;
      case 'core':
        this.state = Math.random() < 0.55 ? 'flood' : 'fireballs';
        break;
    }
    this.stateStart = time;
    this.telegraphUntil = time + (this.enraged ? 380 : 520);
    this.nextActionAt = time + gap + (this.enraged ? 500 : 900);
    this.fired = false;
    this.setTint(0xff8a6a); // telegraph — every attack is readable before it lands
  }

  runState(time, dt, player) {
    if (time < this.telegraphUntil) {
      // plant and shiver, so every wind-up is unmistakable before it lands
      this.setVelocityX(0);
      this.setScale(1 + Math.sin(time / 30) * 0.05, 1 - Math.sin(time / 30) * 0.04);
      return;
    }
    if (!this.fired) {
      this.clearTint();
      this.setScale(1);
      this.fired = true;
      this.fire(time, player);
    }
    if (this.state === 'charge') this.doCharge(time, player);
  }

  fire(time, player) {
    switch (this.state) {
      case 'slam': this.doSlam(); break;
      case 'icicles': this.doIcicles(); break;
      case 'flood': this.doFlood(); break;
      case 'fireballs': this.doFireballs(player); break;
      case 'charge':
        this.chargeUntil = time + 900;
        this.chargeDir = player.x < this.x ? -1 : 1;
        Sfx.bossRoar();
        break;
    }
  }

  // ---- attacks -----------------------------------------------------------
  // Boulders crash down from the ceiling across the arena. The drill turns them
  // from "dodge or die" into "smash them", which is the point.
  doSlam() {
    Sfx.rumble();
    this.scene.cameras.main.shake(260, 0.01);
    const n = this.enraged ? 4 : 3;
    const spread = [];
    for (let i = 0; i < n; i++) {
      let tx;
      let guard = 0;
      do {
        tx = Phaser.Math.Between(this.arena.x0 + 1, this.arena.x1 - 1);
        guard++;
      } while (spread.includes(tx) && guard < 12);
      spread.push(tx);
      this.scene.dropArenaBoulder(tx, this.arena);
    }
  }

  doIcicles() {
    Sfx.bossIce();
    const n = this.enraged ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const tx = Phaser.Math.Between(this.arena.x0 + 1, this.arena.x1 - 1);
      this.scene.time.delayedCall(i * 130, () => {
        if (this.active && !this.dying) this.scene.dropIcicle(tx, this.arena);
      });
    }
  }

  doFlood() {
    Sfx.bossLava();
    this.scene.cameras.main.shake(240, 0.008);
    this.scene.floodArenaFloor(this.arena, this.enraged ? 7 : 5);
  }

  doFireballs(player) {
    Sfx.bossFire();
    const n = this.enraged ? 3 : 2;
    for (let i = 0; i < n; i++) {
      this.scene.time.delayedCall(i * 200, () => {
        if (this.active && !this.dying) this.scene.throwFireball(this, player);
      });
    }
  }

  doCharge(time, player) {
    if (time > this.chargeUntil) {
      this.setVelocityX(0);
      this.state = 'idle';
      // slide back toward the arena centre so it can't camp a corner
      const cx = this.shaftX * T + 8;
      this.scene.tweens.add({ targets: this, x: Phaser.Math.Linear(this.x, cx, 0.4), duration: 600 });
      return;
    }
    const speed = this.enraged ? 190 : 140;
    this.setVelocityX(this.chargeDir * speed);
    // bounce off the arena walls instead of grinding into them
    const minX = (this.arena.x0 + 1) * T, maxX = (this.arena.x1) * T;
    if (this.x <= minX) { this.chargeDir = 1; this.setX(minX); }
    if (this.x >= maxX) { this.chargeDir = -1; this.setX(maxX); }
    if (Math.random() < 0.25) this.scene.fx?.dust(this.x, this.y + 12, 1);
  }

  // ---- frost shell -------------------------------------------------------
  growShell(instant) {
    this.shell = this.maxShell;
    this.nextShellAt = this.scene.time.now + 9000;
    if (!instant) {
      Sfx.bossIce();
      this.scene.fx?.ring(this.x, this.y, 0xbfe9ff);
    }
    this.setTint(0x9fe0f8);
    this.shellShown = true;
  }

  breakShell() {
    this.shell = 0;
    this.shellShown = false;
    this.clearTint();
    Sfx.breakTile();
    this.scene.fx?.burst(this.x, this.y, 0xbfe9ff, 16);
    this.scene.fx?.float(this.x, this.y - 22, 'SHELL BROKEN!', '#bfe9ff');
    this.nextShellAt = this.scene.time.now + 9000;
  }

  // ---- taking damage -----------------------------------------------------
  // `source` is 'pick' or 'water'; the water gun is the core's real weakness.
  hit(dmg, time, source = 'pick') {
    if (this.dying || !this.awake) return false;
    if (time < this.hurtUntil) return false;
    this.hurtUntil = time + HIT_INVULN;

    // ice shell soaks hits until it's chipped away — the fire pick digs deeper
    if (this.kind === 'warden' && this.shell > 0) {
      const bite = this.scene.registry.get('upgrades').firePick ? 2 : 1;
      this.shell -= bite;
      Sfx.clank();
      this.scene.fx?.burst(this.x, this.y, 0xbfe9ff, 5);
      if (this.shell <= 0) this.breakShell();
      this.flash(0xffffff);
      this.scene.game.events.emit('boss:hp', this.hudState());
      return false;
    }

    // the molten core barely notices a pickaxe; water is what hurts it
    let real = dmg;
    if (this.kind === 'core') real = source === 'water' ? dmg * 3 + 3 : Math.max(1, Math.floor(dmg / 2));

    this.hp -= real;
    this.flash(0xffffff);
    Sfx.bossHit();
    this.scene.fx?.burst(this.x, this.y, this.meta.tint, 7);
    this.scene.game.events.emit('boss:hp', this.hudState());
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  flash(color) {
    this.setTint(color).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      this.clearTint();
      if (this.shellShown) this.setTint(0x9fe0f8);
    });
  }

  hudState() {
    return {
      name: this.meta.name,
      hp: Math.max(0, this.hp), maxHp: this.maxHp,
      shell: this.shell, maxShell: this.maxShell,
      tint: this.meta.tint,
    };
  }

  die() {
    this.dying = true;
    this.setVelocity(0, 0);
    this.idleTween?.stop();
    this.body.enable = false;
    Sfx.bossDie();
    this.scene.cameras.main.shake(900, 0.02);
    this.scene.onBossDied(this);
    // come apart in pieces
    for (let i = 0; i < 5; i++) {
      this.scene.time.delayedCall(i * 130, () => {
        this.scene.fx?.burst(this.x + Phaser.Math.Between(-12, 12),
          this.y + Phaser.Math.Between(-12, 12), this.meta.tint, 12);
        this.scene.cameras.main.shake(120, 0.006);
      });
    }
    this.scene.tweens.add({
      targets: this, alpha: 0, scaleX: 1.3, scaleY: 0.6, angle: 12,
      duration: 900, ease: 'Quad.In', onComplete: () => this.destroy(),
    });
  }
}

