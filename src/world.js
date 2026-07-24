// Seeded generation of the whole underground — now TWO regions side by side on
// one map, split by a bedrock spine:
//   WEST  (cols 1..46, shaft x=24)  — the original desert descent, ends at the
//         Golden Idol. Claiming it opens the Rift to the east.
//   EAST  (cols 49..94, shaft x=72) — the frozen descent, ends at the Sun Crown
//         (the true ending). Locked until the Idol is claimed.
// Each region has 3 depth zones separated by sealed gates (need Portal Stones),
// checkpoint temples on its shaft line, caves, ores and treasure.
import { TILE } from './art.js';

export const T = 16;              // tile size in px
export const W = 188;             // world width in tiles (3 regions)
export const H = 262;             // world height in tiles
export const SURFACE = 12;        // first solid row (grass)

// Three regions on one map. LAVA is on the far left and twice as wide.
//   [ LAVA 1..90 | spine | DESERT 93..138 | spine | FROST 141..186 ]
export const SHAFT_X = 116;       // desert (start town) shaft
export const SHAFT_X2 = 164;      // frost shaft
export const SHAFT_X3 = 45;       // lava shaft (wide region -> centred)
export const DIVIDER = 139;       // spine/rift between desert and frost
export const DIVIDER2 = 91;       // spine/rift between lava and desert

export const ZONES = [
  { name: 'Dusty Mines', top: SURFACE + 1, bottom: 92, gateRow: 93 },
  { name: 'Emerald Caverns', top: 96, bottom: 176, gateRow: 177 },
  { name: 'Forgotten Abyss', top: 180, bottom: 248, gateRow: 249 },
];
export const ZONES_R = [
  { name: 'Frostbite Hollow', top: SURFACE + 1, bottom: 92, gateRow: 93 },
  { name: 'Glacier Deep', top: 96, bottom: 176, gateRow: 177 },
  { name: 'The Frozen Throne', top: 180, bottom: 248, gateRow: 249 },
];
export const ZONES_L = [
  { name: 'Cinder Steppes', top: SURFACE + 1, bottom: 92, gateRow: 93 },
  { name: 'Molten Halls', top: 96, bottom: 176, gateRow: 177 },
  { name: 'The Inferno Deep', top: 180, bottom: 248, gateRow: 249 },
];
export const IDOL_ROW = 254; // finale chamber below the last gate (every region)

// region descriptors
export const REGIONS = [
  { id: 0, shaftX: SHAFT_X, xMin: 93, xMax: 138, theme: 'desert', zones: ZONES },
  { id: 1, shaftX: SHAFT_X2, xMin: 141, xMax: 186, theme: 'frost', zones: ZONES_R },
  { id: 2, shaftX: SHAFT_X3, xMin: 1, xMax: 90, theme: 'lava', zones: ZONES_L },
];

// which region column x belongs to (-1 = spine/edge)
export function regionOfX(x) {
  if (x >= 1 && x <= 90) return 2;      // lava
  if (x >= 93 && x <= 138) return 0;    // desert
  if (x >= 141 && x <= 186) return 1;   // frost
  return -1;
}
const themeOfX = (x) => ['desert', 'frost', 'lava'][regionOfX(x)] || 'desert';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Special-room stamps. Legend:
// '#' brick  '%' mossy brick  '.' carved empty
// 'S' shrine pedestal  'K' portal stone  'O' orb rock  'M' mushroom
// '^' spikes  'C' loot chest (coins)
const ROOM_SHRINE = [
  '#########',
  '#.......#',
  '#...S...#',
  '#.......#',
  '#..###..#',
  '#.......#',
  '#### ####',
];
const ROOM_STONE = [
  '###########',
  '#O.......O#',
  '#....K....#',
  '#...###...#',
  '#.^.....^.#',
  '#### #####',
];
const ROOM_TREASURE = [
  '#%#%#%#',
  '%O...O%',
  '#..C..#',
  '%O...O%',
  '#% #%##',
];

export function generateWorld(seedNum = 7) {
  const rnd = mulberry32(seedNum);
  const grid = new Int16Array(W * H).fill(TILE.EMPTY);
  const spawns = [];      // {type,x,y}
  const shrines = [];     // {x,y,power}       (west only)
  const stones = [];      // {x,y,zone,region,key}
  const gates = [];       // {zone,row,shaftX,region,key}
  const mushrooms = [];   // {x,y}
  const chests = [];      // {x,y}
  const checkpoints = []; // {x,y,region}
  const boulders = [];    // {x,y}  heavy rocks resting on cave floors
  const keys = [];        // {x,y}  dungeon keys
  let dungeon = null;     // {x,y}  fireproof-suit vault location (lava region)
  const at = (x, y) => grid[y * W + x];
  const set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = v; };
  const inZone = (y, z) => y >= ZONES[z].top && y <= ZONES[z].bottom;

  // per-theme strata tile at a given depth
  const strataTile = (theme, y) => {
    const G = { desert: TILE.GRASS, frost: TILE.FROST_GRASS, lava: TILE.MAGMA_GRASS };
    const D = { desert: rnd() < 0.14 ? TILE.DIRT2 : TILE.DIRT, frost: TILE.FROST_DIRT, lava: TILE.MAGMA_DIRT };
    const R = { desert: rnd() < 0.18 ? TILE.STONE2 : TILE.STONE, frost: TILE.FROST_ROCK, lava: TILE.MAGMA_ROCK };
    const P = { desert: rnd() < 0.2 ? TILE.DEEP2 : TILE.DEEP, frost: TILE.FROST_DEEP, lava: TILE.MAGMA_DEEP };
    if (y === SURFACE) return G[theme];
    if (y <= ZONES[0].bottom) return D[theme];
    if (y <= ZONES[0].gateRow + 2) return TILE.BEDROCK;
    if (y <= ZONES[1].bottom) return R[theme];
    if (y <= ZONES[1].gateRow + 2) return TILE.BEDROCK;
    if (y <= ZONES[2].bottom) return P[theme];
    return TILE.BEDROCK;
  };

  // ---- base strata (per-region theme) -----------------------------------
  for (let y = SURFACE; y < H; y++) {
    for (let x = 0; x < W; x++) set(x, y, strataTile(themeOfX(x), y));
  }
  // world edges + both spines are bedrock (surface row stays walkable)
  for (let y = SURFACE; y < H; y++) { set(0, y, TILE.BEDROCK); set(W - 1, y, TILE.BEDROCK); }
  for (const div of [DIVIDER, DIVIDER2]) {
    for (let y = SURFACE + 1; y < H; y++) { set(div - 1, y, TILE.BEDROCK); set(div, y, TILE.BEDROCK); }
  }

  const carve = (x, y) => {
    if (x <= 0 || x >= W - 1 || y <= SURFACE || y >= H - 1) return;
    if (at(x, y) === TILE.BEDROCK) return;
    set(x, y, TILE.EMPTY);
  };
  const carveBlob = (cx, cy, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r + rnd() * 2) carve(cx + dx, cy + dy);
      }
    }
  };
  const stampRoom = (room, ox, oy, meta) => {
    for (let ry = 0; ry < room.length; ry++) {
      for (let rx = 0; rx < room[ry].length; rx++) {
        const ch = room[ry][rx];
        const x = ox + rx, y = oy + ry;
        switch (ch) {
          case '#': set(x, y, TILE.BRICK); break;
          case '%': set(x, y, TILE.BRICK2); break;
          case '.': carve(x, y); break;
          case '^': carve(x, y); set(x, y, TILE.SPIKE); break;
          case 'O': set(x, y, TILE.ORB_ROCK); break;
          case 'M': carve(x, y); mushrooms.push({ x, y }); break;
          case 'S': carve(x, y); shrines.push({ x, y, power: meta.power }); break;
          case 'K': carve(x, y); stones.push({ x, y, zone: meta.zone, region: meta.region, key: meta.key }); break;
          case 'C': carve(x, y); chests.push({ x, y }); break;
          default: break;
        }
      }
    }
  };

  const veinsFor = (theme) => ({
    frost: [
      { tile: TILE.ORE_SILVER, zone: 0, count: 36, len: 3 },
      { tile: TILE.ORE_GOLD, zone: 0, count: 46, len: 3, minY: 40 },
      { tile: TILE.ORE_GOLD, zone: 1, count: 28, len: 3 },
      { tile: TILE.ORE_EMERALD, zone: 1, count: 26, len: 3 },
      { tile: TILE.ORE_RUBY, zone: 1, count: 34, len: 3, minY: 130 },
      { tile: TILE.ORE_RUBY, zone: 2, count: 22, len: 3 },
      { tile: TILE.ORE_DIAMOND, zone: 2, count: 34, len: 2 },
      { tile: TILE.ORE_MYTHRIL, zone: 2, count: 30, len: 2, minY: 200 },
    ],
    desert: [
      { tile: TILE.ORE_COPPER, zone: 0, count: 90, len: 4 },
      { tile: TILE.ORE_SILVER, zone: 0, count: 42, len: 3, minY: 40 },
      { tile: TILE.ORE_SILVER, zone: 1, count: 30, len: 3 },
      { tile: TILE.ORE_GOLD, zone: 1, count: 55, len: 3 },
      { tile: TILE.ORE_EMERALD, zone: 1, count: 30, len: 3, minY: 130 },
      { tile: TILE.ORE_GOLD, zone: 2, count: 18, len: 3 },
      { tile: TILE.ORE_RUBY, zone: 2, count: 40, len: 3 },
      { tile: TILE.ORE_DIAMOND, zone: 2, count: 24, len: 2, minY: 205 },
    ],
    // lava region is wider -> more veins; rich gold/ruby/diamond
    lava: [
      { tile: TILE.ORE_GOLD, zone: 0, count: 70, len: 3 },
      { tile: TILE.ORE_GOLD, zone: 1, count: 50, len: 3 },
      { tile: TILE.ORE_RUBY, zone: 1, count: 50, len: 3, minY: 120 },
      { tile: TILE.ORE_RUBY, zone: 2, count: 44, len: 3 },
      { tile: TILE.ORE_DIAMOND, zone: 2, count: 46, len: 2 },
      { tile: TILE.ORE_EMERALD, zone: 1, count: 24, len: 3 },
    ],
  }[theme]);

  const caveTypes = (theme) => ({
    frost: [
      ['beetle', 'crawler', 'bat'],
      ['beetle', 'crawler', 'spitter', 'wraith'],
      ['wraith', 'wraith', 'beetle', 'spitter', 'crawler'],
    ],
    desert: [
      ['grub', 'grub', 'beetle', 'crawler'],
      ['grub', 'beetle', 'crawler', 'bat', 'spitter'],
      ['beetle', 'crawler', 'bat', 'spitter', 'wraith'],
    ],
    lava: [
      ['grub', 'beetle', 'bat', 'crawler'],
      ['beetle', 'spitter', 'crawler', 'bat'],
      ['wraith', 'wraith', 'spitter', 'beetle', 'crawler'],
    ],
  }[theme]);

  // ---- per-region generation -------------------------------------------
  for (const reg of REGIONS) {
    const clampX = (x) => Math.max(reg.xMin, Math.min(reg.xMax, x));

    // obsidian intrusions (zones 1-2)
    for (let i = 0; i < 55; i++) {
      const y = Math.floor(ZONES[1].top + rnd() * (ZONES[2].bottom - ZONES[1].top));
      const x = clampX(reg.xMin + Math.floor(rnd() * (reg.xMax - reg.xMin)));
      if (at(x, y) === TILE.BEDROCK) continue;
      set(x, y, TILE.OBSIDIAN);
      if (rnd() < 0.5) set(clampX(x + 1), y, TILE.OBSIDIAN);
      if (rnd() < 0.3) set(x, y + 1, TILE.OBSIDIAN);
    }

    // ore veins
    for (const v of veinsFor(reg.theme)) {
      const z = ZONES[v.zone];
      const y0 = Math.max(v.minY || 0, z.top);
      for (let i = 0; i < v.count; i++) {
        let x = clampX(reg.xMin + Math.floor(rnd() * (reg.xMax - reg.xMin)));
        let y = Math.floor(y0 + rnd() * (z.bottom - y0));
        for (let j = 0; j < v.len; j++) {
          const cur = at(x, y);
          if (cur !== TILE.BEDROCK && cur !== TILE.OBSIDIAN && cur !== TILE.EMPTY && inZone(y, v.zone)) set(x, y, v.tile);
          x = clampX(x + Math.floor(rnd() * 3) - 1);
          y += Math.floor(rnd() * 3) - 1;
        }
      }
    }

    // caves + life
    const types = caveTypes(reg.theme);
    for (let z = 0; z < 3; z++) {
      const zone = ZONES[z];
      const caveCount = 11 + z * 3;
      for (let i = 0; i < caveCount; i++) {
        let x = clampX(reg.xMin + 2 + Math.floor(rnd() * (reg.xMax - reg.xMin - 4)));
        let y = zone.top + 4 + Math.floor(rnd() * (zone.bottom - zone.top - 8));
        const steps = 4 + Math.floor(rnd() * 8);
        for (let s = 0; s < steps; s++) {
          carveBlob(x, y, 1 + Math.floor(rnd() * 2));
          x = clampX(x + Math.floor(rnd() * 5) - 2);
          y = Math.max(zone.top + 2, Math.min(zone.bottom - 2, y + Math.floor(rnd() * 3) - 1));
        }
        if (rnd() < 0.78) spawns.push({ type: types[z][Math.floor(rnd() * types[z].length)], x, y });
        if (z >= 1 && rnd() < 0.6) mushrooms.push({ x, y });
        if (rnd() < 0.3 && at(x, y + 1) !== TILE.EMPTY && at(x, y) === TILE.EMPTY) set(x, y, TILE.SPIKE);
      }
    }

    // tool-gated hard blocks — HARDROCK (Pickaxe III, desert), ICE_BLOCK (Fire
    // Pick, frost), HOTROCK (Water Gun, lava). They wall off richer ore but
    // never seal the central shaft.
    const baseTerrain = {
      frost: new Set([TILE.FROST_DIRT, TILE.FROST_ROCK, TILE.FROST_DEEP]),
      desert: new Set([TILE.DIRT, TILE.DIRT2, TILE.STONE, TILE.STONE2, TILE.DEEP, TILE.DEEP2]),
      lava: new Set([TILE.MAGMA_DIRT, TILE.MAGMA_ROCK, TILE.MAGMA_DEEP]),
    }[reg.theme];
    const hardTile = { frost: TILE.ICE_BLOCK, desert: TILE.HARDROCK, lava: TILE.HOTROCK }[reg.theme];
    for (const z of [1, 2]) {
      const zone = ZONES[z];
      const clusters = reg.theme === 'lava' ? (z === 2 ? 40 : 22) : reg.theme === 'frost' ? (z === 2 ? 26 : 14) : (z === 2 ? 20 : 10);
      for (let i = 0; i < clusters; i++) {
        const bx = clampX(reg.xMin + Math.floor(rnd() * (reg.xMax - reg.xMin)));
        const by = zone.top + 2 + Math.floor(rnd() * (zone.bottom - zone.top - 4));
        for (let j = 0; j < 4; j++) {
          const cx2 = clampX(bx + Math.floor(rnd() * 3) - 1);
          const cy2 = by + Math.floor(rnd() * 3) - 1;
          if (Math.abs(cx2 - reg.shaftX) <= 3) continue;      // keep the shaft clear
          if (baseTerrain.has(at(cx2, cy2))) set(cx2, cy2, hardTile);
        }
      }
    }

    // LAVA pools — hazard puddles on cave floors, heavy in the DANGEROUS lower
    // half (zone 2) so the fireproof suit from the dungeon really pays off.
    if (reg.theme === 'lava') {
      for (const z of [0, 1, 2]) {
        const zone = ZONES[z];
        const target = z === 2 ? 42 : z === 1 ? 18 : 6;
        let placed = 0;
        for (let i = 0; i < target * 40 && placed < target; i++) {
          const x = clampX(reg.xMin + 2 + Math.floor(rnd() * (reg.xMax - reg.xMin - 4)));
          const y = zone.top + 3 + Math.floor(rnd() * (zone.bottom - zone.top - 5));
          if (Math.abs(x - reg.shaftX) <= 2) continue;                 // keep shaft crossable
          if (at(x, y) === TILE.EMPTY && at(x, y + 1) !== TILE.EMPTY && at(x, y + 1) !== TILE.BEDROCK) {
            set(x, y, TILE.LAVA);
            if (rnd() < 0.5 && at(x + 1, y) === TILE.EMPTY && at(x + 1, y + 1) !== TILE.EMPTY) set(x + 1, y, TILE.LAVA);
            placed++;
          }
        }
      }
    }

    // boulders resting on cave floors (never right on the shaft) — they drop
    // when you dig out the block beneath them
    const restsOn = (t) => t !== TILE.EMPTY && t !== TILE.LADDER && t !== TILE.SPIKE && t !== TILE.GATE;
    for (let z = 0; z < 3; z++) {
      const zone = ZONES[z];
      let placed = 0;
      for (let i = 0; i < 90 && placed < 4; i++) {
        const x = clampX(reg.xMin + 2 + Math.floor(rnd() * (reg.xMax - reg.xMin - 4)));
        const y = zone.top + 3 + Math.floor(rnd() * (zone.bottom - zone.top - 6));
        if (Math.abs(x - reg.shaftX) <= 3) continue;
        if (at(x, y) === TILE.EMPTY && at(x, y - 1) === TILE.EMPTY && restsOn(at(x, y + 1))) {
          boulders.push({ x, y });
          placed++;
        }
      }
    }

    // special rooms
    const powers = ['doubleJump', 'dash', 'dynamite'];
    const sideA = () => reg.xMin + 3 + Math.floor(rnd() * 8);
    const sideB = () => reg.xMax - 16 + Math.floor(rnd() * 3);
    for (let z = 0; z < 3; z++) {
      const zone = ZONES[z];
      const span = zone.bottom - zone.top;
      const yAt = (f) => zone.top + Math.floor(span * f);
      const key = `r${reg.id}z${z}`;
      if (reg.theme === 'desert') {
        stampRoom(ROOM_SHRINE, rnd() < 0.5 ? sideA() : sideB(), yAt(0.35), { power: powers[z] });
      } else {
        stampRoom(ROOM_TREASURE, rnd() < 0.5 ? sideA() : sideB(), yAt(0.35), {}); // extra loot instead
      }
      stampRoom(ROOM_STONE, rnd() < 0.5 ? sideA() : sideB(), yAt(0.72), { zone: z, region: reg.id, key });
      stampRoom(ROOM_TREASURE, sideA(), yAt(0.55), {});
      stampRoom(ROOM_TREASURE, sideB(), yAt(0.15), {});
    }

    // gates
    for (let z = 0; z < 3; z++) {
      const row = ZONES[z].gateRow;
      for (let y = row; y <= row + 2; y++) {
        for (const x of [reg.shaftX - 1, reg.shaftX, reg.shaftX + 1]) set(x, y, TILE.GATE);
      }
      gates.push({ zone: z, row, shaftX: reg.shaftX, region: reg.id, key: `r${reg.id}z${z}` });
      for (let y = row - 3; y < row; y++) {
        for (let x = reg.shaftX - 2; x <= reg.shaftX + 2; x++) carve(x, y);
      }
    }

    // checkpoint temples on the shaft line
    for (const row of [40, 72, 120, 152, 202, 232]) {
      const cxp = reg.shaftX;
      for (let yy = row - 2; yy <= row + 1; yy++) {
        for (let xx = cxp - 2; xx <= cxp + 2; xx++) {
          if (yy === row + 1) set(xx, yy, TILE.BRICK);
          else carve(xx, yy);
        }
      }
      for (let yy = row - 1; yy <= row; yy++) { set(cxp - 3, yy, TILE.BRICK2); set(cxp + 3, yy, TILE.BRICK2); }
      checkpoints.push({ x: cxp, y: row, region: reg.id });
    }

    // goal chamber + shaft under town
    buildGoalChamber(reg.shaftX);
    for (let y = SURFACE; y <= SURFACE + 4; y++) {
      for (const x of [reg.shaftX - 1, reg.shaftX, reg.shaftX + 1]) set(x, y, TILE.EMPTY);
    }
    for (let y = SURFACE + 1; y <= SURFACE + 4; y++) set(reg.shaftX - 1, y, TILE.LADDER);
    for (const x of [reg.shaftX - 1, reg.shaftX, reg.shaftX + 1]) {
      if (at(x, SURFACE + 5) === TILE.EMPTY) {
        set(x, SURFACE + 5, { frost: TILE.FROST_DIRT, desert: TILE.DIRT, lava: TILE.MAGMA_DIRT }[reg.theme]);
      }
    }

    // ---- the lava dungeon: a sealed brick vault halfway down (zone 2), key-
    // locked, holding the Fireproof Suit that halves lava damage for the deadly
    // lower half. A key sits in a cave elsewhere in the region.
    if (reg.theme === 'lava') {
      const drow = 132;                                   // ~mid depth
      const dx = reg.shaftX + (rnd() < 0.5 ? -22 : 20);   // off to one side of the shaft
      // 9-wide, 7-tall brick vault, carved inside, floor + walls
      for (let yy = drow - 5; yy <= drow + 1; yy++) {
        for (let xx = dx - 4; xx <= dx + 4; xx++) {
          if (yy === drow - 5 || yy === drow + 1 || xx === dx - 4 || xx === dx + 4) set(xx, yy, TILE.BRICK);
          else carve(xx, yy);
        }
      }
      // guardians + a couple of lava traps inside
      spawns.push({ type: 'wraith', x: dx - 2, y: drow - 2 });
      spawns.push({ type: 'spitter', x: dx + 2, y: drow });
      set(dx, drow, TILE.LAVA);
      // key-locked doorway on the shaft-facing wall
      const doorX = dx < reg.shaftX ? dx + 4 : dx - 4;
      set(doorX, drow - 1, TILE.KEYDOOR); set(doorX, drow, TILE.KEYDOOR);
      // carve a short approach tunnel from the shaft side toward the door
      const dir = dx < reg.shaftX ? 1 : -1;
      for (let xx = doorX + dir; dir > 0 ? xx <= reg.shaftX : xx >= reg.shaftX; xx += dir) carve(xx, drow);
      dungeon = { x: dx, y: drow - 2 };                   // suit sits here
      // the key: in a carved pocket a bit above, on the far side
      const keyX = clampX(reg.shaftX - dir * (10 + Math.floor(rnd() * 8)));
      const keyY = 96 + Math.floor(rnd() * 30);
      for (let yy = keyY - 1; yy <= keyY + 1; yy++) for (let xx = keyX - 1; xx <= keyX + 1; xx++) carve(xx, yy);
      set(keyX, keyY + 2, TILE.BRICK);
      keys.push({ x: keyX, y: keyY });
    }
  }

  function buildGoalChamber(sx) {
    for (let y = IDOL_ROW - 3; y <= IDOL_ROW + 1; y++) {
      for (let x = sx - 6; x <= sx + 6; x++) set(x, y, y === IDOL_ROW + 1 ? TILE.BRICK : TILE.EMPTY);
    }
    for (let x = sx - 6; x <= sx + 6; x++) set(x, IDOL_ROW - 4, TILE.BRICK);
    set(sx - 7, IDOL_ROW - 3, TILE.BRICK); set(sx + 7, IDOL_ROW - 3, TILE.BRICK);
    for (let y = ZONES[2].gateRow + 3; y < IDOL_ROW - 3; y++) {
      for (const x of [sx - 1, sx, sx + 1]) set(x, y, TILE.EMPTY);
    }
  }

  // never let spikes float in midair
  for (let y = SURFACE; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (at(x, y) === TILE.SPIKE && at(x, y + 1) === TILE.EMPTY) set(x, y, TILE.EMPTY);
    }
  }

  const idol = { x: SHAFT_X, y: IDOL_ROW };
  const crown = { x: SHAFT_X2, y: IDOL_ROW };
  const heart = { x: SHAFT_X3, y: IDOL_ROW };  // lava finale — Heart of the Volcano
  return { grid, spawns, shrines, stones, gates, mushrooms, chests, checkpoints, boulders, keys, dungeon, idol, crown, heart };
}

// which zone (0..2) a tile row belongs to; -1 = surface/sky
export function zoneOfRow(y) {
  if (y <= SURFACE) return -1;
  for (let z = 2; z >= 0; z--) if (y >= ZONES[z].top) return z;
  return 0;
}

export function zoneName(x, y) {
  const region = regionOfX(x);
  const z = zoneOfRow(y);
  const townName = ['Sundrop Flats', 'Frosthaven', 'Cinder Reach'][region] || 'Sundrop Flats';
  if (z < 0) return townName;
  const zones = [ZONES, ZONES_R, ZONES_L][region] || ZONES;
  return zones[z].name;
}

// background wall tile for a tile (drawn behind dug-out areas)
export function bgTileAt(x, y) {
  if (y < SURFACE) return TILE.EMPTY;
  if (y >= IDOL_ROW - 4) return TILE.BG_BRICK;
  const region = regionOfX(x);
  if (region === 1) return TILE.BG_FROST;
  if (region === 2) return TILE.BG_MAGMA;
  const z = zoneOfRow(y);
  return z <= 0 ? TILE.BG_DIRT : z === 1 ? TILE.BG_STONE : TILE.BG_DEEP;
}
