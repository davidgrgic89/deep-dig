import Phaser from 'phaser';
import Sfx from '../audio.js';
import { ORES } from '../art.js';

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
    this.mode = null; // null | 'dialog' | 'shop' | 'portal' | 'won'

    // ---- HUD ------------------------------------------------------------
    this.hearts = [];
    this.coinText = this.add.text(16, 40, '', TXT(10, '#f2d75c')).setDepth(10);
    this.orbText = this.add.text(16, 60, '', TXT(10, '#78d8f0')).setDepth(10);
    this.bagText = this.add.text(16, 80, '', TXT(10, '#e8c48a')).setDepth(10);
    this.dynaText = this.add.text(16, 100, '', TXT(10, '#e88b3a')).setDepth(10);
    this.kitText = this.add.text(16, 120, '', TXT(10, '#a8d8b8')).setDepth(10);
    this.ladderText = this.add.text(16, 140, '', TXT(10, '#8fd8a0')).setDepth(10);
    this.depthText = this.add.text(SW - 52, 15, '', TXT(11, '#c8d0dc')).setOrigin(1, 0).setDepth(10);

    // lantern bar
    this.lampBarBg = this.add.rectangle(SW - 16, 44, 120, 10, 0x14100a).setOrigin(1, 0).setDepth(10).setStrokeStyle(2, 0x5c4820);
    this.lampBar = this.add.rectangle(SW - 18, 46, 116, 6, 0xf2d75c).setOrigin(1, 0).setDepth(11);
    this.lampLabel = this.add.text(SW - 140, 42, 'LAMP', TXT(8, '#c8b060')).setOrigin(1, 0).setDepth(10);

    this.hintText = this.add.text(SW / 2, SH - 64, '', TXT(9, '#ffffff')).setOrigin(0.5).setDepth(10);
    this.zoneText = this.add.text(SW / 2, 90, '', TXT(16, '#f2d75c')).setOrigin(0.5).setDepth(10).setAlpha(0);

    // vignette that deepens with depth
    this.vignette = this.add.graphics().setDepth(5);

    // controls hint (fades out)
    this.controls = this.add.text(SW / 2, SH - 30,
      'MOVE ←→  JUMP SPACE  DIG X (+↑/↓)  TALK/USE E  RECALL hold R  MUTE M',
      TXT(8, '#b8b09a')).setOrigin(0.5).setDepth(10);
    this.time.delayedCall(12000, () => this.tweens.add({ targets: this.controls, alpha: 0, duration: 1000 }));

    // ---- panels ---------------------------------------------------------
    this.panel = this.add.container(0, 0).setDepth(20).setVisible(false);

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
    on('hud:death', () => this.deathFlash());
    on('game:won', (stats) => this.showWin(stats));

    this.input.keyboard.on('keydown', (ev) => this.handleKey(ev));
    this.buildTouchControls();
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
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
      Sfx.select();
    });
    this.scale.on('enterfullscreen', paint);
    this.scale.on('leavefullscreen', paint);
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
    if (!this.controlsOn) return;
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

  closePanel() {
    this.clearPanel();
    this.game.events.emit('ui:closed');
  }

  panelBox(w, h, title) {
    const { width: SW, height: SH } = this.scale;
    const x = SW / 2, y = SH / 2;
    const bg = this.add.rectangle(x, y, w, h, 0x1a140a, 0.96).setStrokeStyle(3, 0x8a5e2e);
    const bg2 = this.add.rectangle(x, y, w - 10, h - 10).setStrokeStyle(1, 0x5c4820);
    const t = this.add.text(x, y - h / 2 + 22, title, TXT(13, '#f2d75c')).setOrigin(0.5);
    this.panel.add([bg, bg2, t]);
    this.panel.setVisible(true);
    return { x, y, w, h };
  }

  // ---- dialog -----------------------------------------------------------
  showDialog({ name, lines }) {
    this.clearPanel();
    this.mode = 'dialog';
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
  }

  // ---- shop -------------------------------------------------------------
  showShop(stock) {
    this.clearPanel();
    this.mode = 'shop';
    this.stock = stock;
    this.sel = Math.min(this.sel || 0, stock.length - 1);
    const rows = stock.length;
    const title = stock._east ? "YUKI'S FROST EMPORIUM" : "MARA'S TRADING POST";
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
    this.clearPanel();
    this.mode = 'portal';
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

  // ---- win --------------------------------------------------------------
  showWin({ coins, orbs }) {
    this.clearPanel();
    this.mode = 'won';
    const { x, y, h } = this.panelBox(640, 300, 'THE SUN CROWN');
    const body = this.add.text(x, y - 30,
      'You lift the Sun Crown from the Frozen Throne.\n\n' +
      'From the desert to the deepest ice, no digger\never came so far. Two worlds will sing your name.\n\n' +
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

  menuConfirm() {
    if (this.mode === 'dialog' || this.mode === 'won') { Sfx.select(); this.closePanel(); return; }
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
    if (this.mode === 'dialog' || this.mode === 'won') {
      if (code === 'Escape' || code === 'KeyE' || code === 'Enter' || code === 'Space') this.menuConfirm();
      return;
    }
    if (code === 'ArrowUp' || code === 'KeyW') this.menuNav(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.menuNav(1);
    else if (code === 'Enter' || code === 'KeyE') this.menuConfirm();
    else if (code === 'Escape') this.menuCancel();
  }
}
