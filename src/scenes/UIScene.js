import Phaser from 'phaser';
import Sfx from '../audio.js';
import { ORES } from '../art.js';
import { SURFACE } from '../world.js';
import { renderMapTexture, MAP_TOP, MAP_ROWS, MARKS } from '../minimap.js';
import { buildJournal } from '../journal.js';

const FONT = '"Press Start 2P"';
const TXT = (size, color = '#f2e6c9') => ({
  fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#14100a', strokeThickness: 3,
});

// Runs on top of the Game scene at native resolution (no zoom), so all HUD,
// dialog boxes, the shop and portal picker live here and stay crisp.
export default class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    const { width: SW, height: SH } = this.scale;
    this.mode = null; // null | 'dialog' | 'shop' | 'portal' | 'museum' | 'map' | 'journal' | 'won'

    // ---- HUD ------------------------------------------------------------
    this.hearts = [];
    this.coinText = this.add.text(16, 40, '', TXT(10, '#f2d75c')).setDepth(10);
    this.orbText = this.add.text(16, 60, '', TXT(10, '#78d8f0')).setDepth(10);
    this.bagText = this.add.text(16, 80, '', TXT(10, '#e8c48a')).setDepth(10);
    this.dynaText = this.add.text(16, 100, '', TXT(10, '#e88b3a')).setDepth(10);
    this.kitText = this.add.text(16, 120, '', TXT(10, '#a8d8b8')).setDepth(10);
    this.ladderText = this.add.text(16, 140, '', TXT(10, '#8fd8a0')).setDepth(10);
    // sits left of the QUESTS/MAP/pause/fullscreen icon row along the top edge
    this.depthText = this.add.text(SW - 200, 15, '', TXT(11, '#c8d0dc')).setOrigin(1, 0).setDepth(10);

    // lantern bar
    this.lampBarBg = this.add.rectangle(SW - 16, 44, 120, 10, 0x14100a).setOrigin(1, 0).setDepth(10).setStrokeStyle(2, 0x5c4820);
    this.lampBar = this.add.rectangle(SW - 18, 46, 116, 6, 0xf2d75c).setOrigin(1, 0).setDepth(11);
    this.lampLabel = this.add.text(SW - 140, 42, 'LAMP', TXT(8, '#c8b060')).setOrigin(1, 0).setDepth(10);

    // current objective, straight from the journal — the one line that tells a
    // new player what this whole world wants from them
    this.objLabel = this.add.text(SW - 16, 64, 'OBJECTIVE', TXT(7, '#c8b060')).setOrigin(1, 0).setDepth(10);
    this.objText = this.add.text(SW - 16, 78, '', {
      ...TXT(8, '#f2d75c'), align: 'right', wordWrap: { width: 250 }, lineSpacing: 4,
    }).setOrigin(1, 0).setDepth(10);

    this.hintText = this.add.text(SW / 2, SH - 64, '', TXT(9, '#ffffff')).setOrigin(0.5).setDepth(10);
    this.zoneText = this.add.text(SW / 2, 90, '', TXT(16, '#f2d75c')).setOrigin(0.5).setDepth(10).setAlpha(0);

    // vignette that deepens with depth
    this.vignette = this.add.graphics().setDepth(5);

    // ---- boss bar (hidden until a boss wakes) ---------------------------
    this.bossBar = this.add.container(0, 0).setDepth(14).setVisible(false);
    const bw = 420;
    this.bossName = this.add.text(SW / 2, SH - 122, '', TXT(10, '#f2e6c9')).setOrigin(0.5);
    this.bossTrack = this.add.rectangle(SW / 2, SH - 104, bw, 12, 0x14100a)
      .setStrokeStyle(2, 0x8a5e2e);
    this.bossFill = this.add.rectangle(SW / 2 - bw / 2 + 3, SH - 104, bw - 6, 7, 0xc94f38)
      .setOrigin(0, 0.5);
    // the frost warden's ice shell rides just under its health
    this.bossShell = this.add.rectangle(SW / 2 - bw / 2 + 3, SH - 94, bw - 6, 4, 0x9fe0f8)
      .setOrigin(0, 0.5);
    this.bossBar.add([this.bossName, this.bossTrack, this.bossFill, this.bossShell]);
    this.bossBarW = bw - 6;

    // controls hint (fades out)
    this.controls = this.add.text(SW / 2, SH - 30,
      'MOVE ←→  JUMP SPACE  DIG X (+↑/↓)  TALK/USE E  MAP TAB  QUESTS Q  RECALL hold R  MUTE M',
      TXT(8, '#b8b09a')).setOrigin(0.5).setDepth(10);
    this.time.delayedCall(12000, () => this.tweens.add({ targets: this.controls, alpha: 0, duration: 1000 }));

    // ---- panels ---------------------------------------------------------
    // above the HUD, the touch pad (40) and the corner icons (45/46), but below
    // the pause overlay (70)
    this.panel = this.add.container(0, 0).setDepth(55).setVisible(false);

    // ---- events from the game scene ------------------------------------
    const g = this.game.events;
    const on = (ev, fn) => { g.removeAllListeners(ev); g.on(ev, fn); };
    on('hud:refresh', () => this.refreshHud());
    on('hud:hint', (h) => this.hintText.setText(h || ''));
    on('hud:depth', (d) => this.setDepthHud(d));
    on('hud:zone', (name) => this.zoneToast(name));
    on('dialog:show', (d) => this.showDialog(d));
    on('shop:open', (stock) => this.showShop(stock));
    on('portal:open', (data) => this.showPortals(data));
    on('museum:open', (data) => this.showMuseum(data));
    on('map:open', (data) => this.showMap(data));
    on('journal:open', (data) => this.showJournal(data));
    on('boss:hp', (s) => this.showBossBar(s));
    on('boss:hide', () => this.hideBossBar());
    on('hud:death', () => this.deathFlash());
    on('game:won', (stats) => this.showWin(stats));

    this.input.keyboard.on('keydown', (ev) => this.handleKey(ev));
    this.input.keyboard.on('keydown-P', () => { if (!this.mode) this.togglePause(); });
    this.buildTouchControls();
    this.installBackButtonHandler();
    this.refreshHud();
  }

  // ============================ on-screen touch controls ==================
  // Left thumb: a 4-way pad (move left/right, climb, and AIM the pickaxe up/
  // down). Right thumb: DIG and JUMP, with a small USE button for talking to
  // NPCs and using portals. The same buttons drive the shop/portal menus.
  buildTouchControls() {
    const params = new URLSearchParams(location.search);
    this.isTouch = this.sys.game.device.input.touch || navigator.maxTouchPoints > 0
      || params.get('touch') === '1' || localStorage.getItem('dd-touch') === '1';
    this.input.addPointer(3); // allow up to ~4 simultaneous fingers

    this.buttons = [
      { id: 'up', x: 120, y: 350, r: 34, label: '▲' },
      { id: 'down', x: 120, y: 452, r: 34, label: '▼' },
      { id: 'left', x: 66, y: 401, r: 34, label: '◀' },
      { id: 'right', x: 174, y: 401, r: 34, label: '▶' },
      { id: 'dig', x: 772, y: 456, r: 46, label: 'DIG', color: 0xc9702e },
      { id: 'jump', x: 888, y: 452, r: 52, label: 'JUMP', color: 0x3a7d5f },
      { id: 'use', x: 812, y: 350, r: 30, label: 'USE', color: 0x3a5f8a },
      // contextual ability buttons — only shown once unlocked / while stocked
      { id: 'dash', x: 690, y: 386, r: 28, label: 'DASH', color: 0x9a5ac0, ability: 'dash' },
      { id: 'bomb', x: 730, y: 320, r: 28, label: 'BOMB', color: 0xd0562e, ability: 'dynamite' },
      { id: 'ladder', x: 636, y: 330, r: 26, label: 'LADR', color: 0x4a8a5a, ability: 'ladder' },
      { id: 'water', x: 690, y: 300, r: 28, label: 'WATER', color: 0x3a8ac0, ability: 'waterGun' },
      // always-available: hold to recall to town
      { id: 'recall', x: 876, y: 300, r: 26, label: 'HOME', color: 0x3a6a9a },
    ];
    this.ctrlG = this.add.graphics().setScrollFactor(0).setDepth(40);
    this.ctrlLabels = this.buttons.map((b) => this.add.text(b.x, b.y, b.label, {
      fontFamily: FONT, fontSize: b.r > 40 ? '9px' : '7px', color: '#f6ecd6',
      stroke: '#14100a', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41));
    this.prevPressed = new Set();
    this.enabled = new Set();
    this.setControlsVisible(this.isTouch);

    this.buildFullscreenButton();
    this.buildPauseButton();
    this.buildPanelButtons();
    this.buildPauseOverlay();

    // Auto-pause when the tab/app is hidden or the device screen turns off, so
    // the game (and its music) never keep running in the background.
    this._onHidden = () => { if (document.hidden) this.pauseGame(); };
    document.addEventListener('visibilitychange', this._onHidden);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', this._onHidden));

    // reveal the pad as soon as a real touch happens; hide again if a key is used
    this.input.on('pointerdown', (p) => { if (p.wasTouch) this.setControlsVisible(true); });
    this.input.keyboard.on('keydown', () => { if (!this.isTouch) this.setControlsVisible(false); });
  }

  // A fullscreen toggle in the top-right corner (works on PC and mobile).
  buildFullscreenButton() {
    const SW = this.scale.width;
    const bx = SW - 26, by = 24, s = 9;
    const zone = this.add.rectangle(bx, by, 34, 30, 0x000000, 0.28)
      .setScrollFactor(0).setDepth(45).setInteractive({ useHandCursor: true });
    const icon = this.add.graphics().setScrollFactor(0).setDepth(46);
    const paint = () => {
      icon.clear();
      icon.lineStyle(2, 0xf2e6c9, 0.9);
      const on = this.scale.isFullscreen;
      // four corner brackets (arrows point in when fullscreen, out when not)
      const c = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (const [sx, sy] of c) {
        const cx = bx + sx * s, cy = by + sy * s;
        icon.beginPath();
        if (on) { icon.moveTo(cx, cy - sy * 6); icon.lineTo(cx, cy); icon.lineTo(cx - sx * 6, cy); }
        else { icon.moveTo(cx - sx * 6, cy); icon.lineTo(cx, cy); icon.lineTo(cx, cy - sy * 6); }
        icon.strokePath();
      }
    };
    paint();
    zone.on('pointerdown', () => {
      if (this.mode) return;            // a panel is on top of this icon
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
      Sfx.select();
    });
    this.scale.on('enterfullscreen', paint);
    this.scale.on('leavefullscreen', paint);
  }

  // Pause button (top-right, left of the fullscreen icon) — two bars.
  buildPauseButton() {
    const SW = this.scale.width;
    const bx = SW - 62, by = 24;
    const zone = this.add.rectangle(bx, by, 34, 30, 0x000000, 0.28)
      .setScrollFactor(0).setDepth(45).setInteractive({ useHandCursor: true });
    const icon = this.add.graphics().setScrollFactor(0).setDepth(46);
    icon.fillStyle(0xf2e6c9, 0.9);
    icon.fillRect(bx - 6, by - 7, 4, 14);
    icon.fillRect(bx + 2, by - 7, 4, 14);
    zone.on('pointerdown', () => { if (!this.mode) this.togglePause(); });
  }

  // MAP / QUESTS taps, sitting alongside the pause + fullscreen icons so phone
  // players can reach both panels without a keyboard. Tapping again closes.
  buildPanelButtons() {
    const SW = this.scale.width;
    const mk = (bx, bw, label, mode, request) => {
      const zone = this.add.rectangle(bx, 24, bw, 30, 0x000000, 0.28)
        .setScrollFactor(0).setDepth(45).setInteractive({ useHandCursor: true });
      this.add.text(bx, 24, label, TXT(7, '#f2e6c9')).setOrigin(0.5)
        .setScrollFactor(0).setDepth(46);
      zone.on('pointerdown', () => {
        if (this.paused) return;
        if (this.mode === mode) { this.menuCancel(); return; }
        if (this.mode) return;             // some other panel owns the screen
        this.game.events.emit(request);
      });
    };
    mk(SW - 104, 40, 'MAP', 'map', 'ui:requestMap');
    mk(SW - 158, 56, 'QUESTS', 'journal', 'ui:requestJournal');
  }

  buildPauseOverlay() {
    const { width: SW, height: SH } = this.scale;
    this.pauseOverlay = this.add.container(0, 0).setDepth(70).setVisible(false);
    this.pauseBg = this.add.rectangle(SW / 2, SH / 2, SW, SH, 0x05040a, 0.82);
    const title = this.add.text(SW / 2, SH / 2 - 30, 'PAUSED', TXT(28, '#f2d75c')).setOrigin(0.5);
    const hint = this.add.text(SW / 2, SH / 2 + 22, 'tap here or press P to resume', TXT(10, '#d8c8a8')).setOrigin(0.5);
    this.pauseBg.on('pointerdown', () => this.resumeGame());
    this.pauseOverlay.add([this.pauseBg, title, hint]);
    this.paused = false;
  }

  togglePause() { this.paused ? this.resumeGame() : this.pauseGame(); }

  pauseGame() {
    if (this.paused) return;
    this.paused = true;
    this.pushNavGuard();   // so the Android back button resumes instead of leaving
    Sfx.pauseAudio();
    // release any held touch input so nothing lingers on resume
    const t = this.registry.get('touch');
    if (t) for (const k of Object.keys(t)) t[k] = false;
    this.pauseOverlay.setVisible(true);
    this.pauseBg.setInteractive();
    if (this.scene.isActive('Game')) this.scene.pause('Game');
  }

  resumeGame() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOverlay.setVisible(false);
    this.pauseBg.disableInteractive();
    if (this.scene.isPaused('Game')) this.scene.resume('Game');
    Sfx.resumeAudio();
    if (!this.mode) this.popNavGuard();   // a panel underneath keeps the guard
  }

  setControlsVisible(v) {
    this.controlsOn = v;
    this.ctrlG?.setVisible(v);
    this.ctrlLabels?.forEach((l) => l.setVisible(v));
    if (v && this.controls) this.controls.setVisible(false); // hide the keyboard hint line
  }

  // which ability buttons are currently usable (unlocked / stocked)
  refreshEnabled() {
    const r = this.registry;
    this.enabled = new Set();
    const powers = r.get('powers') || {};
    for (const b of this.buttons) {
      if (!b.ability) { this.enabled.add(b.id); continue; }
      if (b.ability === 'dash' && powers.dash) this.enabled.add(b.id);
      if (b.ability === 'dynamite' && powers.dynamite && (r.get('dynamite') || 0) > 0) this.enabled.add(b.id);
      if (b.ability === 'ladder' && (r.get('ropeLadders') || 0) > 0) this.enabled.add(b.id);
      if (b.ability === 'waterGun' && (r.get('upgrades') || {}).waterGun) this.enabled.add(b.id);
    }
  }

  pollTouch() {
    const pressed = new Set();
    const ptrs = [this.input.pointer1, this.input.pointer2, this.input.pointer3,
      this.input.pointer4, this.input.mousePointer].filter(Boolean);
    for (const p of ptrs) {
      if (!p.isDown) continue;
      for (const b of this.buttons) {
        if (!this.enabled.has(b.id)) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy <= (b.r + 6) * (b.r + 6)) pressed.add(b.id);
      }
    }
    return pressed;
  }

  drawControls(pressed) {
    const g = this.ctrlG;
    g.clear();
    this.buttons.forEach((b, i) => {
      const show = this.enabled.has(b.id);
      this.ctrlLabels[i].setVisible(show && this.controlsOn);
      if (!show) return;
      const on = pressed.has(b.id);
      g.fillStyle(0x000000, 0.28);
      g.fillCircle(b.x, b.y + 2, b.r + 2);
      g.fillStyle(b.color ?? 0x6a6a7a, on ? 0.9 : 0.4);
      g.fillCircle(b.x, b.y, b.r);
      g.lineStyle(2, 0xffffff, on ? 0.95 : 0.4);
      g.strokeCircle(b.x, b.y, b.r);
    });
  }

  update() {
    if (this.paused || !this.controlsOn) return; // frozen while paused
    this.refreshEnabled();
    const pressed = this.pollTouch();
    const just = (id) => pressed.has(id) && !this.prevPressed.has(id);
    const t = this.registry.get('touch');
    if (t) {
      if (this.mode) {
        // a menu/dialog is open: buttons navigate it, don't drive the avatar
        t.left = t.right = t.up = t.down = t.jump = t.dig = t.use = t.recall = false;
        if (just('up')) this.menuNav(-1);
        if (just('down')) this.menuNav(1);
        if (just('dig') || just('use')) this.menuConfirm();
        if (just('jump')) this.menuCancel();
      } else {
        t.left = pressed.has('left'); t.right = pressed.has('right');
        t.up = pressed.has('up'); t.down = pressed.has('down');
        t.jump = pressed.has('jump'); t.dig = pressed.has('dig'); t.use = pressed.has('use');
        t.recall = pressed.has('recall'); // held to warp home
        if (just('jump')) t.jumpPressed = true;
        if (just('use')) t.usePressed = true;
        if (just('dash')) t.dashPressed = true;
        if (just('bomb')) t.dynaPressed = true;
        if (just('ladder')) t.ladderPressed = true;
        if (just('water')) t.waterPressed = true;
      }
    }
    this.prevPressed = pressed;
    this.drawControls(pressed);
  }

  // ------------------------------------------------------------------ HUD
  refreshHud() {
    const r = this.registry;
    const maxHp = r.get('maxHp') || 3, hp = r.get('hp') ?? maxHp;
    while (this.hearts.length < maxHp) {
      const h = this.add.image(24 + this.hearts.length * 22, 22, 'heart').setScale(2).setDepth(10);
      this.hearts.push(h);
    }
    this.hearts.forEach((h, i) => {
      h.setVisible(i < maxHp);
      h.setTint(i < hp ? 0xffffff : 0x333333);
      h.setAlpha(i < hp ? 1 : 0.5);
    });
    this.coinText.setText(`$ ${r.get('coins') ?? 0}`);
    this.orbText.setText(`◉ ${r.get('orbs') ?? 0} orbs`);
    const bag = r.get('bag') || [];
    this.bagText.setText(`BAG ${bag.length}/${r.get('bagCap') ?? 8}`);
    const dyna = r.get('dynamite') || 0;
    this.dynaText.setText(dyna > 0 ? `DYNAMITE x${dyna} (K)` : '');
    const kits = r.get('teleKits') || 0;
    this.kitText.setText(kits > 0 ? `TELE-KIT x${kits} (T)` : '');
    const ladders = r.get('ropeLadders') || 0;
    this.ladderText.setText(ladders > 0 ? `ROPE LADDER x${ladders} (L)` : '');

    const j = buildJournal(r);
    this.objText.setText(j.current ? j.current.text : 'Nothing left undone. The world is yours.');
    this.objLabel.setVisible(true);
  }

  setDepthHud(d) {
    this.depthText.setText(`${d}m`);
    const r = this.registry;
    const frac = Math.max(0, Math.min(1, (r.get('lamp') ?? 100) / (r.get('lampCap') || 100)));
    this.lampBar.width = 116 * frac;
    this.lampBar.setFillStyle(frac > 0.3 ? 0xf2d75c : 0xe85c5c);
    const dim = this.registry.get('lamp') <= 0.01;
    this.lampLabel.setColor(dim ? '#e85c5c' : '#c8b060');
    // vignette: none in town, heavy in the abyss
    const { width: SW, height: SH } = this.scale;
    const strength = Math.min(0.55, d / 260 * 0.7);
    this.vignette.clear();
    if (strength > 0.02) {
      this.vignette.fillStyle(0x060410, strength);
      const t = 70;
      this.vignette.fillRect(0, 0, SW, t);
      this.vignette.fillRect(0, SH - t, SW, t);
      this.vignette.fillRect(0, 0, t, SH);
      this.vignette.fillRect(SW - t, 0, t, SH);
    }
  }

  showBossBar({ name, hp, maxHp, shell, maxShell, tint }) {
    this.bossBar.setVisible(true);
    this.bossName.setText(name);
    this.bossFill.setFillStyle(tint || 0xc94f38);
    // tween the drain so a big hit reads as a big hit
    this.tweens.add({
      targets: this.bossFill, displayWidth: Math.max(0, this.bossBarW * (hp / maxHp)),
      duration: 180, ease: 'Quad.Out',
    });
    const hasShell = shell > 0;
    this.bossShell.setVisible(hasShell);
    if (hasShell) this.bossShell.displayWidth = this.bossBarW * (shell / maxShell);
  }

  hideBossBar() {
    this.bossBar.setVisible(false);
  }

  zoneToast(name) {
    this.zoneText.setText(name).setAlpha(0);
    this.tweens.add({
      targets: this.zoneText, alpha: 1, duration: 500, yoyo: true, hold: 1600,
    });
  }

  deathFlash() {
    const { width: SW, height: SH } = this.scale;
    const black = this.add.rectangle(SW / 2, SH / 2, SW, SH, 0x000000, 0).setDepth(30);
    const msg = this.add.text(SW / 2, SH / 2, 'The depths claim another dream...\nYour gems dropped where you fell — go get them!',
      { ...TXT(11, '#e85c5c'), align: 'center', lineSpacing: 6 }).setOrigin(0.5).setDepth(31).setAlpha(0);
    this.tweens.add({ targets: black, fillAlpha: 0.75, duration: 500 });
    this.tweens.add({ targets: msg, alpha: 1, duration: 500 });
    this.time.delayedCall(1500, () => {
      this.tweens.add({
        targets: [black, msg], alpha: 0, fillAlpha: 0, duration: 400,
        onComplete: () => { black.destroy(); msg.destroy(); },
      });
    });
  }

  // --------------------------------------------------------------- panels
  clearPanel() {
    this.panel.removeAll(true);
    this.panel.setVisible(false);
    this.mode = null;
  }

  // Every panel opens through here, so the Android back-button guard can never
  // be forgotten when a new panel type is added.
  beginPanel(mode) {
    this.clearPanel();
    this.mode = mode;
    this.pushNavGuard();
  }

  closePanel() {
    this.popNavGuard();
    this.clearPanel();
    this.game.events.emit('ui:closed');
  }

  // ---- hardware / browser back button ----------------------------------
  // On Android the system back button would otherwise leave the game entirely.
  // While a panel is open we hold one history entry, so back closes the panel
  // instead — the same thing the on-screen X does.
  installBackButtonHandler() {
    this.navGuard = false;
    this._onPopState = () => {
      this.navGuard = false;          // the entry we pushed is already gone
      if (this.mode) { Sfx.select(); this.closePanel(); }
      else if (this.paused) this.resumeGame();
    };
    window.addEventListener('popstate', this._onPopState);
    this.events.once('shutdown', () => window.removeEventListener('popstate', this._onPopState));
  }

  pushNavGuard() {
    if (this.navGuard) return;        // one entry is enough, however deep we go
    this.navGuard = true;
    try { history.pushState({ ddPanel: true }, ''); } catch { this.navGuard = false; }
  }

  popNavGuard() {
    if (!this.navGuard) return;
    this.navGuard = false;
    try { history.back(); } catch { /* nothing to go back to */ }
  }

  // A visible way out of every panel. Touch players had no discoverable close
  // control at all — tapping the JUMP pad worked, but nothing said so.
  addCloseButton(x, y) {
    // Nothing else in the panel is interactive, so this button owns every tap
    // it covers. The HUD icons underneath refuse taps while a panel is open.
    const btn = this.add.rectangle(x, y, 30, 30, 0x3a2410, 0.95)
      .setStrokeStyle(2, 0xc08618).setDepth(90).setInteractive({ useHandCursor: true });
    const glyph = this.add.text(x, y, 'X', TXT(11, '#f2d75c')).setOrigin(0.5).setDepth(91);
    btn.on('pointerover', () => btn.setFillStyle(0x5c3a18, 0.95));
    btn.on('pointerout', () => btn.setFillStyle(0x3a2410, 0.95));
    // pointerup, not pointerdown: a tap that opened the panel can't close it too
    btn.on('pointerup', () => this.menuCancel());
    this.panel.add([btn, glyph]);
    return btn;
  }

  panelBox(w, h, title) {
    const { width: SW, height: SH } = this.scale;
    const x = SW / 2, y = SH / 2;
    const bg = this.add.rectangle(x, y, w, h, 0x1a140a, 0.96).setStrokeStyle(3, 0x8a5e2e);
    const bg2 = this.add.rectangle(x, y, w - 10, h - 10).setStrokeStyle(1, 0x5c4820);
    const t = this.add.text(x, y - h / 2 + 22, title, TXT(13, '#f2d75c')).setOrigin(0.5);
    this.panel.add([bg, bg2, t]);
    this.panel.setVisible(true);
    this.addCloseButton(x + w / 2 - 24, y - h / 2 + 24);
    return { x, y, w, h };
  }

  // ---- dialog -----------------------------------------------------------
  showDialog({ name, lines }) {
    this.beginPanel('dialog');
    const { width: SW, height: SH } = this.scale;
    const w = Math.min(680, SW - 80), h = 130;
    const x = SW / 2, y = SH - h / 2 - 24;
    const bg = this.add.rectangle(x, y, w, h, 0x1a140a, 0.96).setStrokeStyle(3, 0x8a5e2e);
    const nm = this.add.text(x - w / 2 + 14, y - h / 2 + 10, name, TXT(10, '#f2d75c'));
    const body = this.add.text(x - w / 2 + 14, y - h / 2 + 34, lines.join('\n'),
      { ...TXT(9), lineSpacing: 8, wordWrap: { width: w - 28 } });
    const hintT = this.add.text(x + w / 2 - 14, y + h / 2 - 18, 'E / ESC', TXT(8, '#b8b09a')).setOrigin(1, 0);
    this.panel.add([bg, nm, body, hintT]);
    this.panel.setVisible(true);
    this.addCloseButton(x + w / 2 - 22, y - h / 2 + 20);
  }

  // ---- shop -------------------------------------------------------------
  showShop(stock) {
    this.beginPanel('shop');
    this.stock = stock;
    this.sel = Math.min(this.sel || 0, stock.length - 1);
    const rows = stock.length;
    const title = stock._kind === 'lava' ? "CINDER'S FORGE"
      : stock._kind === 'east' ? "YUKI'S FROST EMPORIUM" : "MARA'S TRADING POST";
    const { x, y, w, h } = this.panelBox(580, 132 + rows * 26, title);
    this.add.text(0, 0, '');
    const r = this.registry;
    const orbIcon = this.add.image(x - 92, y - h / 2 + 44, 'orb').setScale(1.3);
    const balance = this.add.text(x - 78, y - h / 2 + 38,
      `you have  $ ${r.get('coins')}      ${r.get('orbs')} Relic Orbs`, TXT(9, '#b8d8a0'));
    const hint = this.add.text(x, y - h / 2 + 58,
      'Relic Orbs come from glowing HARD & ICE blocks (need Pickaxe III / Fire Pick)',
      TXT(7, '#78c8f0')).setOrigin(0.5);
    this.panel.add([orbIcon, balance, hint]);
    this.shopRows = [];
    stock.forEach((item, i) => {
      const ry = y - h / 2 + 82 + i * 26;
      const isOrb = item.cur === 'orbs';
      const afford = r.get(item.cur) >= item.cost;
      const row = this.add.text(x - w / 2 + 34, ry,
        `${item.name.padEnd(20)} ${item.cost}${isOrb ? ' orb' : ''}`,
        TXT(9, afford ? '#f2e6c9' : '#7a6a55'));
      // orb-cost items are flagged with the Relic Orb icon at the row's edge
      if (isOrb) this.panel.add(this.add.image(x - w / 2 + 18, ry + 5, 'orb').setScale(1.2));
      else this.panel.add(this.add.text(x - w / 2 + 14, ry, '$', TXT(9, '#f2d75c')));
      const desc = this.add.text(x + w / 2 - 24, ry, item.desc, TXT(7, '#9a8c72')).setOrigin(1, 0);
      this.panel.add([row, desc]);
      this.shopRows.push(row);
    });
    const foot = this.add.text(x, y + h / 2 - 20, '↑↓ choose   ENTER buy   ESC leave', TXT(8, '#b8b09a')).setOrigin(0.5);
    this.panel.add(foot);
    this.paintShopSel();
  }

  paintShopSel() {
    this.shopRows.forEach((row, i) => {
      row.setText(row.text.replace(/^> /, ''));
      if (i === this.sel) row.setText(`> ${row.text}`);
    });
  }

  // ---- portals ----------------------------------------------------------
  showPortals({ portals, from }) {
    this.beginPanel('portal');
    this.portalList = portals;
    this.sel = 0;
    const { x, y, h } = this.panelBox(480, 110 + portals.length * 26, 'PORTAL NETWORK');
    this.portalRows = [];
    portals.forEach((name, i) => {
      const ry = y - h / 2 + 58 + i * 26;
      const row = this.add.text(x - 200, ry, `${name}${i === from ? '  (here)' : ''}`,
        TXT(9, i === from ? '#7a6a55' : '#f2e6c9'));
      this.panel.add(row);
      this.portalRows.push(row);
    });
    const foot = this.add.text(x, y + h / 2 - 20, '↑↓ choose   ENTER travel   ESC close', TXT(8, '#b8b09a')).setOrigin(0.5);
    this.panel.add(foot);
    this.paintPortalSel();
  }

  paintPortalSel() {
    this.portalRows.forEach((row, i) => {
      row.setText(row.text.replace(/^> /, ''));
      if (i === this.sel) row.setText(`> ${row.text}`);
    });
  }

  // ---- museum of relics -------------------------------------------------
  showMuseum({ items }) {
    this.beginPanel('museum');
    const foundCount = items.filter((i) => i.found).length;
    const cols = 4, cellW = 116, cellH = 88;
    const w = cols * cellW + 92, h = 3 * cellH + 104;
    const { x, y } = this.panelBox(w, h, 'MUSEUM OF RELICS');
    const sub = this.add.text(x, y - h / 2 + 40,
      `${foundCount} / ${items.length} relics recovered`,
      TXT(9, foundCount === items.length ? '#f2d75c' : '#b8d8a0')).setOrigin(0.5);
    this.panel.add(sub);
    const gx = x - (cols * cellW) / 2 + cellW / 2;
    const gy = y - h / 2 + 74;
    items.forEach((it, i) => {
      const cx = gx + (i % cols) * cellW;
      const cy = gy + Math.floor(i / cols) * cellH;
      const box = this.add.rectangle(cx, cy + 22, cellW - 14, cellH - 12,
        it.found ? 0x2a2212 : 0x141017).setStrokeStyle(2, it.found ? 0x8a6c30 : 0x36303f);
      this.panel.add(box);
      if (it.found) {
        const icon = this.add.image(cx, cy + 6, it.icon).setScale(2.6);
        const nm = this.add.text(cx, cy + 34, it.name,
          { ...TXT(6, '#f2e6c9'), align: 'center', wordWrap: { width: cellW - 22 } }).setOrigin(0.5, 0);
        this.panel.add([icon, nm]);
      } else {
        const q = this.add.text(cx, cy + 6, '?', TXT(18, '#4a4458')).setOrigin(0.5);
        const nm = this.add.text(cx, cy + 34, 'UNDISCOVERED', TXT(6, '#6a6270')).setOrigin(0.5, 0);
        this.panel.add([q, nm]);
      }
    });
    ['DESERT', 'FROST', 'LAVA'].forEach((rn, r) => {
      const lbl = this.add.text(x - w / 2 + 12, gy + r * cellH + 22, rn, TXT(7, '#9a8c72')).setOrigin(0, 0.5);
      this.panel.add(lbl);
    });
    const foot = this.add.text(x, y + h / 2 - 20, 'ESC / E — leave', TXT(8, '#b8b09a')).setOrigin(0.5);
    this.panel.add(foot);
  }

  // ---- world map --------------------------------------------------------
  // Full-screen panel: the tile map blown up 2x, a depth ruler down the left,
  // landmark pins, and a blinking dot for you.
  showMap(data) {
    this.beginPanel('map');
    const { width: SW, height: SH } = this.scale;
    const S = 2;                                    // screen px per world tile
    renderMapTexture(this, 'mapview', data.tiles, data.explored);
    const img = this.add.image(SW / 2, 0, 'mapview').setOrigin(0.5, 0).setScale(S);
    const mapW = img.width * S, mapH = MAP_ROWS * S;
    // town name labels sit in the strip above the map, so the map starts low
    // enough to leave them room
    const top = 20;
    img.setY(top);
    const left = SW / 2 - mapW / 2;

    const bg = this.add.rectangle(SW / 2, SH / 2, SW, SH, 0x07060e, 0.97);
    const frame = this.add.rectangle(SW / 2, top + mapH / 2, mapW + 4, mapH + 4)
      .setStrokeStyle(2, 0x8a5e2e);
    this.panel.add([bg, frame, img]);
    this.panel.setVisible(true);
    img.setDepth(1); frame.setDepth(2);

    // tile -> screen
    const sx = (tx) => left + tx * S;
    const sy = (ty) => top + (ty - MAP_TOP) * S;

    // depth ruler every 40m, down the left margin
    for (let m = 0; m <= 250; m += 40) {
      const y = sy(SURFACE + m);
      if (y < top || y > top + mapH) continue;
      const lbl = this.add.text(left - 10, y, `${m}m`, TXT(6, '#8a94a2')).setOrigin(1, 0.5);
      const tick = this.add.rectangle(left - 6, y, 4, 1, 0x5c5468).setOrigin(0.5);
      this.panel.add([lbl, tick]);
    }

    // landmark pins
    for (const m of data.marks) {
      const color = MARKS[m.kind] || 0xffffff;
      const pin = this.add.rectangle(sx(m.tx), sy(m.ty), 5, 5, color).setDepth(3);
      this.panel.add(pin);
      if (m.label) {
        const lbl = this.add.text(sx(m.tx), sy(m.ty) - 8, m.label, TXT(6, '#f2d75c'))
          .setOrigin(0.5, 1).setDepth(3);
        this.panel.add(lbl);
      }
    }

    // you (blinking, so it never hides under a pin)
    const me = this.add.rectangle(sx(data.player.tx), sy(data.player.ty), 7, 7, 0xffffff)
      .setStrokeStyle(1, 0x000000).setDepth(4);
    this.panel.add(me);
    this.tweens.add({ targets: me, alpha: 0.15, duration: 420, yoyo: true, repeat: -1 });

    // legend + where you are, tucked into the left margin under the ruler
    const legend = [
      ['dug tunnel', 0x8e8272], ['ore vein', ORES.gold.color], ['ladder', 0x8fd8a0],
      ['sealed gate', 0xb07aff], ['lava', 0xff6a20], ['portal', MARKS.portal],
      ['camp', MARKS.camp], ['checkpoint', MARKS.checkpoint], ['lost gems', MARKS.stash],
    ];
    // title lives in the left margin, clear of the town labels along the top
    const lx = 18;
    let ly = 20;
    const title = this.add.text(lx, ly, 'WORLD MAP', TXT(11, '#f2d75c'));
    this.panel.add(title);
    ly += 30;
    const you = this.add.text(lx, ly, `${data.place}\n${data.depth}m down`,
      { ...TXT(7, '#f2e6c9'), lineSpacing: 4 });
    this.panel.add(you);
    ly += 34;
    for (const [name, color] of legend) {
      const sw = this.add.rectangle(lx + 4, ly + 4, 7, 7, color);
      const lbl = this.add.text(lx + 14, ly, name, TXT(6, '#b8b09a'));
      this.panel.add([sw, lbl]);
      ly += 14;
    }

    const foot = this.add.text(SW / 2, SH - 5, 'TAB / ESC — close      Q — quest journal',
      TXT(8, '#b8b09a')).setOrigin(0.5, 1);
    this.panel.add(foot);
    this.addCloseButton(SW - 28, 28);
  }

  // ---- quest journal ----------------------------------------------------
  showJournal(data) {
    this.beginPanel('journal');
    const { width: SW, height: SH } = this.scale;
    const BOXW = 720;
    const bg = this.add.rectangle(SW / 2, SH / 2, SW, SH, 0x07060e, 0.97);
    const box = this.add.rectangle(SW / 2, SH / 2, BOXW, SH - 28, 0x1a140a, 0.98)
      .setStrokeStyle(3, 0x8a5e2e);
    const title = this.add.text(SW / 2, 0, 'QUEST JOURNAL', TXT(12, '#f2d75c')).setOrigin(0.5);
    // entries go in their own container laid out from y=0, so the box can be
    // sized to whatever the journal actually contains and then centred
    const content = this.add.container(0, 0);
    const foot = this.add.text(SW / 2, 0, 'Q / ESC — close      TAB — world map',
      TXT(8, '#b8b09a')).setOrigin(0.5);
    this.panel.add([bg, box, title, content, foot]);
    this.panel.setVisible(true);

    let y = 0;
    const line = (text, style, indent = 0) => {
      const t = this.add.text(indent, y, text, style);
      content.add(t);
      y += t.height + 3;
      return t;
    };

    for (const ch of data.chapters) {
      y += 6;
      const done = ch.entries.filter((e) => e.done).length;
      if (ch.locked) {
        line(`${ch.name}   [${ch.lockNote}]`, TXT(8, '#5f5a6c'));
        continue;
      }
      line(`${ch.name}   ${done}/${ch.entries.length}`, TXT(9, '#f2d75c'));
      for (const e of ch.entries) {
        line(`${e.done ? '✓' : '·'}  ${e.text}`,
          TXT(8, e.done ? '#6f8a5e' : '#f2e6c9'), 10);
        if (!e.done && e.detail) line(e.detail, TXT(6, '#9a8c72'), 28);
      }
    }

    y += 10;
    line('Side work', TXT(9, '#78c8f0'));
    for (const e of data.side) {
      line(`${e.done ? '✓' : '·'}  ${e.text}`,
        TXT(8, e.done ? '#6f8a5e' : '#f2e6c9'), 10);
      if (!e.done && e.detail) line(e.detail, TXT(6, '#9a8c72'), 28);
    }

    const boxH = Math.min(SH - 20, y + 92);
    const boxTop = (SH - boxH) / 2;
    box.setSize(BOXW, boxH);
    title.setY(boxTop + 22);
    content.setPosition(SW / 2 - BOXW / 2 + 24, boxTop + 44);
    foot.setY(boxTop + boxH - 20);
    this.addCloseButton(SW / 2 + BOXW / 2 - 24, boxTop + 24);
  }

  // ---- win --------------------------------------------------------------
  showWin({ coins, orbs }) {
    this.beginPanel('won');
    const { x, y, h } = this.panelBox(660, 300, 'THE HEART OF THE VOLCANO');
    const body = this.add.text(x, y - 30,
      'You tear the molten Heart from the Inferno Deep.\n\n' +
      'Desert, ice, and fire — three worlds conquered.\nNo digger in any age came half so far.\n\n' +
      `coins: $${coins}    orbs: ${orbs}`,
      { ...TXT(9), align: 'center', lineSpacing: 6 }).setOrigin(0.5);
    const foot = this.add.text(x, y + h / 2 - 24, 'ESC — keep exploring your world', TXT(8, '#b8b09a')).setOrigin(0.5);
    this.panel.add([body, foot]);
  }

  // ---------------------------------------------------------------- input
  // Menu actions, shared by keyboard (handleKey) and touch buttons (update).
  menuNav(dir) {
    if (this.mode !== 'shop' && this.mode !== 'portal') return;
    const rows = this.mode === 'shop' ? this.stock : this.portalList;
    this.sel = (this.sel + dir + rows.length) % rows.length;
    Sfx.select();
    this.mode === 'shop' ? this.paintShopSel() : this.paintPortalSel();
  }

  // Close one panel and immediately open the other, so TAB/Q flip between the
  // map and the journal without a trip back to the game.
  swapPanel(request) {
    Sfx.select();
    this.closePanel();
    this.game.events.emit(request);
  }

  menuConfirm() {
    if (['dialog', 'won', 'museum', 'map', 'journal'].includes(this.mode)) {
      Sfx.select(); this.closePanel(); return;
    }
    if (this.mode === 'shop') {
      this.game.events.emit('shop:buy', this.stock[this.sel]);
    } else if (this.mode === 'portal') {
      this.closePanel();
      this.game.events.emit('portal:go', this.sel);
    }
  }

  menuCancel() {
    if (!this.mode) return;
    Sfx.select();
    this.closePanel();
  }

  handleKey(ev) {
    if (!this.mode) return;
    const code = ev.code;
    if (this.mode === 'map' || this.mode === 'journal') {
      // the other panel's key flips straight to it; anything else closes
      if (code === 'Tab' && this.mode === 'journal') this.swapPanel('ui:requestMap');
      else if (code === 'KeyQ' && this.mode === 'map') this.swapPanel('ui:requestJournal');
      else if (code === 'Escape' || code === 'Tab' || code === 'KeyQ'
               || code === 'KeyE' || code === 'Enter') this.menuConfirm();
      return;
    }
    if (this.mode === 'dialog' || this.mode === 'won' || this.mode === 'museum') {
      if (code === 'Escape' || code === 'KeyE' || code === 'Enter' || code === 'Space') this.menuConfirm();
      return;
    }
    if (code === 'ArrowUp' || code === 'KeyW') this.menuNav(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.menuNav(1);
    else if (code === 'Enter' || code === 'KeyE') this.menuConfirm();
    else if (code === 'Escape') this.menuCancel();
  }
}
