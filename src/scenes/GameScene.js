import Phaser from 'phaser';
import Sfx from '../audio.js';
import Player from '../player.js';
import { Enemy, makeEnemyAnims } from '../enemies.js';
import { Boulder } from '../boulder.js';
import { Boss } from '../boss.js';
import { TILE, TILE_INFO, ORES } from '../art.js';
import {
  T, W, H, SURFACE, SHAFT_X, SHAFT_X2, SHAFT_X3, DIVIDER, DIVIDER2,
  ZONES, ZONES_R, ZONES_L, IDOL_ROW, ARTIFACTS, BOSSES, arenaBounds,
  ARENA_CEIL, ARENA_HALF_W,
  generateWorld, zoneOfRow, regionOfX, zoneName, bgTileAt,
} from '../world.js';
import { packExplored, unpackExplored } from '../minimap.js';
import { buildJournal } from '../journal.js';

const SAVE_KEY = 'deepdig-save-v2';

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
    for (const tex of ['player', 'player_fire']) {
      if (!this.anims.exists(`${tex}-walk`)) {
        this.anims.create({
          key: `${tex}-walk`,
          frames: [0, 1, 2, 3].map((f) => ({ key: tex, frame: f })),
          frameRate: 10, repeat: -1,
        });
      }
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
      dashPressed: false, dynaPressed: false, ladderPressed: false, waterPressed: false, recall: false,
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
    this.player.setSkin(this.registry.get('skin') || 'player');
    this.physics.add.collider(this.player, this.layer);
    this.player.body.setCollideWorldBounds(true);
    this.lavaHurtAt = 0;

    // enemies
    this.enemies = this.add.group();
    for (const s of this.world.spawns) this.spawnEnemy(s.type, s.x * T + 8, s.y * T + 8);
    const terrainBound = (e) => e.type !== 'wraith' && e.type !== 'crawler';
    this.physics.add.collider(this.enemies, this.layer, undefined, terrainBound, this);
    this.physics.add.overlap(this.player, this.enemies, (pl, e) => this.touchEnemy(e));

    this.buildBarriers();

    // boulders — heavy rocks that fall when you dig out their support
    this.boulders = this.add.group();
    for (const bd of (this.world.boulders || [])) {
      this.boulders.add(new Boulder(this, bd.x * T + 8, bd.y * T + 8));
    }
    this.physics.add.collider(this.boulders, this.layer);
    this.physics.add.collider(this.boulders, this.boulders);
    this.physics.add.collider(this.player, this.boulders, (pl, bd) => {
      if (bd.phase === 'fall' && bd.body.velocity.y > 80 && bd.y < pl.y + 2) this.crushByBoulder(bd);
    });
    this.physics.add.collider(this.enemies, this.boulders, undefined, terrainBound, this);

    // pickups & projectiles
    this.pickups = this.physics.add.group();
    this.physics.add.collider(this.pickups, this.layer);
    this.physics.add.overlap(this.player, this.pickups, (pl, p) => this.collect(p));
    this.globs = this.physics.add.group();
    this.physics.add.collider(this.globs, this.layer, (g) => this.splat(g));
    this.physics.add.overlap(this.player, this.globs, (pl, g) => {
      this.splat(g); this.damagePlayer(g.x, 1);
    });
    // water-gun jets — cool HOTROCK (solid) on contact; LAVA (non-colliding) is
    // handled per-frame in update() since the jet passes through it.
    this.waterJets = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.waterJets, this.layer, (jet, tile) => this.waterHitsTile(jet, tile));

    this.wireBosses();

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
    d('rightUnlocked', false);  // has the Idol opened the Rift east (frost)?
    d('lavaUnlocked', false);   // has the Crown opened the Ember Rift west (lava)?
    d('idolClaimed', false); d('crownClaimed', false); d('heartClaimed', false);
    d('dungeonKeys', 0);        // keys picked up for the lava dungeon
    d('skin', 'player');        // 'player' | 'player_fire' (fireproof suit)
    d('deathStash', null);      // {x,y,items:[...]} loot dropped on death
    d('placedPortals', []);     // [{x,y}] teleporter kits placed
    d('dugTiles', []);          // indices of removed tiles
    d('placedLadders', []);     // indices of rope-ladder tiles you dropped
    d('activatedCheckpoints', []); // indices of lit checkpoint temples
    d('foundArtifacts', []);    // ids of golden relics collected for the museum
    d('soldOnce', false);       // has the player ever sold a bag? (journal)
    d('bossesKilled', []);      // boss ids beaten — a dead boss stays dead
    d('bossIntros', []);        // boss ids whose intro cutscene has played
    // map fog-of-war: one byte per tile, saved packed to bits
    this.explored = unpackExplored(save?.explored, W * H);
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
      'takenChests', 'carriedStones', 'placedPortals', 'dugTiles', 'placedLadders',
      'activatedCheckpoints', 'respawnPoint', 'ropeLadders', 'rightUnlocked',
      'idolClaimed', 'deathStash', 'lavaUnlocked', 'crownClaimed', 'heartClaimed',
      'dungeonKeys', 'skin', 'foundArtifacts', 'soldOnce', 'bossesKilled',
      'bossIntros']) data[k] = r.get(k);
    if (this.explored) data.explored = packExplored(this.explored);
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
    // rope ladders go back last, so one dropped into a tunnel you dug survives
    for (const idx of (this.registry.get('placedLadders') || [])) this.world.grid[idx] = TILE.LADDER;
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
    this.layer.setCollisionByExclusion([-1, TILE.LADDER, TILE.SPIKE, TILE.LAVA]);
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
    this.npcs = [];
    // desert (start), frost (east), lava (west) districts, each around its shaft
    this.townPortal = this.buildDistrict({
      shaft: SHAFT_X, tint: 0xffffff, portalName: 'Sundrop Town', portalTint: 0xd0e8ff,
      people: [['npc_mara', 'Mara', 'shop'], ['npc_gus', 'Gus', 'gus'], ['npc_mayor', 'Mayor Bell', 'mayor']],
    });
    this.eastPortal = this.buildDistrict({
      shaft: SHAFT_X2, tint: 0x9fc4e6, portalName: 'Frosthaven Town', portalTint: 0xdff0ff,
      people: [['npc_mara', 'Yuki', 'shopEast'], ['npc_gus', 'Frostbeard', 'gusEast'], ['npc_mayor', 'Elder Pyra', 'mayorEast']],
    });
    this.lavaPortal = this.buildDistrict({
      shaft: SHAFT_X3, tint: 0xe0906a, portalName: 'Cinder Reach', portalTint: 0xffb070,
      people: [['npc_mara', 'Cinder', 'shopLava'], ['npc_gus', 'Slag', 'gusLava'], ['npc_mayor', 'Warden Ash', 'mayorLava']],
    });

    // two rifts + the map-edge signs
    this.riftFrost = this.buildRift(DIVIDER, 'rightUnlocked', 0xb07aff, 'THE RIFT', 'SEALED\nRIFT');
    this.riftLava = this.buildRift(DIVIDER2, 'lavaUnlocked', 0xff7a2a, 'EMBER RIFT', 'SEALED\nEMBER RIFT');

    // Museum of Relics — home town (desert), off to the right of the mine
    const gy = SURFACE * T, mx = (SHAFT_X + 16) * T;
    this.add.image(mx, gy + 1, 'bldg_museum').setOrigin(0.5, 1).setDepth(2);
    this.add.text(mx, gy - 66, 'MUSEUM', {
      fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#f2d75c',
      stroke: '#3a2410', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);
    this.museum = { x: mx, y: gy };
  }

  buildDistrict({ shaft, tint, portalName, portalTint, people }) {
    const gy = SURFACE * T;
    // Keep the shop (and its keeper) well clear of the portal so you can't hit
    // the portal menu when you mean to open the shop.
    const props = [
      ['bldg_house', (shaft - 18) * T, 0], ['bldg_shop', (shaft - 11) * T, 0],
      ['barrel', (shaft - 7.5) * T, 0], ['lamppost', (shaft - 14) * T, 0],
      ['lamppost', (shaft + 5) * T, 0], ['minehead', shaft * T + 8, 4],
      ['bldg_house', (shaft + 12) * T, 0],
    ];
    for (const [key, x, dy] of props) {
      const img = this.add.image(x, gy + dy, key).setOrigin(0.5, 1).setDepth(2).setTint(tint);
      if (key === 'minehead') img.setDepth(4);
    }
    const at = [-10, 2, 9]; // shopkeeper far left, Gus, mayor — none near the portal
    people.forEach(([spr, name, dialog], i) => {
      this.npcs.push(this.makeNpc(spr, (shaft + at[i]) * T, gy, name, dialog, tint));
    });
    const portal = { name: portalName, x: (shaft - 4) * T, y: gy };
    this.add.image(portal.x, gy - 1, 'portal').setOrigin(0.5, 1).setDepth(2).setTint(portalTint);
    this.portalGlow(portal.x, gy - 18, portalTint);
    return portal;
  }

  buildRift(col, unlockKey, tint, openLabel, sealedLabel) {
    const gy = SURFACE * T, x = col * T;
    const unlocked = this.registry.get(unlockKey);
    const gate = this.add.image(x, gy - 1, 'portal').setOrigin(0.5, 1).setDepth(3)
      .setScale(1.4).setTint(unlocked ? tint : 0x4a4458);
    const glow = this.portalGlow(x, gy - 26, tint);
    glow.setVisible(unlocked);
    const sign = this.add.text(x, gy - 44, unlocked ? openLabel : sealedLabel, {
      fontFamily: '"Press Start 2P"', fontSize: '7px', color: unlocked ? '#f0c0a0' : '#8a94a2',
      align: 'center', lineSpacing: 4, stroke: '#1a1420', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);
    return { col, unlockKey, tint, openLabel, gate, glow, sign, wall: null };
  }

  // Invisible walls at the map edges + both rifts (until opened).
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
    for (const rift of [this.riftFrost, this.riftLava]) {
      if (!this.registry.get(rift.unlockKey)) {
        // Tall enough that even a double jump can't clear it: top well above the
        // sky, bottom sunk into the surface. Removed once the rift is unlocked.
        const top = -14 * T, bottom = (SURFACE + 4) * T;
        rift.wall = addWall(rift.col * T, bottom - top, (top + bottom) / 2);
      }
    }
    this.physics.add.collider(this.player, this.barriers);
    this.physics.add.collider(this.enemies, this.barriers, undefined, (e) => e.type !== 'wraith' && e.type !== 'crawler', this);
    this.makeSign(2.4 * T, 'MOLTEN\nWASTES', 0xff7a2a);
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
    this.portals = [this.townPortal, this.eastPortal, this.lavaPortal];
    this.gateSprites = [];
    for (const gate of this.world.gates) {
      if (this.registry.get('openGates').includes(gate.key)) this.addGatePortal(gate);
    }
    for (const p of this.registry.get('placedPortals')) this.addPlacedPortal(p.x, p.y, false);

    // finales: Golden Idol (desert), Sun Crown (frost), Heart of the Volcano (lava)
    const finale = (data, key, tint, claimed) => {
      const spr = this.add.image(data.x * T + 8, data.y * T + 14, key)
        .setOrigin(0.5, 1).setDepth(5).setVisible(!claimed);
      if (spr.visible) {
        this.tweens.add({ targets: spr, y: spr.y - 2, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.portalGlow(spr.x, spr.y - 14, tint);
      }
      return spr;
    };
    this.idol = finale(this.world.idol, 'idol', 0xf2d75c, this.registry.get('idolClaimed'));
    this.crown = finale(this.world.crown, 'crown', 0xbfe9ff, this.registry.get('crownClaimed'));
    this.heart = finale(this.world.heart, 'boulder', 0xff6a2a, this.registry.get('heartClaimed'));
    this.heart.setTint(0xff5a2a).setScale(1.2); // Heart of the Volcano (glowing molten core)

    // dungeon keys, the key-door, and the fireproof suit
    this.keySprites = [];
    for (const k of (this.world.keys || [])) {
      const px = k.x * T + 8, py = k.y * T + 10;
      const spr = this.add.image(px, py, 'key').setDepth(5);
      this.tweens.add({ targets: spr, y: py - 3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.portalGlow(px, py, 0xf2b93a);
      this.keySprites.push({ px, py, spr });
    }
    this.keyDoors = [];
    for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
      if (this.world.grid[y * W + x] === TILE.KEYDOOR && this.layer.getTileAt(x, y)) {
        this.keyDoors.push({ x, y, px: x * T + 8, py: y * T + 8, open: false });
      }
    }
    this.suitSprite = null;
    if (this.world.dungeon && this.registry.get('skin') !== 'player_fire') {
      const px = this.world.dungeon.x * T + 8, py = this.world.dungeon.y * T + 14;
      this.suitSprite = this.add.image(px, py, 'suit').setOrigin(0.5, 1).setDepth(5);
      this.tweens.add({ targets: this.suitSprite, y: py - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.portalGlow(px, py - 8, 0xe8721f);
    }

    // hidden golden relics (museum collectibles) — one glowing icon per vault
    this.artifactSprites = [];
    const found = this.registry.get('foundArtifacts') || [];
    for (const a of (this.world.artifacts || [])) {
      if (found.includes(a.id)) continue;
      const meta = ARTIFACTS.find((m) => m.id === a.id);
      if (!meta) continue;
      const px = a.x * T + 8, py = a.y * T + 12;
      const spr = this.add.image(px, py, meta.icon).setDepth(5).setScale(1.05);
      this.tweens.add({ targets: spr, y: py - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.portalGlow(px, py - 4, 0xf2d75c).setDepth(51);
      this.artifactSprites.push({ id: a.id, px, py, spr });
    }

    // Arena braziers. These are ATMOSPHERE only — the room is made readable by
    // dropping the darkness (see updateLighting), because these glows blend
    // additively above the dark layer and will wash a sprite to white if they
    // sit on top of one. Hence: dim, and out at the corners away from the boss.
    for (const meta of BOSSES) {
      const a = arenaBounds([SHAFT_X, SHAFT_X2, SHAFT_X3][meta.region]);
      for (const gx of [a.x0 + 1, a.x1 - 1]) {
        const glow = this.portalGlow(gx * T + 8, a.bottom * T + 6, 0xffa040);
        glow.setAlpha(0.18).setScale(0.12);
        this.tweens.killTweensOf(glow);
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 1300, yoyo: true, repeat: -1 });
      }
    }

    // the three region bosses, each waiting in its finale arena
    this.bosses = this.add.group();
    this.bossByRegion = {};
    const killed = this.registry.get('bossesKilled') || [];
    for (const meta of BOSSES) {
      if (killed.includes(meta.id)) continue;
      const shaftX = [SHAFT_X, SHAFT_X2, SHAFT_X3][meta.region];
      const b = new Boss(this, meta, shaftX);
      this.bosses.add(b);
      this.bossByRegion[meta.region] = b;
    }

    // a loot stash left from a previous death
    this.stashSprite = null;
    const stash = this.registry.get('deathStash');
    if (stash) this.spawnStash(stash);
  }

  addGatePortal(gate) {
    const zones = [ZONES, ZONES_R, ZONES_L][gate.region] || ZONES;
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
    // Boss arenas are torch-lit. Without this the abyss darkness (0.985) would
    // hide the boss completely and the fight would be unreadable. Kept low
    // enough that the boss keeps its own colours instead of reading as a
    // silhouette lit by the braziers.
    if (this.inBossArena()) target = Math.min(target, 0.15);
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
      water: add(k.G), mute: add(k.M), recall: add(k.R), esc: add(k.ESC),
      map: add(k.TAB), journal: add(k.Q),
    };
    this.input.keyboard.addCapture('TAB'); // don't let TAB move browser focus
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
      waterPressed: jp(K.water) || !!t.waterPressed,
      recallDown: K.recall.isDown || !!t.recall,
      mapPressed: jp(K.map),
      journalPressed: jp(K.journal),
    };
    // consume one-shot touch edges so they fire exactly once
    if (t.jumpPressed) t.jumpPressed = false;
    if (t.usePressed) t.usePressed = false;
    if (t.dashPressed) t.dashPressed = false;
    if (t.dynaPressed) t.dynaPressed = false;
    if (t.ladderPressed) t.ladderPressed = false;
    if (t.waterPressed) t.waterPressed = false;
    return inp;
  }

  bindUIEvents() {
    const g = this.game.events;
    g.removeAllListeners('ui:closed'); g.removeAllListeners('shop:buy');
    g.removeAllListeners('portal:go'); g.removeAllListeners('menu:quit');
    g.removeAllListeners('ui:requestMap'); g.removeAllListeners('ui:requestJournal');
    g.on('ui:closed', () => { this.uiOpen = false; });
    g.on('ui:requestMap', () => this.openMap());
    g.on('ui:requestJournal', () => this.openJournal());
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
    this.markExplored(ptx, pty);

    // enemies (only near ones think)
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      if (Math.abs(e.x - px) < 420 && Math.abs(e.y - py) < 320) e.update(time, dtMs, this.player);
      else e.setVelocity(0, (e.body.allowGravity ? e.body.velocity.y : 0));
    });

    // boulders (only nearby ones need support/fall checks)
    this.boulders.getChildren().forEach((bd) => {
      if (bd.active && Math.abs(bd.x - px) < 460 && Math.abs(bd.y - py) < 360) bd.update(time);
    });

    // bosses: only the one whose arena you're in ever thinks
    this.bosses.getChildren().forEach((b) => {
      if (b.active && Math.abs(b.x - px) < 460 && Math.abs(b.y - py) < 300) {
        b.update(time, dtMs, this.player);
      } else if (b.awake && !b.dying) {
        b.reset();                       // walked out mid-fight: it heals up
        this.game.events.emit('boss:hide');
      }
    });

    // spikes at feet
    const feet = this.layer.getTileAtWorldXY(px, py + 10);
    if (feet && feet.index === TILE.SPIKE && this.player.body.velocity.y >= 0) {
      this.damagePlayer(px, 1, true);
    }

    // LAVA burns on contact (the fireproof suit halves it) — check body & feet
    const inLava = [this.layer.getTileAtWorldXY(px, py + 6), this.layer.getTileAtWorldXY(px, py)]
      .some((t) => t && t.index === TILE.LAVA);
    if (inLava && time > this.lavaHurtAt) {
      const suit = this.registry.get('skin') === 'player_fire';
      this.lavaHurtAt = time + (suit ? 900 : 550);
      this.damagePlayer(px, 1);
      this.player.setVelocityY(-180); // little hop out
      this.fx.burst(px, py, 0xff8c2a, 8);
    }

    // water jets: convert LAVA they pass through (LAVA doesn't collide)
    this.waterJets.getChildren().forEach((jet) => {
      if (!jet.active) return;
      const t = this.layer.getTileAtWorldXY(jet.x, jet.y);
      if (t && t.index === TILE.LAVA) { this.coolTile(t); this.killJet(jet); }
      else if (jet.life !== undefined && time > jet.life) this.killJet(jet);
    });

    // pickups magnet — never pull a pickup you can't actually take right now
    // (full bag, or a heart at full health), or it just vibrates on your body.
    const magnet = this.registry.get('upgrades').magnet ? 48 : 20;
    this.pickups.getChildren().forEach((p) => {
      if (!this.canCollect(p)) { p.body.setAllowGravity(true); return; } // let it rest on the ground
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
        if (input.interactPressed) this.openPortalMenu(p);
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
    // key-locked dungeon door — opens if you carry a dungeon key
    for (const kd of this.keyDoors) {
      if (!kd.open && Phaser.Math.Distance.Between(px, py, kd.px, kd.py) < 34) {
        if (this.registry.get('dungeonKeys') > 0) this.openKeyDoor(kd);
        else hint = 'A locked vault door — find the Key';
      }
    }
    // dungeon keys + the fireproof suit
    for (const k of this.keySprites) {
      if (k.spr.active && near(k.px, k.py, 16)) this.takeKey(k);
    }
    if (this.suitSprite && this.suitSprite.active && near(this.suitSprite.x, this.suitSprite.y - 6, 18)) {
      this.takeSuit();
    }
    // golden relics — walk into one to collect it for the museum
    for (const a of (this.artifactSprites || [])) {
      if (a.spr.active && near(a.px, a.py, 16)) this.takeArtifact(a);
    }
    // Museum of Relics (surface, home town) — press E to view your collection
    if (this.museum && near(this.museum.x, this.museum.y - 14, 26)) {
      const found = this.registry.get('foundArtifacts') || [];
      hint = `E — Museum of Relics (${found.length}/${ARTIFACTS.length})`;
      if (input.interactPressed) {
        this.uiOpen = true;
        Sfx.talk();
        this.game.events.emit('museum:open', this.museumData());
      }
    }
    // death-loot stash — recover your dropped gems
    if (this.stashSprite && this.stashSprite.active && near(this.stashSprite.x, this.stashSprite.y - 4, 20)) {
      this.recoverStash();
    }
    // finales: each treasure is guarded — you have to put the boss down first.
    // Idol opens the east Rift, Crown opens the west Ember Rift, the Heart of
    // the Volcano is the true ending.
    const guardedBy = (region) => `${BOSSES[region].name} bars the way — put it down first`;
    if (this.idol.visible && !this.claiming && near(this.idol.x, this.idol.y - 12, 22)) {
      if (this.bossAlive(0)) hint = guardedBy(0); else this.claimIdol();
    }
    if (this.crown.visible && !this.claiming && near(this.crown.x, this.crown.y - 12, 22)) {
      if (this.bossAlive(1)) hint = guardedBy(1); else this.claimCrown();
    }
    if (!this.won && !this.claiming && near(this.heart.x, this.heart.y - 12, 22)) {
      if (this.bossAlive(2)) hint = guardedBy(2); else this.winGame();
    }

    // rift hints
    if (!this.registry.get('rightUnlocked') && Phaser.Math.Distance.Between(px, py, DIVIDER * T, SURFACE * T) < 40) {
      hint = 'The Rift is sealed — claim the Golden Idol below to open it';
    }
    if (!this.registry.get('lavaUnlocked') && Phaser.Math.Distance.Between(px, py, DIVIDER2 * T, SURFACE * T) < 40) {
      hint = 'The Ember Rift is sealed — claim the Sun Crown to open it';
    }

    if (input.dynaPressed) this.throwDynamite();
    if (input.kitPressed) this.placeKit();
    if (input.ladderPressed) this.placeLadder();
    if (input.waterPressed) this.fireWaterGun();
    if (input.mapPressed) this.openMap();
    if (input.journalPressed) this.openJournal();

    this.game.events.emit('hud:hint', hint);
  }

  // ------------------------------------------------------------- atmosphere
  updateAtmosphere(pty, time, dtMs) {
    const zone = zoneOfRow(pty);
    const region = regionOfX(Math.floor(this.player.x / T));
    const r = this.registry;

    // music + zone toast — a live boss overrides the depth mood entirely
    const fighting = this.bosses.getChildren().some((b) => b.active && b.awake && !b.dying);
    const mood = fighting ? 'boss'
      : zone === -1 ? 'town' : zone === 0 ? 'mines' : zone === 1 ? 'caverns' : 'abyss';
    Sfx.setMood(mood);
    const zoneKey = `${region}:${zone}`;
    if (zoneKey !== this.curZoneKey) {
      this.curZoneKey = zoneKey;
      this.curZone = zone;
      if (zone >= 0 && time > this.zoneToastAt + 3500) {
        this.zoneToastAt = time;
        this.game.events.emit('hud:zone', zoneName(Math.floor(this.player.x / T), pty));
      } else if (zone === -1) {
        // surface: name the district you're actually standing in (zoneName already
        // knows all three towns, including Cinder Reach out west)
        this.game.events.emit('hud:zone', zoneName(Math.floor(this.player.x / T), pty));
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

  // ------------------------------------------------------------ map & journal
  // Paint fog-of-war around the player. Above ground the radius is generous so
  // the whole town strip fills in on your first walk through it.
  markExplored(ptx, pty) {
    const R = pty <= SURFACE ? 14 : 6;
    const R2 = R * R;
    for (let dy = -R; dy <= R; dy++) {
      const y = pty + dy;
      if (y < 0 || y >= H) continue;
      const row = y * W;
      for (let dx = -R; dx <= R; dx++) {
        const x = ptx + dx;
        if (x < 0 || x >= W) continue;
        if (dx * dx + dy * dy <= R2) this.explored[row + x] = 1;
      }
    }
  }

  // Snapshot of the live tilemap plus the landmarks worth pinning. Built only
  // when the map is opened, never per frame.
  mapData() {
    const tiles = new Int16Array(W * H).fill(TILE.EMPTY);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = this.layer.getTileAt(x, y);
        if (t) tiles[y * W + x] = t.index;
      }
    }
    const marks = [];
    // only pin towns you can actually reach — an unopened rift keeps its secret
    const towns = [
      { x: SHAFT_X, name: 'Sundrop Flats', open: true },
      { x: SHAFT_X2, name: 'Frosthaven', open: this.registry.get('rightUnlocked') },
      { x: SHAFT_X3, name: 'Cinder Reach', open: this.registry.get('lavaUnlocked') },
    ];
    for (const t of towns) {
      if (t.open) marks.push({ kind: 'town', tx: t.x, ty: SURFACE - 1, label: t.name });
    }
    // gate portals + placed camps (skip the three town pads, already marked)
    for (const p of this.portals.slice(3)) {
      marks.push({
        kind: p.name.startsWith('Camp') ? 'camp' : 'portal',
        tx: Math.floor(p.x / T), ty: Math.floor(p.y / T),
      });
    }
    for (const cp of this.checkpoints) {
      if (cp.activated) marks.push({ kind: 'checkpoint', tx: cp.x, ty: cp.y });
    }
    const stash = this.registry.get('deathStash');
    if (stash) marks.push({ kind: 'stash', tx: Math.floor(stash.x / T), ty: Math.floor(stash.y / T) });

    return {
      tiles,
      explored: this.explored,
      marks,
      player: { tx: Math.floor(this.player.x / T), ty: Math.floor(this.player.y / T) },
      depth: Math.max(0, Math.floor(this.player.y / T) - SURFACE),
      place: zoneName(Math.floor(this.player.x / T), Math.floor(this.player.y / T)),
    };
  }

  openMap() {
    if (this.uiOpen || this.gameOver) return;
    this.uiOpen = true;
    Sfx.select();
    this.game.events.emit('map:open', this.mapData());
  }

  openJournal() {
    if (this.uiOpen || this.gameOver) return;
    this.uiOpen = true;
    Sfx.select();
    this.game.events.emit('journal:open', buildJournal(this.registry));
  }

  // ------------------------------------------------------------------ bosses
  wireBosses() {
    // ceiling rocks the guardian drops — heavy, smashable with the drill
    this.arenaRocks = this.physics.add.group();
    this.physics.add.collider(this.arenaRocks, this.layer, (rock) => this.shatterRock(rock, true));
    this.physics.add.overlap(this.player, this.arenaRocks, (pl, rock) => {
      if (rock.body.velocity.y > 60) { this.damagePlayer(rock.x, 1); this.shatterRock(rock, false); }
    });

    // icicles and fireballs — one group, each shot carries its own damage
    this.bossShots = this.physics.add.group();
    this.physics.add.collider(this.bossShots, this.layer, (shot) => this.popShot(shot));
    this.physics.add.overlap(this.player, this.bossShots, (pl, shot) => {
      this.damagePlayer(shot.x, shot.dmg || 1);
      this.popShot(shot);
    });

    // walking into a boss hurts
    this.physics.add.overlap(this.player, this.bosses, (pl, b) => {
      if (b.awake && !b.dying) this.damagePlayer(b.x, b.contactDmg);
    });
    // the water gun is the molten core's real weakness
    this.physics.add.overlap(this.waterJets, this.bosses, (jet, b) => {
      if (b.awake && !b.dying) b.hit(this.registry.get('pickTier'), this.time.now, 'water');
      this.killJet(jet);
    });
  }

  // Is the player standing in one of the three finale arenas?
  inBossArena() {
    const ty = Math.floor(this.player.y / T);
    if (ty < ARENA_CEIL) return false;
    const tx = Math.floor(this.player.x / T);
    return [SHAFT_X, SHAFT_X2, SHAFT_X3].some((sx) => Math.abs(tx - sx) <= ARENA_HALF_W + 1);
  }

  bossAlive(region) {
    const b = this.bossByRegion?.[region];
    return !!b && b.active && !b.dying;
  }

  onBossWake(boss) {
    const seen = this.registry.get('bossIntros') || [];
    this.game.events.emit('boss:hp', boss.hudState());
    if (seen.includes(boss.kind)) {
      this.game.events.emit('hud:zone', boss.meta.name);
      return;
    }
    seen.push(boss.kind);
    this.registry.set('bossIntros', seen);
    this.uiOpen = true;
    this.game.events.emit('dialog:show', {
      name: boss.meta.name,
      lines: [...boss.meta.intro, boss.meta.tip],
    });
    this.save();
  }

  onBossDied(boss) {
    const killed = this.registry.get('bossesKilled');
    if (!killed.includes(boss.kind)) killed.push(boss.kind);
    delete this.bossByRegion[boss.meta.region];
    this.game.events.emit('boss:hide');
    // it pays out: a pile of coins and a few Relic Orbs
    this.time.delayedCall(700, () => {
      for (let i = 0; i < 8; i++) {
        const p = this.pickups.create(boss.x + Phaser.Math.Between(-16, 16), boss.y, 'coin');
        p.ore = 'coin'; p.coinValue = Phaser.Math.Between(25, 60);
        p.setDepth(12); p.setVelocity(Phaser.Math.Between(-60, 60), -160); p.setBounce(0.4);
      }
      for (let i = 0; i < 3; i++) this.spawnOre(boss.x + i * 6 - 6, boss.y - 4, 'orb');
      this.fx.float(boss.x, boss.y - 30, 'THE WAY IS CLEAR', '#f2d75c');
    });
    // clear anything the fight left lying around
    this.arenaRocks.getChildren().slice().forEach((r) => this.shatterRock(r, false));
    this.bossShots.getChildren().slice().forEach((s) => this.popShot(s));
    this.save();
  }

  resetBosses() {
    this.bosses?.getChildren().forEach((b) => { if (b.awake) b.reset(); });
    this.arenaRocks?.getChildren().slice().forEach((r) => this.shatterRock(r, false));
    this.bossShots?.getChildren().slice().forEach((s) => this.popShot(s));
    this.game.events.emit('boss:hide');
  }

  // ---- boss attacks (called from boss.js) --------------------------------
  // A rock from the ceiling, with a red smear on the floor as the tell.
  dropArenaBoulder(tx, arena) {
    const x = tx * T + 8;
    const warn = this.add.rectangle(x, arena.floor * T - 1, 14, 3, 0xff5a3a, 0.85)
      .setOrigin(0.5, 1).setDepth(6);
    this.tweens.add({
      targets: warn, alpha: 0.15, duration: 190, yoyo: true, repeat: 1,
      onComplete: () => warn.destroy(),
    });
    this.time.delayedCall(430, () => {
      if (!this.arenaRocks) return;
      const rock = this.arenaRocks.create(x, arena.top * T + 6, 'boulder');
      rock.setDepth(9);
      rock.body.setSize(14, 14).setOffset(1, 1);
      rock.body.setAllowGravity(true);
      rock.setVelocityY(70);
      rock.hp = 3;
    });
  }

  shatterRock(rock, landed) {
    if (!rock || !rock.active) return;
    if (landed) { Sfx.thud(); this.cameras.main.shake(90, 0.004); }
    this.fx.burst(rock.x, rock.y, 0x8a94a2, 9);
    this.fx.dust(rock.x, rock.y + 6, 4);
    rock.destroy();
  }

  dropIcicle(tx, arena) {
    if (!this.bossShots) return;
    const shot = this.bossShots.create(tx * T + 8, arena.top * T + 6, 'icicle');
    shot.setDepth(9);
    shot.body.setSize(4, 8);
    shot.body.setAllowGravity(true);
    shot.setVelocityY(120);
    shot.dmg = 1;
  }

  throwFireball(boss, player) {
    if (!this.bossShots) return;
    const shot = this.bossShots.create(boss.x, boss.y - 6, 'fireball');
    shot.setDepth(9);
    shot.body.setSize(6, 6);
    shot.body.setAllowGravity(false);
    const a = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    shot.setVelocity(Math.cos(a) * 210, Math.sin(a) * 210);
    shot.dmg = 1;
    this.tweens.add({ targets: shot, angle: 360, duration: 500, repeat: -1 });
    this.time.delayedCall(4000, () => this.popShot(shot));
  }

  popShot(shot) {
    if (!shot || !shot.active) return;
    this.fx.burst(shot.x, shot.y, shot.texture.key === 'icicle' ? 0xbfe9ff : 0xff8c2a, 6);
    shot.destroy();
  }

  // Lava wells up through the arena floor. The existing LAVA hazard + water gun
  // cooling both work on these tiles for free.
  floodArenaFloor(arena, count) {
    const y = arena.bottom;
    for (let i = 0; i < count * 3 && count > 0; i++) {
      const x = Phaser.Math.Between(arena.x0 + 1, arena.x1 - 1);
      if (this.layer.getTileAt(x, y)) continue;   // already lava or something else
      this.layer.putTileAt(TILE.LAVA, x, y);      // placed tiles don't collide — correct for lava
      this.fx.burst(x * T + 8, y * T + 8, 0xff6a20, 6);
      count--;
    }
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

    // a boss is the biggest target in the room, so it takes the swing first
    let hitBoss = false;
    this.bosses.getChildren().forEach((b) => {
      if (!b.active || !b.awake || b.dying || hitBoss) return;
      if (Phaser.Math.Distance.Between(b.x, b.y, hx, hy) < 24 ||
          Phaser.Math.Distance.Between(b.x, b.y, player.x, player.y) < 26) {
        b.hit(this.registry.get('pickTier'), this.time.now, 'pick');
        hitBoss = true;
      }
    });
    if (hitBoss) return;

    // ceiling rocks in a boss arena: only the drill breaks them, same as boulders
    let hitRock = false;
    (this.arenaRocks?.getChildren() || []).forEach((rk) => {
      if (!rk.active || hitRock) return;
      if (Phaser.Math.Distance.Between(rk.x, rk.y, hx, hy) < 16 ||
          Phaser.Math.Distance.Between(rk.x, rk.y, player.x, player.y) < 16) {
        if (this.registry.get('upgrades').drill) this.shatterRock(rk, false);
        else { Sfx.clank(); this.fx.burst(rk.x, rk.y, 0x8a94a2, 3); }
        hitRock = true;
      }
    });
    if (hitRock) return;

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

    // boulders resist the pickaxe — only the BOULDER DRILL can smash them
    let hitBoulder = false;
    this.boulders.getChildren().forEach((bd) => {
      if (!bd.active || hitBoulder) return;
      if (Phaser.Math.Distance.Between(bd.x, bd.y, hx, hy) < 16 ||
          Phaser.Math.Distance.Between(bd.x, bd.y, player.x, player.y) < 16) {
        if (this.registry.get('upgrades').drill) bd.hit(3);
        else { Sfx.clank(); this.fx.burst(bd.x, bd.y, 0x8a94a2, 3); }
        hitBoulder = true; // either way the swing is spent on the boulder
      }
    });
    if (hitBoulder) return;

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
    if (req.waterGun && !this.registry.get('upgrades').waterGun) return false;
    return true;
  }

  digTileAt(wx, wy) {
    const tile = this.layer.getTileAtWorldXY(wx, wy);
    if (!tile || tile.index === TILE.LADDER || tile.index === TILE.SPIKE || tile.index === TILE.LAVA) return;
    if (tile.index === TILE.KEYDOOR) { Sfx.clank(); return; }
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
        const msg = info.req.firePick ? 'ICE — needs the FIRE PICK'
          : info.req.waterGun ? 'HOT ROCK — cool it with the WATER GUN'
            : `TOO HARD — needs PICKAXE ${'I'.repeat(info.req.pick)}`;
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
    const wasIndex = tile.index;
    this.layer.removeTileAt(tile.x, tile.y);
    this.tileHp.delete(idx);
    this.cracks.get(idx)?.destroy();
    this.cracks.delete(idx);
    const dug = this.registry.get('dugTiles');
    dug.push(idx);
    if (info.ore) this.spawnOre(cx, cy, info.ore);
    // Gated hard blocks (needed Pickaxe III / the Fire Pick) pay off: a rare
    // Relic Orb every time, plus a good chance at a high-value gem for money.
    if (wasIndex === TILE.HARDROCK || wasIndex === TILE.ICE_BLOCK) {
      this.spawnOre(cx, cy, 'orb');
      if (Math.random() < 0.5) this.spawnOre(cx, cy, wasIndex === TILE.ICE_BLOCK ? 'mythril' : 'diamond');
    }
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

  // Can this pickup actually be taken right now? (drives both magnet + collect)
  canCollect(p) {
    const r = this.registry;
    if (p.ore === 'heart') return r.get('hp') < r.get('maxHp');
    if (ORES[p.ore] && p.ore !== 'orb') return (r.get('bag') || []).length < r.get('bagCap');
    return true; // coins, orbs
  }

  collect(p) {
    const r = this.registry;
    if (!this.canCollect(p)) {
      if (p.ore === 'heart' && !p.warned) { Sfx.bagFull(); this.fx.float(p.x, p.y - 8, 'HEALTH FULL', '#e85c5c'); p.warned = true; }
      else if (!p.warned) { Sfx.bagFull(); this.fx.float(p.x, p.y - 8, 'BAG FULL!', '#e85c5c'); p.warned = true; }
      p.body.setAllowGravity(true); // let it rest; magnet leaves it alone until you can take it
      return;
    }
    if (p.ore === 'orb') {
      r.set('orbs', r.get('orbs') + 1);
      Sfx.orb();
      this.fx.float(p.x, p.y - 8, '+1 ORB', '#78d8f0');
    } else if (p.ore === 'heart') {
      r.set('hp', Math.min(r.get('maxHp'), r.get('hp') + 1));
      Sfx.heart();
    } else if (p.ore === 'coin') {
      r.set('coins', r.get('coins') + p.coinValue);
      Sfx.pickup();
      this.fx.float(p.x, p.y - 8, `+${p.coinValue}`, '#f2d75c');
    } else {
      r.get('bag').push(p.ore); // canCollect already guaranteed there's room
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

  // A falling boulder landing on you is lethal — that's the price of digging
  // straight under one. (The 1.4s shake is your warning; the Drill clears them.)
  crushByBoulder(bd) {
    if (this.gameOver || this.player.dead || this.time.now < this.player.invulnUntil) return;
    this.cameras.main.shake(320, 0.016);
    this.fx.burst(this.player.x, this.player.y, 0x8a5e2e, 16);
    this.registry.set('hp', 0);
    this.game.events.emit('hud:refresh');
    this.die();
  }

  // Fall damage: short drops are free, longer ones bite — scaled by tiles fallen.
  applyFallDamage(fellTiles, x) {
    const dmg = Math.min(5, 1 + Math.floor((fellTiles - 8) / 5)); // 8-12:1, 13-17:2, ...
    if (dmg <= 0) return;
    this.cameras.main.shake(140, 0.006);
    this.fx.dust(this.player.x, this.player.y + 11, 8);
    this.fx.float(this.player.x, this.player.y - 18, 'OUCH!', '#e85c5c');
    this.damagePlayer(x, dmg);
  }

  // A landing boulder smashes the single block it comes down on.
  boulderCrushTile(bd) {
    const tx = Math.floor(bd.x / T);
    const ty = Math.floor((bd.body.bottom + 2) / T);
    const tile = this.layer.getTileAt(tx, ty);
    if (!tile) return false;
    const info = TILE_INFO[tile.index];
    if (!info || tile.index === TILE.BEDROCK || tile.index === TILE.GATE || tile.index === TILE.KEYDOOR) return false;
    if (info.req && !this.meetsReq(info.req)) return false; // can't crush what it can't break
    this.breakTile(tile, ty * W + tx, info);
    return true;
  }

  die() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.player.dead = true;
    this.player.setVelocity(0, -200);
    this.player.body.checkCollision.none = true;
    Sfx.die();
    this.resetBosses(); // a boss you nearly beat goes back to full — no chip-away wins
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
    this.player.apexY = rp.y; // don't count the teleport as a fall
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
    const region = st.key.startsWith('r1') ? ZONES_R : st.key.startsWith('r2') ? ZONES_L : ZONES;
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

  takeArtifact(a) {
    a.spr.destroy();
    const r = this.registry;
    const found = r.get('foundArtifacts');
    if (found.includes(a.id)) return;
    found.push(a.id);
    const meta = ARTIFACTS.find((m) => m.id === a.id);
    Sfx.powerup();
    this.fx.burst(a.px, a.py, 0xf2d75c, 16);
    this.fx.float(a.px, a.py - 12, 'RELIC!', '#f2d75c');
    this.game.events.emit('dialog:show', {
      name: 'Golden Relic',
      lines: [`You found the ${meta.name}!`, meta.blurb,
        `Relic ${found.length} of ${ARTIFACTS.length} — show it off at the Museum in town.`],
    });
    this.uiOpen = true;
    this.save();
    this.game.events.emit('hud:refresh');
  }

  // snapshot for the museum panel: every relic, flagged found or not
  museumData() {
    const found = this.registry.get('foundArtifacts') || [];
    return {
      items: ARTIFACTS.map((m) => ({
        name: m.name, blurb: m.blurb, icon: m.icon,
        region: m.region, found: found.includes(m.id),
      })),
    };
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
      // dynamite is a fine answer to a boss (and to its ice shell)
      this.bosses.getChildren().forEach((b) => {
        if (b.active && b.awake && !b.dying &&
            Phaser.Math.Distance.Between(b.x, b.y, dx, dy) < 46) {
          b.hit(6, this.time.now, 'pick');
        }
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

  // The travel menu only ever lists places you've actually opened up: the two
  // far towns stay off it until their rift is unlocked, so you can't warp into
  // Frosthaven or Cinder Reach before earning the way in.
  reachablePortals() {
    const openRegion = [true, !!this.registry.get('rightUnlocked'), !!this.registry.get('lavaUnlocked')];
    return this.portals.filter((p, i) => (i < 3 ? openRegion[i] : true));
  }

  openPortalMenu(here) {
    this.portalMenu = this.reachablePortals();
    this.uiOpen = true;
    this.game.events.emit('portal:open', {
      portals: this.portalMenu.map((q) => q.name),
      from: this.portalMenu.indexOf(here),
    });
  }

  teleportTo(idx) {
    const list = this.portalMenu || this.reachablePortals();
    const p = list[idx];
    if (!p) return;
    Sfx.teleport();
    this.cameras.main.flash(200, 120, 200, 255);
    this.player.setPosition(p.x, p.y - 14);
    this.player.setVelocity(0, 0);
    this.player.apexY = p.y - 14; // don't count the teleport as a fall
    if (p.y <= (SURFACE + 1) * T) this.arriveInTown(); // a surface town pad
  }

  returnToTown() {
    const s = this.registry.get('spawnPoint');
    this.player.setPosition(s.x, s.y);
    this.player.setVelocity(0, 0);
    this.player.apexY = s.y; // don't count the teleport as a fall
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
    if (npc.dialog === 'shop' || npc.dialog === 'shopEast' || npc.dialog === 'shopLava') {
      this.shopKind = npc.dialog === 'shopEast' ? 'east' : npc.dialog === 'shopLava' ? 'lava' : 'west';
      this.sellBag();
      this.game.events.emit('shop:open', this.shopStock(this.shopKind));
    } else if (npc.dialog === 'gusLava') {
      const tips = [
        ['Slag wipes soot from his brow.', 'Buy the WATER GUN off Cinder. Spray lava and it hardens to walkable rock.'],
        ['Slag points down.', 'Halfway down sits a locked vault. The Key is hidden in a cave nearby.'],
        ['Slag grins.', 'That vault holds a Fireproof Suit. You\'ll need it — the lower half is all fire.'],
        ['Slag warns.', 'Below the vault, lava\'s everywhere. No suit, no chance.'],
      ];
      this.game.events.emit('dialog:show', { name: 'Slag', lines: tips[Math.floor(Math.random() * tips.length)] });
    } else if (npc.dialog === 'mayorLava') {
      this.game.events.emit('dialog:show', {
        name: 'Warden Ash',
        lines: ['So the Crown burned open the Ember Rift. Cinder Reach greets you.',
          'The Heart of the Volcano sleeps at the very bottom — the last prize.',
          'Find the vault, don the suit, and brave the Inferno Deep.'],
      });
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
    r.set('soldOnce', true);
    Sfx.sell();
    this.fx.float(this.player.x, this.player.y - 22, `SOLD +${total}`, '#f2d75c');
    this.game.events.emit('hud:refresh');
    this.save();
  }

  // Three shops: 'west' (Mara), 'east' (Yuki), 'lava' (Cinder). Deeper towns
  // unlock higher tiers + their signature tool.
  shopStock(kind) {
    const r = this.registry;
    const u = r.get('upgrades');
    const stock = [];
    const deep = kind === 'east' || kind === 'lava';
    const PICK = { names: ['II', 'III', 'IV', 'V', 'VI'], cost: [60, 220, 600, 1200, 2500] };
    const BAG = { cap: [12, 18, 26, 36, 48], cost: [40, 150, 400, 900, 1800] };
    const LAMP = { names: ['II', 'III', 'IV', 'V'], cap: [150, 220, 320, 430], cost: [50, 180, 450, 1000] };
    const HP = { cost: [80, 200, 500, 900, 1500] };
    const pickMax = deep ? 5 : 3, bagMax = deep ? 4 : 3, lampMax = deep ? 4 : 3, hpMax = deep ? 5 : 3;

    const pickLvl = r.get('pickTier');
    if (pickLvl - 1 < pickMax) stock.push({ id: 'pick', name: `Pickaxe ${PICK.names[pickLvl - 1]}`, desc: 'Digs faster, hits harder', cost: PICK.cost[pickLvl - 1], cur: 'coins' });
    const bagLvl = u.bag || 0;
    if (bagLvl < bagMax) stock.push({ id: 'bag', name: `Bigger Bag (${BAG.cap[bagLvl]})`, desc: 'Carry more loot', cost: BAG.cost[bagLvl], cur: 'coins' });
    const lampLvl = u.lamp || 0;
    if (lampLvl < lampMax) stock.push({ id: 'lamp', name: `Bright Lamp ${LAMP.names[lampLvl]}`, desc: 'Burns longer & brighter', cost: LAMP.cost[lampLvl], cur: 'coins' });
    const hpLvl = u.hp || 0;
    if (hpLvl < hpMax) stock.push({ id: 'hp', name: 'Heart Container', desc: '+1 max health', cost: HP.cost[hpLvl], cur: 'coins' });

    if (kind === 'east' && !u.firePick) stock.push({ id: 'firePick', name: 'FIRE PICK', desc: 'Melts ICE blocks in the deep frost', cost: 1500, cur: 'coins' });
    if (kind === 'lava' && !u.waterGun) stock.push({ id: 'waterGun', name: 'WATER GUN', desc: 'G sprays LAVA/HOT ROCK into cool stone', cost: 1400, cur: 'coins' });
    if (deep) stock.push({ id: 'ladder', name: 'Rope Ladder x3', desc: 'L drops a ladder to climb up', cost: 90, cur: 'coins' });
    if (!u.drill) stock.push({ id: 'drill', name: 'BOULDER DRILL', desc: 'Lets the pickaxe smash boulders', cost: 350, cur: 'coins' });
    stock.push({ id: 'kit', name: 'Teleporter Kit', desc: 'T places a camp portal', cost: 75, cur: 'coins' });
    if (r.get('powers').dynamite) stock.push({ id: 'dyna', name: 'Dynamite x3', desc: 'K goes boom', cost: 60, cur: 'coins' });
    if (!u.armor) stock.push({ id: 'armor', name: 'Leather Armor', desc: 'Halves damage taken', cost: 6, cur: 'orbs' });
    if (!u.magnet) stock.push({ id: 'magnet', name: 'Loot Magnet', desc: 'Pulls loot from afar', cost: 4, cur: 'orbs' });
    if (!u.lucky) stock.push({ id: 'lucky', name: 'Lucky Charm', desc: '+25% sell price', cost: 5, cur: 'orbs' });
    if (!u.steamlamp) stock.push({ id: 'steamlamp', name: 'Steam Lamp', desc: 'Much wider light', cost: 4, cur: 'orbs' });
    stock._kind = kind;
    stock._east = kind !== 'west';
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
    this.game.events.emit('shop:open', this.shopStock(this.shopKind || 'west')); // refresh stock
  }

  // Claiming the Idol: warp to the surface and OPEN THE RIFT east (frost).
  claimIdol() {
    this.claiming = true;
    this.registry.set('idolClaimed', true);
    this.registry.set('rightUnlocked', true);
    Sfx.win();
    this.idol.setDepth(60);
    this.cameras.main.flash(700, 255, 220, 120);
    this.openRift(this.riftFrost);
    this.game.events.emit('dialog:show', {
      name: 'The Golden Idol',
      lines: ['The Idol blazes with light and lifts you to the surface!',
        'Far to the EAST, a sealed Rift cracks open...',
        'A frozen land — and the Sun Crown — await beyond it.'],
    });
    this.uiOpen = true;
    this.time.delayedCall(400, () => { this.idol.setVisible(false); this.returnToTown(); this.claiming = false; });
    this.save();
  }

  // Claiming the Crown: OPEN THE EMBER RIFT west (lava), warp to the surface.
  claimCrown() {
    this.claiming = true;
    this.registry.set('crownClaimed', true);
    this.registry.set('lavaUnlocked', true);
    Sfx.win();
    this.crown.setDepth(60);
    this.cameras.main.flash(700, 255, 160, 80);
    this.openRift(this.riftLava);
    this.game.events.emit('dialog:show', {
      name: 'The Sun Crown',
      lines: ['The Crown\'s fire tears open the EMBER RIFT far to the WEST!',
        'A molten realm waits below Cinder Reach — twice as vast, twice as deadly.',
        'Deep in its heart lies the last treasure: the Heart of the Volcano.'],
    });
    this.uiOpen = true;
    this.time.delayedCall(400, () => { this.crown.setVisible(false); this.returnToTown(); this.claiming = false; });
    this.save();
  }

  openRift(rift) {
    if (rift.wall) { rift.wall.destroy(); rift.wall = null; }
    rift.gate.setTint(rift.tint);
    rift.glow.setVisible(true);
    rift.sign.setText(rift.openLabel).setColor('#f0c0a0');
  }

  winGame() {
    this.won = true;
    this.registry.set('heartClaimed', true);
    Sfx.win();
    this.heart.setDepth(60);
    this.cameras.main.flash(600, 255, 200, 120);
    this.uiOpen = true;
    this.game.events.emit('game:won', {
      coins: this.registry.get('coins'),
      orbs: this.registry.get('orbs'),
    });
    this.save();
  }

  // ---- water gun: cool LAVA/HOTROCK into rock ----
  fireWaterGun() {
    const r = this.registry;
    if (!r.get('upgrades').waterGun) return;
    const now = this.time.now;
    if (now < (this.waterReadyAt || 0)) return;
    this.waterReadyAt = now + 260;
    Sfx.water();
    const p = this.player;
    const jet = this.waterJets.create(p.x + p.facing * 10, p.y + 2, 'water').setDepth(11);
    jet.body.setAllowGravity(false);
    jet.body.setSize(5, 5);
    const dy = p.dead ? 0 : 0;
    jet.setVelocity(p.facing * 300, dy);
    jet.life = now + 500;
  }

  waterHitsTile(jet, tile) {
    if (tile && tile.index === TILE.HOTROCK) this.coolTile(tile);
    this.killJet(jet);
  }

  coolTile(tile) {
    // LAVA -> solid MAGMA_ROCK (a bridge); HOTROCK -> MAGMA_ROCK (now diggable)
    this.layer.putTileAt(TILE.MAGMA_ROCK, tile.x, tile.y);
    this.layer.setCollision(TILE.MAGMA_ROCK, true, false, this.layer.layer);
    this.tileHp.delete(tile.y * W + tile.x);
    Sfx.hiss();
    this.fx.burst(tile.getCenterX(), tile.getCenterY(), 0xbfe4ff, 8);
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(tile.getCenterX() + Phaser.Math.Between(-6, 6), tile.getCenterY() - 8, 'px')
        .setTint(0xeeeeff).setDepth(12).setAlpha(0.7);
      this.tweens.add({ targets: s, y: s.y - 10, alpha: 0, duration: 500, onComplete: () => s.destroy() });
    }
  }

  killJet(jet) {
    if (!jet.active) return;
    this.fx.burst(jet.x, jet.y, 0x9fd4ff, 3);
    jet.destroy();
  }

  // ---- dungeon key & door ----
  takeKey(k) {
    k.spr.destroy();
    this.registry.set('dungeonKeys', this.registry.get('dungeonKeys') + 1);
    Sfx.key();
    this.fx.float(k.px, k.py - 10, 'VAULT KEY', '#f2d75c');
    this.game.events.emit('hud:refresh');
    this.save();
  }

  openKeyDoor(kd) {
    kd.open = true;
    this.registry.set('dungeonKeys', this.registry.get('dungeonKeys') - 1);
    // remove the whole 2-tall door
    for (const yy of [kd.y, kd.y - 1, kd.y + 1]) {
      const t = this.layer.getTileAt(kd.x, yy);
      if (t && t.index === TILE.KEYDOOR) {
        this.layer.removeTileAt(kd.x, yy);
        this.registry.get('dugTiles').push(yy * W + kd.x);
        this.fx.burst(kd.x * T + 8, yy * T + 8, 0xf2b93a, 6);
      }
    }
    Sfx.unlock ? Sfx.unlock() : Sfx.gateOpen();
    this.game.events.emit('hud:refresh');
    this.save();
  }

  takeSuit() {
    this.suitSprite.destroy();
    this.suitSprite = null;
    this.registry.set('skin', 'player_fire');
    this.player.setSkin('player_fire');
    Sfx.powerup();
    this.cameras.main.flash(300, 255, 160, 80);
    this.fx.burst(this.player.x, this.player.y, 0xe8721f, 16);
    this.game.events.emit('dialog:show', {
      name: 'The Fireproof Suit',
      lines: ['You seal on the ancient Fireproof Suit!',
        'Lava now burns you far more slowly — the Inferno Deep is survivable.'],
    });
    this.uiOpen = true;
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
    const saved = r.get('placedLadders');
    let placed = 0;
    for (let y = topY; y > topY - 8 && y > SURFACE; y--) {
      const t = this.layer.getTileAt(tx, y);
      if (t && t.index !== TILE.EMPTY && t.index !== TILE.LADDER) break; // blocked by solid
      this.layer.putTileAt(TILE.LADDER, tx, y);
      const idx = y * W + tx;
      if (!saved.includes(idx)) saved.push(idx); // so the climb-out survives a reload
      placed++;
    }
    if (placed === 0) { Sfx.denied(); return; }
    r.set('ropeLadders', r.get('ropeLadders') - 1);
    Sfx.buy();
    this.fx.float(this.player.x, this.player.y - 18, 'LADDER', '#a8d8b8');
    this.game.events.emit('hud:refresh');
    this.save();
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
