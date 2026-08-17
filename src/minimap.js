// The world map. Painted into a canvas texture at exactly 1 pixel per tile
// (via a single putImageData, so the whole 188x247 map costs one blit), then
// blown up with nearest-neighbour scaling in the panel.
//
// Only tiles you have actually walked past are painted — GameScene keeps an
// `explored` bitmap and saves it, so the map fills in as you dig, the same way
// your tunnel network does.
import { TILE, ORES } from './art.js';
import { SURFACE, IDOL_ROW, W, regionOfX } from './world.js';

export const MAP_TOP = SURFACE - 1;          // first row worth drawing (town level)
export const MAP_BOTTOM = IDOL_ROW + 3;      // last row (floor of the finale chambers)
export const MAP_ROWS = MAP_BOTTOM - MAP_TOP + 1;

const UNSEEN = 0x0d0a14;
// Dug-out space is deliberately the BRIGHTEST thing on the map: the map's job is
// to show you the shape of the tunnel network you carved.
const OPEN = [0x8e8272, 0x8296a6, 0x9a7a6a]; // desert, frost, lava

const SOLID = {
  [TILE.SAND]: 0xc2a074, [TILE.GRASS]: 0x6b9a3a,
  [TILE.DIRT]: 0x6a4522, [TILE.DIRT2]: 0x5e3d1e,
  [TILE.STONE]: 0x4e4e58, [TILE.STONE2]: 0x45454f,
  [TILE.DEEP]: 0x322e40, [TILE.DEEP2]: 0x2b2838,
  [TILE.BEDROCK]: 0x100e18, [TILE.OBSIDIAN]: 0x1e1a2a,
  [TILE.BRICK]: 0x8a6438, [TILE.BRICK2]: 0x7a5830,
  [TILE.LADDER]: 0x8fd8a0, [TILE.SPIKE]: 0xa03030,
  [TILE.GATE]: 0xb07aff, [TILE.KEYDOOR]: 0xf2b93a,
  // ores keep their real colours so veins you walked past stay visible
  [TILE.ORE_COPPER]: ORES.copper.color, [TILE.ORE_SILVER]: ORES.silver.color,
  [TILE.ORE_GOLD]: ORES.gold.color, [TILE.ORE_EMERALD]: ORES.emerald.color,
  [TILE.ORE_RUBY]: ORES.ruby.color, [TILE.ORE_DIAMOND]: ORES.diamond.color,
  [TILE.ORE_MYTHRIL]: ORES.mythril.color, [TILE.ORB_ROCK]: ORES.orb.color,
  // frost
  [TILE.FROST_GRASS]: 0xa8d8e8, [TILE.FROST_DIRT]: 0x51687c,
  [TILE.FROST_ROCK]: 0x3f5670, [TILE.FROST_DEEP]: 0x2e4058,
  // molten
  [TILE.MAGMA_GRASS]: 0x9a4a2a, [TILE.MAGMA_DIRT]: 0x5e2c1a,
  [TILE.MAGMA_ROCK]: 0x4a2618, [TILE.MAGMA_DEEP]: 0x381c12,
  [TILE.LAVA]: 0xff6a20, [TILE.HOTROCK]: 0xd2542a,
  // tool-gated blocks glow so you can plan a route back to them
  [TILE.HARDROCK]: 0xc89a4a, [TILE.ICE_BLOCK]: 0x9fe0f8,
};

// Marker colours, keyed by the `kind` GameScene tags each marker with.
export const MARKS = {
  town: 0xf2d75c,
  portal: 0x48b8f0,
  camp: 0x78f0c8,
  checkpoint: 0x9ae8f2,
  stash: 0xf2a53a,
};

export function renderMapTexture(scene, key, tiles, explored) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, W, MAP_ROWS);
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, MAP_ROWS);
  const d = img.data;
  for (let y = MAP_TOP; y <= MAP_BOTTOM; y++) {
    const rowBase = (y - MAP_TOP) * W;
    for (let x = 0; x < W; x++) {
      let c = UNSEEN;
      if (explored[y * W + x]) {
        const t = tiles[y * W + x];
        c = t === TILE.EMPTY
          ? OPEN[Math.max(0, regionOfX(x))]
          : (SOLID[t] ?? 0x3a3444);
      }
      const o = (rowBase + x) * 4;
      d[o] = (c >> 16) & 255;
      d[o + 1] = (c >> 8) & 255;
      d[o + 2] = c & 255;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return tex;
}

// ---- explored bitmap persistence -----------------------------------------
// One byte per tile in memory (fast to test in the update loop), packed down to
// one BIT per tile for storage — 188*265 tiles becomes ~8KB of base64.
export function packExplored(bytes) {
  const out = new Uint8Array(Math.ceil(bytes.length / 8));
  for (let i = 0; i < bytes.length; i++) if (bytes[i]) out[i >> 3] |= 1 << (i & 7);
  let s = '';
  const CH = 8192; // chunked so String.fromCharCode never blows the arg limit
  for (let i = 0; i < out.length; i += CH) s += String.fromCharCode(...out.subarray(i, i + CH));
  return btoa(s);
}

export function unpackExplored(b64, len) {
  const out = new Uint8Array(len);
  if (!b64) return out;
  try {
    const bin = atob(b64);
    for (let i = 0; i < len; i++) {
      const byte = bin.charCodeAt(i >> 3);
      if (byte && (byte >> (i & 7)) & 1) out[i] = 1;
    }
  } catch { /* corrupt save: start with a blank map */ }
  return out;
}
