# Deep Dig — An Explorer's Dream

A mining platformer built with [Phaser 4](https://phaser.io/), heavily inspired by
the *SteamWorld Dig* formula but with its own theme: instead of robots, you play
**Dusty**, an Indiana-Jones-style explorer who arrives at the desert town of
**Sundrop Flats** chasing a dream — a Golden Idol said to sleep at the bottom of
the world.

Every sprite, tile and sound is **generated at runtime** (ASCII pixel maps,
painted canvases, WebAudio synthesis) — there are no asset files at all except
the pixel font.

## The loop

1. Dig into the huge underground world below the town (one connected map,
   188 tiles wide and 262 deep, seeded generation).
2. Mine ore — copper, silver, gold, emerald, ruby, diamond, mythril — into a
   limited bag.
3. Return to town (climb, portals, or hold **R** to recall) and sell to the
   local trader.
4. Buy upgrades: better pickaxes, bigger bag, brighter lamp, hearts, rope
   ladders, teleporter kits. Rare **Relic Orbs** from tool-gated blocks buy
   special gear (armor, loot magnet, lucky charm, steam lamp).
5. Dig deeper. Repeat until the dream comes true.

Press **Q** for the quest journal if you ever lose the thread, and **TAB** for
the world map.

## The world

Three regions sit side by side on one map, separated by bedrock spines with
sealed **rifts** between them. Each region is a full three-zone descent ending
in its own treasure, and each has its own town, trader and signature tool.

| Region | Town | Zones | Ends in |
| --- | --- | --- | --- |
| Desert (start) | Sundrop Flats | Dusty Mines · Emerald Caverns · Forgotten Abyss | The Golden Idol |
| Frost (east) | Frosthaven | Frostbite Hollow · Glacier Deep · The Frozen Throne | The Sun Crown |
| Molten (west, widest) | Cinder Reach | Cinder Steppes · Molten Halls · The Inferno Deep | The Heart of the Volcano |

- Claiming the **Golden Idol** opens the Rift east to the frost; claiming the
  **Sun Crown** opens the Ember Rift west to the lava. The **Heart of the
  Volcano** is the true ending.
- Every zone is sealed by an **ancient gate**; each needs a **Portal Stone**
  hidden in a brick cave in the zone above. Open gates become portals — a fast
  travel network back to town.
- Hidden **shrines** in the desert grant permanent powers: **double jump**,
  **drill dash** (smashes through soft ground), and **dynamite**.
- **Tool-gated blocks** wall off the richest ore: HARD ROCK needs Pickaxe III,
  ICE blocks need the **Fire Pick** (Frosthaven), HOT ROCK needs the **Water
  Gun** (Cinder Reach). Breaking one always yields a Relic Orb.
- The lava region hides a key-locked vault holding the **Fireproof Suit** —
  without it the Inferno Deep is unsurvivable.
- **Boulders** rest on cave floors and crush you if you dig out their support;
  only the Boulder Drill lets your pickaxe smash them.
- 12 hidden **golden relics** sit in bedrock vaults with a single diggable door.
  Found ones go on display at the **Museum of Relics** in Sundrop Flats.
- **Checkpoint temples** on each shaft line become your respawn point and
  relight your lantern.
- The deeper you go, the darker it gets: your lantern is a shrinking circle of
  light that drains underground and refills topside. Music shifts from friendly
  town chiptune to sparse minor grooves to a near-atonal abyss drone.
- Death drops your unsold gems where you fell — go back and get them. Progress
  (upgrades, dug tunnels, opened gates, explored map) saves to localStorage.

## Run it

```
npm install
npm run dev
```

Open http://localhost:5184 and click the page once so it has keyboard focus.

## Play it online

Deployed automatically to GitHub Pages — **https://davidgrgic89.github.io/deep-dig/**.
Every push to `main` rebuilds and republishes in ~1–2 minutes.

## Edit it online (no PC needed)

- **Quick tweaks:** open the repo on github.com and press `.` (or go to
  [github.dev](https://github.dev/davidgrgic89/deep-dig)) for a browser code
  editor. Commit a change and the live site updates itself.
- **Full dev in the browser:** on github.com click **Code → Codespaces →
  Create codespace**. It auto-runs `npm install` (see `.devcontainer/`); then in
  its terminal run `npm run dev` and open the forwarded port 5184 to play with
  live reload — all from any device, no local PC required.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | Move |
| Space | Jump — hold for higher; press again mid-air to double jump (once found) |
| X / J | Swing pickaxe — digs ahead; hold ↑ / ↓ to aim up or down |
| ↑ ↓ on ladders | Climb |
| **TAB** | **World map** — your dug tunnels, ore, landmarks, fog of war |
| **Q** | **Quest journal** — what to do next, chapter by chapter |
| Shift / C | Drill dash (once found) |
| K | Throw dynamite (once found) |
| G | Fire the water gun (cools lava into walkable rock) |
| L | Drop a rope ladder to climb back up |
| T | Place a teleporter camp (consumes a kit) |
| E | Talk / use portals / accept shrine gifts / view the museum |
| R (hold) | Emergency recall to town |
| P | Pause |
| M | Mute |

On a phone or tablet an on-screen pad appears automatically; **MAP** and
**QUESTS** buttons sit in the top-right next to pause and fullscreen.

## Game feel

The jump physics are carried over from our previous platformer (Forest Leap):
coyote time, jump buffering, variable jump height, apex float, heavier fall,
turn boost, squash & stretch. All constants live in the `P` block at the top of
[src/player.js](src/player.js).

## Code map

- [src/art.js](src/art.js) — all pixel art, generated (palette, ASCII sprite maps, tile painter)
- [src/world.js](src/world.js) — seeded world generation: three regions, strata, ores, caves, special rooms, gates, relic vaults
- [src/player.js](src/player.js) — movement physics, digging, ladder, dash
- [src/enemies.js](src/enemies.js) — grub, beetle, crawler, bat, spitter, wraith
- [src/boulder.js](src/boulder.js) — falling boulders
- [src/journal.js](src/journal.js) — quest journal, derived entirely from saved state
- [src/minimap.js](src/minimap.js) — world map texture painter + fog-of-war packing
- [src/audio.js](src/audio.js) — synthesized SFX + four depth-based music moods
- [src/scenes/GameScene.js](src/scenes/GameScene.js) — the world: digging, lighting, towns, shop logic, portals, combat
- [src/scenes/UIScene.js](src/scenes/UIScene.js) — HUD, dialogs, shop, portals, museum, map, journal
