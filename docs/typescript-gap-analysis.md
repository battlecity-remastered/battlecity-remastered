# TypeScript Visual Parity Gap Analysis (`master` -> `feature/typescript`)

Date: 2026-02-24  
Focus: UI parity, building rendering parity, map layout/terrain parity, exact coordinates and exact texture/frame usage.

This is a render contract + implementation backlog.  
If TypeScript follows this exactly, visual parity with `master` is achievable.

## 1) Authoritative Coordinate Systems

## 1.1 Global world/panel split

Master contract:

```ts
const PANEL_WIDTH = 200;
const maxMapX = surfaceWidth - PANEL_WIDTH;
const defaultOffsetX = maxMapX / 2;
const defaultOffsetY = surfaceHeight / 2;
```

World-to-screen transform:

```ts
screenX = worldX + (defaultOffsetX - playerOffsetX);
screenY = worldY + (defaultOffsetY - playerOffsetY);
```

Map world extent:

- `MAP_SIZE = 512` tiles
- `TILE_SIZE = 48` px
- world max = `512 * 48 = 24576` px

## 1.2 Stage/layer order (must match)

Master stage order:

1. `groundTiles`
2. `backgroundTiles`
3. `itemTiles`
4. `iconTiles`
5. `commandCenterLabelLayer`
6. `objectContainer` (tanks/bullets/explosions)
7. `panelContainer`

TypeScript currently uses a different composition (hazards/defenses inside world object layer), which changes overlap behavior.

Parity requirement:

- keep map/terrain below items
- keep dropped icons above items
- keep tank/bullet/effects above items/icons
- keep panel always top

## 2) Right Panel Exact Pixel Contract

All coordinates are panel-local unless stated as `maxMapX + ...`.

## 2.1 Static panel textures

| Element | Asset | Exact position |
|---|---|---|
| Top panel | `interfaceTop` | `(maxMapX, 0)` |
| Bottom panel | `interfaceBottom` | `(maxMapX, 430)` |

TypeScript gap:

- TS currently draws bottom panel at `surfaceHeight - 128` instead of fixed `430`.

## 2.2 Finance block

| Element | Asset/style | Exact position |
|---|---|---|
| Money box | `imgMoneyBox` | `(maxMapX + 2, 224)` |
| Income icon | `imgMoneyUp` or `imgMoneyDown` | `(maxMapX + 8, 225)` |
| Cash text | `Arial 13 bold` | `(maxMapX + 24, 226)` |

## 2.3 Health bar

Health sprite dimensions:

- width `38`
- height `87`

Sprite anchor:

- bottom-right (`anchor = (1,1)`)

Sprite position:

- `x = maxMapX + (137 + 38) = maxMapX + 175`
- `y = 160 + 87 = 247`

Mask rule:

- visible height = `floor((health/MAX_HEALTH) * 87)`
- mask x = `sprite.x - 38`
- mask y = `sprite.y - visibleHeight`

## 2.4 Panel message text block

Base:

- `x = maxMapX + 12`
- `y = 465`
- line spacing `15`

## 2.5 Panel buttons (hitboxes)

These are already aligned in TS and should not change:

- `staff`: `(145,268) 45x20`
- `map`: `(145,290) 45x20`
- `info/city`: `(145,312) 45x20`
- `points`: `(145,334) 45x20`
- `options`: `(145,356) 45x20`
- `help`: `(145,378) 45x20`
- `build`: `(126,400) 64x22`
- `exit`: `(150,576) 42x18`

## 2.6 Inventory grid (missing in TS)

Slot coordinates:

- row 1: laser `(7,267)`, rocket `(42,267)`, medkit `(77,267)`
- row 2: bomb `(7,302)`, mine `(42,302)`, orb `(77,302)`
- row 3: flare `(7,337)`, dfg `(42,337)`, wall `(77,337)`
- row 4: turret `(7,372)`, sleeper `(42,372)`, plasma `(77,372)`, cloak `(7,372)`

Frames (`imageItems`):

- default: `(type * 32, 0, 32, 32)`
- orb: `(250, 41 + frame*48, 32, 32)` and icon draw x offset `+2`
- armed bomb icon: `(152, 89, 32, 32)`

Selection:

- use `imageInventorySelection` at slot origin

Quantity text:

- `x = slotX + 22`
- `y = slotY + 12`

## 2.7 Home arrow (missing in TS)

Asset + frame:

- `imgArrows`, 8 frames, each `40x40`

Container:

- `(maxMapX + 5, 160)`

Direction selection:

- angle from player center to city center
- index quantized to 8 directions (`Math.round(angle / (PI/4))`, wrap to `0..7`)

## 2.8 Radar exact math and bounds

Constants:

```ts
RADAR_RANGE_PX = 2400;
RADAR_RATIO = 24;
RADAR_CENTER_OFFSET_X = 100;
RADAR_CENTER_Y = 80;
RADAR_BOUNDS = { offsetX: 28, offsetY: 8, width: 138, height: 138 };
RADAR_OFFSET_ADJUST_X = 70;
RADAR_OFFSET_ADJUST_Y = 69;
```

Plot:

```ts
dx = targetX - myX;
dy = targetY - myY;

globalX = (maxMapX + 100) + ((dx - 70) / 24);
globalY = 80 + ((dy - 69) / 24);
```

Clip:

- x in `[maxMapX + 28, maxMapX + 166]`
- y in `[8, 146]`

Point textures:

- `imgRadarColors`: columns 0..3 (`2x2`) for neutral/admin/enemy/ally
- `imgMiniMapColors`: column 15 (`2x2`) for dead marker

TypeScript gap:

- TS currently uses world normalization by `WORLD_MAX`, which is not master radar behavior.

## 3) Tank Rendering Contract

## 3.1 Tank texture frames

Frame:

- `(column * 48, row * 48, 48, 48)`
- `column = floor(direction / 2)`

Row selection:

- local city recruit: `0`
- local city mayor: `1`
- enemy recruit: `2`
- enemy mayor: `3`
- override if explicit `tank` row exists

## 3.2 Tank positions

- local: `(defaultOffsetX, defaultOffsetY)`
- remote: `remoteX + (defaultOffsetX - playerOffsetX)`, `remoteY + (defaultOffsetY - playerOffsetY)`

Parity detail:

- master uses top-left sprite origin (no center anchor)
- TS currently sets `anchor(0.5,0.5)` and drifts by ~24 px

## 4) Terrain + Map Rendering Contract (Building/Terrain Priority)

## 4.1 Map decode orientation

Both master and TS must decode map bytes using:

```ts
sourceX = (511 - y);
sourceY = (511 - x);
map[x][y] = bytes[sourceX + sourceY * 512];
```

## 4.2 Terrain semantics

- `0` = ground
- `1` = lava
- `2` = rock
- `3` = command-center anchor tile (special building map square)

## 4.3 Terrain adjacency frame offset

For rock/lava tiles:

```ts
isLeft  = neighbor-left  same ? 0 : 1;
isRight = neighbor-right same ? 0 : 1;
isDown  = neighbor-down  same ? 0 : 1;
isUp    = neighbor-up    same ? 0 : 1;

bitmask = isLeft + (isRight * 2) + (isDown * 4) + (isUp * 8);
frameX = bitmask * 48;
```

Frame:

- `(frameX, 0, 48, 48)` from `imgRocks` or `imgLava`

## 4.4 Ground layer

Ground tile size:

- `128`

Draw window:

- master draws `i,j` from `-12` to `11`

Position/pivot contract:

```ts
offX = cameraX % 128;
offY = cameraY % 128;
ground.position = (defaultOffsetX + cameraX - offX, defaultOffsetY + cameraY - offY);
ground.pivot = (cameraX, cameraY);
```

## 4.5 Tile layer redraw window

View radius:

- `40` tiles around camera tile center

Edge behavior:

- out-of-bounds tiles are filled black (`48x48` rects)

Tile layer alignment:

```ts
offX = cameraX % 48;
offY = cameraY % 48;
background.position = (defaultOffsetX + cameraX - offX, defaultOffsetY + cameraY - offY);
background.pivot = (cameraX, cameraY);
```

## 4.6 Blocking tile parity (map-layout critical)

Client TS `decodeMapData` currently blocks:

- lava (`1`)
- rock (`2`)
- command-center footprint expanded `3x3` from anchors (`3`)

Server TS `buildBlockingTileSet` currently blocks only:

- `2` and `3` (no lava)
- no `3x3` anchor expansion

This is a terrain/layout parity mismatch and will cause movement/pathing inconsistencies versus visual terrain.

## 5) Building Rendering Contract (Exact Coordinates + Frames)

## 5.1 Building base

Building family:

```ts
baseType = floor(buildingType / 100);
```

Base frame:

- `(0, baseType * 144, 144, 144)` from `imgBuildings`

Draw origin:

- `(tileX * 48, tileY * 48)`

Animation:

- `animX = 144`
- `animCountX = 3`
- `animDivisor = 4`

## 5.2 Building overlay icons

Overlay source:

- `imageItems` frame `(overlayIcon * 32, 0, 32, 32)`

Overlay placements:

- research building: `(+14, +98)`
- factory building: `(+56, +52)`

## 5.3 Research vertical strip

Texture:

- `imgResearch` (pending) or `imgResearchComplete` (complete)

Crop:

- top `5`, bottom `5` (`144 -> 134`)

Scale:

- width `9`
- height `floor(134 * 0.9) = 121`

Position:

```ts
x = tileX * 48 + 130;
y = tileY * 48 + floor((144 - scaledHeight)/2) - 5;
```

## 5.4 Population indicator

Frame source:

- `imgPopulation`
- frame `(frameColumn*48, frameRow*48, 48, 48)`

Frame row:

- command center family => `row 1`
- others => `row 0`

Frame column:

- `0..6`, proportional to population/maxPopulation

Max population:

- houses => `100`
- non-houses => `50`

Per-family offsets:

- command center `(96,49)`
- factory `(96,48)`
- repair `(96,48)`
- house `(96,90)`
- research `(96,90)`

## 5.5 Factory smoke

Frame:

- `imgSmoke`, `(0, smokeFrame*60, 180, 60)`

Position:

- `(tileX*48 + 6, tileY*48 - 15)`

## 5.6 Factory item count digits

Texture:

- `imgBlackNumbers`

Digit frame:

- `(digit*16, 0, 16, 16)`

Positions:

- tens at `(tileX*48 + 56, tileY*48 + 84)`
- ones at `(tileX*48 + 72, tileY*48 + 84)`

## 5.7 Command center world label

World center:

- `((tileX + 1.5) * 48, (tileY + 1.5) * 48)`

Screen offset:

- y `-32`

## 6) Defense, Hazard, Item, Bullet Contract

## 6.1 Defense turret rendering

Base:

- `imageTurretBase` frame `(damageColumn*48, typeIndex*48, 48, 48)`

Head:

- `imageTurretHead` frame `(orientation*48, (type-9)*48, 48, 48)`

Type index:

- `typeIndex = clamp(type - 9, 0..2)`

Orientation:

- from angle bucketed to 16 steps

TypeScript gap:

- TS currently renders only turret base; head is missing.

## 6.2 World items

Generic:

- `imageItems` `(type*48, 42, 48, 48)`

Mine:

- frame `(type*32, 0, 32, 32)`
- draw offset `+8,+8`
- hidden if active enemy mine

Bomb:

- armed frame `(144, 91, 48, 48)`
- idle frame `(ITEM_TYPE_BOMB*48, 42, 48, 48)`

Orb:

- frame `(ITEM_TYPE_ORB*48, 42 + frame*48, 48, 48)`
- x offset `+4`

Render priority:

- mines first, walls after mines

## 6.3 Bullet rendering

Texture:

- `bulletTexture`

Frame:

- `(animation*8, type*8, 8, 8)`

Animation:

- `animation = (animation + 1) % 4`

TypeScript gap:

- TS currently uses one `24x24` bullet frame scaled down and does not use row-based bullet type frames.

## 7) Map Layout + City Coordinates

## 7.1 City spawn source of truth

Current source:

- `apps/server-ts/data/citySpawns.json`

Contains city IDs `0..63` with explicit `tileX/tileY`.

Important:

- first rows use 64-step grid (`31,95,159,...`)
- final row (IDs `57..63`) uses shifted X values (`94,158,222,286,350,414,478`)
- do not derive with a strict formula; use file coordinates exactly.

## 7.2 Player spawn coordinate formula from city tile

Given city tile origin `(tileX, tileY)`:

```ts
baseX = tileX * 48;
baseY = tileY * 48;
centerX = baseX + 72;   // 3 tiles wide command center
centerY = baseY + 120;  // 2 tiles + front offset
spawnX = centerX - 24 - 6.5;
spawnY = centerY - 24 - 5.5;
```

Equivalent simplified:

- `spawnX = tileX*48 + 41.5`
- `spawnY = tileY*48 + 90.5`

## 7.3 `.city` layout import transform

For each line `<type> <rawX> <rawY>`:

```ts
tileX = 511 - rawX;
tileY = 511 - rawY;
type = ORIGINAL_TO_REMASTERED_TYPE[type] ?? 300;
```

Example (`Annaba` anchor):

- input: `1 416 352`
- output tile: `(95,159)`
- remastered type: `200`

## 7.4 Legacy->remastered type conversion (used by map/city imports)

| Legacy | Remastered |
|---|---|
| 1 | 200 |
| 2 | 300 |
| 3 | 400 |
| 4 | 100 |
| 5 | 409 |
| 6 | 109 |
| 7 | 403 |
| 8 | 103 |
| 9 | 402 |
| 10 | 102 |
| 11 | 411 |
| 12 | 111 |
| 13 | 404 |
| 14 | 104 |
| 15 | 405 |
| 16 | 105 |
| 17 | 401 |
| 18 | 101 |
| 19 | 410 |
| 20 | 110 |
| 21 | 408 |
| 22 | 108 |
| 23 | 407 |
| 24 | 107 |
| 25 | 406 |
| 26 | 106 |

## 8) Item Type IDs Required for Texture Parity

Master item IDs:

- cloak `0`
- rocket `1`
- medkit `2`
- bomb `3`
- mine `4`
- orb `5`
- flare `6`
- dfg `7`
- wall `8`
- turret `9`
- sleeper `10`
- plasma `11`
- laser `12`

TypeScript high-risk mismatch:

- TS action/inventory flow currently uses `ITEM_TYPE_BOMB = 1` in multiple places.
- This breaks both behavior and panel/world sprite frame selection parity.

## 9) Map Modal Parity Contract (Building/Terrain heavy)

Master modal contract:

- full-screen overlay + canvas (not text preformatted block)
- draw every map tile colorized from terrain value:
  - ground `#27421f`
  - rock `#8d99a6`
  - lava `#d35400`
  - building `#f6d743`
- render structure markers centered on building footprints
- render city markers with names
- render player triangle marker from `(player.offset + 24) / 48`
- default scale `2`, max scale `4`

TypeScript gap:

- TS currently shows textual/ascii `16x12` radar in `<pre>`.

## 10) Asset Parity Matrix

All of these exist in `apps/client-ts/public/assets`, but not all are loaded/used in TS renderer.

| Asset | Needed for parity | Current TS load status |
|---|---|---|
| `imgTanks.png` | tanks | loaded |
| `imgGround.png` | ground | loaded |
| `imgLava.png` | terrain | loaded |
| `imgRocks.png` | terrain | loaded |
| `imgbullets.png` | bullet frame rows | loaded (but not used as master rows) |
| `imgInterface.png` | panel top | loaded |
| `imgInterfaceBottom.png` | panel bottom | loaded |
| `imgHealth.png` | health bar sprite | loaded |
| `imgBuildings.png` | buildings | loaded |
| `imgBuildIcons.png` | build UI | present, not wired in render parity path |
| `imgItems.png` | items/icons | loaded |
| `imgInventorySelection.png` | inventory highlight | present, not loaded in registry |
| `imgArrows.png` | home arrow | present, not loaded in registry |
| `imgArrowsRed.png` | arrow variant | present, not loaded in registry |
| `imgRadarColors.png` | radar points | loaded |
| `imgMiniMapColors.png` | radar dead marker | present, not loaded in registry |
| `imgPopulation.png` | population overlay | loaded |
| `imgBlackNumbers.png` | factory digits | present, not loaded in registry |
| `imgMoneyBox.png` | panel finance box | present, not loaded in registry |
| `imgMoneyUp.png` | income icon | loaded |
| `imgMoneyDown.png` | income icon | loaded |
| `imgTurretBase.png` | defense base | loaded |
| `imgTurretHead.png` | defense head | present, not loaded in registry |
| `imgSmoke.png` | factory smoke | loaded |
| `imgLExplosion.png` | large explosion | present, not loaded in registry |
| `imgSExplosion.png` | small explosion | loaded |
| `imgMuzzleFlash.png` | muzzle flash | loaded |
| `imgResearch.png` | research strip | loaded |
| `imgResearchComplete.png` | research strip | loaded |

## 11) TypeScript File-by-File Change Backlog (Building/Terrain First)

Priority order below is optimized for building + map/terrain parity first.

1. `apps/client-ts/src/render/layers/TileLayer.ts`
- implement animated building base frames (`animX=144`, `animCountX=3`, `animDivisor=4`)
- add overlay icon placements (`+14,+98` / `+56,+52`)
- add exact research strip crop/scale/position
- add factory digit rendering (`imgBlackNumbers`) at exact positions
- add command center world labels with `-32` y offset

2. `apps/client-ts/src/render/layers/ChangingLayer.ts`
- correct population frame row/column and family offset matrix
- smoke position to exact `+6,-15`
- keep defense hp lines without replacing master overlays

3. `apps/client-ts/src/render/items/ItemRenderer.ts`
- align item ID usage to master IDs
- implement mine/bomb/orb offsets + frame rectangles exactly
- add turret head rendering (`imgTurretHead`)
- enforce mine-before-wall draw ordering

4. `apps/client-ts/src/world/city-spawn.ts`
- replace hardcoded 8-city list with full source-of-truth city list from `apps/server-ts/data/citySpawns.json` equivalent
- keep exact tile coordinate values (including final-row shifted values)

5. `apps/client-ts/src/world/map-loader.ts` + server `apps/server-ts/src/domain/map/MapService.ts`
- align blocking rules between client/server for terrain/building footprint (lava + 3x3 anchor expansion policy must match)

6. `apps/client-ts/src/render/LegacyTextureRegistry.ts`
- load missing parity assets listed in section 10

7. `apps/client-ts/src/render/scene.ts`
- enforce panel exact coordinates (fixed bottom y=430)
- add finance box/text and health masked sprite at exact coordinates
- replace radar normalization with master local projection
- add home arrow
- add panel inventory icon grid
- remove center anchor on tank sprites for parity path

8. `apps/client-ts/src/app/intents-actions.ts` + `apps/client-ts/src/gameplay/items/IconInventoryService.ts`
- fix item type constant mapping (bomb/mines/orb/etc)
- ensure selected item type drives correct panel/world frame indexing

9. `apps/client-ts/src/ui/map/MapModal.ts`
- replace ascii modal with full terrain/building canvas modal parity behavior

10. Optional parity hardening
- add explicit render-order tests (panel/world items/objects)
- add snapshot tests for key coordinates and frame rects

## 12) Acceptance Criteria (Exact Visual Checks)

1. Panel @ `1024x768`
- panel starts at `x=824`
- bottom panel starts at `(824,430)`
- money box/icon/cash text/health bar exactly aligned

2. Radar
- range clamp at `2400 px`
- points clip within `138x138` at panel offset `(28,8)`
- projection formula matches master (`dx/dy` with adjustors `70/69`)

3. Terrain/buildings
- rock/lava tile frame `x` changes only via adjacency bitmask*48
- building base animation cycles across 3 columns
- research strip, population overlay, smoke, digits at exact offsets

4. Items/defenses
- mine/bomb/orb frame rects and offsets exact
- turret head rotates and layers over turret base

5. Map layout
- city spawns resolve using full 0..63 coordinate table
- `.city` import transform matches `(511-rawX, 511-rawY)` exactly
- client/server blocking sets agree on terrain/building footprint interpretation

6. Tank parity
- local tank center behavior with no anchor drift
- remote tanks align exactly with world transform formula

## 13) Source Files Used for This Analysis

- `master: client/app.js`
- `master: client/src/draw/draw-ground.js`
- `master: client/src/draw/draw-tiles.js`
- `master: client/src/draw/draw-items.js`
- `master: client/src/draw/draw-changing.js`
- `master: client/src/draw/draw-panel-interface.js`
- `master: client/src/mapBuilder.js`
- `master: client/src/ui/MapModal.js`
- `master: client/src/constants.js`
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/src/render/layers/GroundLayer.ts`
- `apps/client-ts/src/render/layers/TileLayer.ts`
- `apps/client-ts/src/render/layers/ChangingLayer.ts`
- `apps/client-ts/src/render/items/ItemRenderer.ts`
- `apps/client-ts/src/render/LegacyTextureRegistry.ts`
- `apps/client-ts/src/world/map-loader.ts`
- `apps/client-ts/src/world/city-spawn.ts`
- `apps/client-ts/src/world/city-import.ts`
- `apps/client-ts/src/ui/map/MapModal.ts`
- `apps/client-ts/src/app/intents-actions.ts`
- `apps/client-ts/src/gameplay/items/IconInventoryService.ts`
- `apps/server-ts/src/domain/map/MapService.ts`
- `apps/server-ts/src/domain/map/CityLayoutService.ts`
- `apps/server-ts/src/domain/defense/DefenseService.ts`
- `apps/server-ts/data/citySpawns.json`
