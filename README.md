# BattleCity Remastered (TypeScript)

BattleCity Remastered now runs on a TypeScript monorepo stack:

- `apps/client-ts`: Three.js web client (Vite), connected to the authoritative game server
- `apps/server-ts`: Socket.IO + Express game server
- `packages/protocol`: shared wire/event schemas
- `packages/sim-core`: shared simulation/combat primitives

## Quick Start

1. Install dependencies:
   - `npm install`
2. Run both app processes:
   - `npm run dev`
3. Open the client:
   - `http://localhost:8220`
4. Server health endpoint:
   - `http://localhost:8121/health`

## Useful Commands

The default client connects to the server and opens the city lobby. Choose a
callsign and join a city as mayor or recruit. The mayor builds housing, research
centres and factories; research unlocks the matching products. Build with right-click, F4 or Ctrl+B and
click a clear plot; Escape cancels. CITY shows infrastructure and production.
Factories display available products on their dispatch pads.

Arrows drive (W/A/S are movement aliases), Space/Shift/left-click fires, Q/E selects
inventory, D (G alias) drops cargo **on the original dominant tile underneath the tank**,
and U collects nearby pickups. A blocked drop fails without choosing a neighbour.
Walls and towers unfold when deployed. Friendly sleepers, mines and DFGs remain
visible; enemy sleepers reveal within the original 400px range and active enemy
mines/DFGs stay concealed. C uses cloak, H uses a medkit, Control fires flares,
and the bomb's ARM button or V toggles arming before the next drop. B drops an armed bomb. Carry an orb to an enemy command
centre's NO PARKING apron and press O to attack the city.

Mayors use a distinct rounded teal command tank, visible to other players.
Population appears in recessed crew displays on the buildings. Left-click a
friendly house to show its actual staffing connections; clicking empty ground
clears selection. POPULATION shows all household links. Homes support two
buildings and show their combined residents out of 100; workplaces fill to 50.
F2 or M opens the tactical map, F1 opens help, F3 toggles diagnostics and F toggles fullscreen. The
inventory radar shows heading, home bearing, distance and visible live entities.
Chat, city finance, research, scores, damage and item counts use server events.
For the independent visual preview, open `http://localhost:8220/?demo=1`; it
needs only `npm run dev:client`. You are the demo mayor, all research is unlocked, population grows gradually after housing is built,
and right-click opens the shared housing/construction menu. O or ORB MY CITY
lets you orb your own NO PARKING apron **only in this sandbox**. RESET DEMO
restores the district. Preview gunfire provides visual feedback; armed demo bombs detonate and destroy nearby structures.
The former Pixi renderer is retained under `archive/pixi-client/`; Pixi is no
longer an npm dependency. The approved rendering quality is preserved.

- `npm run dev:client` - start client only
- `npm run dev:server` - start server only
- `npm run build` - build the TypeScript client
- `npm run start` - run the TypeScript server
- `npm run test` - run TypeScript test suites (`packages/*`, `apps/*-ts`)
- `npm run typecheck` - run workspace type checks
- `npm run rewrite:check:strict` - strict TS rewrite verification suite

## Workspace Layout

- `apps/client-ts/src` - client runtime/input/render loop
- `apps/server-ts/src` - server runtime/event dispatch/ticks
- `apps/server-ts/test` - server TypeScript tests
- `apps/client-ts/test` - client TypeScript tests
- `packages/protocol/src` - typed event envelope/schema
- `packages/sim-core/src` - deterministic sim helpers
