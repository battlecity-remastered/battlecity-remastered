# Visual Parity Rewrite Plan (LLM-Executable)

Last updated: 2026-02-24
Owner: `feature/typescript`
Primary gap source: `docs/typescript-gap-analysis.md`

## Non-negotiable note
No plan can mathematically guarantee 100% correctness in complex UI systems. This plan is designed to be as close as practical by using hard verification gates (tests + deterministic render audits + strict checks). If every gate passes, unresolved parity risk is minimized.

## LLM execution contract
1. Work phase-by-phase in order. Do not skip phases.
2. Each phase must have code + tests + docs updates.
3. Do not start next phase until current phase gate passes.
4. If a gate fails, stop and fix before moving on.
5. Keep commits atomic: one phase per commit.
6. After each phase, update this file status table and `docs/parity-checklist.md`.

## Required commands
- Install: `npm install`
- Fast full checks after each phase:
  - `npm run typecheck`
  - `npm run test`
- Final release gate:
  - `npm run rewrite:check:strict`

## Phase status
| Phase | Scope | Status | Exit gate |
|---|---|---|---|
| 0 | Baseline + harness | done | baseline artifacts committed |
| 1 | Shared constants + item IDs | done | all constants centralized, tests green |
| 2 | Asset loading parity | done | all required textures loaded + tested |
| 3 | Map decode + blocking parity | done | client/server map tests aligned |
| 4 | Ground + terrain tile parity | done | terrain frame math + draw transform parity |
| 5 | Building base + overlays parity | pending | building visual matrix parity |
| 6 | Population/research/smoke/digits parity | pending | changing-layer parity tests |
| 7 | Items/defense/bullets parity | pending | frame/offset parity tests |
| 8 | Panel + radar + home arrow parity | pending | panel coordinate tests + manual verify |
| 9 | Map modal parity | pending | canvas modal parity + tests |
| 10 | City spawn/layout parity | pending | 0..63 city spawn parity + import tests |
| 11 | End-to-end parity validation | pending | strict gate + visual audit pass |

## Phase 0: Baseline + harness
Goal: lock current behavior and create deterministic comparison tooling.

Steps:
1. Create `scripts/parity/` with:
   - `capture-master-notes.md` (manual expected values from legacy `master`).
   - `capture-ts-runtime.ts` (logs runtime coordinates/textures from TS render frame).
2. Add deterministic render fixture in tests:
   - fixed surface size: `1024x768`
   - fixed player world offset
   - fixed entity fixtures (1 city, 1 building per family, 1 turret, 1 mine, 1 bomb, 1 orb, 2 remotes).
3. Add baseline JSON snapshots under `apps/client-ts/test/fixtures/parity/`:
   - `baseline-panel.json`
   - `baseline-radar.json`
   - `baseline-buildings.json`
   - `baseline-items.json`

Files:
- `scripts/parity/*`
- `apps/client-ts/test/fixtures/parity/*`

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 1: Shared constants + item IDs
Goal: eliminate ID drift and magic numbers.

Steps:
1. Add `apps/client-ts/src/render/parity/constants.ts` containing:
   - panel/radar constants
   - texture frame sizes
   - item type IDs (`cloak=0 ... laser=12`)
   - common dimensions (`TILE=48`, `PANEL=200`, etc).
2. Replace local ad-hoc constants in:
   - `apps/client-ts/src/app/intents-actions.ts`
   - `apps/client-ts/src/gameplay/items/IconInventoryService.ts`
   - `apps/client-ts/src/render/items/ItemRenderer.ts`
   - `apps/client-ts/src/render/scene.ts`
3. Remove incorrect `ITEM_TYPE_BOMB = 1` usage.
4. Add tests asserting canonical IDs and no local redefinitions.

Files:
- `apps/client-ts/src/render/parity/constants.ts`
- affected imports in files above
- `apps/client-ts/test/item-id-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 2: Asset loading parity
Goal: guarantee every required visual asset is loaded and available.

Steps:
1. Expand `apps/client-ts/src/render/LegacyTextureRegistry.ts` to load:
   - `imgTurretHead`, `imgMiniMapColors`, `imgArrows`, `imgArrowsRed`,
   - `imgMoneyBox`, `imgBlackNumbers`, `imgInventorySelection`, `imgLExplosion`, `imgBuildIcons`.
2. Extend `LegacyTextures` type with parity aliases required by renderer.
3. Add fallback handling only for missing files; do not silently skip loaded assets.
4. Add unit test verifying all expected texture keys exist when files exist.

Files:
- `apps/client-ts/src/render/LegacyTextureRegistry.ts`
- `apps/client-ts/test/assets-parity-registry.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 3: Map decode + blocking parity
Goal: client/server map semantics match and match legacy expectations.

Steps:
1. Confirm decode transform remains:
   - `sourceX=511-y`, `sourceY=511-x`.
2. Align blocking semantics across:
   - `apps/client-ts/src/world/map-loader.ts`
   - `apps/server-ts/src/domain/map/MapService.ts`
3. Decide and enforce one contract for blocking values and command-center footprint expansion, then apply consistently to both client and server.
4. Update/add tests in:
   - `apps/client-ts/test/map-loader.test.ts`
   - `apps/server-ts/test/map-services.test.ts`
   - add cross-contract test to assert same input bytes produce equivalent blocking decisions.

Files:
- map loader files above
- map tests above

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 4: Ground + terrain tile parity
Goal: match legacy terrain draw behavior exactly.

Steps:
1. Update `apps/client-ts/src/render/layers/GroundLayer.ts`:
   - match tile size `128`, draw radius/window parity logic, camera modulo placement.
2. Update `apps/client-ts/src/render/layers/TileLayer.ts` terrain section:
   - ensure adjacency bitmask frame offset `*48` identical to legacy.
   - out-of-bounds black tile fill.
3. Add tests for:
   - frame offset bitmask cases (all 16 combinations).
   - camera transform formula parity.

Files:
- `GroundLayer.ts`
- `TileLayer.ts`
- `apps/client-ts/test/terrain-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 5: Building base + overlays parity
Goal: exact building base and overlay icon rendering.

Steps:
1. In `TileLayer.ts`, set building base frame:
   - `(0, baseType*144, 144, 144)`.
2. Add building animation parity:
   - `animX=144`, `animCountX=3`, `animDivisor=4` equivalent behavior.
3. Add building overlay icon frames from `imgItems` (`32x32` strip):
   - research offset `(+14,+98)`
   - factory offset `(+56,+52)`.
4. Add command-center label placement:
   - center `(tile+1.5)*48`, y offset `-32`.

Files:
- `apps/client-ts/src/render/layers/TileLayer.ts`
- `apps/client-ts/src/render/scene.ts` (label layer wiring if needed)
- `apps/client-ts/test/building-overlay-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 6: Population/research/smoke/digits parity
Goal: exact changing-layer visuals.

Steps:
1. Update `ChangingLayer.ts` population frame logic:
   - row selection and max-pop rules (`house=100`, others `50`).
   - per-family offsets.
2. Research strip parity:
   - crop 5px top/bottom, scale to width 9 and height ~121, x/y formula.
3. Smoke parity:
   - frame `(0, smokeFrame*60,180,60)` and offset `(+6,-15)`.
4. Factory digits parity:
   - `imgBlackNumbers` tens/ones at `(+56,+84)` and `(+72,+84)`.
5. Add tests for each coordinate and frame rectangle.

Files:
- `apps/client-ts/src/render/layers/ChangingLayer.ts`
- `apps/client-ts/test/changing-layer-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 7: Items/defense/bullets parity
Goal: exact world item/defense/bullet sprite behavior.

Steps:
1. Update `ItemRenderer.ts`:
   - mine frame `(type*32,0,32,32)` + `+8,+8`.
   - bomb armed frame `(144,91,48,48)` else idle bomb frame.
   - orb animated frame with `+4` x offset.
   - mine/wall render ordering parity.
2. Add turret head rendering with orientation frames using `imgTurretHead`.
3. Update bullet rendering in `scene.ts` (or extracted renderer):
   - frame `(animation*8, type*8, 8, 8)` and frame cycle.
4. Add unit tests for frame selection and placement offsets.

Files:
- `apps/client-ts/src/render/items/ItemRenderer.ts`
- `apps/client-ts/src/render/scene.ts` (bullet/defense portions)
- `apps/client-ts/test/item-defense-bullet-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 8: Panel + radar + home arrow parity
Goal: exact right-panel behavior and coordinates.

Steps:
1. In `scene.ts`, change panel layout to fixed legacy coordinates:
   - top at `(panelX,0)`, bottom at `(panelX,430)`.
2. Add finance sprites and cash text exact coordinates.
3. Add health masked bar exact coordinates and mask formula.
4. Add panel message base `(panelX+12,465)`.
5. Implement inventory icon grid + selection highlight + quantity text.
6. Replace radar normalization with local relative formula + clipping bounds.
7. Use radar point textures from `imgRadarColors` and dead marker from `imgMiniMapColors`.
8. Add home arrow (`imgArrows`, 8 frames) at `(panelX+5,160)`.
9. Add tests for all panel coordinates and radar projection math.

Files:
- `apps/client-ts/src/render/scene.ts`
- `apps/client-ts/src/render/panel/panel-visuals.ts`
- `apps/client-ts/test/panel-radar-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 9: Map modal parity
Goal: replace ASCII map modal with canvas-based terrain/building modal.

Steps:
1. Rework `apps/client-ts/src/ui/map/MapModal.ts` to canvas modal behavior:
   - tile-color render of full map.
   - city markers + labels.
   - structure markers centered on footprints.
   - player marker from player center.
2. Preserve close behaviors (`Escape`, overlay click, fullscreen container attach).
3. Add tests for modal render path and deterministic color/coordinate mapping.

Files:
- `apps/client-ts/src/ui/map/MapModal.ts`
- `apps/client-ts/test/map-modal-parity.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 10: City spawn/layout parity
Goal: align city placement/layout data across client/server.

Steps:
1. Replace hardcoded 8-city spawn list in `city-spawn.ts` with complete 0..63 source data.
2. Keep exact tile values from `apps/server-ts/data/citySpawns.json` (do not derive by formula).
3. Validate `.city` import transform parity in both client and server utility tests.
4. Add tests:
   - city 0, 7, 56, 63 coordinates.
   - spawn pixel formula from tile coords.

Files:
- `apps/client-ts/src/world/city-spawn.ts`
- `apps/client-ts/src/world/city-import.ts`
- `apps/client-ts/test/city-spawn.test.ts`
- `apps/client-ts/test/city-import.test.ts`

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 11: End-to-end parity validation
Goal: prove all planned issues are closed.

Steps:
1. Run full strict gate:
   - `npm run rewrite:check:strict`
2. Run deterministic parity audit script:
   - emit `parity-report.json` with each contract assertion from `docs/typescript-gap-analysis.md`.
3. Manually verify key scenes at `1024x768`:
   - panel layout + health + finance
   - radar plot behavior
   - terrain edges and building overlays
   - turret head, mine/bomb/orb offsets
4. Update `docs/parity-checklist.md` to all checked.
5. Mark all phases in this file `done`.

Gate:
- strict gate passes
- parity report has zero failures
- manual verification checklist complete

## Completion definition
Rewrite is complete when all are true:
1. Every phase status = `done`.
2. `npm run rewrite:check:strict` passes.
3. `docs/parity-checklist.md` is 100% checked.
4. Parity report has zero failed assertions.
5. No unresolved TODO/FIXME markers in parity-related files.
