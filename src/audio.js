// All sound is synthesized with WebAudio — no audio files needed.
// Music has four moods that follow the player's depth:
//   town    — warm, friendly major-pentatonic tune
//   mines   — mellow, sparse minor groove
//   caverns — slower, darker, echoing intervals
//   abyss   — near-atonal drone with eerie high wisps
class SfxEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.mood = 'town';
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.14;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  toggleMute() {
    this.ensure();
    this.muted = !this.muted;
    this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // ---- primitives -------------------------------------------------------
  tone({ from = 440, to = from, dur = 0.1, type = 'square', vol = 0.2, delay = 0, dest = null }) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest || this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.2, freq = 1000, delay = 0, q = 0.8 }) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // ---- game sounds ------------------------------------------------------
  jump() { this.tone({ from: 280, to: 620, dur: 0.13, type: 'square', vol: 0.16 }); }
  doubleJump() {
    this.tone({ from: 420, to: 880, dur: 0.12, type: 'square', vol: 0.15 });
    this.tone({ from: 620, to: 1100, dur: 0.1, type: 'square', vol: 0.1, delay: 0.04 });
  }
  land() { this.noise({ dur: 0.08, vol: 0.1, freq: 400 }); }
  dash() {
    this.noise({ dur: 0.18, vol: 0.22, freq: 2400 });
    this.tone({ from: 900, to: 200, dur: 0.16, type: 'sawtooth', vol: 0.08 });
  }
  dig(hard = false) {
    this.noise({ dur: 0.07, vol: 0.16, freq: hard ? 1500 : 700 });
    if (hard) this.tone({ from: 1200, to: 600, dur: 0.05, type: 'square', vol: 0.05 });
  }
  breakTile() {
    this.noise({ dur: 0.16, vol: 0.22, freq: 500 });
    this.tone({ from: 240, to: 90, dur: 0.14, type: 'square', vol: 0.1 });
  }
  clank() { // pickaxe on undiggable rock
    this.tone({ from: 1800, to: 1200, dur: 0.07, type: 'square', vol: 0.1 });
    this.noise({ dur: 0.05, vol: 0.12, freq: 3000, q: 3 });
  }
  swing() { this.noise({ dur: 0.07, vol: 0.07, freq: 1800, q: 2 }); }
  pickup() {
    this.tone({ from: 988, dur: 0.06, type: 'square', vol: 0.12 });
    this.tone({ from: 1319, dur: 0.1, type: 'square', vol: 0.12, delay: 0.05 });
  }
  orb() {
    [880, 1109, 1319, 1760].forEach((n, i) =>
      this.tone({ from: n, dur: 0.14, type: 'triangle', vol: 0.14, delay: i * 0.06 }));
  }
  sell() {
    [659, 784, 988, 1319].forEach((n, i) =>
      this.tone({ from: n, dur: 0.08, type: 'square', vol: 0.12, delay: i * 0.05 }));
  }
  buy() {
    this.tone({ from: 523, dur: 0.08, type: 'triangle', vol: 0.18 });
    this.tone({ from: 784, dur: 0.14, type: 'triangle', vol: 0.18, delay: 0.07 });
  }
  denied() { this.tone({ from: 220, to: 160, dur: 0.16, type: 'square', vol: 0.14 }); }
  heart() {
    this.tone({ from: 523, dur: 0.1, type: 'triangle', vol: 0.2 });
    this.tone({ from: 659, dur: 0.1, type: 'triangle', vol: 0.2, delay: 0.09 });
    this.tone({ from: 784, dur: 0.18, type: 'triangle', vol: 0.2, delay: 0.18 });
  }
  hurt() {
    this.tone({ from: 400, to: 90, dur: 0.28, type: 'sawtooth', vol: 0.2 });
    this.noise({ dur: 0.2, vol: 0.15, freq: 300 });
  }
  enemyHit() {
    this.noise({ dur: 0.09, vol: 0.18, freq: 900 });
    this.tone({ from: 500, to: 250, dur: 0.09, type: 'square', vol: 0.12 });
  }
  enemyDie() {
    this.tone({ from: 600, to: 80, dur: 0.25, type: 'sawtooth', vol: 0.15 });
    this.noise({ dur: 0.2, vol: 0.18, freq: 500 });
  }
  spit() { this.tone({ from: 700, to: 300, dur: 0.12, type: 'sine', vol: 0.12 }); }
  wraithMoan() {
    this.tone({ from: 180, to: 120, dur: 0.9, type: 'sine', vol: 0.07 });
    this.tone({ from: 275, to: 178, dur: 0.9, type: 'sine', vol: 0.05, delay: 0.05 });
  }
  powerup() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone({ from: n, dur: 0.12, type: 'square', vol: 0.14, delay: i * 0.07 }));
  }
  portal() {
    [220, 330, 440, 660, 880].forEach((n, i) =>
      this.tone({ from: n, to: n * 1.5, dur: 0.3, type: 'sine', vol: 0.1, delay: i * 0.08 }));
  }
  gateOpen() {
    this.noise({ dur: 0.6, vol: 0.2, freq: 200 });
    [131, 196, 262, 392, 523].forEach((n, i) =>
      this.tone({ from: n, dur: 0.4, type: 'triangle', vol: 0.16, delay: 0.2 + i * 0.12 }));
  }
  rumble() { // boulder about to fall — a low warning grind
    this.noise({ dur: 0.5, vol: 0.12, freq: 120, q: 0.5 });
    this.tone({ from: 70, to: 55, dur: 0.5, type: 'sawtooth', vol: 0.06 });
  }
  thud() { // boulder lands
    this.noise({ dur: 0.18, vol: 0.28, freq: 180, q: 0.5 });
    this.tone({ from: 110, to: 40, dur: 0.16, type: 'square', vol: 0.16 });
  }
  explosion() {
    this.noise({ dur: 0.5, vol: 0.35, freq: 250, q: 0.4 });
    this.tone({ from: 150, to: 40, dur: 0.4, type: 'sawtooth', vol: 0.2 });
  }
  fuse() { this.noise({ dur: 0.8, vol: 0.05, freq: 4000, q: 4 }); }
  checkpoint() {
    [523, 659, 784, 1047, 1319].forEach((n, i) =>
      this.tone({ from: n, dur: 0.18, type: 'triangle', vol: 0.16, delay: i * 0.08 }));
    this.tone({ from: 1568, dur: 0.4, type: 'sine', vol: 0.08, delay: 0.4 });
  }
  teleport() {
    [880, 660, 440, 330, 220].forEach((n, i) =>
      this.tone({ from: n, to: n / 2, dur: 0.15, type: 'sine', vol: 0.1, delay: i * 0.05 }));
  }
  select() { this.tone({ from: 880, dur: 0.06, type: 'square', vol: 0.12 }); }
  talk() { this.tone({ from: 660, to: 720, dur: 0.05, type: 'square', vol: 0.07 }); }
  bagFull() {
    this.tone({ from: 330, dur: 0.1, type: 'square', vol: 0.12 });
    this.tone({ from: 262, dur: 0.16, type: 'square', vol: 0.12, delay: 0.1 });
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((n, i) =>
      this.tone({ from: n, dur: 0.22, type: 'triangle', vol: 0.18, delay: i * 0.13 }));
  }
  die() {
    [440, 349, 262, 196, 131].forEach((n, i) =>
      this.tone({ from: n, dur: 0.25, type: 'triangle', vol: 0.16, delay: i * 0.16 }));
  }

  // ---- music ------------------------------------------------------------
  setMood(mood) {
    if (this.mood === mood) return;
    this.mood = mood;
  }

  startMusic() {
    this.ensure();
    if (this.musicTimer) return;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 80);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  scheduleMusic() {
    const pattern = PATTERNS[this.mood] || PATTERNS.town;
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const s = this.musicStep % pattern.len;
      const t = Math.max(0, this.nextNoteTime - this.ctx.currentTime);
      const b = pattern.bass[s % pattern.bass.length];
      const l = pattern.lead[s % pattern.lead.length];
      if (b) this.tone({ from: b, dur: pattern.bassDur, type: pattern.bassType, vol: pattern.bassVol, delay: t, dest: this.musicGain });
      if (l) this.tone({ from: l, dur: pattern.leadDur, type: pattern.leadType, vol: pattern.leadVol, delay: t, dest: this.musicGain });
      if (pattern.sparkle && Math.random() < pattern.sparkle && s % 4 === 0) {
        const wisp = [1760, 2093, 2637, 3136][Math.floor(Math.random() * 4)];
        this.tone({ from: wisp, to: wisp * 0.94, dur: 1.2, type: 'sine', vol: 0.025, delay: t, dest: this.musicGain });
      }
      this.nextNoteTime += pattern.step;
      this.musicStep++;
    }
  }
}

// Patterns: 0 = rest. Values are Hz.
const PATTERNS = {
  town: { // warm and friendly, C major pentatonic amble
    len: 64, step: 0.17,
    bassType: 'triangle', bassVol: 0.5, bassDur: 0.34,
    leadType: 'square', leadVol: 0.13, leadDur: 0.2,
    bass: [
      131, 0, 0, 0, 131, 0, 0, 0, 98, 0, 0, 0, 98, 0, 0, 0,
      110, 0, 0, 0, 110, 0, 0, 0, 123, 0, 0, 0, 123, 0, 0, 0,
      131, 0, 0, 0, 131, 0, 0, 0, 98, 0, 0, 0, 98, 0, 0, 0,
      110, 0, 0, 0, 87, 0, 0, 0, 131, 0, 0, 0, 0, 0, 0, 0,
    ],
    lead: [
      523, 0, 587, 0, 659, 0, 784, 0, 659, 0, 0, 0, 587, 0, 523, 0,
      440, 0, 523, 0, 587, 0, 523, 0, 494, 0, 0, 0, 0, 0, 0, 0,
      523, 0, 587, 0, 659, 0, 784, 0, 880, 0, 0, 0, 784, 0, 659, 0,
      587, 0, 659, 0, 523, 0, 494, 0, 523, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  mines: { // mellow A-minor groove, a bit of purpose
    len: 64, step: 0.16,
    bassType: 'triangle', bassVol: 0.5, bassDur: 0.3,
    leadType: 'square', leadVol: 0.11, leadDur: 0.18,
    bass: [
      110, 0, 0, 110, 0, 0, 110, 0, 87, 0, 0, 87, 0, 0, 87, 0,
      98, 0, 0, 98, 0, 0, 98, 0, 82, 0, 0, 82, 0, 0, 110, 0,
      110, 0, 0, 110, 0, 0, 110, 0, 87, 0, 0, 87, 0, 0, 87, 0,
      98, 0, 0, 98, 0, 0, 98, 0, 73, 0, 0, 73, 0, 82, 0, 0,
    ],
    lead: [
      440, 0, 0, 0, 523, 0, 440, 0, 0, 0, 349, 0, 0, 0, 330, 0,
      0, 0, 392, 0, 440, 0, 0, 0, 330, 0, 0, 0, 0, 0, 0, 0,
      440, 0, 0, 0, 523, 0, 587, 0, 0, 0, 523, 0, 0, 0, 440, 0,
      0, 0, 392, 0, 330, 0, 0, 0, 294, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  caverns: { // slower, darker, hollow fifths
    len: 64, step: 0.21,
    bassType: 'triangle', bassVol: 0.55, bassDur: 0.55,
    leadType: 'triangle', leadVol: 0.1, leadDur: 0.5,
    sparkle: 0.05,
    bass: [
      82, 0, 0, 0, 0, 0, 0, 0, 82, 0, 0, 0, 123, 0, 0, 0,
      73, 0, 0, 0, 0, 0, 0, 0, 73, 0, 0, 0, 110, 0, 0, 0,
      65, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 98, 0, 0, 0,
      73, 0, 0, 0, 0, 0, 0, 0, 78, 0, 0, 0, 82, 0, 0, 0,
    ],
    lead: [
      0, 0, 0, 0, 330, 0, 0, 0, 311, 0, 0, 0, 0, 0, 0, 0,
      294, 0, 0, 0, 0, 0, 0, 0, 247, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 262, 0, 0, 0, 247, 0, 0, 0, 0, 0, 0, 0,
      220, 0, 0, 0, 0, 0, 233, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  abyss: { // dread drone, tritone pulses, high wisps
    len: 64, step: 0.26,
    bassType: 'sawtooth', bassVol: 0.22, bassDur: 1.0,
    leadType: 'sine', leadVol: 0.08, leadDur: 0.9,
    sparkle: 0.14,
    bass: [
      55, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 55, 0, 0, 0,
      58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 55, 0, 0, 0,
      55, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 78, 0, 0, 0,
      55, 0, 0, 0, 0, 0, 0, 0, 52, 0, 0, 0, 0, 0, 0, 0,
    ],
    lead: [
      0, 0, 0, 0, 0, 0, 165, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 156, 0, 0, 0, 0, 0, 0, 0, 0, 0, 175, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 233, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 220, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
};

const Sfx = new SfxEngine();
export default Sfx;
