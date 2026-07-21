// All art is generated at runtime: ASCII pixel maps for sprites, painted
// canvases for tiles/backgrounds. 1 game pixel = 1 texture pixel; the camera
// zooms 3x with pixelArt:true for the chunky look.

// ---------------------------------------------------------------------------
// palette
export const PAL = {
  '.': null,
  // explorer
  h: '#8a5222', H: '#5f3413', s: '#edb476', E: '#26160c', k: '#c9a86a',
  K: '#a8874e', b: '#4c2f16', p: '#6b4f2e', P: '#54401f', w: '#f2e6c9',
  // creatures
  g: '#7d9c3d', G: '#5d7529', m: '#8c5a9c', M: '#5d3a6b', r: '#c94f38',
  v: '#8fe8e0', V: '#3f9c94', y: '#f2d75c', Y: '#c9a52e', o: '#e88b3a',
  d: '#3d3548', D: '#211c2e', x: '#141020', z: '#68c8f0', Z: '#2f7ab0',
  q: '#e8e2d0', Q: '#b0a890', f: '#e85c5c', F: '#a03030',
  n: '#8c6a48', N: '#66492c', u: '#c0c8d0', U: '#8a94a2',
  t: '#3a875f', T: '#22573b', a: '#d0483a', A: '#8c2318',
  i: '#f8f4e0', l: '#f2b93a', L: '#c08618', c: '#e07830',
};

function drawMap(g2d, rows, ox = 0, oy = 0, pal = PAL) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = pal[rows[y][x]];
      if (!c) continue;
      g2d.fillStyle = c;
      g2d.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// Make a spritesheet texture out of several same-sized ASCII frames.
function sheet(scene, key, frames, fw, fh) {
  const canvas = document.createElement('canvas');
  canvas.width = fw * frames.length;
  canvas.height = fh;
  const g = canvas.getContext('2d');
  frames.forEach((rows, i) => drawMap(g, rows, i * fw, 0));
  scene.textures.addSpriteSheet(key, canvas, { frameWidth: fw, frameHeight: fh });
}

function single(scene, key, rows) {
  const fw = rows[0].length, fh = rows.length;
  const tex = scene.textures.createCanvas(key, fw, fh);
  drawMap(tex.getContext(), rows);
  tex.refresh();
}

// ---------------------------------------------------------------------------
// PLAYER — "Dusty", explorer with a fedora. 16x22, feet at bottom.
const PLR_BASE = [
  '................',
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '..HHHHHHHHHHHH..',
  '....ssssssss....',
  '....sEssssEs....',
  '....ssssssss....',
  '.....ssssss.....',
  '...kkkkkkkkkk...',
  '..kkkkkkkkkkkk..',
  '..skkbkkkkbkks..',
  '..skkkbkkbkkks..',
  '..skkkkbbkkkks..',
  '...kkkkkkkkkk...',
  '...PPPPPPPPPP...',
];
const LEGS = {
  idle: [
    '...ppp....ppp...',
    '...ppp....ppp...',
    '...ppp....ppp...',
    '...ppp....ppp...',
    '...ppp....ppp...',
    '...bbb....bbb...',
    '..bbbb....bbbb..',
  ],
  walk1: [
    '...ppp...ppp....',
    '...ppp...ppp....',
    '..ppp.....ppp...',
    '..ppp.....ppp...',
    '..ppp.....ppp...',
    '..bbb.....bbb...',
    '.bbbb.....bbbb..',
  ],
  walk2: [
    '....pppppp......',
    '....pppppp......',
    '....ppp.ppp.....',
    '....ppp.ppp.....',
    '....ppp.ppp.....',
    '....bbb.bbb.....',
    '...bbbb.bbbb....',
  ],
  jump: [
    '...ppp....ppp...',
    '...ppp....ppp...',
    '...ppp...ppp....',
    '..ppp....ppp....',
    '..bbb...bbb.....',
    '..bbbb..bbbb....',
    '................',
  ],
};
function playerFrame(legs) { return PLR_BASE.concat(LEGS[legs]); }

// ---------------------------------------------------------------------------
// creatures
// A plump, block-sized grub — big enough to time a pickaxe swing against.
const GRUB = [
  [
    '....gggggg....',
    '..gggggggggg..',
    '.gggggggggggg.',
    'gggggggggggggg',
    'gEEgggggggEEgg',
    'gEEgggggggEEgg',
    'gggggggggggggg',
    'gGgGgGgGgGgGgG',
    'gggggggggggggg',
    '.gggggggggggg.',
    '..GG..GG..GG..',
    '..............',
  ],
  [
    '....gggggg....',
    '..gggggggggg..',
    '.gggggggggggg.',
    'gggggggggggggg',
    'gEEgggggggEEgg',
    'gEEgggggggEEgg',
    'gggggggggggggg',
    'GgGgGgGgGgGgGg',
    'gggggggggggggg',
    '.gggggggggggg.',
    '.GG..GG..GG.GG',
    '..............',
  ],
];
const BAT = [
  [
    'mm..........mm',
    'mmm..mmmm..mmm',
    '.mmmmmMMmmmm..',
    '..mMEMmmMEMm..',
    '...mmmmmmmm...',
    '....m....m....',
  ],
  [
    '..............',
    '.....mmmm.....',
    '.mmmmmMMmmmm..',
    'mmmMEMmmMEMmmm',
    'mm..mmmmmm..mm',
    '.....m..m.....',
  ],
];
const SPITTER = [
  [
    '......tt......',
    '....tttttt....',
    '...ttATTAtt...',
    '...tTTTTTTt...',
    '...ttaaaatt...',
    '....tttttt....',
    '.....T..T.....',
    '....TT..TT....',
  ],
  [
    '......tt......',
    '....tttttt....',
    '...ttATTAtt...',
    '...tTaaaaTt...',
    '...ta....at...',
    '....taaaat....',
    '.....T..T.....',
    '....TT..TT....',
  ],
];
const WRAITH = [
  [
    '.....vvvv.....',
    '...vvvvvvvv...',
    '..vvvvvvvvvv..',
    '..vvDvvvvDvv..',
    '..vvDvvvvDvv..',
    '..vvvvvvvvvv..',
    '..vvvVvvVvvv..',
    '...vvvvvvvv...',
    '...vv.vv.vv...',
    '...v...v..v...',
  ],
  [
    '.....vvvv.....',
    '...vvvvvvvv...',
    '..vvvvvvvvvv..',
    '..vDvvvvvvDv..',
    '..vDvvvvvvDv..',
    '..vvvvvvvvvv..',
    '..vvVvvvvVvv..',
    '...vvvvvvvv...',
    '...v.vv.vv....',
    '....v..v..v...',
  ],
];
const GLOB = [
  '..tt..',
  '.tttt.',
  'tttatt',
  'ttaatt',
  '.tttt.',
  '..tt..',
];
// Armored beetle — steel carapace (tough, ~3 hits). Tinted red once cracked.
const BEETLE = [
  [
    '....UUUUUU....',
    '..UUUUUUUUUU..',
    '.UUuuUUUUuuUU.',
    'UUUUUUUUUUUUUU',
    'UUEUUUUUUUUEUU',
    'UUEUUUUUUUUEUU',
    'UUUUdUUUUdUUUU',
    'UUUUUUUUUUUUUU',
    '.UUUUUUUUUUUU.',
    'd.dd.dd.dd.d.d',
    '.d..d..d..d.d.',
    '..............',
  ],
  [
    '....UUUUUU....',
    '..UUUUUUUUUU..',
    '.UUuuUUUUuuUU.',
    'UUUUUUUUUUUUUU',
    'UUEUUUUUUUUEUU',
    'UUEUUUUUUUUEUU',
    'UUUUdUUUUdUUUU',
    'UUUUUUUUUUUUUU',
    '.UUUUUUUUUUUU.',
    '.dd.dd.dd.dd.d',
    'd..d..d..d..d.',
    '..............',
  ],
];
// Wall crawler — a purple spider that clings to walls and lunges out.
const CRAWLER = [
  [
    'm..m....m..m..',
    '.mm.m..m.mm...',
    '..mmMMMMmm....',
    '.mMMMMMMMMm...',
    '.mMaMMMMaMm...',
    '.mMMMMMMMMm...',
    '..mMMMMMMm....',
    '.mm.m..m.mm...',
    'm..m....m..m..',
    '..............',
    '..............',
    '..............',
  ],
  [
    '.m..m..m..m...',
    'm.mm.m..m.mm..',
    '..mmMMMMmm....',
    '.mMMMMMMMMm...',
    '.mMaMMMMaMm...',
    '.mMMMMMMMMm...',
    '..mMMMMMMm....',
    'm.mm.m..m.mm..',
    '.m..m..m..m...',
    '..............',
    '..............',
    '..............',
  ],
];

// ---------------------------------------------------------------------------
// NPCs
const NPC_MARA = [
  '....nnnnnn......',
  '...nnnnnnnn.....',
  '...nnssssnn.....',
  '...nsEssEsn.....',
  '...nssssssn.....',
  '....ssssss......',
  '...aaaaaaaa.....',
  '..aaaaaaaaaa....',
  '..saiiiiiias....',
  '..saiiiiiias....',
  '..saiiiiiias....',
  '...aiiiiiia.....',
  '...aaaaaaaa.....',
  '...aaa..aaa.....',
  '...aaa..aaa.....',
  '...aaa..aaa.....',
  '...bbb..bbb.....',
  '..bbbb..bbbb....',
];
const NPC_GUS = [
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..hhhhhhhhhhhh..',
  '....ssssssss....',
  '....sEssssEs....',
  '....qqssssqq....',
  '...qqqqqqqqqq...',
  '....qqqqqqqq....',
  '...uKKKKKKKKu...',
  '..uKKKKKKKKKKu..',
  '..sKKKKKKKKKKs..',
  '..sKKKKKKKKKKs..',
  '...KKKKKKKKKK...',
  '...ppp....ppp...',
  '...ppp....ppp...',
  '...ppp....ppp...',
  '...bbb....bbb...',
  '..bbbb....bbbb..',
];
const NPC_MAYOR = [
  '....xxxxxxxx....',
  '...xxxxxxxxxx...',
  '..xxxxxxxxxxxx..',
  '....ssssssss....',
  '....sEssssEs....',
  '....ssssssss....',
  '.....ssssss.....',
  '...dddddddddd...',
  '..dddddddddddd..',
  '..sddiiiiiidds..',
  '..sddiillii dds.'.replace(' ', 'd'),
  '..sddiiiiiidds..',
  '...dddddddddd...',
  '...ddd....ddd...',
  '...ddd....ddd...',
  '...ddd....ddd...',
  '...xxx....xxx...',
  '..xxxx....xxxx..',
];

// ---------------------------------------------------------------------------
// items & props
const PICKAXE = [
  '.........uu.',
  '.......uuuu.',
  '....uuuuuu..',
  '..uuuu.nn...',
  '.uuu..nn....',
  '.uu..nn.....',
  '.u..nn......',
  '...nn.......',
  '..nn........',
  '.nn.........',
  'nn..........',
  'n...........',
];
const HEART = [
  '.ff..ff.',
  'ffffffff',
  'fFffffFf',
  'ffffffff',
  '.ffffff.',
  '..ffff..',
  '...ff...',
  '........',
];
const ORB = [
  '..zzzz..',
  '.zzizzz.',
  'zzizzzzz',
  'zzzzzzzz',
  'zZzzzzzz',
  'zZZzzzZz',
  '.zZZZZz.',
  '..zzzz..',
];
const COIN = [
  '..llll..',
  '.llllll.',
  'lliilllL',
  'lliilllL',
  'llllllLL',
  'llllllLL',
  '.llLLLL.',
  '..LLLL..',
];
const DYNA = [
  '....yy..',
  '...y....',
  '..ff....',
  '..ffF...',
  '..fFf...',
  '..Fff...',
  '..fFF...',
  '..FFF...',
];
const TELEPORT_KIT = [
  '..zzzzzzzz..',
  '.zZZZZZZZZz.',
  '.zZuuuuuuZz.',
  '.zZuzzzzuZz.',
  '.zZuzzzzuZz.',
  '.zZuuuuuuZz.',
  '.zZZZZZZZZz.',
  '..UUUUUUUU..',
  '..UU....UU..',
  '.UUU....UUU.',
];
const IDOL = [
  '......llll......',
  '.....llllll.....',
  '....lLllllLl....',
  '....llLLLLll....',
  '.....llllll.....',
  '....LllllllL....',
  '...LlllllLllL...',
  '...Llll.llllL...',
  '...LlllllLllL...',
  '....LllllllL....',
  '.....llllll.....',
  '....LLLLLLLL....',
  '...LLLLLLLLLL...',
  '..LLLLLLLLLLLL..',
];
// Sun Crown — the frozen region's final treasure (gold + ice gems)
const CROWN = [
  '..z..l..z..l..z.',
  '..zl.ll.lz.ll.z.',
  '.lzllllllllllzll',
  '.llllzllllzllll.',
  '.lLllllllllllLl.',
  '.lLLLLLLLLLLLLl.',
  '.llzLLLLLLLLzll.',
  '..lLLLLLLLLLLl..',
  '..LLLLLLLLLLLL..',
];
// Loot stash — the sack of gems you drop when you die
const STASH = [
  '...NNNN...',
  '..NnnnnN..',
  '.NnyzynN..',
  'NnzynyznN.',
  'NnynzynyN.',
  'NnzynzynN.',
  '.NnynynN..',
  '..NnnnN...',
  '..NNNNN...',
];
// Checkpoint temple — stone obelisk topped by a crystal (tinted dim/bright).
const CHECKPOINT = [
  '.....ii.....',
  '....zzzz....',
  '...zzZZzz...',
  '...zZZZZz...',
  '....zZZz....',
  '.....zz.....',
  '....qQQq....',
  '...qQQQQq...',
  '...qQQQQq...',
  '...qQQQQq...',
  '..qQQQQQQq..',
  '..qQQQQQQq..',
  '..QQQQQQQQ..',
  '.QQQQQQQQQQ.',
  '.QQQQQQQQQQ.',
  'QQQQQQQQQQQQ',
  'QQQQQQQQQQQQ',
  '.QQQQQQQQQQ.',
];
const MUSHROOM = [
  '...zzzzzz...',
  '..zzizzizz..',
  '.zzzzzzzzzz.',
  '.zZzzizzzZz.',
  '..ZZzzzzZZ..',
  '....qqqq....',
  '....qqqq....',
  '....QqqQ....',
  '...QQqqQQ...',
];
const BIRD = [
  ['..z...', '.zzz..', 'zzzzzc', '.zz...'],
  ['......', 'zzz...', '.zzzzc', 'z.z...'],
];

// ---------------------------------------------------------------------------
// tiles — painted with a seeded speckle so every load looks the same
export const TILE = {
  EMPTY: -1,
  SAND: 0, GRASS: 1, DIRT: 2, DIRT2: 3, STONE: 4, STONE2: 5,
  DEEP: 6, DEEP2: 7, BEDROCK: 8, OBSIDIAN: 9, BRICK: 10, BRICK2: 11,
  LADDER: 12, SPIKE: 13,
  ORE_COPPER: 14, ORE_SILVER: 15, ORE_GOLD: 16, ORE_EMERALD: 17,
  ORE_RUBY: 18, ORE_DIAMOND: 19, ORB_ROCK: 20, GATE: 21,
  BG_DIRT: 22, BG_STONE: 23, BG_DEEP: 24, BG_SKY: 25, BG_BRICK: 26,
  // frozen east region
  FROST_GRASS: 27, FROST_DIRT: 28, FROST_ROCK: 29, FROST_DEEP: 30,
  ORE_MYTHRIL: 31, BG_FROST: 32,
  // tool-gated blocks
  HARDROCK: 33, ICE_BLOCK: 34,
};

// tile hp / value tables used by the game scene
export const TILE_INFO = {
  [TILE.SAND]: { hp: 1 }, [TILE.GRASS]: { hp: 1 },
  [TILE.DIRT]: { hp: 1 }, [TILE.DIRT2]: { hp: 2 },
  [TILE.STONE]: { hp: 3 }, [TILE.STONE2]: { hp: 4 },
  [TILE.DEEP]: { hp: 5 }, [TILE.DEEP2]: { hp: 7 },
  [TILE.OBSIDIAN]: { hp: 12 },
  [TILE.BRICK]: { hp: 6 }, [TILE.BRICK2]: { hp: 6 },
  [TILE.ORE_COPPER]: { hp: 2, ore: 'copper' },
  [TILE.ORE_SILVER]: { hp: 3, ore: 'silver' },
  [TILE.ORE_GOLD]: { hp: 4, ore: 'gold' },
  [TILE.ORE_EMERALD]: { hp: 5, ore: 'emerald' },
  [TILE.ORE_RUBY]: { hp: 6, ore: 'ruby' },
  [TILE.ORE_DIAMOND]: { hp: 7, ore: 'diamond' },
  [TILE.ORB_ROCK]: { hp: 3, ore: 'orb' },
  [TILE.FROST_GRASS]: { hp: 1 },
  [TILE.FROST_DIRT]: { hp: 2 }, [TILE.FROST_ROCK]: { hp: 4 },
  [TILE.FROST_DEEP]: { hp: 6 },
  [TILE.ORE_MYTHRIL]: { hp: 8, ore: 'mythril' },
  // gated: only breakable once you meet `req`
  [TILE.HARDROCK]: { hp: 6, req: { pick: 3 } },
  [TILE.ICE_BLOCK]: { hp: 6, req: { firePick: true } },
};
export const ORES = {
  copper: { value: 5, color: 0xd08850, name: 'Copper' },
  silver: { value: 12, color: 0xc8d0dc, name: 'Silver' },
  gold: { value: 25, color: 0xf2c53a, name: 'Gold' },
  emerald: { value: 45, color: 0x3ad078, name: 'Emerald' },
  ruby: { value: 70, color: 0xe83a50, name: 'Ruby' },
  diamond: { value: 120, color: 0x9ae8f2, name: 'Diamond' },
  mythril: { value: 200, color: 0xbfe9ff, name: 'Mythril' },
  orb: { value: 0, color: 0x48b8f0, name: 'Relic Orb' },
};

let seed = 1337;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

function paintBase(g, x, y, base, dark, light, speckle = 26) {
  g.fillStyle = base;
  g.fillRect(x, y, 16, 16);
  for (let i = 0; i < speckle; i++) {
    g.fillStyle = rnd() < 0.5 ? dark : light;
    g.fillRect(x + Math.floor(rnd() * 16), y + Math.floor(rnd() * 16), 1 + (rnd() < 0.2 ? 1 : 0), 1);
  }
  // top edge highlight + bottom shadow for depth
  g.fillStyle = light; g.globalAlpha = 0.4; g.fillRect(x, y, 16, 1); g.globalAlpha = 1;
  g.fillStyle = dark; g.globalAlpha = 0.5; g.fillRect(x, y + 15, 16, 1); g.globalAlpha = 1;
}

function paintOre(g, x, y, color, hi) {
  const spots = [[3, 4], [10, 3], [6, 9], [11, 11], [3, 12]];
  for (const [sx, sy] of spots) {
    if (rnd() < 0.25) continue;
    g.fillStyle = color;
    g.fillRect(x + sx, y + sy, 3, 3);
    g.fillStyle = hi;
    g.fillRect(x + sx, y + sy, 1, 1);
  }
}

export function makeTiles(scene) {
  seed = 1337;
  const count = 35;
  const tex = scene.textures.createCanvas('tiles', count * 16, 16);
  const g = tex.getContext();
  const P = (i) => i * 16;

  // SAND (town ground)
  paintBase(g, P(TILE.SAND), 0, '#d8b46a', '#b28c48', '#ecd28e');
  // GRASS — sandy dirt with dry grass top
  paintBase(g, P(TILE.GRASS), 0, '#a8763c', '#84582a', '#c29254');
  g.fillStyle = '#8aa83c'; g.fillRect(P(TILE.GRASS), 0, 16, 3);
  g.fillStyle = '#a8c454';
  for (let i = 0; i < 8; i++) g.fillRect(P(TILE.GRASS) + Math.floor(rnd() * 15), 0, 1, 2);
  g.fillStyle = '#6a8228'; g.fillRect(P(TILE.GRASS), 3, 16, 1);
  // DIRT / DIRT2
  paintBase(g, P(TILE.DIRT), 0, '#a8763c', '#84582a', '#c29254');
  paintBase(g, P(TILE.DIRT2), 0, '#8a5e2e', '#68441e', '#a87844');
  // STONE / STONE2 (green-grey cavern rock)
  paintBase(g, P(TILE.STONE), 0, '#6e7d6a', '#4e5a4c', '#8e9d88');
  paintBase(g, P(TILE.STONE2), 0, '#57645a', '#3c4640', '#748478');
  // DEEP / DEEP2 (cold purple-black)
  paintBase(g, P(TILE.DEEP), 0, '#4a3d5c', '#332a42', '#645478');
  paintBase(g, P(TILE.DEEP2), 0, '#38304a', '#241e33', '#4e4266');
  // BEDROCK
  paintBase(g, P(TILE.BEDROCK), 0, '#232030', '#161420', '#332e44', 12);
  g.strokeStyle = '#141220'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(P(TILE.BEDROCK) + 2, 2); g.lineTo(P(TILE.BEDROCK) + 13, 13);
  g.moveTo(P(TILE.BEDROCK) + 13, 2); g.lineTo(P(TILE.BEDROCK) + 2, 13);
  g.stroke();
  // OBSIDIAN
  paintBase(g, P(TILE.OBSIDIAN), 0, '#2e1e42', '#1c1229', '#503a6e', 14);
  g.fillStyle = '#8a6ab8'; g.fillRect(P(TILE.OBSIDIAN) + 3, 3, 2, 1); g.fillRect(P(TILE.OBSIDIAN) + 10, 9, 2, 1);
  // BRICK (ancient sandstone) & mossy
  for (const [idx, base, dark, light] of [
    [TILE.BRICK, '#b09048', '#8a6c30', '#ccae66'],
    [TILE.BRICK2, '#96a050', '#6e7a34', '#b4c46e'],
  ]) {
    paintBase(g, P(idx), 0, base, dark, light, 10);
    g.fillStyle = dark;
    g.fillRect(P(idx), 7, 16, 1); g.fillRect(P(idx), 15, 16, 1);
    g.fillRect(P(idx) + 7, 0, 1, 8); g.fillRect(P(idx) + 3, 8, 1, 8) ; g.fillRect(P(idx) + 11, 8, 1, 8);
  }
  // LADDER
  g.clearRect(P(TILE.LADDER), 0, 16, 16);
  g.fillStyle = '#8a5e2e';
  g.fillRect(P(TILE.LADDER) + 2, 0, 3, 16); g.fillRect(P(TILE.LADDER) + 11, 0, 3, 16);
  g.fillStyle = '#a87844';
  for (let ry = 2; ry < 16; ry += 5) g.fillRect(P(TILE.LADDER) + 2, ry, 12, 2);
  // SPIKE
  g.clearRect(P(TILE.SPIKE), 0, 16, 16);
  g.fillStyle = '#c8d0dc';
  for (let sx = 0; sx < 16; sx += 4) {
    g.beginPath();
    g.moveTo(P(TILE.SPIKE) + sx, 16); g.lineTo(P(TILE.SPIKE) + sx + 2, 5); g.lineTo(P(TILE.SPIKE) + sx + 4, 16);
    g.fill();
  }
  g.fillStyle = '#8a94a2'; g.fillRect(P(TILE.SPIKE), 14, 16, 2);
  // ORES
  paintBase(g, P(TILE.ORE_COPPER), 0, '#a8763c', '#84582a', '#c29254');
  paintOre(g, P(TILE.ORE_COPPER), 0, '#d08850', '#f0b080');
  paintBase(g, P(TILE.ORE_SILVER), 0, '#8a5e2e', '#68441e', '#a87844');
  paintOre(g, P(TILE.ORE_SILVER), 0, '#c8d0dc', '#f0f4f8');
  paintBase(g, P(TILE.ORE_GOLD), 0, '#6e7d6a', '#4e5a4c', '#8e9d88');
  paintOre(g, P(TILE.ORE_GOLD), 0, '#f2c53a', '#f8e290');
  paintBase(g, P(TILE.ORE_EMERALD), 0, '#57645a', '#3c4640', '#748478');
  paintOre(g, P(TILE.ORE_EMERALD), 0, '#3ad078', '#90f0b8');
  paintBase(g, P(TILE.ORE_RUBY), 0, '#4a3d5c', '#332a42', '#645478');
  paintOre(g, P(TILE.ORE_RUBY), 0, '#e83a50', '#f890a0');
  paintBase(g, P(TILE.ORE_DIAMOND), 0, '#38304a', '#241e33', '#4e4266');
  paintOre(g, P(TILE.ORE_DIAMOND), 0, '#9ae8f2', '#e0fbff');
  // ORB ROCK — cracked rock with a blue glow
  paintBase(g, P(TILE.ORB_ROCK), 0, '#5c5c6a', '#42424e', '#787888', 14);
  g.fillStyle = '#48b8f0'; g.fillRect(P(TILE.ORB_ROCK) + 5, 5, 6, 6);
  g.fillStyle = '#b0e4ff'; g.fillRect(P(TILE.ORB_ROCK) + 6, 6, 2, 2);
  // GATE (sealed ancient door)
  paintBase(g, P(TILE.GATE), 0, '#7c6434', '#5c4820', '#9c8452', 8);
  g.fillStyle = '#48b8f0'; g.fillRect(P(TILE.GATE) + 6, 2, 4, 12);
  g.fillStyle = '#5c4820'; g.fillRect(P(TILE.GATE), 0, 2, 16); g.fillRect(P(TILE.GATE) + 14, 0, 2, 16);
  // BG variants (darker, for revealed cave walls behind the player)
  paintBase(g, P(TILE.BG_DIRT), 0, '#5c3f1e', '#472f14', '#6e4e28', 16);
  paintBase(g, P(TILE.BG_STONE), 0, '#3a4438', '#2a322a', '#4a564a', 16);
  paintBase(g, P(TILE.BG_DEEP), 0, '#241e33', '#181326', '#302842', 16);
  paintBase(g, P(TILE.BG_BRICK), 0, '#665022', '#4e3c18', '#7a6230', 8);
  g.fillStyle = '#4e3c18';
  g.fillRect(P(TILE.BG_BRICK), 7, 16, 1); g.fillRect(P(TILE.BG_BRICK) + 7, 0, 1, 8);
  // BG_SKY solid (unused visually, keep slot)
  g.fillStyle = '#78b8e8'; g.fillRect(P(TILE.BG_SKY), 0, 16, 16);

  // ---- frozen east region ----
  // FROST_GRASS — snowy crust over pale dirt
  paintBase(g, P(TILE.FROST_GRASS), 0, '#8fa6c0', '#6d84a0', '#b6cfe6');
  g.fillStyle = '#eaf4ff'; g.fillRect(P(TILE.FROST_GRASS), 0, 16, 4);
  g.fillStyle = '#cfe4f5';
  for (let i = 0; i < 6; i++) g.fillRect(P(TILE.FROST_GRASS) + Math.floor(rnd() * 15), 3, 2, 1);
  paintBase(g, P(TILE.FROST_DIRT), 0, '#7f93ad', '#5f7290', '#a7bfd6');
  paintBase(g, P(TILE.FROST_ROCK), 0, '#6d8296', '#4e6070', '#96b0c4');
  paintBase(g, P(TILE.FROST_DEEP), 0, '#455a72', '#2f3f52', '#688098');
  // sparkle flecks of ice
  for (const idx of [TILE.FROST_ROCK, TILE.FROST_DEEP]) {
    g.fillStyle = '#eaf6ff';
    for (let i = 0; i < 4; i++) g.fillRect(P(idx) + Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1, 1);
  }
  // MYTHRIL ore in deep frost
  paintBase(g, P(TILE.ORE_MYTHRIL), 0, '#455a72', '#2f3f52', '#688098');
  paintOre(g, P(TILE.ORE_MYTHRIL), 0, '#bfe9ff', '#ffffff');
  // BG_FROST (dark ice wall behind dug areas)
  paintBase(g, P(TILE.BG_FROST), 0, '#2c3a4c', '#1f2a38', '#3a4c62', 16);

  // HARDROCK — dark banded stone with a bronze rivet (needs Pickaxe III)
  paintBase(g, P(TILE.HARDROCK), 0, '#4a4650', '#302c38', '#645e6e', 10);
  g.fillStyle = '#2a2732';
  g.fillRect(P(TILE.HARDROCK), 5, 16, 2); g.fillRect(P(TILE.HARDROCK), 11, 16, 2);
  g.fillStyle = '#c89a4a'; g.fillRect(P(TILE.HARDROCK) + 7, 7, 3, 3);
  g.fillStyle = '#f0d08a'; g.fillRect(P(TILE.HARDROCK) + 7, 7, 1, 1);
  // ICE_BLOCK — translucent blue crystal (needs the Fire Pick)
  paintBase(g, P(TILE.ICE_BLOCK), 0, '#7ec4e8', '#4f9ac8', '#c6ecff', 8);
  g.strokeStyle = '#eafaff'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(P(TILE.ICE_BLOCK) + 3, 2); g.lineTo(P(TILE.ICE_BLOCK) + 9, 8); g.lineTo(P(TILE.ICE_BLOCK) + 5, 14);
  g.moveTo(P(TILE.ICE_BLOCK) + 12, 3); g.lineTo(P(TILE.ICE_BLOCK) + 8, 9);
  g.stroke();

  tex.refresh();

  // crack overlays (2 damage stages)
  for (const [key, n] of [['crack1', 5], ['crack2', 11]]) {
    const c = scene.textures.createCanvas(key, 16, 16);
    const cg = c.getContext();
    cg.strokeStyle = 'rgba(10,8,6,0.75)';
    cg.lineWidth = 1;
    let cx = 8, cy = 8;
    seed = key === 'crack1' ? 42 : 99;
    for (let i = 0; i < n; i++) {
      const nx = Math.floor(rnd() * 16), ny = Math.floor(rnd() * 16);
      cg.beginPath(); cg.moveTo(cx, cy); cg.lineTo(nx, ny); cg.stroke();
      cx = nx; cy = ny;
    }
    c.refresh();
  }
}

// ---------------------------------------------------------------------------
export function makeSprites(scene) {
  sheet(scene, 'player', [
    playerFrame('idle'), playerFrame('walk1'), playerFrame('idle'),
    playerFrame('walk2'), playerFrame('jump'),
  ], 16, 22);
  sheet(scene, 'grub', GRUB, 14, 12);
  sheet(scene, 'beetle', BEETLE, 14, 12);
  sheet(scene, 'crawler', CRAWLER, 14, 12);
  sheet(scene, 'bat', BAT, 14, 6);
  sheet(scene, 'spitter', SPITTER, 14, 8);
  sheet(scene, 'wraith', WRAITH, 14, 10);
  sheet(scene, 'bird', BIRD, 6, 4);
  single(scene, 'glob', GLOB);
  single(scene, 'npc_mara', NPC_MARA);
  single(scene, 'npc_gus', NPC_GUS);
  single(scene, 'npc_mayor', NPC_MAYOR);
  single(scene, 'pickaxe', PICKAXE);
  single(scene, 'heart', HEART);
  single(scene, 'orb', ORB);
  single(scene, 'coin', COIN);
  single(scene, 'dynamite', DYNA);
  single(scene, 'telekit', TELEPORT_KIT);
  single(scene, 'idol', IDOL);
  single(scene, 'mushroom', MUSHROOM);
  single(scene, 'checkpoint', CHECKPOINT);
  single(scene, 'crown', CROWN);
  single(scene, 'stash', STASH);

  // ore pickup sprites (8x8 chunks tinted at runtime)
  const chunk = scene.textures.createCanvas('chunk', 8, 8);
  const cg = chunk.getContext();
  cg.fillStyle = '#ffffff';
  cg.fillRect(2, 1, 4, 1); cg.fillRect(1, 2, 6, 4); cg.fillRect(2, 6, 4, 1);
  chunk.refresh();

  // soft radial light (for lighting overlay erase brush)
  const light = scene.textures.createCanvas('lightbrush', 256, 256);
  const lg = light.getContext();
  const grad = lg.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  lg.fillStyle = grad;
  lg.fillRect(0, 0, 256, 256);
  light.refresh();

  // 1px white (particles, flashes)
  const px1 = scene.textures.createCanvas('px', 2, 2);
  px1.getContext().fillStyle = '#ffffff';
  px1.getContext().fillRect(0, 0, 2, 2);
  px1.refresh();

  // portal arch 26x34
  const portal = scene.textures.createCanvas('portal', 26, 34);
  const pg = portal.getContext();
  pg.fillStyle = '#7c6434';
  pg.fillRect(0, 6, 5, 28); pg.fillRect(21, 6, 5, 28);
  pg.fillRect(0, 0, 26, 6);
  pg.fillStyle = '#9c8452';
  pg.fillRect(1, 1, 24, 2); pg.fillRect(1, 7, 2, 26); pg.fillRect(23, 7, 2, 26);
  pg.fillStyle = '#5c4820';
  pg.fillRect(0, 5, 26, 1);
  portal.refresh();

  // shrine pedestal 20x12
  const ped = scene.textures.createCanvas('pedestal', 20, 12);
  const eg = ped.getContext();
  eg.fillStyle = '#8a6c30'; eg.fillRect(4, 0, 12, 12);
  eg.fillStyle = '#b09048'; eg.fillRect(2, 0, 16, 3); eg.fillRect(0, 9, 20, 3);
  eg.fillStyle = '#ccae66'; eg.fillRect(2, 0, 16, 1); eg.fillRect(0, 9, 20, 1);
  ped.refresh();
}

// ---------------------------------------------------------------------------
// town buildings / props, painted
function canvasTex(scene, key, w, h, painter) {
  const tex = scene.textures.createCanvas(key, w, h);
  painter(tex.getContext());
  tex.refresh();
}

export function makeProps(scene) {
  // General store — wood cabin with awning and sign
  canvasTex(scene, 'bldg_shop', 74, 58, (g) => {
    g.fillStyle = '#8a5e2e'; g.fillRect(2, 14, 70, 44);       // walls
    g.fillStyle = '#a87844';
    for (let y = 16; y < 58; y += 6) g.fillRect(2, y, 70, 2); // planks
    g.fillStyle = '#68441e'; g.fillRect(0, 8, 74, 8);          // roof beam
    g.fillStyle = '#c94f38';                                    // awning
    for (let x = 0; x < 74; x += 12) { g.fillRect(x, 16, 6, 8); g.fillStyle = '#f2e6c9'; g.fillRect(x + 6, 16, 6, 8); g.fillStyle = '#c94f38'; }
    g.fillStyle = '#2c1c0c'; g.fillRect(28, 34, 18, 24);       // door
    g.fillStyle = '#f2d75c'; g.fillRect(42, 44, 2, 3);         // handle
    g.fillStyle = '#78d8f0'; g.fillRect(8, 32, 14, 12); g.fillRect(52, 32, 14, 12); // windows
    g.fillStyle = '#68441e'; g.strokeStyle = '#68441e';
    g.strokeRect(8.5, 32.5, 13, 11); g.strokeRect(52.5, 32.5, 13, 11);
    g.fillStyle = '#f2e6c9'; g.fillRect(17, 0, 40, 10);        // sign
    g.fillStyle = '#5f3413'; g.font = '7px monospace'; g.textBaseline = 'top';
    g.fillText('TRADE', 22, 2);
  });
  // saloon/house
  canvasTex(scene, 'bldg_house', 60, 52, (g) => {
    g.fillStyle = '#c9a86a'; g.fillRect(2, 16, 56, 36);
    g.fillStyle = '#b0925a';
    for (let y = 18; y < 52; y += 7) g.fillRect(2, y, 56, 2);
    g.fillStyle = '#a03030'; g.beginPath();
    g.moveTo(0, 18); g.lineTo(30, 0); g.lineTo(60, 18); g.closePath(); g.fill();
    g.fillStyle = '#7c2020'; g.fillRect(0, 16, 60, 3);
    g.fillStyle = '#2c1c0c'; g.fillRect(24, 30, 14, 22);
    g.fillStyle = '#78d8f0'; g.fillRect(8, 28, 10, 10); g.fillRect(44, 28, 10, 10);
  });
  // mine head-frame over the shaft
  canvasTex(scene, 'minehead', 52, 46, (g) => {
    g.fillStyle = '#68441e';
    g.fillRect(2, 4, 6, 42); g.fillRect(44, 4, 6, 42);
    g.fillRect(0, 0, 52, 6);
    g.fillStyle = '#8a5e2e';
    g.fillRect(6, 14, 40, 4); g.fillRect(6, 30, 40, 4);
    // diagonal braces
    g.strokeStyle = '#8a5e2e'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(6, 18); g.lineTo(46, 30); g.stroke();
    g.beginPath(); g.moveTo(46, 18); g.lineTo(6, 30); g.stroke();
    g.fillStyle = '#f2d75c'; g.font = '6px monospace';
    g.fillText('MINE', 15, 1);
  });
  canvasTex(scene, 'cactus', 14, 22, (g) => {
    g.fillStyle = '#3a875f';
    g.fillRect(5, 2, 4, 20); g.fillRect(0, 6, 4, 3); g.fillRect(1, 6, 3, 8);
    g.fillRect(10, 9, 4, 3); g.fillRect(10, 4, 3, 8);
    g.fillStyle = '#57b47f'; g.fillRect(5, 2, 1, 20); g.fillRect(1, 6, 1, 8);
  });
  canvasTex(scene, 'barrel', 12, 14, (g) => {
    g.fillStyle = '#8a5e2e'; g.fillRect(1, 0, 10, 14);
    g.fillStyle = '#a87844'; g.fillRect(2, 0, 2, 14); g.fillRect(7, 0, 2, 14);
    g.fillStyle = '#4c4c58'; g.fillRect(0, 2, 12, 2); g.fillRect(0, 10, 12, 2);
  });
  canvasTex(scene, 'lamppost', 10, 30, (g) => {
    g.fillStyle = '#3c3c46'; g.fillRect(4, 6, 2, 24);
    g.fillRect(2, 0, 6, 8);
    g.fillStyle = '#f2d75c'; g.fillRect(3, 1, 4, 6);
  });
  canvasTex(scene, 'cloud', 38, 12, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(6, 4, 26, 6); g.fillRect(10, 0, 12, 6); g.fillRect(20, 2, 12, 5);
    g.fillRect(0, 6, 38, 4);
  });
  // parallax dunes strip
  canvasTex(scene, 'dunes', 320, 60, (g) => {
    g.fillStyle = '#c99e58';
    g.beginPath(); g.moveTo(0, 60);
    for (let x = 0; x <= 320; x += 8) {
      g.lineTo(x, 34 + Math.sin(x / 34) * 12 + Math.sin(x / 13) * 4);
    }
    g.lineTo(320, 60); g.closePath(); g.fill();
    g.fillStyle = '#b8894a';
    g.beginPath(); g.moveTo(0, 60);
    for (let x = 0; x <= 320; x += 8) {
      g.lineTo(x, 46 + Math.sin(x / 21 + 3) * 8);
    }
    g.lineTo(320, 60); g.closePath(); g.fill();
  });
}
