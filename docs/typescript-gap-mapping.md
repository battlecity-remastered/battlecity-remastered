# TypeScript Gap Mapping (Legacy `master` -> TS Rewrite)

Last updated: 2026-02-24
Source analysis: `docs/typescript-gap-analysis.md`

## How to use this document
1. Pick one row.
2. Implement all code changes listed in `TS target files`.
3. Add/adjust tests in `Required tests`.
4. Mark status only when tests pass.

## Mapping table
| Area | Legacy contract | TS target files | Required tests | Status |
|---|---|---|---|---|
| Panel static layout | top at `(maxMapX,0)`, bottom at `(maxMapX,430)` | `apps/client-ts/src/render/scene.ts` | `panel-radar-parity.test.ts` | pending |
| Finance block | money box/up/down/cash text exact coordinates | `apps/client-ts/src/render/scene.ts` | `panel-radar-parity.test.ts` | pending |
| Health bar | 38x87 masked, anchor `(1,1)`, at `(maxMapX+175,247)` | `apps/client-ts/src/render/scene.ts` | `panel-radar-parity.test.ts` | pending |
| Panel messages | base `(maxMapX+12,465)`, line spacing 15 | `apps/client-ts/src/render/scene.ts` | `panel-radar-parity.test.ts` | pending |
| Inventory panel icons | slot coordinates + item frames + selection texture | `apps/client-ts/src/render/scene.ts`, `apps/client-ts/src/gameplay/items/IconInventoryService.ts` | `panel-radar-parity.test.ts`, `item-id-parity.test.ts` | pending |
| Home arrow | `imgArrows` 8 directions at `(maxMapX+5,160)` | `apps/client-ts/src/render/scene.ts` | `panel-radar-parity.test.ts` | pending |
| Radar math | local-relative projection with range/bounds constants | `apps/client-ts/src/render/scene.ts`, `apps/client-ts/src/render/panel/panel-visuals.ts` | `panel-radar-parity.test.ts` | pending |
| Radar textures | `imgRadarColors` + dead marker from `imgMiniMapColors` | `apps/client-ts/src/render/scene.ts`, `apps/client-ts/src/render/LegacyTextureRegistry.ts` | `assets-parity-registry.test.ts`, `panel-radar-parity.test.ts` | pending |
| Tank origin/frame | top-left origin, frame `(col*48,row*48,48,48)` | `apps/client-ts/src/render/scene.ts` | `render-entity-parity.test.ts` | pending |
| Ground layer | tile size 128 + modulo camera transform | `apps/client-ts/src/render/layers/GroundLayer.ts` | `terrain-parity.test.ts` | pending |
| Terrain frames | adjacency bitmask -> `frameX = mask*48` | `apps/client-ts/src/render/layers/TileLayer.ts` | `terrain-parity.test.ts` | pending |
| Building base | `(0,baseType*144,144,144)` + animation strip | `apps/client-ts/src/render/layers/TileLayer.ts` | `building-overlay-parity.test.ts` | pending |
| Building overlay icons | research `(+14,+98)`, factory `(+56,+52)` | `apps/client-ts/src/render/layers/TileLayer.ts` | `building-overlay-parity.test.ts` | pending |
| Research strip | crop 5px top/bottom, scale and position formula | `apps/client-ts/src/render/layers/TileLayer.ts`, `apps/client-ts/src/render/layers/ChangingLayer.ts` | `changing-layer-parity.test.ts` | pending |
| Population overlay | row/column rules + family offsets | `apps/client-ts/src/render/layers/ChangingLayer.ts` | `changing-layer-parity.test.ts` | pending |
| Factory smoke | frame `(0,smokeFrame*60,180,60)`, offset `(+6,-15)` | `apps/client-ts/src/render/layers/ChangingLayer.ts` | `changing-layer-parity.test.ts` | pending |
| Factory digits | `imgBlackNumbers` at `(+56,+84)` and `(+72,+84)` | `apps/client-ts/src/render/layers/ChangingLayer.ts` | `changing-layer-parity.test.ts` | pending |
| Command center labels | centered at `(tile+1.5)*48`, y offset `-32` | `apps/client-ts/src/render/layers/TileLayer.ts` | `building-overlay-parity.test.ts` | pending |
| Defense turret base/head | base damage columns + rotating head frames | `apps/client-ts/src/render/items/ItemRenderer.ts`, `apps/client-ts/src/render/scene.ts` | `item-defense-bullet-parity.test.ts` | pending |
| Item rendering | mine/bomb/orb frame rectangles + offsets | `apps/client-ts/src/render/items/ItemRenderer.ts` | `item-defense-bullet-parity.test.ts` | pending |
| Bullet rendering | 8x8 animated frames by type/animation | `apps/client-ts/src/render/scene.ts` | `item-defense-bullet-parity.test.ts` | pending |
| Item type IDs | canonical IDs (bomb=3, mine=4, orb=5, etc.) | `apps/client-ts/src/render/parity/constants.ts`, `apps/client-ts/src/app/intents-actions.ts`, `apps/client-ts/src/gameplay/items/IconInventoryService.ts`, `apps/client-ts/src/render/items/ItemRenderer.ts` | `item-id-parity.test.ts` | pending |
| Asset registry completeness | all parity textures loaded | `apps/client-ts/src/render/LegacyTextureRegistry.ts` | `assets-parity-registry.test.ts` | pending |
| Map decode orientation | `sourceX=511-y`, `sourceY=511-x` | `apps/client-ts/src/world/map-loader.ts`, `apps/server-ts/src/domain/map/MapService.ts` | `map-loader.test.ts`, `map-services.test.ts` | pending |
| Blocking tile parity | client/server consistent blocking policy | `apps/client-ts/src/world/map-loader.ts`, `apps/server-ts/src/domain/map/MapService.ts` | `map-loader.test.ts`, `map-services.test.ts`, `blocking-parity-contract.test.ts` | pending |
| City spawn parity | full 0..63 spawn table, exact tile values | `apps/client-ts/src/world/city-spawn.ts` | `city-spawn.test.ts` | pending |
| `.city` import transform | `(511-rawX, 511-rawY)` + type map | `apps/client-ts/src/world/city-import.ts`, `apps/server-ts/src/domain/map/CityLayoutService.ts` | `city-import.test.ts`, `map-services.test.ts` | pending |
| Map modal parity | canvas modal with terrain/building/city/player markers | `apps/client-ts/src/ui/map/MapModal.ts` | `map-modal-parity.test.ts` | pending |

## Test file additions (planned)
- `apps/client-ts/test/item-id-parity.test.ts`
- `apps/client-ts/test/assets-parity-registry.test.ts`
- `apps/client-ts/test/terrain-parity.test.ts`
- `apps/client-ts/test/building-overlay-parity.test.ts`
- `apps/client-ts/test/changing-layer-parity.test.ts`
- `apps/client-ts/test/item-defense-bullet-parity.test.ts`
- `apps/client-ts/test/panel-radar-parity.test.ts`
- `apps/client-ts/test/map-modal-parity.test.ts`
- `apps/client-ts/test/render-entity-parity.test.ts`
- `apps/server-ts/test/blocking-parity-contract.test.ts`
