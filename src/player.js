import Phaser from 'phaser';
import Sfx from './audio.js';

// Hand-tuned game feel, carried over from our previous platformer:
// coyote time, jump buffering, variable jump height, apex float, heavy fall,
// turn boost, squash & stretch. New here: pickaxe digging, ladder climbing,
// and the drill dash that chews through soft ground.
const P = {
  MAX_RUN: 150,
  ACCEL_GROUND: 1600,
  ACCEL_AIR: 1000,
  DECEL_GROUND: 2000,
  DECEL_AIR: 450,
  TURN_BOOST: 1.9,

  GRAVITY: 1500,
  FALL_GRAV_MULT: 1.4,
  APEX_GRAV_MULT: 0.55,
  APEX_WINDOW: 60,
  MAX_FALL: 480,

  JUMP_V: -420,
  DOUBLE_JUMP_V: -380,
  JUMP_CUT: 0.45,
  COYOTE_MS: 100,
  BUFFER_MS: 130,

  CLIMB_V: 110,
  LADDER_COYOTE_MS: 150,  // brief window to jump right after leaving a ladder top

  DASH_SPEED: 380,
  DASH_MS: 170,
  DASH_COOLDOWN_MS: 600,

  SWING_MS: 230,          // pickaxe cadence while held
  HURT_KNOCK_X: 180,
  HURT_KNOCK_Y: -260,
  HURT_LOCK_MS: 250,

  GROUND_STICK_MS: 70,   // smooth 1-2 frame ground flicker on tile edges
  LAND_MIN_FALL: 120,    // only squash/dust on a real fall, not edge jitter
};
export const SWING_MS = P.SWING_MS;

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(10, 18);
    this.body.setOffset(3, 4);
    this.setDepth(10);

    this.facing = 1;
    this.lastGroundedAt = -9999;
    this.jumpPressedAt = -9999;
    this.jumpCutDone = true;
    this.isJumping = false;
    this.jumpsUsed = 0;
    this.wasOnGround = false;
    this.wasGrounded = false;
    this.fellSpeed = 0;
    this.lastLandAt = -9999;
    this.climbing = false;
    this.lastLadderAt = -9999;

    this.dashing = false;
    this.dashEndAt = 0;
    this.dashReadyAt = 0;
    this.canAirDash = true;

    this.nextSwingAt = 0;
    this.swinging = false;

    this.hurtLockUntil = 0;
    this.invulnUntil = 0;
    this.dead = false;

    // the pickaxe rides along and rotates on swings
    this.pick = scene.add.image(x, y, 'pickaxe').setDepth(11).setOrigin(0.15, 0.9);
    this.pick.setVisible(true);
  }

  get onGround() {
    return this.body.blocked.down || this.body.touching.down;
  }

  hasPower(name) {
    return !!this.scene.registry.get('powers')?.[name];
  }

  update(time, dt, input) {
    if (this.dead) { this.pick.setVisible(false); return; }
    const body = this.body;
    const onGround = this.onGround;
    const locked = time < this.hurtLockUntil;

    if (onGround) {
      this.lastGroundedAt = time;
      this.jumpsUsed = 0;
      this.canAirDash = true;
    }
    // Buffered ground state: hold "grounded" for a couple frames after the raw
    // check drops out, so balancing on a tile edge can't flicker the animation
    // or spam the landing squash (the Mario-edge jitter).
    const grounded = onGround ||
      (time - this.lastGroundedAt < P.GROUND_STICK_MS && !this.isJumping &&
       body.velocity.y >= -20 && body.velocity.y < 140);
    if (grounded && !this.wasGrounded && this.fellSpeed > P.LAND_MIN_FALL &&
        time - this.lastLandAt > 150) {
      this.lastLandAt = time;
      this.land();
    }
    this.fellSpeed = grounded ? 0 : Math.max(this.fellSpeed, body.velocity.y);

    if (input.jumpPressed) this.jumpPressedAt = time;

    // ---- ladder climbing ----------------------------------------------
    // check center AND feet so we stay "on" the ladder right up to its top
    const onLadder = this.scene.isLadderAt(this.x, this.y) ||
      this.scene.isLadderAt(this.x, this.y + 9);
    if (onLadder) this.lastLadderAt = time;
    if (onLadder && (input.up || input.down) && !this.dashing) this.climbing = true;
    if (!onLadder || this.dashing) this.climbing = false;
    if (this.climbing) {
      body.setAllowGravity(false);
      this.setVelocity(
        ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * P.MAX_RUN * 0.6,
        ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * P.CLIMB_V,
      );
      if (input.jumpPressed) { this.climbing = false; this.doJump(P.JUMP_V, false); }
      this.updateSwing(time, input, onGround);
      this.updateAnim(false);
      this.wasOnGround = onGround;
      this.wasGrounded = onGround;
      this.fellSpeed = 0;
      return;
    }

    // ---- drill dash ----------------------------------------------------
    if (
      input.dashPressed && this.hasPower('dash') && !this.dashing &&
      time >= this.dashReadyAt && (onGround || this.canAirDash) && !locked
    ) {
      this.startDash(time, input);
    }
    if (this.dashing) {
      if (time >= this.dashEndAt) {
        this.dashing = false;
        this.setVelocityX(Phaser.Math.Clamp(body.velocity.x, -P.MAX_RUN * 1.4, P.MAX_RUN * 1.4));
      } else {
        body.setAllowGravity(false);
        this.setVelocityY(0);
        this.spawnGhost();
        this.scene.drillThrough(this); // chew soft tiles in our path
        this.updateAnim(onGround);
        this.wasOnGround = onGround;
        this.wasGrounded = onGround;
        this.placePick();
        return;
      }
    }
    body.setAllowGravity(false); // gravity applied manually below

    // ---- horizontal movement ------------------------------------------
    const dir = locked ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.facing = dir;
    const target = dir * P.MAX_RUN;
    const vx = body.velocity.x;
    let accel = onGround ? P.ACCEL_GROUND : P.ACCEL_AIR;
    if (dir !== 0 && Math.sign(vx) !== 0 && Math.sign(vx) !== dir) accel *= P.TURN_BOOST;
    if (dir === 0) accel = onGround ? P.DECEL_GROUND : P.DECEL_AIR;

    const dv = accel * (dt / 1000);
    let outVx = vx;
    if (vx < target) outVx = Math.min(vx + dv, target);
    else if (vx > target) outVx = Math.max(vx - dv, target);
    this.setVelocityX(outVx);

    if (onGround && dir !== 0 && Math.abs(vx) > 80 && Math.sign(vx) !== dir) {
      this.scene.fx?.dust(this.x, this.y + 11, 1);
    }

    // ---- jumping -------------------------------------------------------
    const canCoyote = time - this.lastGroundedAt < P.COYOTE_MS && !this.isJumping;
    const canLadderJump = time - this.lastLadderAt < P.LADDER_COYOTE_MS && !this.isJumping;
    const buffered = time - this.jumpPressedAt < P.BUFFER_MS;

    if (buffered && (onGround || canCoyote || canLadderJump) && !locked) {
      this.doJump(P.JUMP_V, false);
    } else if (
      input.jumpPressed && !onGround && !canCoyote && !locked &&
      this.hasPower('doubleJump') && this.jumpsUsed < 2
    ) {
      this.doJump(P.DOUBLE_JUMP_V, true);
    }

    if (!input.jumpDown && body.velocity.y < 0 && !this.jumpCutDone) {
      this.setVelocityY(body.velocity.y * P.JUMP_CUT);
      this.jumpCutDone = true;
    }

    // ---- manual gravity with apex float & heavier fall ----------------
    let g = P.GRAVITY;
    const vy = body.velocity.y;
    if (!onGround) {
      if (Math.abs(vy) < P.APEX_WINDOW && input.jumpDown && this.isJumping) g *= P.APEX_GRAV_MULT;
      else if (vy > 0) g *= P.FALL_GRAV_MULT;
    }
    this.setVelocityY(Math.min(vy + g * (dt / 1000), P.MAX_FALL));
    if (onGround && this.isJumping && body.velocity.y >= 0) this.isJumping = false;

    // ---- pickaxe -------------------------------------------------------
    this.updateSwing(time, input, onGround);

    this.updateAnim(grounded);
    this.wasOnGround = onGround;
    this.wasGrounded = grounded;
    this.setAlpha(time < this.invulnUntil ? (Math.floor(time / 80) % 2 ? 0.3 : 0.9) : 1);
  }

  // Swing the pickaxe: digs the tile in the aimed direction and hits enemies.
  // Aim: hold Up = above, hold Down (in air or standing) = below, else facing.
  updateSwing(time, input, onGround) {
    if (input.digDown && time >= this.nextSwingAt && !this.dashing) {
      this.nextSwingAt = time + P.SWING_MS;
      let dx = this.facing, dy = 0;
      if (input.up) { dx = 0; dy = -1; }
      else if (input.down) { dx = 0; dy = 1; }
      this.swingAnim(dx, dy);
      Sfx.swing();
      this.scene.pickStrike(this, dx, dy);
    }
    this.placePick();
  }

  swingAnim(dx, dy) {
    this.swinging = true;
    const baseAngle = dy < 0 ? -120 : dy > 0 ? 60 : -30;
    this.pick.setAngle(baseAngle - 60);
    this.scene.tweens.add({
      targets: this.pick, angle: baseAngle + 55, duration: P.SWING_MS * 0.55,
      ease: 'Cubic.Out',
      onComplete: () => { this.swinging = false; this.pick.setAngle(0); },
    });
  }

  placePick() {
    this.pick.setVisible(!this.dead);
    this.pick.setFlipX(this.facing === -1);
    const off = this.swinging ? 7 : 5;
    this.pick.setPosition(this.x + this.facing * off, this.y + 2);
    if (!this.swinging) this.pick.setAngle(this.facing === -1 ? -10 : 10);
    this.pick.scaleX = this.facing === -1 ? -1 : 1;
  }

  doJump(v, isDouble) {
    this.setVelocityY(v);
    this.isJumping = true;
    this.jumpCutDone = false;
    this.jumpPressedAt = -9999;
    this.jumpsUsed = isDouble ? 2 : 1;
    this.stretch();
    if (isDouble) {
      Sfx.doubleJump();
      this.scene.fx?.ring(this.x, this.y + 8);
    } else {
      Sfx.jump();
      this.scene.fx?.dust(this.x, this.y + 11, 4);
    }
  }

  startDash(time, input) {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0) || this.facing;
    this.dashing = true;
    this.canAirDash = this.onGround;
    this.dashEndAt = time + P.DASH_MS;
    this.dashReadyAt = time + P.DASH_COOLDOWN_MS;
    this.setVelocity(dir * P.DASH_SPEED, 0);
    this.facing = dir;
    Sfx.dash();
    this.scene.cameras.main.shake(80, 0.003);
  }

  spawnGhost() {
    const g = this.scene.add.image(this.x, this.y, 'player', this.frame.name)
      .setFlipX(this.flipX).setDepth(9).setAlpha(0.45).setTint(0xffc86a);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  land() {
    Sfx.land();
    this.squash();
    this.scene.fx?.dust(this.x, this.y + 11, 5);
  }

  squash() {
    this.scene.tweens.add({
      targets: this, scaleX: 1.28, scaleY: 0.72, duration: 60, yoyo: true,
      onComplete: () => this.setScale(1),
    });
  }

  stretch() {
    this.scene.tweens.add({
      targets: this, scaleX: 0.75, scaleY: 1.3, duration: 80, yoyo: true,
      onComplete: () => this.setScale(1),
    });
  }

  hurtFrom(sourceX, time) {
    if (time < this.invulnUntil || this.dead) return false;
    const dir = this.x < sourceX ? -1 : 1;
    this.setVelocity(dir * P.HURT_KNOCK_X, P.HURT_KNOCK_Y);
    this.dashing = false;
    this.climbing = false;
    this.hurtLockUntil = time + P.HURT_LOCK_MS;
    this.invulnUntil = time + 1200;
    Sfx.hurt();
    return true;
  }

  updateAnim(onGround) {
    this.setFlipX(this.facing === -1);
    if (this.climbing) {
      this.anims.play('player-walk', true);
    } else if (!onGround) {
      this.anims.stop();
      this.setFrame(4);
    } else if (Math.abs(this.body.velocity.x) > 10) {
      this.anims.play('player-walk', true);
    } else {
      this.anims.stop();
      this.setFrame(0);
    }
  }
}
