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
   250 tiles / 250 "meters" deep, seeded generation).
2. Mine ore — copper, silver, gold, emerald, ruby, diamond — into a limited bag.
3. Return to town (climb, portals, or hold **R** to recall) and sell to Mara.
4. Buy upgrades: better pickaxes, bigger bag, brighter lamp, hearts,
   teleporter kits. Rare **Relic Orbs** from hidden caves buy special gear
   (armor, loot magnet, lucky charm, steam lamp).
5. Dig deeper. Repeat until the dream comes true.

## The world

| Zone | Depth | Character |
| --- | --- | --- |
| Sundrop Flats | surface | Peaceful town, warm music, birds, NPCs |
| Dusty Mines | 0–80 m | Soft dirt, copper/silver, grubs |
| Emerald Caverns | 85–165 m | Stone, gold/emerald, glowing mushrooms, bats & spitters |
| Forgotten Abyss | 170–240 m | Deep rock, ruby/diamond, wraiths, dread drone music |
| The Idol Chamber | 242 m | The end of the dream |

- Zones are sealed by **ancient gates**; each needs a **Portal Stone** hidden in
  a brick cave somewhere in the zone above. Open gates become portals — a fast
  travel network back to town.
- Hidden **shrines** grant permanent powers: **double jump**, **drill dash**
  (smashes through soft ground), and **dynamite**.
- The deeper you go, the darker it gets: your lantern is a shrinking circle of
  light that drains underground and refills topside. Music shifts from friendly
  town chiptune to sparse minor grooves to a near-atonal abyss drone.
- Death sends you home and costs half your coins. Progress (upgrades, dug
  tunnels, opened gates) is saved to localStorage automatically.

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
| Shift / C | Drill dash (once found) |
| K | Throw dynamite (once found) |
| T | Place a teleporter camp (consumes a kit) |
| E | Talk / use portals / accept shrine gifts |
| R (hold) | Emergency recall to town (keeps 90% of coins) |
| M | Mute |

## Game feel

The jump physics are carried over from our previous platformer (Forest Leap):
coyote time, jump buffering, variable jump height, apex float, heavier fall,
turn boost, squash & stretch. All constants live in the `P` block at the top of
[src/player.js](src/player.js).

## Code map

- [src/art.js](src/art.js) — all pixel art, generated (palette, ASCII sprite maps, tile painter)
- [src/world.js](src/world.js) — seeded world generation: strata, ores, caves, special rooms, gates
- [src/player.js](src/player.js) — movement physics, digging, ladder, dash
- [src/enemies.js](src/enemies.js) — grub, bat, spitter, wraith
- [src/audio.js](src/audio.js) — synthesized SFX + four depth-based music moods
- [src/scenes/GameScene.js](src/scenes/GameScene.js) — the world: digging, lighting, town, shop logic, portals, combat
- [src/scenes/UIScene.js](src/scenes/UIScene.js) — HUD, dialogs, shop & portal menus
