import Phaser from 'phaser';
import Sfx from '../audio.js';
import Player from '../player.js';
import { Enemy, makeEnemyAnims } from '../enemies.js';
import { TILE, TILE_INFO, ORES } from '../art.js';
import {
  T, W, H, SURFACE, SHAFT_X, SHAFT_X2, DIVIDER, ZONES, ZONES_R, IDOL_ROW,
  generateWorld, zoneOfRow, regionOfX, zoneName, bgTileAt,
} from '../world.js';

const SAVE_KEY = 'deepdig-save-v1';

// little effects helper -----------------------------------------------------
class FX {
  constructor(scene) { this.s = scene; }
  dust(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      const p = this.s.add.image(x + Phaser.Math.Between(-5, 5), y, 'px')
        .setDepth(9).setTint(0xc2a074).setAlpha(0.8);
      this.s.tweens.add({
        targets: p, y: y - Phaser.Math.Between(2, 8), x: p.x + Phaser.Math.Between(-6, 6),
        alpha: 0, duration: Phaser.Math.Between(200, 420), onComplete: () => p.destroy(),
      });
    }
  }
  burst(x, y, tint = 0xffffff, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(6, 18);
      const p = this.s.add.image(x, y, 'px').setDepth(12).setTint(tint);
      this.s.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0,
        duration: Phaser.Math.Between(180, 380), onComplete: () => p.destroy(),
      });
    }
  }
  ring(x, y, tint = 0xffffff) {
    const r = this.s.add.circle(x, y, 4).setStrokeStyle(1.5, tint).setDepth(12);
    this.s.tweens.add({ targets: r, radius: 16, alpha: 0, duration: 260, onComplete: () => r.destroy() });
  }
  float(x, y, text, color = '#f2d75c') {
    const t = this.s.add.text(x, y, text, {
      fontFamily: '"Press Start 2P"', fontSize: '6px', color,
      stroke: '#1a1208', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(60);
    this.s.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
}

export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  // ------------------------------------------------------------------ create
  create() {
    this.fx = new FX(this);
    makeEnemyAnims(this);
    if (!this.anims.exists('player-walk')) {
      this.anims.create({
        key: 'player-walk',
        frames: [0, 1, 2, 3].map((f) => ({ key: 'player', frame: f })),
        frameRate: 10, repeat: -1,
      });
    }

    this.uiOpen = false;
    this.gameOver = false;
    this.won = false;
    this.recallHeld = 0;
    this.curZone = -1;
    this.tileHp = new Map();     // tileIndex -> remaining hp
    this.cracks = new Map();     // tileIndex -> crack sprite

    // shared on-screen (touch) control state, written by UIScene each frame
    this.registry.set('touch', {
      left: false, right: false, up: false, down: false,
      jump: false, jumpPressed: false, dig: false, use: false, usePressed: false,
      dashPressed: false, dynaPressed: false, ladderPressed: false, recall: false,
    });

    this.initState();
    this.world = generateWorld(7);
    this.applySavedDigs();
    this.buildMap();
    this.buildSky();
    this.buildTown();
    this.buildSpecials();

    // player
    const spawn = this.registry.get('spawnPoint');
    this.player = new Player(this, spawn.x, spawn.y);
    this.physics.add.collider(this.player, this.layer);
    this.player.body.setCollideWorldBounds(true);

    // enemies
    this.enemies = this.add.group();
    for (const s of this.world.spawns) this.spawnEnemy(s.type, s.x * T + 8, s.y * T + 8);
    const terrainBound = (e) => e.type !== 'wraith' && e.type !== 'crawler';
    this.physics.add.collider(this.enemies, this.layer, undefined, terrainBound, this);
    this.physics.add.overlap(this.player, this.enemies, (pl, e) => this.touchEnemy(e));

    this.buildBarriers();

    // pickups & projectiles
    this.pickups = this.physics.add.group();
    this.physics.add.collider(this.pickups, this.layer);
    this.physics.add.overlap(this.player, this.pickups, (pl, p) => this.collect(p));
    this.globs = this.physics.add.group();
    this.physics.add.collider(this.globs, this.layer, (g) => this.splat(g));
    this.physics.add.overlap(this.player, this.globs, (pl, g) => {
      this.splat(g); this.damagePlayer(g.x, 1);
    });

    // camera
    this.cameras.main.setBounds(0, 0, W * T, H * T);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(3);
    this.physics.world.setBounds(0, 0, W * T, H * T);

    this.buildLighting();
    this.buildInput();
    this.bindUIEvents();

    Sfx.setMood('town');
    Sfx.startMusic();
    this.game.events.emit('hud:refresh');
    this.zoneToastAt = 0;
  }

  initState() {
    const r = this.registry;
    let save = null;
    try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { save = null; }
    if (r.get('freshRun')) { save = null; r.set('freshRun', false); }
    const d = (k, def) => r.set(k, save?.[k] ?? def);
    d('coins', 0); d('orbs', 0);
    d('maxHp', 3); r.set('hp', r.get('maxHp'));
    d('bagCap', 8); r.set('bag', []);
    d('pickTier', 1);
    d('lampCap', 100); r.set('lamp', r.get('lampCap'));
    d('powers', {});
    d('dynamite', 0);
    d('teleKits', 0);
    d('ropeLadders', 0);        // placeable climb-out ladders
    d('upgrades', {});          // shop purchase levels
    d('openGates', []);         // gate keys opened (e.g. 'r0z1')
    d('takenShrines', []); d('takenStones', []); d('takenChests', []);
    d('carriedStones', []);     // gate keys of stones in pocket, not yet used
    d('rightUnlocked', false);  // has the Idol opened the Rift east?
    d('idolClaimed', false);
    d('deathStash', null);      // {x,y,items:[...]} loot dropped on death
    d('placedPortals', []);     // [{x,y}] teleporter kits placed
    d('dugTiles', []);          // indices of removed tiles
    d('activatedCheckpoints', []); // indices of lit checkpoint temples
    const townSpawn = { x: (SHAFT_X - 8) * T, y: (SURFACE - 1) * T };
    r.set('spawnPoint', townSpawn);
    d('respawnPoint', townSpawn); // where death sends you (last checkpoint, or town)
    this.hasSave = !!save;
  }

  save() {
    const r = this.registry;
    const data = {};
    for (const k of ['coins', 'orbs', 'maxHp', 'bagCap', 'pickTier', 'lampCap', 'powers',
      'dynamite', 'teleKits', 'upgrades', 'openGates', 'takenShrines', 'takenStones',
      'takenChests', 'carriedStones', 'placedPortals', 'dugTiles',
      'activatedCheckpoints', 'respawnPoint', 'ropeLadders', 'rightUnlocked',
      'idolClaimed', 'deathStash']) data[k] = r.get(k);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full/blocked */ }
  }

  applySavedDigs() {
    const dug = this.registry.get('dugTiles');
    for (const idx of dug) this.world.grid[idx] = TILE.EMPTY;
    const open = this.registry.get('openGates');
    for (const gate of this.world.gates) {
      if (!open.includes(gate.key)) continue;
      for (let y = gate.row; y <= gate.row + 2; y++) {
        for (const x of [gate.shaftX - 1, gate.shaftX, gate.shaftX + 1]) this.world.grid[y * W + x] = TILE.EMPTY;
      }
    }
  }

  // ------------------------------------------------------------------- map
  buildMap() {
    this.map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: W, height: H });
    const tiles = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.bgLayer = this.map.createBlankLayer('bg', tiles).setDepth(1);
    this.layer = this.map.createBlankLayer('fg', tiles).setDepth(3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const bg = bgTileAt(x, y);
        if (bg !== TILE.EMPTY) this.bgLayer.putTileAt(bg, x, y);
        const t = this.world.grid[y * W + x];
        if (t !== TILE.EMPTY) this.layer.putTileAt(t, x, y);
      }
    }
    this.layer.setCollisionByExclusion([-1, TILE.LADDER, TILE.SPIKE]);
  }

  buildSky() {
    // gradient sky, sun, parallax dunes & clouds — only visible near surface
    const skyH = (SURFACE + 6) * T;
    const g = this.add.graphics().setDepth(0);
    const bands = [
      [0x8fd4f0, 0.0], [0x9fdcf4, 0.25], [0xbde8f0, 0.45],
      [0xe8d8a8, 0.7], [0xf0c888, 0.88],
    ];
    for (let i = 0; i < bands.length; i++) {
      const y0 = skyH * bands[i][1];
      const y1 = i + 1 < bands.length ? skyH * bands[i + 1][1] : skyH;
      g.fillStyle(bands[i][0]);
      g.fillRect(0, y0, W * T, y1 - y0);
    }
    this.add.circle(600, 40, 14, 0xfff2c0).setDepth(0);
    this.add.circle(600, 40, 20, 0xfff2c0, 0.3).setDepth(0);
    this.add.tileSprite(W * T / 2, SURFACE * T - 30, W * T, 60, 'dunes')
      .setDepth(0).setAlpha(0.85).setScrollFactor(0.6, 1);
    for (let i = 0; i < 6; i++) {
      const c = this.add.image(80 + i * 130, 24 + (i % 3) * 16, 'cloud')
        .setDepth(0).setAlpha(0.85).setScrollFactor(0.35, 1);
      this.tweens.add({
        targets: c, x: c.x + 40, duration: 20000 + i * 4000, yoyo: true, repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    // birds
    for (let i = 0; i < 3; i++) {
      const b = this.add.sprite(120 + i * 210, 50 + i * 12, 'bird').setDepth(0);
      if (!this.anims.exists('bird-fly')) {
        this.anims.create({
          key: 'bird-fly',
          frames: [{ key: 'bird', frame: 0 }, { key: 'bird', frame: 1 }],
          frameRate: 6, repeat: -1,
        });
      }
      b.play('bird-fly');
      this.tweens.add({
        targets: b, x: b.x + 260, y: b.y - 14, duration: 14000 + i * 3000,
        yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
    }
  }

  buildTown() {
    const gy = SURFACE * T; // ground top in px
    // ---- west town (Sundrop Flats) ----
    const props = [
      ['bldg_house', 6 * T, 0], ['bldg_shop', 12.5 * T, 0], ['cactus', 2.2 * T, 0],
      ['cactus', 34 * T, 0], ['barrel', 16.4 * T, 0], ['barrel', 17.2 * T, 0],
      ['lamppost', 20 * T, 0], ['lamppost', 28.5 * T, 0], ['minehead', SHAFT_X * T + 8, 4],
      ['bldg_house', 39 * T, 0],
    ];
    for (const [key, x, dy] of props) {
      const img = this.add.image(x, gy + dy, key).setOrigin(0.5, 1).setDepth(2);
      if (key === 'minehead') img.setDepth(4);
    }
    this.npcs = [
      this.makeNpc('npc_mara', 14.2 * T, gy, 'Mara', 'shop'),
      this.makeNpc('npc_gus', 21.5 * T, gy, 'Gus', 'gus'),
      this.makeNpc('npc_mayor', 38 * T, gy, 'Mayor Bell', 'mayor'),
    ];
    this.townPortal = { name: 'Sundrop Town', x: (SHAFT_X - 4) * T, y: gy };
    this.add.image(this.townPortal.x, gy - 1, 'portal').setOrigin(0.5, 1).setDepth(2).setTint(0xd0e8ff);
    this.portalGlow(this.townPortal.x, gy - 18, 0x48b8f0);

    this.buildEastDistrict(gy);
    this.buildRift(gy);
  }

  // The frozen town across the Rift — reachable only after the Idol is claimed.
  buildEastDistrict(gy) {
    const frost = 0x9fc4e6;
    const props = [
      ['bldg_house', 58 * T, 0], ['bldg_shop', 66 * T, 0], ['bldg_house', 84 * T, 0],
      ['barrel', 70.4 * T, 0], ['lamppost', 62 * T, 0], ['lamppost', 80 * T, 0],
      ['minehead', SHAFT_X2 * T + 8, 4],
    ];
    for (const [key, x, dy] of props) {
      const img = this.add.image(x, gy + dy, key).setOrigin(0.5, 1).setDepth(2).setTint(frost);
      if (key === 'minehead') img.setDepth(4);
    }
    this.npcs.push(
      this.makeNpc('npc_mara', 65.5 * T, gy, 'Yuki', 'shopEast', frost),
      this.makeNpc('npc_gus', 71.5 * T, gy, 'Frostbeard', 'gusEast', frost),
      this.makeNpc('npc_mayor', 84 * T, gy, 'Elder Pyra', 'mayorEast', frost),
    );
    this.eastPortal = { name: 'Frosthaven Town', x: (SHAFT_X2 - 4) * T, y: gy };
    this.add.image(this.eastPortal.x, gy - 1, 'portal').setOrigin(0.5, 1).setDepth(2).setTint(0xdff0ff);
    this.portalGlow(this.eastPortal.x, gy - 18, 0x8fe0ff);
  }

  buildRift(gy) {
    const x = DIVIDER * T;
    const unlocked = this.registry.get('rightUnlocked');
    this.riftGate = this.add.image(x, gy - 1, 'portal').setOrigin(0.5, 1).setDepth(3)
      .setScale(1.4).setTint(unlocked ? 0xc89aff : 0x4a4458);
    this.riftGlow = this.portalGlow(x, gy - 26, 0xb07aff);
    this.riftGlow.setVisible(unlocked);
    this.riftSign = this.add.text(x, gy - 44,
      unlocked ? 'THE RIFT' : 'SEALED\nRIFT', {
        fontFamily: '"Press Start 2P"', fontSize: '7px', color: unlocked ? '#d0a8ff' : '#8a94a2',
        align: 'center', lineSpacing: 4, stroke: '#1a1420', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);
  }

  // Invisible walls at the map edges + the Rift (until it's opened).
  buildBarriers() {
    this.barriers = this.physics.add.staticGroup();
    const addWall = (cx, h = H * T, cy = (H * T) / 2) => {
      const wall = this.add.rectangle(cx, cy, T, h, 0xff0000, 0);
      this.physics.add.existing(wall, true);
      this.barriers.add(wall);
      return wall;
    };
    addWall(0.9 * T);
    addWall((W - 0.9) * T);
    // Rift wall blocks the surface crossing until the Idol opens it
    if (!this.registry.get('rightUnlocked')) {
      this.riftWall = addWall(DIVIDER * T, (SURFACE + 4) * T, (SURFACE + 2) * T);
    }
    this.physics.add.collider(this.player, this.barriers);
    this.physics.add.collider(this.enemies, this.barriers, undefined, (e) => e.type !== 'wraith' && e.type !== 'crawler', this);
    this.makeSign(2.4 * T, 'DANGER\nZONE', 0xe85c5c);
    this.makeSign((W - 2.4) * T, 'FROZEN\nWASTES', 0x8fd8ff);
  }

  makeSign(x, label, color) {
    const gy = SURFACE * T;
    this.add.rectangle(x, gy, 3, 20, 0x5c3a18).setOrigin(0.5, 1).setDepth(5); // post
    this.add.rectangle(x, gy - 15, 50, 24, 0x8a5e2e).setOrigin(0.5, 1).setDepth(5)
      .setStrokeStyle(2, 0x4c3014);
    this.add.rectangle(x, gy - 37, 50, 4, color).setOrigin(0.5, 0).setDepth(6); // hazard stripe
    this.add.text(x, gy - 31, label, {
      fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#f6ecd6',
      align: 'center', lineSpacing: 4, stroke: '#3a2410', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(6);
  }

  makeNpc(tex, x, gy, name, dialog, tint = 0xffffff) {
    const spr = this.add.image(x, gy, tex).setOrigin(0.5, 1).setDepth(5).setTint(tint);
    spr.npcName = name; spr.dialog = dialog;
    this.tweens.add({
      targets: spr, y: gy - 1, duration: 1200 + Math.random() * 600,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    return spr;
  }

  portalGlow(x, y, tint) {
    const glow = this.add.image(x, y, 'lightbrush').setScale(0.18).setTint(tint)
      .setAlpha(0.35).setDepth(51).setBlendMode(Phaser.BlendModes.ADD); // above the darkness
    this.tweens.add({ targets: glow, alpha: 0.6, scale: 0.22, duration: 900, yoyo: true, repeat: -1 });
    return glow;
  }

  buildSpecials() {
    this.specialSprites = [];
    const taken = {
      shrine: this.registry.get('takenShrines'),
      stone: this.registry.get('takenStones'),
      chest: this.registry.get('takenChests'),
    };
    // shrines: pedestal + floating power icon
    this.shrines = [];
    for (const s of this.world.shrines) {
      if (taken.shrine.includes(s.power)) continue;
      const px = s.x * T + 8, py = s.y * T + 16;
      this.add.image(px, py, 'pedestal').setOrigin(0.5, 1).setDepth(4);
      const iconKey = s.power === 'doubleJump' ? 'heart' : s.power === 'dash' ? 'pickaxe' : 'dynamite';
      const icon = this.add.image(px, py - 18, iconKey).setDepth(5)
        .setTint(s.power === 'doubleJump' ? 0x78c8ff : 0xffffff);
      this.tweens.add({ targets: icon, y: icon.y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.portalGlow(px, py - 14, 0xf2d75c);
      this.shrines.push({ ...s, px, py, icon });
    }
    // portal stones (keyed per region+zone)
    this.stoneSprites = [];
    for (const st of this.world.stones) {
      if (taken.stone.includes(st.key)) continue;
      const px = st.x * T + 8, py = st.y * T + 10;
      const spr = this.add.image(px, py, 'orb').setDepth(5).setTint(0xf2c53a);
      this.tweens.add({ targets: spr, y: py - 3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.portalGlow(px, py, 0xf2c53a);
      this.stoneSprites.push({ zone: st.zone, key: st.key, px, py, spr });
    }
    // chests (coin caches)
    this.chestSprites = [];
    this.world.chests.forEach((c, i) => {
      if (taken.chest.includes(i)) return;
      const px = c.x * T + 8, py = c.y * T + 10;
      const spr = this.add.image(px, py, 'coin').setDepth(5).setScale(1.2);
      this.tweens.add({ targets: spr, scale: 1.35, duration: 700, yoyo: true, repeat: -1 });
      this.chestSprites.push({ i, px, py, spr });
    });
    // glowing mushrooms
    this.mushLights = [];
    for (const m of this.world.mushrooms) {
      if (this.layer.getTileAt(m.x, m.y + 1) === null) continue;
      const px = m.x * T + 8, py = m.y * T + 16;
      this.add.image(px, py, 'mushroom').setOrigin(0.5, 1).setDepth(2);
      this.portalGlow(px, py - 5, 0x48b8f0).setDepth(51); // shines above the dark
      this.mushLights.push({ x: px, y: py - 6 });
    }
    // checkpoint temples (respawn points)
    this.checkpoints = [];
    const litCps = this.registry.get('activatedCheckpoints') || [];
    (this.world.checkpoints || []).forEach((cp, i) => {
      const px = cp.x * T + 8, py = (cp.y + 1) * T;   // sits on the brick floor
      const on = litCps.includes(i);
      const spr = this.add.image(px, py, 'checkpoint').setOrigin(0.5, 1).setDepth(4);
      spr.setTint(on ? 0xffffff : 0x5a6472);
      this.tweens.add({ targets: spr, y: py - 1, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      const glow = this.portalGlow(px, py - 22, 0x48b8f0);
      glow.setAlpha(on ? 0.55 : 0.22); // faint even when dormant so you can spot it
      this.checkpoints.push({ i, x: cp.x, y: cp.y, px, py, spr, glow, activated: on });
    });

    // gates & portals network
    this.portals = [this.townPortal, this.eastPortal];
    this.gateSprites = [];
    for (const gate of this.world.gates) {
      if (this.registry.get('openGates').includes(gate.key)) this.addGatePortal(gate);
    }
    for (const p of this.registry.get('placedPortals')) this.addPlacedPortal(p.x, p.y, false);

    // the Golden Idol (west finale) and the Sun Crown (east / true finale)
    this.idol = this.add.image(this.world.idol.x * T + 8, this.world.idol.y * T + 14, 'idol')
      .setOrigin(0.5, 1).setDepth(5).setVisible(!this.registry.get('idolClaimed'));
    if (this.idol.visible) {
      this.tweens.add({ targets: this.idol, y: this.idol.y - 2, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.portalGlow(this.idol.x, this.idol.y - 14, 0xf2d75c);
    }
    this.crown = this.add.image(this.world.crown.x * T + 8, this.world.crown.y * T + 14, 'crown')
      .setOrigin(0.5, 1).setDepth(5);
    this.tweens.add({ targets: this.crown, y: this.crown.y - 2, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.portalGlow(this.crown.x, this.crown.y - 14, 0xbfe9ff);

    // a loot stash left from a previous death
    this.stashSprite = null;
    const stash = this.registry.get('deathStash');
    if (stash) this.spawnStash(stash);
  }

  addGatePortal(gate) {
    const zones = gate.region === 1 ? ZONES_R : ZONES;
    const p = { name: `${zones[gate.zone].name} Gate`, x: gate.shaftX * T + 8, y: gate.row * T };
    this.portals.push(p);
    this.add.image(p.x, p.y - 2, 'portal').setOrigin(0.5, 1).setDepth(2).setTint(0xd0e8ff);
    this.portalGlow(p.x, p.y - 18, 0x48b8f0);
  }

  addPlacedPortal(x, y, announce = true) {
    const p = { name: `Camp at ${Math.max(0, Math.floor((y / T - SURFACE)))}m`, x, y };
    this.portals.push(p);
    this.add.image(x, y, 'telekit').setOrigin(0.5, 1).setDepth(2);
    this.portalGlow(x, y - 8, 0x48b8f0);
    if (announce) this.fx.float(x, y - 20, 'CAMP SET', '#78d8f0');
  }

  // -------------------------------------------------------------- lighting
  // A huge dark texture with a soft transparent hole rides on the player;
  // the hole is the lantern. Fixed lights (portals, shrines, mushrooms) are
  // additive glow sprites that shine through the dark on their own.
  buildLighting() {
    const size = 1600, cx = size / 2, R = 150;
    if (!this.textures.exists('darkhole')) {
      const tex = this.textures.createCanvas('darkhole', size, size);
      const g = tex.getContext();
      g.fillStyle = '#060410';
      g.fillRect(0, 0, size, size);
      g.globalCompositeOperation = 'destination-out';
      const grad = g.createRadialGradient(cx, cx, 12, cx, cx, R);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cx, R, 0, Math.PI * 2);
      g.fill();
      tex.refresh();
    }
    this.darkness = this.add.image(0, 0, 'darkhole').setDepth(50).setAlpha(0);
    this.darkAlpha = 0;
  }

  updateLighting() {
    const pty = this.player.y / T - SURFACE;
    const zone = zoneOfRow(Math.floor(this.player.y / T));
    let target = 0;
    if (pty > 0) target = Math.min(0.5 + pty / 200, 0.9);
    if (zone === 1) target = Math.max(target, 0.93);
    if (zone === 2) target = Math.max(target, 0.985);
    if (pty <= 0) target = 0;
    // ease toward the target so entering/leaving the mine feels gradual
    this.darkAlpha += (target - this.darkAlpha) * 0.06;
    this.darkness.setAlpha(this.darkAlpha < 0.02 ? 0 : this.darkAlpha);
    this.darkness.setVisible(this.darkAlpha >= 0.02);
    if (!this.darkness.visible) return;
    const r = this.registry;
    const lampFrac = Math.max(0, r.get('lamp') / r.get('lampCap'));
    const capBonus = 0.85 + (r.get('lampCap') / 320) * 0.45;
    let scale = (0.4 + 0.5 * lampFrac) * capBonus * (r.get('upgrades').steamlamp ? 1.4 : 1);
    scale = Phaser.Math.Clamp(scale, 0.42, 1.6);
    // flicker when the lamp is nearly dead
    if (lampFrac < 0.15) scale *= 0.95 + Math.sin(this.time.now / 60) * 0.04;
    this.darkness.setScale(scale);
    this.darkness.setPosition(this.player.x, this.player.y);
  }

  // ---------------------------------------------------------------- input
  buildInput() {
    const k = Phaser.Input.Keyboard.KeyCodes;
    const add = (code) => this.input.keyboard.addKey(code);
    this.keys = {
      left: add(k.LEFT), right: add(k.RIGHT), up: add(k.UP), down: add(k.DOWN),
      a: add(k.A), d: add(k.D), w: add(k.W), s: add(k.S),
      jump: add(k.SPACE), dig: add(k.X), dig2: add(k.J),
      dash: add(k.SHIFT), dash2: add(k.C),
      interact: add(k.E), dyna: add(k.K), kit: add(k.T), ladder: add(k.L),
      mute: add(k.M), recall: add(k.R), esc: add(k.ESC),
    };
    this.input.keyboard.on('keydown-M', () => {
      const muted = Sfx.toggleMute();
      this.fx.float(this.player.x, this.player.y - 20, muted ? 'MUTED' : 'SOUND ON', '#ffffff');
    });
  }

  readInput() {
    const K = this.keys;
    const jp = Phaser.Input.Keyboard.JustDown;
    const t = this.registry.get('touch') || {};
    const inp = {
      left: K.left.isDown || K.a.isDown || t.left,
      right: K.right.isDown || K.d.isDown || t.right,
      up: K.up.isDown || K.w.isDown || t.up,
      down: K.down.isDown || K.s.isDown || t.down,
      jumpDown: K.jump.isDown || t.jump,
      jumpPressed: jp(K.jump) || !!t.jumpPressed,
      digDown: K.dig.isDown || K.dig2.isDown || t.dig,
      dashPressed: jp(K.dash) || jp(K.dash2) || !!t.dashPressed,
      interactPressed: jp(K.interact) || !!t.usePressed,
      dynaPressed: jp(K.dyna) || !!t.dynaPressed,
      kitPressed: jp(K.kit),
      ladderPressed: jp(K.ladder) || !!t.ladderPressed,
      recallDown: K.recall.isDown || !!t.recall,
    };
    // consume one-shot touch edges so they fire exactly once
    if (t.jumpPressed) t.jumpPressed = false;
    if (t.usePressed) t.usePressed = false;
    if (t.dashPressed) t.dashPressed = false;
    if (t.dynaPressed) t.dynaPressed = false;
    if (t.ladderPressed) t.ladderPressed = false;
    return inp;
  }

  bindUIEvents() {
    const g = this.game.events;
    g.removeAllListeners('ui:closed'); g.removeAllListeners('shop:buy');
    g.removeAllListeners('portal:go'); g.removeAllListeners('menu:quit');
    g.on('ui:closed', () => { this.uiOpen = false; });
    g.on('shop:buy', (item) => this.tryBuy(item));
    g.on('portal:go', (idx) => this.teleportTo(idx));
    g.on('menu:quit', () => {
      this.save();
      Sfx.stopMusic();
      this.scene.stop('UI');
      this.scene.start('Menu');
    });
  }

  // ---------------------------------------------------------------- update
  update(time, dtMs) {
    if (this.gameOver) return;
    const input = this.readInput();

    if (this.uiOpen) {
      this.player.setVelocity(0, this.player.body.velocity.y);
      this.game.events.emit('hud:hint', null);
      this.updateLighting();
      return;
    }

    this.player.update(time, dtMs, input);
    const px = this.player.x, py = this.player.y;
    const ptx = Math.floor(px / T), pty = Math.floor(py / T);

    // enemies (only near ones think)
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      if (Math.abs(e.x - px) < 420 && Math.abs(e.y - py) < 320) e.update(time, dtMs, this.player);
      else e.setVelocity(0, (e.body.allowGravity ? e.body.velocity.y : 0));
    });

    // spikes at feet
    const feet = this.layer.getTileAtWorldXY(px, py + 10);
    if (feet && feet.index === TILE.SPIKE && this.player.body.velocity.y >= 0) {
      this.damagePlayer(px, 1, true);
    }

    // pickups magnet — but never magnet an ORE toward you when the bag is full,
    // or it just orbits/vibrates on you. Coins/hearts/orbs always magnet.
    const magnet = this.registry.get('upgrades').magnet ? 48 : 20;
    const bagFull = (this.registry.get('bag') || []).length >= this.registry.get('bagCap');
    this.pickups.getChildren().forEach((p) => {
      const isBagOre = ORES[p.ore] && p.ore !== 'orb';
      if (bagFull && isBagOre) { p.body.setAllowGravity(true); return; } // let it rest on the ground
      const d = Phaser.Math.Distance.Between(p.x, p.y, px, py);
      if (d < magnet) {
        this.physics.moveTo(p, px, py, 220);
        p.body.setAllowGravity(false);
      }
    });

    this.checkInteractions(input, time);
    this.updateAtmosphere(pty, time, dtMs);
    this.updateLighting();

    // recall home (hold R / hold the RECALL button)
    if (input.recallDown && pty > SURFACE) {
      this.recallHeld += dtMs;
      if (this.recallHeld > 1100) {
        this.recallHeld = -99999;
        this.fx.float(px, py - 20, 'RECALL!', '#78d8f0');
        Sfx.teleport();
        this.time.delayedCall(300, () => this.returnToTown());
      } else if (this.recallHeld > 150) {
        this.game.events.emit('hud:hint', `Recalling... hold ${((1100 - this.recallHeld) / 1000).toFixed(1)}s`);
      }
    } else this.recallHeld = 0;

    // fell out of world safety
    if (py > H * T + 40) this.returnToTown();
  }

  checkInteractions(input, time) {
    const px = this.player.x, py = this.player.y;
    const near = (x, y, r = 18) => Phaser.Math.Distance.Between(px, py, x, y) < r;

    // hint & interact: NPCs
    let hint = null;
    for (const npc of this.npcs) {
      if (near(npc.x, npc.y - 10, 22)) {
        hint = `E — talk to ${npc.npcName}`;
        if (input.interactPressed) this.talkTo(npc);
      }
    }
    // portals
    for (let i = 0; i < this.portals.length; i++) {
      const p = this.portals[i];
      if (near(p.x, p.y - 10, 20)) {
        hint = 'E — use portal';
        if (input.interactPressed) {
          this.uiOpen = true;
          this.game.events.emit('portal:open', { portals: this.portals.map((q) => q.name), from: i });
        }
      }
    }
    // shrines
    for (const s of this.shrines) {
      if (!s.taken && near(s.px, s.py - 10, 20)) {
        hint = 'E — accept the gift';
        if (input.interactPressed) this.takeShrine(s);
      }
    }
    // portal stones
    for (const st of this.stoneSprites) {
      if (st.spr.active && near(st.px, st.py, 16)) this.takeStone(st);
    }
    // chests
    for (const c of this.chestSprites) {
      if (c.spr.active && near(c.px, c.py, 16)) this.takeChest(c);
    }
    // checkpoint temples — stepping onto one makes it your respawn point
    for (const cp of this.checkpoints) {
      if (near(cp.px, cp.py - 12, 22)) {
        this.registry.set('respawnPoint', { x: cp.px, y: cp.py - 12 });
        if (!cp.activated) this.activateCheckpoint(cp);
      }
    }
    // gates
    for (const gate of this.world.gates) {
      if (this.registry.get('openGates').includes(gate.key)) continue;
      const gx = gate.shaftX * T + 8, gy = gate.row * T;
      if (Phaser.Math.Distance.Between(px, py, gx, gy) < 40) {
        if (this.registry.get('carriedStones').includes(gate.key)) this.openGate(gate);
        else hint = 'The gate is sealed... find its Portal Stone';
      }
    }
    // death-loot stash — recover your dropped gems
    if (this.stashSprite && this.stashSprite.active && near(this.stashSprite.x, this.stashSprite.y - 4, 20)) {
      this.recoverStash();
    }
    // the Idol (opens the Rift) and the Crown (true ending)
    if (this.idol.visible && !this.claiming && near(this.idol.x, this.idol.y - 12, 22)) this.claimIdol();
    if (!this.won && !this.claiming && near(this.crown.x, this.crown.y - 12, 22)) this.winGame();

    // rift hint when standing at a sealed rift
    if (!this.registry.get('rightUnlocked') &&
        Phaser.Math.Distance.Between(px, py, DIVIDER * T, SURFACE * T) < 40) {
      hint = 'The Rift is sealed — claim the Golden Idol below to open it';
    }

    if (input.dynaPressed) this.throwDynamite();
    if (input.kitPressed) this.placeKit();
    if (input.ladderPressed) this.placeLadder();

    this.game.events.emit('hud:hint', hint);
  }

  // ------------------------------------------------------------- atmosphere
  updateAtmosphere(pty, time, dtMs) {
    const zone = zoneOfRow(pty);
    const region = regionOfX(Math.floor(this.player.x / T));
    const r = this.registry;

    // music + zone toast
    const mood = zone === -1 ? 'town' : zone === 0 ? 'mines' : zone === 1 ? 'caverns' : 'abyss';
    Sfx.setMood(mood);
    const zoneKey = `${region}:${zone}`;
    if (zoneKey !== this.curZoneKey) {
      this.curZoneKey = zoneKey;
      this.curZone = zone;
      if (zone >= 0 && time > this.zoneToastAt + 3500) {
        this.zoneToastAt = time;
        this.game.events.emit('hud:zone', zoneName(Math.floor(this.player.x / T), pty));
      } else if (zone === -1) {
        this.game.events.emit('hud:zone', region === 1 ? 'Frosthaven' : 'Sundrop Flats');
      }
    }

    // lantern: drains underground, refills topside
    if (pty > SURFACE) {
      r.set('lamp', Math.max(0, r.get('lamp') - dtMs / 1000));
    } else if (r.get('lamp') < r.get('lampCap')) {
      r.set('lamp', Math.min(r.get('lampCap'), r.get('lamp') + dtMs / 100));
    }

    // camera tint per zone via subtle bg color
    const cols = ['#0b0a12', '#171008', '#0c1410', '#0a0714'];
    this.cameras.main.setBackgroundColor(cols[zone + 1] || cols[0]);
    this.game.events.emit('hud:depth', Math.max(0, pty - SURFACE));
  }

  // -------------------------------------------------------------- digging
  isSolidAt(x, y) {
    const t = this.layer.getTileAtWorldXY(x, y);
    return !!t && t.index !== TILE.LADDER && t.index !== TILE.SPIKE;
  }

  isLadderAt(x, y) {
    const t = this.layer.getTileAtWorldXY(x, y);
    return !!t && t.index === TILE.LADDER;
  }

  hasLineOfSight(a, b) {
    const steps = Math.ceil(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 8);
    for (let i = 1; i < steps; i++) {
      const x = a.x + (b.x - a.x) * (i / steps);
      const y = a.y + (b.y - a.y) * (i / steps);
      if (this.isSolidAt(x, y)) return false;
    }
    return true;
  }

  pickStrike(player, dx, dy) {
    // hit enemies first (a swing is also a weapon)
    const reach = 16;
    const hx = player.x + dx * reach, hy = player.y + dy * reach + 2;
    let hitEnemy = false;
    this.enemies.getChildren().forEach((e) => {
      if (!e.active || hitEnemy) return;
      if (Phaser.Math.Distance.Between(e.x, e.y, hx, hy) < 15 ||
          Phaser.Math.Distance.Between(e.x, e.y, player.x, player.y) < 14) {
        e.hit(player.x, this.registry.get('pickTier'), this.time.now);
        hitEnemy = true;
      }
    });
    if (hitEnemy) return;

    // then the tile in the aimed direction (from the body edge).
    if (dy === 0) {
      // horizontal swings hit head AND feet height so tunnels are walkable
      const bx = player.x + dx * 12;
      this.digTileAt(bx, player.y - 6);
      this.digTileAt(bx, player.y + 6);
    } else {
      // vertical swing: scan outward from head/feet for the first solid tile
      // within reach, so a jump lets you connect with rock a bit above (or the
      // ground just below) instead of needing a pixel-perfect line-up.
      const edge = dy < 0 ? player.y - 8 : player.y + 12;
      const maxReach = 24; // ~1.5 tiles past the body edge
      let hit = false;
      for (let d = 0; d <= maxReach; d += 4) {
        const wy = edge + dy * d;
        const tile = this.layer.getTileAtWorldXY(player.x, wy);
        if (tile && tile.index !== TILE.LADDER && tile.index !== TILE.SPIKE) {
          this.digTileAt(player.x, wy);
          hit = true;
          break;
        }
      }
      if (!hit) this.digTileAt(player.x, edge + dy * 12); // whiff into open air
    }
  }

  meetsReq(req) {
    if (req.pick && this.registry.get('pickTier') < req.pick) return false;
    if (req.firePick && !this.registry.get('upgrades').firePick) return false;
    return true;
  }

  digTileAt(wx, wy) {
    const tile = this.layer.getTileAtWorldXY(wx, wy);
    if (!tile || tile.index === TILE.LADDER || tile.index === TILE.SPIKE) return;
    const info = TILE_INFO[tile.index];
    if (!info || tile.index === TILE.BEDROCK || tile.index === TILE.GATE) {
      Sfx.clank();
      this.fx.burst(wx, wy, 0x8a94a2, 3);
      return;
    }
    // tool-gated blocks: bounce off until you have the right equipment
    if (info.req && !this.meetsReq(info.req)) {
      Sfx.clank();
      this.fx.burst(tile.getCenterX(), tile.getCenterY(), tile.index === TILE.ICE_BLOCK ? 0xbfe9ff : 0xc89a4a, 4);
      const now = this.time.now;
      if (now - (this.reqHintAt || 0) > 900) {
        this.reqHintAt = now;
        const msg = info.req.firePick ? 'ICE — needs the FIRE PICK' : `TOO HARD — needs PICKAXE ${'I'.repeat(info.req.pick)}`;
        this.fx.float(tile.getCenterX(), tile.getCenterY() - 8, msg, '#9ae8f2');
      }
      return;
    }
    const idx = tile.y * W + tile.x;
    let hp = this.tileHp.get(idx) ?? info.hp;
    hp -= this.registry.get('pickTier');
    this.fx.burst(tile.getCenterX(), tile.getCenterY(), 0xa8763c, 4);
    Sfx.dig(info.hp >= 3);
    if (hp <= 0) {
      this.breakTile(tile, idx, info);
    } else {
      this.tileHp.set(idx, hp);
      const stage = hp <= info.hp / 3 ? 'crack2' : 'crack1';
      let c = this.cracks.get(idx);
      if (!c) {
        c = this.add.image(tile.getCenterX(), tile.getCenterY(), stage).setDepth(4);
        this.cracks.set(idx, c);
      } else c.setTexture(stage);
    }
  }

  breakTile(tile, idx, info) {
    Sfx.breakTile();
    this.fx.burst(tile.getCenterX(), tile.getCenterY(), 0x8a5e2e, 8);
    const cx = tile.getCenterX(), cy = tile.getCenterY();
    this.layer.removeTileAt(tile.x, tile.y);
    this.tileHp.delete(idx);
    this.cracks.get(idx)?.destroy();
    this.cracks.delete(idx);
    const dug = this.registry.get('dugTiles');
    dug.push(idx);
    if (info.ore) this.spawnOre(cx, cy, info.ore);
    // rare: digging reveals a lurker in zone 2/3
    const zone = zoneOfRow(tile.y);
    if (zone >= 1 && Math.random() < 0.012) {
      const type = zone === 1 ? 'bat' : 'wraith';
      this.spawnEnemy(type, cx, cy);
      this.fx.ring(cx, cy, 0xc94f38);
    }
  }

  drillThrough(player) {
    // drill dash chews through soft (dirt-tier) blocks in front of the body
    for (const oy of [-6, 6]) {
      const tile = this.layer.getTileAtWorldXY(player.x + player.facing * 9, player.y + oy);
      if (!tile) continue;
      const info = TILE_INFO[tile.index];
      if (info && info.hp <= 2 && tile.index !== TILE.BEDROCK && tile.index !== TILE.GATE) {
        this.breakTile(tile, tile.y * W + tile.x, info);
      }
    }
  }

  spawnOre(x, y, ore) {
    const p = this.pickups.create(x, y, 'chunk');
    p.ore = ore;
    p.setTint(ORES[ore].color).setDepth(12);
    p.setVelocity(Phaser.Math.Between(-40, 40), -120);
    p.setBounce(0.4);
    p.body.setSize(8, 8);
  }

  spawnEnemy(type, x, y) {
    const e = new Enemy(this, x, y, type);
    this.enemies.add(e);
    return e;
  }

  collect(p) {
    const r = this.registry;
    if (p.ore === 'orb') {
      r.set('orbs', r.get('orbs') + 1);
      Sfx.orb();
      this.fx.float(p.x, p.y - 8, '+1 ORB', '#78d8f0');
    } else if (p.ore === 'heart') {
      if (r.get('hp') >= r.get('maxHp')) return; // leave it if full
      r.set('hp', Math.min(r.get('maxHp'), r.get('hp') + 1));
      Sfx.heart();
    } else if (p.ore === 'coin') {
      r.set('coins', r.get('coins') + p.coinValue);
      Sfx.pickup();
      this.fx.float(p.x, p.y - 8, `+${p.coinValue}`, '#f2d75c');
    } else {
      const bag = r.get('bag');
      if (bag.length >= r.get('bagCap')) {
        if (!p.warned) { Sfx.bagFull(); this.fx.float(p.x, p.y - 8, 'BAG FULL!', '#e85c5c'); p.warned = true; }
        p.body.setAllowGravity(true); // drop it — magnet loop leaves it alone until you have room
        return;
      }
      bag.push(p.ore);
      Sfx.pickup();
      this.fx.float(p.x, p.y - 8, ORES[p.ore].name, '#f2d75c');
    }
    p.destroy();
    this.game.events.emit('hud:refresh');
  }

  // -------------------------------------------------------------- combat
  touchEnemy(e) {
    if (!e.active) return;
    // the wall crawler only hurts you mid-lunge, not while it's resting
    if (e.type === 'crawler' && !e.dangerous) return;
    this.damagePlayer(e.x, e.stats.dmg);
  }

  damagePlayer(fromX, dmg, isSpike = false) {
    const time = this.time.now;
    const r = this.registry;
    if (r.get('upgrades').armor) dmg = Math.max(1, Math.floor(dmg / 2));
    if (!this.player.hurtFrom(fromX + (isSpike ? 4 : 0), time)) return;
    r.set('hp', r.get('hp') - dmg);
    this.cameras.main.shake(120, 0.008);
    this.cameras.main.flash(80, 120, 20, 20);
    this.game.events.emit('hud:refresh');
    if (r.get('hp') <= 0) this.die();
  }

  die() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.player.dead = true;
    this.player.setVelocity(0, -200);
    this.player.body.checkCollision.none = true;
    Sfx.die();
    this.tweens.add({ targets: this.player, angle: 180, alpha: 0, duration: 900 });
    this.dropStash(); // your carried gems stay where you fell — go get them back
    this.game.events.emit('hud:death');
    this.game.events.emit('hud:refresh');
    this.time.delayedCall(1600, () => {
      this.gameOver = false;
      this.player.dead = false;
      this.player.body.checkCollision.none = false;
      this.player.setAlpha(1).setAngle(0);
      this.registry.set('hp', this.registry.get('maxHp'));
      this.registry.set('lamp', this.registry.get('lampCap'));
      this.respawnPlayer();
      this.save();
    });
  }

  // Respawn at the last checkpoint you touched, or town if you haven't found one.
  respawnPlayer() {
    const rp = this.registry.get('respawnPoint') || this.registry.get('spawnPoint');
    const atTown = rp.y <= SURFACE * T;
    this.player.setPosition(rp.x, rp.y);
    this.player.setVelocity(0, 0);
    this.cameras.main.flash(220, 120, 200, 255);
    if (!atTown) this.fx.float(rp.x, rp.y - 20, 'RESPAWN', '#9ae8f2');
    this.save();
  }

  activateCheckpoint(cp) {
    cp.activated = true;
    cp.spr.clearTint();
    cp.glow.setAlpha(0.55);
    const arr = this.registry.get('activatedCheckpoints');
    if (!arr.includes(cp.i)) arr.push(cp.i);
    this.registry.set('lamp', this.registry.get('lampCap')); // relight your lantern
    Sfx.checkpoint();
    this.cameras.main.flash(150, 90, 160, 220);
    this.fx.burst(cp.px, cp.py - 18, 0x48b8f0, 16);
    this.fx.ring(cp.px, cp.py - 18, 0x9ae8f2);
    this.fx.float(cp.px, cp.py - 34, 'CHECKPOINT!', '#9ae8f2');
    this.game.events.emit('hud:refresh');
    this.game.events.emit('hud:zone', 'Checkpoint reached');
    this.save();
  }

  onEnemyDied(e) {
    // drops: coins usually, sometimes a heart
    if (Math.random() < 0.18) {
      const p = this.pickups.create(e.x, e.y, 'heart');
      p.ore = 'heart'; p.setDepth(12); p.setVelocity(0, -100); p.setBounce(0.3);
    } else {
      const p = this.pickups.create(e.x, e.y, 'coin');
      p.ore = 'coin'; p.coinValue = Phaser.Math.Between(3, 9);
      p.setDepth(12); p.setVelocity(Phaser.Math.Between(-30, 30), -110); p.setBounce(0.3);
    }
  }

  spitAt(spitter, player) {
    Sfx.spit();
    const g = this.globs.create(spitter.x, spitter.y - 4, 'glob');
    g.setDepth(8);
    const dx = player.x - spitter.x, dy = player.y - spitter.y;
    const t = 0.7;
    g.setVelocity(dx / t, dy / t - 0.5 * 900 * t * 0.5);
    g.body.setSize(5, 5);
    this.time.delayedCall(3000, () => g.active && this.splat(g));
  }

  splat(g) {
    if (!g.active) return;
    this.fx.burst(g.x, g.y, 0x3a875f, 5);
    g.destroy();
  }

  // ------------------------------------------------------------ specials
  takeShrine(s) {
    s.taken = true;
    s.icon.destroy();
    const r = this.registry;
    const powers = { ...r.get('powers') };
    powers[s.power] = true;
    r.set('powers', powers);
    const taken = r.get('takenShrines'); taken.push(s.power);
    if (s.power === 'dynamite') r.set('dynamite', r.get('dynamite') + 3);
    Sfx.powerup();
    this.fx.burst(s.px, s.py - 10, 0xf2d75c, 14);
    const names = {
      doubleJump: ['WINGED IDOL', 'Press JUMP again in mid-air!'],
      dash: ['DRILL FISTS', 'SHIFT to dash — smashes soft ground!'],
      dynamite: ['OLD DYNAMITE', 'Press K to throw a stick! (+3)'],
    };
    this.game.events.emit('dialog:show', {
      name: 'Ancient Shrine',
      lines: [`You found the ${names[s.power][0]}!`, names[s.power][1]],
    });
    this.uiOpen = true;
    this.save();
    this.game.events.emit('hud:refresh');
  }

  takeStone(st) {
    st.spr.destroy();
    const r = this.registry;
    r.get('carriedStones').push(st.key);
    r.get('takenStones').push(st.key);
    Sfx.orb();
    this.fx.burst(st.px, st.py, 0xf2c53a, 12);
    const region = st.key.startsWith('r1') ? ZONES_R : ZONES;
    this.game.events.emit('dialog:show', {
      name: 'Portal Stone',
      lines: ['A humming golden stone...', `It resonates with the sealed gate of ${region[st.zone].name}.`],
    });
    this.uiOpen = true;
    this.save();
  }

  takeChest(c) {
    c.spr.destroy();
    const r = this.registry;
    const amount = 40 + c.i * 15;
    r.set('coins', r.get('coins') + amount);
    r.get('takenChests').push(c.i);
    Sfx.sell();
    this.fx.float(c.px, c.py - 10, `+${amount} COINS`, '#f2d75c');
    this.game.events.emit('hud:refresh');
    this.save();
  }

  openGate(gate) {
    const r = this.registry;
    r.set('carriedStones', r.get('carriedStones').filter((k) => k !== gate.key));
    r.get('openGates').push(gate.key);
    for (let y = gate.row; y <= gate.row + 2; y++) {
      for (const x of [gate.shaftX - 1, gate.shaftX, gate.shaftX + 1]) {
        const t = this.layer.getTileAt(x, y);
        if (t) {
          this.fx.burst(t.getCenterX(), t.getCenterY(), 0x48b8f0, 6);
          this.layer.removeTileAt(x, y);
          this.registry.get('dugTiles').push(y * W + x);
        }
      }
    }
    Sfx.gateOpen();
    this.cameras.main.shake(400, 0.01);
    this.addGatePortal(gate);
    this.game.events.emit('dialog:show', {
      name: 'The Gate',
      lines: ['The Portal Stone dissolves...', 'The way down is open — and a portal hums to life.'],
    });
    this.uiOpen = true;
    this.save();
  }

  throwDynamite() {
    const r = this.registry;
    if (!r.get('powers').dynamite) return;
    if (r.get('dynamite') <= 0) { Sfx.denied(); this.fx.float(this.player.x, this.player.y - 18, 'NO DYNAMITE', '#e85c5c'); return; }
    r.set('dynamite', r.get('dynamite') - 1);
    this.game.events.emit('hud:refresh');
    Sfx.fuse();
    const d = this.physics.add.image(this.player.x, this.player.y - 4, 'dynamite').setDepth(12);
    d.setVelocity(this.player.facing * 120, -160);
    d.setBounce(0.4);
    this.physics.add.collider(d, this.layer);
    this.tweens.add({ targets: d, angle: 360, duration: 600, repeat: 2 });
    this.time.delayedCall(1100, () => {
      if (!d.active) return;
      const dx = d.x, dy = d.y;
      d.destroy();
      Sfx.explosion();
      this.cameras.main.shake(250, 0.012);
      this.fx.burst(dx, dy, 0xf2a53a, 22);
      const tx = Math.floor(dx / T), ty = Math.floor(dy / T);
      for (let yy = ty - 1; yy <= ty + 1; yy++) {
        for (let xx = tx - 1; xx <= tx + 1; xx++) {
          const tile = this.layer.getTileAt(xx, yy);
          if (!tile) continue;
          const info = TILE_INFO[tile.index];
          if (!info || tile.index === TILE.BEDROCK || tile.index === TILE.GATE) continue;
          if (info.req && !this.meetsReq(info.req)) continue; // dynamite can't cheat the gates
          this.breakTile(tile, yy * W + xx, info);
        }
      }
      this.enemies.getChildren().forEach((e) => {
        if (e.active && Phaser.Math.Distance.Between(e.x, e.y, dx, dy) < 40) e.hit(dx, 4, this.time.now);
      });
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, dx, dy) < 30) {
        this.damagePlayer(dx, 1);
      }
    });
  }

  placeKit() {
    const r = this.registry;
    const pty = Math.floor(this.player.y / T);
    if (r.get('teleKits') <= 0 || pty <= SURFACE) return;
    if (!this.player.onGround) return;
    r.set('teleKits', r.get('teleKits') - 1);
    const x = this.player.x, y = Math.floor((this.player.y + 12) / T) * T;
    r.get('placedPortals').push({ x, y });
    this.addPlacedPortal(x, y);
    Sfx.portal();
    this.game.events.emit('hud:refresh');
    this.save();
  }

  teleportTo(idx) {
    const p = this.portals[idx];
    if (!p) return;
    Sfx.teleport();
    this.cameras.main.flash(200, 120, 200, 255);
    this.player.setPosition(p.x, p.y - 14);
    this.player.setVelocity(0, 0);
    if (p.y <= (SURFACE + 1) * T) this.arriveInTown(); // a surface town pad
  }

  returnToTown() {
    const s = this.registry.get('spawnPoint');
    this.player.setPosition(s.x, s.y);
    this.player.setVelocity(0, 0);
    this.cameras.main.flash(200, 120, 200, 255);
    this.arriveInTown();
  }

  arriveInTown() {
    this.save();
  }

  // ----------------------------------------------------------------- town
  talkTo(npc) {
    this.uiOpen = true;
    Sfx.talk();
    if (npc.dialog === 'shop' || npc.dialog === 'shopEast') {
      this.shopEast = npc.dialog === 'shopEast';
      this.sellBag();
      this.game.events.emit('shop:open', this.shopStock(this.shopEast));
    } else if (npc.dialog === 'gus') {
      const tips = [
        ['Gus squints at the horizon.', 'Dirt gives way easy. The green rock below wants a better pickaxe.'],
        ['Gus taps his lamp.', 'Light burns fast down deep. Buy a bigger lamp — or learn the dark.'],
        ['Gus lowers his voice.', 'Sealed gates open with Portal Stones. Folks hid \'em in brick caves.'],
        ['Gus shudders.', 'Below the second gate... things float. Swing first, friend.'],
      ];
      this.game.events.emit('dialog:show', { name: 'Old Gus', lines: tips[Math.floor(Math.random() * tips.length)] });
    } else if (npc.dialog === 'gusEast') {
      const tips = [
        ['Frostbeard huffs a frozen breath.', 'The ice hides Mythril — richest ore there is. Dig deep, dress warm.'],
        ['Frostbeard nods at your pack.', 'Yuki sells Rope Ladders. Toss one down and climb right back up.'],
        ['Frostbeard warns you.', 'The Frozen Throne at the bottom guards the Sun Crown. Mind the wraiths.'],
      ];
      this.game.events.emit('dialog:show', { name: 'Frostbeard', lines: tips[Math.floor(Math.random() * tips.length)] });
    } else if (npc.dialog === 'mayorEast') {
      this.game.events.emit('dialog:show', {
        name: 'Elder Pyra',
        lines: ['So the Idol woke the Rift, and here you stand.',
          'Frosthaven has waited an age for a digger like you.',
          'Claim the Sun Crown below — and be remembered forever.'],
      });
    } else {
      this.game.events.emit('dialog:show', {
        name: 'Mayor Bell',
        lines: [
          'Welcome to Sundrop Flats, dreamer!',
          'They say a Golden Idol sleeps at the world\'s bottom.',
          this.registry.get('rightUnlocked')
            ? 'And you opened the Rift east! Frosthaven awaits.'
            : 'Every digger who chased it... well. Enjoy your stay!',
        ],
      });
    }
  }

  sellBag() {
    const r = this.registry;
    const bag = r.get('bag');
    if (!bag.length) return;
    let total = bag.reduce((sum, ore) => sum + ORES[ore].value, 0);
    if (r.get('upgrades').lucky) total = Math.floor(total * 1.25);
    r.set('coins', r.get('coins') + total);
    r.set('bag', []);
    Sfx.sell();
    this.fx.float(this.player.x, this.player.y - 22, `SOLD +${total}`, '#f2d75c');
    this.game.events.emit('hud:refresh');
    this.save();
  }

  // Upgrade ladders extend into the east game. maxTier caps what a shop offers.
  shopStock(east) {
    const r = this.registry;
    const u = r.get('upgrades');
    const stock = [];
    const PICK = { names: ['II', 'III', 'IV', 'V', 'VI'], cost: [60, 220, 600, 1200, 2500] };
    const BAG = { cap: [12, 18, 26, 36, 48], cost: [40, 150, 400, 900, 1800] };
    const LAMP = { names: ['II', 'III', 'IV', 'V'], cap: [150, 220, 320, 430], cost: [50, 180, 450, 1000] };
    const HP = { cost: [80, 200, 500, 900, 1500] };
    const pickMax = east ? 5 : 3, bagMax = east ? 4 : 3, lampMax = east ? 4 : 3, hpMax = east ? 5 : 3;

    const pickLvl = r.get('pickTier');
    if (pickLvl - 1 < pickMax) stock.push({ id: 'pick', name: `Pickaxe ${PICK.names[pickLvl - 1]}`, desc: 'Digs faster, hits harder', cost: PICK.cost[pickLvl - 1], cur: 'coins' });
    const bagLvl = u.bag || 0;
    if (bagLvl < bagMax) stock.push({ id: 'bag', name: `Bigger Bag (${BAG.cap[bagLvl]})`, desc: 'Carry more loot', cost: BAG.cost[bagLvl], cur: 'coins' });
    const lampLvl = u.lamp || 0;
    if (lampLvl < lampMax) stock.push({ id: 'lamp', name: `Bright Lamp ${LAMP.names[lampLvl]}`, desc: 'Burns longer & brighter', cost: LAMP.cost[lampLvl], cur: 'coins' });
    const hpLvl = u.hp || 0;
    if (hpLvl < hpMax) stock.push({ id: 'hp', name: 'Heart Container', desc: '+1 max health', cost: HP.cost[hpLvl], cur: 'coins' });

    if (east && !u.firePick) stock.push({ id: 'firePick', name: 'FIRE PICK', desc: 'Melts ICE blocks in the deep frost', cost: 1500, cur: 'coins' });
    if (east) stock.push({ id: 'ladder', name: 'Rope Ladder x3', desc: 'L drops a ladder to climb up', cost: 90, cur: 'coins' });
    stock.push({ id: 'kit', name: 'Teleporter Kit', desc: 'T places a camp portal', cost: 75, cur: 'coins' });
    if (r.get('powers').dynamite) stock.push({ id: 'dyna', name: 'Dynamite x3', desc: 'K goes boom', cost: 60, cur: 'coins' });
    if (!u.armor) stock.push({ id: 'armor', name: 'Leather Armor', desc: 'Halves damage taken', cost: 6, cur: 'orbs' });
    if (!u.magnet) stock.push({ id: 'magnet', name: 'Loot Magnet', desc: 'Pulls loot from afar', cost: 4, cur: 'orbs' });
    if (!u.lucky) stock.push({ id: 'lucky', name: 'Lucky Charm', desc: '+25% sell price', cost: 5, cur: 'orbs' });
    if (!u.steamlamp) stock.push({ id: 'steamlamp', name: 'Steam Lamp', desc: 'Much wider light', cost: 4, cur: 'orbs' });
    stock._east = east;
    return stock;
  }

  tryBuy(item) {
    const r = this.registry;
    const have = r.get(item.cur);
    if (have < item.cost) { Sfx.denied(); return; }
    r.set(item.cur, have - item.cost);
    const u = { ...r.get('upgrades') };
    const BAGCAP = [12, 18, 26, 36, 48], LAMPCAP = [150, 220, 320, 430];
    switch (item.id) {
      case 'pick': r.set('pickTier', r.get('pickTier') + 1); break;
      case 'bag': u.bag = (u.bag || 0) + 1; r.set('bagCap', BAGCAP[u.bag - 1]); break;
      case 'lamp': u.lamp = (u.lamp || 0) + 1; r.set('lampCap', LAMPCAP[u.lamp - 1]); r.set('lamp', r.get('lampCap')); break;
      case 'hp': u.hp = (u.hp || 0) + 1; r.set('maxHp', r.get('maxHp') + 1); r.set('hp', r.get('maxHp')); break;
      case 'kit': r.set('teleKits', r.get('teleKits') + 1); break;
      case 'ladder': r.set('ropeLadders', r.get('ropeLadders') + 3); break;
      case 'dyna': r.set('dynamite', r.get('dynamite') + 3); break;
      default: u[item.id] = true; break;
    }
    r.set('upgrades', u);
    Sfx.buy();
    this.save();
    this.game.events.emit('hud:refresh');
    this.game.events.emit('shop:open', this.shopStock(this.shopEast)); // refresh stock
  }

  // Claiming the Idol: warp to the surface and OPEN THE RIFT to the east.
  claimIdol() {
    this.claiming = true;
    this.registry.set('idolClaimed', true);
    this.registry.set('rightUnlocked', true);
    Sfx.win();
    this.idol.setDepth(60);
    this.cameras.main.flash(700, 255, 220, 120);
    this.openRift();
    this.game.events.emit('dialog:show', {
      name: 'The Golden Idol',
      lines: ['The Idol blazes with light and lifts you to the surface!',
        'Far to the EAST, a sealed Rift cracks open...',
        'A frozen land — and the Sun Crown — await beyond it.'],
    });
    this.uiOpen = true;
    this.time.delayedCall(400, () => {
      this.idol.setVisible(false);
      this.returnToTown();
      this.claiming = false;
    });
    this.save();
  }

  openRift() {
    if (this.riftWall) { this.riftWall.destroy(); this.riftWall = null; }
    if (this.riftGate) this.riftGate.setTint(0xc89aff);
    if (this.riftGlow) this.riftGlow.setVisible(true);
    if (this.riftSign) this.riftSign.setText('THE RIFT').setColor('#d0a8ff');
  }

  winGame() {
    this.won = true;
    Sfx.win();
    this.crown.setDepth(60);
    this.cameras.main.flash(600, 255, 240, 180);
    this.uiOpen = true;
    this.game.events.emit('game:won', {
      coins: this.registry.get('coins'),
      orbs: this.registry.get('orbs'),
    });
    this.save();
  }

  // ---- rope ladder: drop a short climbable ladder to get back up ----
  placeLadder() {
    const r = this.registry;
    if (r.get('ropeLadders') <= 0) {
      Sfx.denied();
      this.fx.float(this.player.x, this.player.y - 18, 'NO LADDERS', '#e85c5c');
      return;
    }
    const tx = Math.floor(this.player.x / T);
    const topY = Math.floor(this.player.y / T);
    let placed = 0;
    for (let y = topY; y > topY - 8 && y > SURFACE; y--) {
      const t = this.layer.getTileAt(tx, y);
      if (t && t.index !== TILE.EMPTY && t.index !== TILE.LADDER) break; // blocked by solid
      this.layer.putTileAt(TILE.LADDER, tx, y);
      const idx = y * W + tx;
      if (!this.registry.get('dugTiles').includes(idx)) { /* ladders aren't dug tiles */ }
      placed++;
    }
    if (placed === 0) { Sfx.denied(); return; }
    r.set('ropeLadders', r.get('ropeLadders') - 1);
    Sfx.buy();
    this.fx.float(this.player.x, this.player.y - 18, 'LADDER', '#a8d8b8');
    this.game.events.emit('hud:refresh');
  }

  // ---- death loot: drop your unsold gems as a recoverable stash ----
  dropStash() {
    const r = this.registry;
    const bag = r.get('bag') || [];
    if (!bag.length) { r.set('deathStash', null); return; }
    const stash = { x: this.player.x, y: this.player.y, items: [...bag] };
    r.set('deathStash', stash);
    r.set('bag', []);
    this.spawnStash(stash);
  }

  spawnStash(stash) {
    if (this.stashSprite) this.stashSprite.destroy();
    this.stashSprite = this.add.image(stash.x, stash.y, 'stash').setDepth(9);
    this.stashSprite.stash = stash;
    this.portalGlow(stash.x, stash.y - 6, 0xf2d75c).setDepth(51);
    this.tweens.add({ targets: this.stashSprite, y: stash.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  recoverStash() {
    const r = this.registry;
    const stash = r.get('deathStash');
    if (!stash) return;
    const bag = r.get('bag');
    for (const ore of stash.items) bag.push(ore);
    r.set('deathStash', null);
    if (this.stashSprite) { this.stashSprite.destroy(); this.stashSprite = null; }
    Sfx.pickup();
    this.fx.burst(this.player.x, this.player.y, 0xf2d75c, 12);
    this.fx.float(this.player.x, this.player.y - 20, `+${stash.items.length} GEMS`, '#f2d75c');
    this.game.events.emit('hud:refresh');
    this.save();
  }
}
