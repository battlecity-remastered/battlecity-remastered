# Agent Guide: BattleCity JS Remake

## Quick Facts
- Project recreates Battle City using a browser Pixi.js client (`client/`) and a Socket.IO-backed Node server (`server/`).
- Client now builds with Vite (config in `client/vite.config.js`), entry remains `client/app.js` which instantiates the main `game` state object and kicks off rendering + networking.
- Pixel art assets, maps, and audio live under `client/data/`; `data/map.dat` is a 512×512 tilemap consumed as an `ArrayBuffer`.
- Multiplayer and item drops require the local server on port 8021; without it the client runs in a mostly single-player sandbox.

## Runbook
- Install deps separately in `client/` and `server/` (`npm install`).
- Client dev server: `npm run dev` from `client/` (Vite on `http://localhost:8020`).
- Client production build: `npm run build` (emits to `client/dist`, `npm run preview` serves the build).
- Server: `npm start` from `server/` (Express + Socket.IO on `http://localhost:8021`). Use `npm run dev` for auto-reload during development.
- Run both processes to sync gameplay via Socket.IO.

## Client Architecture
- `client/app.js` sets up PIXI, registers loaders, builds `game` (rendering containers, factories, networking).
- `client/src/play.js` advances player movement/rotation, enforces map-edge clamps, and handles death resets; relies on `checkPlayerCollision` and constants.
- Input handling lives in `client/src/input/`, mapping keyboard/mouse to `game.player` flags and factory actions (shooting, item drop, build menu).
- Rendering pipeline split into modules under `client/src/draw/` (`drawGround`, `drawTiles`, `drawChanging`, etc.) and executed each animation frame by `gameLoop()`.
- The panel overlay (`drawPanelInterface`) now builds the radar each frame, using `imgRadarColors`/`imgMiniMapColors` to plot nearby tanks while skipping cloaked players and anything outside the 2,400px range window.
- Factories (`client/src/factories/`) maintain linked-list structures (`next`/`previous`) to manage dynamic entities (buildings, bullets, icons, items). They coordinate with collision helpers under `client/src/collision/`.
- Networking via `client/src/SocketListener.js` wraps `socket.io-client`; emits local state (`player`, `bullet_shot`, `new_building`) and applies server broadcasts to `game.otherPlayers`, factories, etc.

## Server Architecture
- `server/app.js` boots Express/Socket.IO, instantiates factories for players, bullets, buildings, then spins a 100 ms tick for factory cycles (currently only building production uses it).
- Player sync: `server/src/PlayerFactory.js` holds `game.players`, rebroadcasts player state to others.
- Bullet sync: `server/src/BulletFactory.js` receives `bullet_shot` and rebroadcasts (TODO share physics with client for authoritative behavior).
- Building management: `server/src/BuildingFactory.js` stores placed buildings, attaches `FactoryBuilding` subtype when appropriate to emit `new_icon` events.

## Conventions & Tips
- Client code now relies on ES module imports resolved through Vite; prefer package names/relative paths instead of reaching into `node_modules` manually.
- Game world uses 48px tiles; map indexes (`game.map[i][j]`) often translate via `* 48` when converting to pixel space.
- Many systems depend on mutating the shared `game` object; prefer extending it carefully instead of replacing references to avoid breaking factories.
- Collision helpers expect rectangles shaped as `{x, y, w, h}` in pixel coordinates; reuse `getPlayerRect`/`rectangleCollision` utilities.
- Linked-list factories require updating `next`/`previous` pointers when inserting/removing to keep iteration stable.

## Artwork & Rendering Notes
- The tank muzzle flash is now driven by measured offsets extracted directly from `client/data/imgTanks.png` (see `client/src/data/muzzleOffsets.js`). `computeTankMuzzlePosition` interpolates between 32 recorded steps so the flash aligns with the painted barrel tip at every heading.
- Visual debugging helpers live under `client/scripts/`: `muzzle-debug.mjs` prints per-heading offsets while `muzzle-visualize.mjs` emits 64×64 PPMs showing the muzzle marker overlaid on the sprite.
- Remaining misalignment is art-side: some frames shorten or skew the barrel. To get math-perfect alignment, the sprite should keep the muzzle highlight at a constant radius/angle from the turret pivot across all frames.

## Testing Guidelines
- **CRITICAL: Always run tests BEFORE making changes** to establish a baseline and identify pre-existing failures.
- **CRITICAL: Always run tests AFTER making changes** to catch regressions immediately.
- Server tests: `cd server && npm test` (use `npm test <file>` for specific tests).
- Client tests: `cd client && npm test` (currently limited coverage).
- When a test fails after your changes, investigate immediately - don't assume it was pre-existing.
- When adding new functionality, add corresponding test coverage to prevent future regressions.
- If you discover broken tests that are unrelated to your changes, fix them or document them clearly.

## Known Gaps / TODOs
- Socket.IO server CORS is pinned to the dev client URL (`http://localhost:8020`); adjust in `server/app.js` if the client origin changes.
- No automated tests; any changes that touch movement/collision should be exercised manually in the running client.
- Map/city generation is placeholder (`cityBuilder.createFakeCity` commented); expect additional logic or data integration work.
- Bullet physics run client-side; server currently trusts client data, so authoritative validation is absent.

## Linting & Automation
- Run `npm run lint` from the repository root before committing. The ESLint flat config (`eslint.config.js`) enforces 4-space indentation across the repo—expect large diffs if you introduce inconsistent indenting and use `npm run lint -- --fix` to realign files when needed.
- All code should be written in a lint-clean state; fix lint violations as you go instead of leaving them for later.
- GitLab CI now runs the same command in the `lint` stage using Node 20 (`.gitlab-ci.yml`). Ensure the command passes locally to keep pipelines green.
- When shipping a new feature, add automated tests alongside it whenever feasible so coverage improves over time.

## Useful Entry Points for Future Work
- Player movement logic: `client/src/play.js`.
- Spawning buildings & permissions: `client/src/factories/BuildingFactory.js` and `client/src/draw/draw-building-interface.js`.
- Bullet lifecycle & collisions: `client/src/factories/BulletFactory.js` and `client/src/collision/collision-bullet.js`.
- Server broadcasts of new items: `server/src/FactoryBuilding.js`.
- Configuration constants: `client/src/constants.js` (movement speeds, build dependencies, item ids, etc.).

Keep this file updated when adding systems (e.g., AI, new map loaders, authoritative physics) so future agents have a quick on-ramp.
