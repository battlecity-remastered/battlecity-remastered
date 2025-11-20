# BattleCity Game Rules Tracker

Use this document to record gameplay rules, mechanics, and feature behaviors as they are implemented. Keeping it current prevents regressions and makes it easier to onboard new contributors.

## Core Gameplay
- Players control a tank mapped to the 48px tile grid; movement is clamped to the map bounds.
- Tank collisions use the shared `{x, y, w, h}` rectangle helpers to stay consistent with bullet and building logic.
- Death resets the player to the defined spawn location with default stats.
- Collision resolution keeps a rolling “last safe” position, nudges outward in 6px steps, scans nearby tiles, and finally snaps to city spawn if required so players can’t be trapped by buildings or terrain pushes. (client/src/play.js:18)

## Teams & Roles
- The authoritative server guarantees each city has exactly one mayor and at most three recruits; newcomers round-robin between city `0` and city `1` until both rosters reach that capacity. (server/src/PlayerFactory.js:11, server/src/PlayerFactory.js:195)
- When every slot is filled the join request is rejected with `cities_full`, allowing a future lobby flow to queue players without spawning them. (server/src/PlayerFactory.js:39)
- City spawn points and canonical city names are keyed in `shared/citySpawns.json`; both client and server snap players to those offsets so each team enters at the correct base. (client/src/utils/citySpawns.js:1, server/src/PlayerFactory.js:208)
- The `map.dat` asset is rotated 180° during load so command centers align with their classic plazas; this prevents rocks from appearing inside the base footprint. (client/src/mapBuilder.js:45)
- Mayors render a “Mayor of _City_” banner above their tank using the shared city display name to make leadership clear in-game. (client/src/draw/draw-changing.js:6)

## Economy
- Each city starts with `95,000,000` cash and resolves finance ticks every 7 seconds; the server clamps balances, tracks income/expenses, and rebroadcasts updates to clients. (server/src/CityManager.js:20)
- Houses generate `population × 10,000` cash per tick while fully staffed Research centers withdraw the `COST_ITEM` budget and Hospitals consume `COST_UPKEEP_HOSPITAL`. (server/src/Building.js:74)
- Factories only craft items when their city can afford `COST_ITEM` and the amount is deducted as production spending. (server/src/FactoryBuilding.js:28)
- Mayors see a live money box in the side panel with cash totals and up/down indicators driven by the latest finance update. (client/src/draw/draw-panel-interface.js:47)

## Combat
- Bullets originate from the active tank barrel position and inherit the firing tank's facing direction.
- Client handles bullet physics; server currently trusts reported positions and broadcasts them to peers.
- Mines detonate when an opposing-city tank overlaps their tile, dealing `DAMAGE_MINE` (19) and clearing the mine from the field while leaving allies unaffected. (client/src/collision/collision-helpers.js:54, client/src/play.js:11)
- Bombs dropped while armed (`B` toggles arming) explode after 5 seconds, wiping nearby items, demolishing server-verified buildings whose footprint falls within the three-tile blast radius (command centers are excluded), and inflicting lethal damage on tanks inside the same radius. (client/src/factories/ItemFactory.js:215, client/src/input/input-keyboard.js:128, server/src/hazards/HazardManager.js:414, server/src/BuildingFactory.js:466)
- Rogue tank assaults now raise a `Rogue Assault` toast as soon as a raider crosses the dynamic perimeter that surrounds every city; the radius expands to match the furthest owned building plus a four-tile buffer so players always get warned before defenses fall. (client/src/rogue/RogueTankManager.js:334, client/src/rogue/RogueTankManager.js:783)
- Once a wave of rogues is destroyed the manager delays the next spawn by 60–120 seconds, keeping pressure on cities without immediate respawns. (client/src/rogue/RogueTankManager.js:760)
- The radar UI plots tanks within ~2,400px of the local player, colour-coding friendlies vs enemies; cloaked players stay hidden and dots disappear once targets leave the radar window. (client/src/draw/draw-panel-interface.js:164, client/src/constants.js:4)
- Every combatant now receives a server-curated callsign; the kill feed surfaces `Victim killed by Source` using those names, falling back to the weapon type for hazards and automated defenses. (server/src/PlayerFactory.js:625, client/app.js:1336, client/src/rogue/RogueTankManager.js:707)
- Tank sprites render in-world nameplates: mayors display `Mayor <callsign> of <City>`, recruits show the same recruit formatting, and rogue tanks broadcast their own callsigns so players can ID threats at a glance. (client/src/draw/draw-changing.js:24)
- Fake city garrisons now spawn up to two automated recruits that anchor near the command center, scan ~18 tiles for enemies from other cities, fire laser volleys every ~1.4s, and respawn 45 seconds after being destroyed—with hazards and bullets damaging them exactly like human tanks. (server/src/FakeCityManager.js:196, server/src/FakeCityManager.js:397, server/src/PlayerFactory.js:244)

## Points & Ranks
- Capturing an enemy city’s orb grants its point value to every active member of the attacking city; the orbing player gains an Orb stat while teammates log assists. (original/Battle-City/server/CCity.cpp:283)
- Orb value scales with the target city’s development: `maxBuildingCount` ≥ `ORBABLE_SIZE` (21) is worth 30 points, ≥ `ORBABLE_SIZE + 5` yields 40, and ≥ `ORBABLE_SIZE + 10` pays 50; legacy Orb or Bomb factories keep a city worth 20 or 10 respectively, and the total is boosted by +5 for each orb already stolen. (original/Battle-City/server/CConstants.h:30, original/Battle-City/server/CCity.cpp:401)
- Death only impacts standings after a player has more than 100 points; at that threshold the victim loses 2 points and, when the killer’s city differs from the victim’s, every in-game member of that opposing city receives 2. (original/Battle-City/server/CProcess.cpp:963)
- Point totals map to fixed rank titles from Private (<100) up through King (≥ 500,000); crossing a threshold triggers a promotion broadcast to the lobby and all combatants. (original/Battle-City/server/CAccount.cpp:435, original/Battle-City/server/CAccount.cpp:514)
- Full promotion ladder from the original server:
  | Points | Rank |
  | --- | --- |
  | < 100 | Private |
  | < 200 | Corporal |
  | < 500 | Sergeant |
  | < 1,000 | Sergeant Major |
  | < 2,000 | Lieutenant |
  | < 4,000 | Captain |
  | < 8,000 | Major |
  | < 16,000 | Colonel |
  | < 30,000 | Brigadier |
  | < 45,000 | General |
  | < 60,000 | Baron |
  | < 80,000 | Earl |
  | < 100,000 | Count |
  | < 125,000 | Duke |
  | < 150,000 | Archduke |
  | < 200,000 | Grand Duke |
  | < 250,000 | Lord |
  | < 300,000 | Chancellor |
  | < 350,000 | Royaume |
  | < 400,000 | Emperor |
  | < 500,000 | Auror |
  | ≥ 500,000 | King |
- Source: original/Battle-City/server/CAccount.cpp:435

## Buildings & Items
- Building placement consumes the appropriate resources and links into the building factory's list (`next`/`previous` pointers must remain valid).
- Mayors can only place a building when their city's cash balance covers `COST_BUILDING`; insufficient funds now reject the placement server-side and refund any optimistic client adjustments. (server/src/BuildingFactory.js:87, client/src/factories/BuildingFactory.js:50)
- New construction must remain contiguous: non-command center buildings are rejected if their center lies more than 20 tiles (~960px) from the nearest friendly structure, and the client surfaces a toast explaining the rule. The same layout scan feeds rogue assault radius calculations. (client/src/factories/BuildingFactory.js:133, client/src/factories/BuildingFactory.js:414)
- Research centres must run for 10 seconds at full population (TIMER_RESEARCH) before unlocking their factories; the server streams `research:update` states and rejects early build attempts, while the client renders pending factories as greyed-out menu entries until the timer elapses. (server/src/constants.js:10, server/src/BuildingFactory.js:243, server/src/BuildingFactory.js:640, client/src/factories/BuildingFactory.js:214, client/src/draw/draw-building-interface.js:223)
- When your city finishes a research line, a toast confirms completion and lists the newly unlocked build options. (client/src/factories/BuildingFactory.js:193)
- Factory buildings emit `new_icon` events when they start producing item drops.
- Dropped items always render using the appropriate sprites (turret heads, sleepers, bombs, walls, mines, etc.), with enemy mines hidden while armed to match legacy behaviour. (client/src/draw/draw-items.js:1)
- Houses maintain up to two attachment slots for nearby support buildings; the server keeps the attachment list authoritative and rebroadcasts population changes.
- Dropping a Mine icon spawns an armed mine item that remembers the owner's city, renders via the item tile layer, and is removed from the item list once triggered. (client/src/factories/ItemFactory.js:12, client/src/draw/draw-items.js:27)
- Bomb icons snap to the tile grid when placed; armed bombs start a 5-second detonation timer, while unarmed bombs remain inert until dropped while armed. (client/src/factories/ItemFactory.js:135, client/src/draw/draw-items.js:14)
- Defensive structures now track durability and react to bullet impacts: Walls and Plasma Cannons start at 40 HP, Turrets at 32 HP, and Sleepers at 16 HP. Bullets chip this durability, mark the defense as “burning” once below legacy thresholds, and destroy it when health reaches zero. (client/src/constants.js:107, client/src/factories/ItemFactory.js:331)
- Hazards and pickups (mines, bombs, DFG emitters, etc.) are removed when struck by a bullet, matching the original C++ client/server behaviour. (client/src/collision/collision-bullet.js:103, client/src/factories/ItemFactory.js:412)
- Player-built defenses (turrets, sleepers, plasma cannons, walls) are now stored on the server; placements emit a defense snapshot and persist through death or reconnects. (client/src/factories/ItemFactory.js:489, client/src/SocketListener.js:430, server/src/DefenseManager.js:88)
- Turrets and sleepers evaluate rogue tanks when acquiring targets, ensuring city defenses fire on NPC raiders even when no player opponents are nearby. (client/src/factories/ItemFactory.js:296)
- Factory production now leaves icons on the ground until collected; pickups notify the server so city stock counts stay authoritative and future production isn't blocked. (server/src/FactoryBuilding.js:33, client/src/factories/BuildingFactory.js:515, server/src/BuildingFactory.js:116)
- Command Centers are immune to bomb demolition and will never be deleted by local explosion cleanup. (client/src/factories/ItemFactory.js:698)
- Cities become *orbable* once they either (a) reach a historical maximum of at least 21 constructed buildings, or (b) have ever operated a Bomb or Orb factory. (server/src/CityManager.js:129)
- An Orb dropped on an enemy command center now triggers a full city wipe when the target meets the orbable criteria: the command center is destroyed, every building is demolished, all hazards are cleared, and the affected players are sent back to the lobby. (server/src/orb/OrbManager.js:47, server/src/PlayerFactory.js:658)
- Factory output counts now come entirely from the server snapshot. Each `new_building` payload includes `itemsLeft`, and the client reconciles the expected drops through `syncFactoryItems`. (client/src/SocketListener.js:140, client/src/factories/BuildingFactory.js:538)
- Factory output now mirrors the original Battle City per-item caps; production stalls once a city's stock hits the legacy limit and resumes only after that item is spent.\
  | Item | Player inventory cap | Factory stock cap | Notes |
  | --- | --- | --- | --- |
  | Cloak | 4 | 4 | Consumed immediately on use |
  | Rocket/Bazooka | 4 | 4 | |
  | Medkit | 5 | 20 | |
  | Bomb | 20 | 20 | Covers armed and unarmed stacks |
  | Mine | 10 | 10 | |
  | Orb | 1 | 1 | City must detonate or otherwise consume the active orb |
  | Flare | 4 | 4 | Matches the legacy walkie cap |
  | DFG | 5 | 5 | |
  | Wall | 20 | 20 | |
  | Turret | 10 | 10 | |
  | Sleeper | 5 | 5 | |
  | Plasma | 5 | 5 | |
  | Laser | 4 | 4 | Parity with rockets for the starter weapon |
- Orb factories now pin production while the city has an orb in circulation; the server records which socket collected the orb and releases the slot when that player detonates it or disconnects. (server/src/BuildingFactory.js:123, server/src/CityManager.js:121, server/src/orb/OrbManager.js:81, server/src/PlayerFactory.js:232)
- Demolishing a factory wipes its legacy stock: the server purges matching icons from city inventories, clears deployed hazards/defenses of that type, and cancels any active orb carriers so the production limit stays authoritative. (server/src/BuildingFactory.js:133, server/src/hazards/HazardManager.js:231, server/src/DefenseManager.js:116, client/src/factories/IconFactory.js:71)
- Inventory stacks repeatable items (bombs, mines, turrets) and shows a count overlay; selecting a bomb arms the stack so drops inherit the armed state. (client/src/factories/IconFactory.js:20, client/src/draw/draw-panel-interface.js:37)
- Item pickups respect the classic per-city caps (e.g., Cloaks 4, Bombs 20, Turrets 10, Plasma 5, Orb 1); excess inventory is trimmed during restore and additional pickups are blocked once a cap is reached. (client/src/constants.js:90, client/src/factories/IconFactory.js:18)
- Factory drops now carry their producing city’s team flag; only members of that city can collect the items, preventing players from looting rival (or AI) production lines. (server/src/FactoryBuilding.js:41, client/src/SocketListener.js:131, client/src/factories/IconFactory.js:239)

## AI Opposition
- When the human roster slips below 16 players the server fabricates up to six AI fortress cities from the shared blueprint, wiring in bomb, orb, and turret factories so they’re immediately orbable and large enough to draw rogue tank patrols. (server/src/FakeCityManager.js, shared/fakeCities.json)
- These synthetic strongholds carry an `isFake` marker, so the lobby assignment flow skips them while they are active. (server/src/PlayerFactory.js)
- AI fortress templates now include a command center at the city spawn, so they can be orbed like player cities and feel like full bases. (shared/fakeCities.json:5, server/src/FakeCityManager.js:90)
- Default fortresses pre-seed minefields and autonomous turrets/plasma/sleeper emplacements, all team-locked so only the owning city can interact with them; the layout mirrors `defaultDefenses` and is streamed to clients along with hazard snapshots. (shared/fakeCities.json:17, server/src/FakeCityManager.js:110, server/src/hazards/HazardManager.js:74, client/src/SocketListener.js:129)

## Build Tree
- Housing is available immediately and permits launching the two starting research lines.
- Lazer Research (→ Lazer Factory) is unlocked from the start and, once completed, enables Cloak Research, MedKit Research, and their factories.
- Turret Research (→ Turret Factory) is also granted at the start and unlocks Plasma Turret Research and Mine Research.
- Cloak Research unlocks Cloak Factory plus Orb Research and Time Bomb Research, which then unlock their matching factories.
- MedKit Research unlocks MedKit Factory and allows the city to construct Hospitals.
- Plasma Turret Research unlocks Plasma Turret Factory as well as Sleeper Research and Wall Research; each research unlocks its paired factory.
- Mine Research unlocks Mine Factory and DFG Research (and then DFG Factory).
- Orb Research grants Orb Factory production and unlocks Flare Gun Research (and the Flare Gun Factory).

## Items
- **Cloak** – Press `C` to activate a 5-second cloak as long as you own the icon; enemies stop drawing your tank while allied players still see you. The server tracks the timer so taking damage or timeout automatically broadcasts a status update. (client/src/input/input-keyboard.js:150, client/src/factories/ItemFactory.js:208, server/src/PlayerFactory.js:318)
- **Laser** – Owning a Laser icon enables the default SHIFT shot; the input handler falls back to bullet type `0` (5 damage) whenever no bazooka is available. (client/src/input/input-keyboard.js:175, client/src/factories/BulletFactory.js:13)
- **Cougar Missile (Bazooka)** – When you hold still with Cougar Missiles in your inventory, SHIFT fires rocket shots (type `1`) that reuse the classic damage boost, now enforced on both client and server. (client/src/input/input-keyboard.js:175, client/src/factories/BulletFactory.js:13, server/src/BulletFactory.js:10)
- **MedKit** – Press `H` to consume one MedKit from your inventory and instantly restore your tank to full health; the server clamps the heal and rebroadcasts the new value. (client/src/input/input-keyboard.js:168, client/src/factories/ItemFactory.js:200, server/src/PlayerFactory.js:299)
- **Bomb** – Pressing `B` arms/disarms the selected stack, and dropping an armed bomb spawns a synced hazard that later clears items, buildings, and players inside the detonation radius. (client/src/input/input-keyboard.js:157, client/src/factories/ItemFactory.js:215, client/src/factories/ItemFactory.js:376)
- **Mine** – Mines snap to the tile grid, hide from enemies once deployed, and flag themselves for removal the moment an opposing tank trips the collision handler. (client/src/play.js:49, client/src/factories/ItemFactory.js:546, server/src/hazards/HazardManager.js:268)
- **DFG** – Deep Freeze Generators work like invisible mines: an enemy that rolls over one is frozen in place for 5 seconds while friends pass through harmlessly. Freeze state is driven server-side so everyone sees the status change. (client/src/play.js:105, client/src/factories/ItemFactory.js:242, server/src/hazards/HazardManager.js:303)
- **Flare Gun** – Holding `CTRL` fires three slow flare shots behind your tank (bullet type `3`) using the classic spread; both client and server honour the lower projectile speed and damage, and each flare now fizzles after roughly one 48px tile so it only tags riders on your tail. (client/src/input/input-keyboard.js:95, client/src/factories/BulletFactory.js:13, server/src/BulletFactory.js:13)
- **Orb** – Dropping an Orb queues a server validation; on success the server wipes the target city, resets its economy, and broadcasts the destruction event. (client/src/factories/ItemFactory.js:431, server/src/orb/OrbManager.js:57)
- **Wall** – Wall icons place a 48×48 blocking tile that behaves like the legacy barricades, including collision and visibility rules. (client/src/draw/draw-items.js:92, client/src/collision/collision-helpers.js:23)
- **Turret** – Auto-turrets track targets every 200 ticks and fire standard bullets whenever a hostile tank strays within range. (client/src/factories/ItemFactory.js:33, client/src/factories/ItemFactory.js:105)
- **Sleeper Turret** – Sleeper turrets reuse the autonomous firing logic but stay hidden unless they have a target or belong to your city. (client/src/factories/ItemFactory.js:33, client/src/draw/draw-items.js:116)
- **Plasma Turret** – Plasma turrets share the automated targeting loop, providing the higher-tier factory defense once population is available. (client/src/factories/ItemFactory.js:33, client/src/draw/draw-items.js:20)

## Defense Durability
- Players can deliver two baseline projectile types: lasers (default SHIFT fire) and Cougar Missiles/Bazookas (stand still + SHIFT). Lasers carry `DAMAGE_LASER = 5` while bazooka rounds bump to `DAMAGE_ROCKET = 8`; automated defenses also use the laser profile unless explicitly overridden. (client/src/constants.js:39-41, client/src/factories/BulletFactory.js:7, client/src/factories/BulletFactory.js:26, client/src/factories/ItemFactory.js:467)
- Defense items load their base hit points from `ITEM_INITIAL_LIFE`, letting us map life totals directly to the number of laser hits required (ceiling applied to cover partial health remaining). (client/src/constants.js:120, client/src/factories/ItemFactory.js:383)
- `Wall` – 40 life → 8 laser hits or 5 bazooka hits; walls ignite once they slip below the 20-life burn threshold but still need the full count to crumble. (client/src/constants.js:121, client/src/constants.js:128)
- `Turret` – 32 life → 7 laser hits or 4 bazooka hits, with visual burning kicking in below the 8-life mark even though the barrel keeps tracking until it explodes. (client/src/constants.js:122, client/src/constants.js:129)
- `Sleeper Turret` – 16 life → 4 laser hits or 2 bazooka hits; sleepers stay hidden until they fire, but their durability matches the legacy fast-falloff configuration. (client/src/constants.js:123, client/src/constants.js:130)
- `Plasma Turret` – 40 life → 8 laser hits or 5 bazooka hits; these inherit the same sturdiness as walls and don’t get a special armor bonus beyond the higher burn threshold. (client/src/constants.js:124, client/src/constants.js:131)

## Networking
- Socket.IO server runs on port 8021 and rebroadcasts player, bullet, and building updates it receives from clients.
- Client emits `player`, `bullet_shot`, and `new_building` events when local state changes; listeners reconcile remote entities under `game.otherPlayers`.
- Orb drops are authoritative: the client sends an `orb:drop` request, the server validates the target and broadcasts the `city:orbed` result (or an `orb:result` failure) so every peer stays in sync. (client/src/factories/ItemFactory.js:134, server/src/orb/OrbManager.js:47)

## Points & Scoring
- Each city tracks a running `score` tally and the number of successful orbs (`orbs`), both of which are surfaced in the mayor finance panel, lobby listings, and the contextual right-click inspector. (client/src/draw/draw-panel-interface.js:53, client/src/lobby/LobbyManager.js:215)
- Destroying an orbable enemy city awards points to the attacking city based on the victim's historical growth (max buildings) plus a 5-point bonus per prior orb they had launched; this value is also exposed as the city's `Bounty` in inspection panels. (server/src/CityManager.js:166, client/app.js:305)
- When a city is destroyed its economy resets to the starting balance, its orb bounty drops to zero, and every occupant must rejoin via the lobby overlay. (server/src/CityManager.js:200, client/src/lobby/LobbyManager.js:410)

## Houses ↔ Factories
- Every non-house building (including factories) must attach to a compatible house to accumulate staff population; without an attachment its population is reset to `0`. (server/src/Building.js:75, server/src/BuildingFactory.js:205)
- Attachment eligibility requires matching owner or matching city, and each house can host at most two attachments; the server picks the house with the fewest occupants. (server/src/BuildingFactory.js:224, server/src/BuildingFactory.js:237)
- When a factory attaches, its `cityId` is synced to the house and both sides receive `population:update` events so the client stays in sync. (server/src/BuildingFactory.js:248, client/src/factories/BuildingFactory.js:280)
- House population is always the sum of its attachment slots; demolishing a house clears every attached building's link and population, while demolishing the factory just frees the slot. (server/src/BuildingFactory.js:165, server/src/BuildingFactory.js:257, server/src/BuildingFactory.js:295)
- New houses retroactively claim eligible unattached buildings (again up to two), keeping older factories productive once housing exists. (server/src/BuildingFactory.js:299)
- Factories only begin item production once they reach full population (`POPULATION_MAX_NON_HOUSE` = 50), so sustaining a house link is required for output. (server/src/FactoryBuilding.js:15, server/src/constants.js:4)
- Houses cap their total population at `POPULATION_MAX_HOUSE` (100), while research centers and factories cap at 50; in practice one house can fully staff up to two such support buildings, so plan on **½ house per research center or factory**. Losing a house drops both attached buildings back to zero population until another house claims them. (server/src/Building.js:35, server/src/constants.js:3, server/src/BuildingFactory.js:295)
- Legacy behavior matches this ratio: each attached non-house building contributes its current population directly to the parent house (`pop = AttachedPop + AttachedPop2`). A single staffed research center therefore fills a house to 50 population, while two staffed centers (or a center plus a factory) take it to 100. (original/Battle-City/server/CBuilding.cpp:509, original/Battle-City/server/CBuilding.cpp:523)

> When adding new functionality, append the relevant rules here so they remain discoverable. Note the subsystem (play, draw, factory, etc.) and include any constraints or invariants that other developers should honor.
