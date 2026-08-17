// The quest journal. Everything here is DERIVED from saved state — there is no
// separate quest progress to keep in sync, so a journal entry can never drift
// out of step with the world. `buildJournal(registry)` is pure and cheap enough
// to call on every HUD refresh.
import { ARTIFACTS } from './world.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function buildJournal(r) {
  const u = r.get('upgrades') || {};
  const gates = r.get('openGates') || [];
  const shrines = r.get('takenShrines') || [];
  const relics = (r.get('foundArtifacts') || []).length;
  const pick = r.get('pickTier') || 1;
  const suited = r.get('skin') === 'player_fire';
  const gatesIn = (reg) => gates.filter((k) => k.startsWith(`r${reg}z`)).length;

  const chapters = [
    {
      name: 'Chapter I — Sundrop Flats',
      locked: false,
      lockNote: null,
      entries: [
        {
          text: 'Dig into the mine, then sell your ore to Mara',
          detail: 'Talk to her and your whole bag sells at once',
          done: !!r.get('soldOnce'),
        },
        {
          text: `Upgrade to Pickaxe III  (you have ${ROMAN[pick - 1]})`,
          detail: 'Only Pickaxe III can crack HARD ROCK open for Relic Orbs',
          done: pick >= 3,
        },
        {
          text: `Find the three ancient shrines  (${shrines.length}/3)`,
          detail: 'Double jump, drill dash and dynamite are hidden in brick caves',
          done: shrines.length >= 3,
        },
        {
          text: `Open the three sealed gates  (${gatesIn(0)}/3)`,
          detail: 'Every gate needs the Portal Stone hidden in the zone above it',
          done: gatesIn(0) >= 3,
        },
        {
          text: 'Claim the Golden Idol at 242m',
          detail: 'The Idol tears open the Rift on the eastern edge of town',
          done: !!r.get('idolClaimed'),
        },
      ],
    },
    {
      name: 'Chapter II — Frosthaven',
      locked: !r.get('rightUnlocked'),
      lockNote: 'Sealed until you claim the Golden Idol',
      entries: [
        {
          text: 'Cross the Rift east and buy the FIRE PICK from Yuki',
          detail: 'Costs 1500 — it is the only thing that melts ICE blocks',
          done: !!u.firePick,
        },
        {
          text: `Open the frozen gates  (${gatesIn(1)}/3)`,
          detail: 'Same rule as the desert: a Portal Stone for each gate',
          done: gatesIn(1) >= 3,
        },
        {
          text: 'Claim the Sun Crown at the Frozen Throne',
          detail: 'The Crown burns open the Ember Rift on the western edge',
          done: !!r.get('crownClaimed'),
        },
      ],
    },
    {
      name: 'Chapter III — Cinder Reach',
      locked: !r.get('lavaUnlocked'),
      lockNote: 'Sealed until you claim the Sun Crown',
      entries: [
        {
          text: 'Buy the WATER GUN from Cinder',
          detail: 'G sprays lava into solid rock — bridges and safe ground',
          done: !!u.waterGun,
        },
        {
          text: 'Find the Vault Key hidden in a molten cave',
          detail: 'It sits in a small carved pocket, opposite side from the vault',
          done: (r.get('dungeonKeys') || 0) > 0 || suited,
        },
        {
          text: 'Unlock the vault and wear the Fireproof Suit',
          detail: 'Halves lava damage — the Inferno Deep is unsurvivable without it',
          done: suited,
        },
        {
          text: `Open the molten gates  (${gatesIn(2)}/3)`,
          detail: 'The widest region in the world — three gates, far apart',
          done: gatesIn(2) >= 3,
        },
        {
          text: 'Tear the Heart of the Volcano from the Inferno Deep',
          detail: 'The last treasure in the world',
          done: !!r.get('heartClaimed'),
        },
      ],
    },
  ];

  const orbGear = ['armor', 'magnet', 'lucky', 'steamlamp'].filter((k) => u[k]).length;
  const side = [
    {
      text: `Golden relics recovered  (${relics}/${ARTIFACTS.length})`,
      detail: 'Sealed in bedrock vaults with one diggable door — show them at the Museum',
      done: relics >= ARTIFACTS.length,
    },
    {
      text: 'Buy the BOULDER DRILL',
      detail: 'Lets your pickaxe smash boulders instead of bouncing off them',
      done: !!u.drill,
    },
    {
      text: `Spend Relic Orbs on special gear  (${orbGear}/4)`,
      detail: 'Leather Armor, Loot Magnet, Lucky Charm, Steam Lamp',
      done: orbGear >= 4,
    },
  ];

  // The headline objective: first unfinished entry in the deepest chapter you
  // have actually unlocked, so it always points at something you can do now.
  let current = null;
  for (const ch of chapters) {
    if (ch.locked) continue;
    const next = ch.entries.find((e) => !e.done);
    if (next) { current = next; break; }
  }
  if (!current) current = side.find((e) => !e.done) || null;

  return { chapters, side, current, relics, relicTotal: ARTIFACTS.length };
}
