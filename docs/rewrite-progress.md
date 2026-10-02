# Visual Parity Rewrite Plan (LLM-Executable)

## Three.js gameplay port — October 2026

The user has authorized completing the live game port while preserving the approved terrain, lava, buildings, inventory and radar. The default Three.js route is now connected, with ?demo=1 retained for the offline preview; the shared TypeScript server remains the source of gameplay authority. The earlier Pixi parity table below describes the prior renderer, not completion of this port.

- [x] Restore a green current-contract server test baseline.
- [x] Live Three.js startup, identity/city joining, disconnect/reconnect and respawn.
- [x] Frame-driven local driving, throttled network commands and remote player interpolation.
- [x] Server-driven buildings, factory stock, pickups, hazards and defenses.
- [x] Authoritative combat with the existing weapon, recoil, impact and explosion effects.
- [x] Usable build/research/economy controls, placement previews and destruction.
- [x] Inventory use/deployment, cloak, medkit, flares and city-orbing gameplay.
- [x] Chat, identity, scores, role information and help.
- [x] Multi-client end-to-end validation of construction, production, combat, respawn and orbing; build/type/test checks (strict complexity and maintainability thresholds remain below).

Validation: all 92 test files passed with population growth, household attachments,
mayor appearance, deployed-defense geometry and housing footprint coverage. Browser city joining and
construction passed without runtime errors. Cross-client runtime tests cover
production, pickups, authoritative combat, leaving/rejoining and city-orbing.
Headless software GPU driving automation did not reliably reach its pickup
waypoints; it is not evidence of hardware frame rate or a completed browser-only
combat playthrough. Manual multiplayer play testing remains important.

Precise drops reuse the original padded 32px tank footprint, greatest-overlap
selection and centre-tile tie break. There is no adjacent-tile fallback. All 32
headings are tested for wall/turret/sleeper/plasma deployment. Towers and walls
unfold without moving their one-tile footprint. Classic team visibility is shared
with the Three world and radar; sleeper reveal triggers emergence.

The strict rewrite gate now passes all checks after the October 2 CI repair.
Complexity and function length use the TypeScript parser, measuring nested
callbacks independently and ignoring comments, shader strings and optional type
syntax as control flow. The limits remain a complexity of 15 per function, an average
of 8 per file, 90 lines per function and 320 per file, with the existing legacy
file limits unchanged. Large render, UI, snapshot and server functions were split
into focused helpers; GLSL source moved without changing its rendering settings.

Rendering quality remains fixed: original tile/camera scale, full display density, four-sample multisampling and per-frame shadows. No automatic resolution reduction.

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
| 5 | Building base + overlays parity | done | building visual matrix parity |
| 6 | Population/research/smoke/digits parity | done | changing-layer parity tests |
| 7 | Items/defense/bullets parity | done | frame/offset parity tests |
| 8 | Panel + radar + home arrow parity | done | panel coordinate tests + manual verify |
| 9 | Map modal parity | done | canvas modal parity + tests |
| 10 | City spawn/layout parity | done | 0..63 city spawn parity + import tests |
| 11 | End-to-end parity validation | done | strict gate + visual audit pass |

## Phase 0: Baseline + harness
Goal: lock current behavior and create deterministic comparison tooling.

Steps:
1. Create `scripts/parity/` with:
   - `capture-master-notes.md` (manual expected values from classic `master`).
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
1. Expand `apps/client-ts/src/render/TextureRegistry.ts` to load:
   - `imgTurretHead`, `imgMiniMapColors`, `imgArrows`, `imgArrowsRed`,
   - `imgMoneyBox`, `imgBlackNumbers`, `imgInventorySelection`, `imgLExplosion`, `imgBuildIcons`.
2. Extend `TextureSet` type with parity aliases required by renderer.
3. Add fallback handling only for missing files; do not silently skip loaded assets.
4. Add unit test verifying all expected texture keys exist when files exist.

Files:
- `apps/client-ts/src/render/TextureRegistry.ts`
- `apps/client-ts/test/assets-parity-registry.test.ts` (new)

Gate:
- `npm run typecheck`
- `npm run test`

## Phase 3: Map decode + blocking parity
Goal: client/server map semantics match and match classic expectations.

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
Goal: match classic terrain draw behavior exactly.

Steps:
1. Update `apps/client-ts/src/render/layers/GroundLayer.ts`:
   - match tile size `128`, draw radius/window parity logic, camera modulo placement.
2. Update `apps/client-ts/src/render/layers/TileLayer.ts` terrain section:
   - ensure adjacency bitmask frame offset `*48` identical to classic.
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
1. In `scene.ts`, change panel layout to fixed classic coordinates:
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

### Mayor sandbox and residential assets

`?demo=1` now assigns the local player as mayor, exposes the live construction
UI with all research unlocked, and supports actual housing placement. Right-click
and B open construction in both routes. Demo-only self-orbing from the canonical
NO PARKING apron plays the shared orb energy effect and a district collapse;
RESET DEMO restores it. Enemy-only live orbing remains unchanged.

The Blender mayor variant reproduces the original rounded teal command turret,
within the existing one-tile footprint. Local and remote tanks follow lobby role
assignments and mayor promotion. Housing now uses a dedicated Blender habitat,
with twin residential wings, inset windows, balconies, skylights, service pods,
chrome framing and dark DX armour. Both mayor and housing GLBs have explicit
footprint regression coverage. Their export commands are documented under
`scripts/blender/README.md`.

### Population presentation and house selection

The original six crew symbols are represented inside recessed glass staffing
panels on the buildings. Houses show combined residents out of 100, other
buildings show staff out of 50. Live values and household links come from
`population.update`, including removal and reassignment. The floor tokens and
apron labels from the first visual pass were removed. Housing roof reflections
are softened without changing the shared factory/lava lighting.

Clicking a friendly house raycasts its actual model, selects its household links,
and suppresses firing for that click. Empty-ground clicks clear the selection;
the POPULATION control shows all links. Moving light packets follow the visible
routes. The offline mayor sandbox grows population by five per workplace per
250ms tick, respects the original two-building household limit, and resets or
reattaches buildings after demolition. Research remains unlocked in the sandbox.

The full strict complexity/maintainability gate still flags oversized scene/UI
functions; gameplay tests, typechecks and the production build are validated
separately, without waiving those limits.

Final verification: 92 test files pass, workspace typechecks and unused-symbol
checks pass, and the production build passes. Import-extension, dependency-cycle
and duplication checks pass. The isolated browser verified housing construction,
roof-click selection with exactly two connected buildings and zero player shots,
and reported zero runtime errors. The client was restarted on 8220 after its
previous process stopped; the server health endpoint on 8121 remains healthy.
The test browser is shut down after its final capture.

## 2026-10-01 — AI opponents and tile navigation

Live AI cities now activate when the first human joins, favour nearby unoccupied
cities, and preserve existing battle damage when everyone returns to the lobby.
They cannot overwrite human-owned cities or accept human ownership while active.
The default lobby covers the original 64 cities; generated cities are labelled
as AI opponents and occupancy updates when their lifecycle changes.

Each engaged city supports mayor, shooter, bomb-defuser and miner defenders.
Idle defenders patrol entrances throughout the city. Miners place bounded armed
mine/DFG traps ahead of exposed enemies, with a cooldown, occupancy checks and
space around tanks. Lost roles are replaced after twenty seconds. AI mayors use
the mayor model through optional snapshot role metadata. Orbed cities clear bots
and retain the original five-minute reconstruction cooldown.

Routes remain on the tile grid: tanks reach each centre before turning, keep
forward progress when paths are recalculated, stop when no route exists, and
replan when blocked. Spawns must have collision clearance and a usable route into
the city. Collision movement is swept in small increments. Defenders and rogues
seek a route around obstructing terrain instead of firing into it from their
usual standoff distance. Friendly/dead/cloaked targets are excluded and DFG
freezes movement and fire. Patrol goals are cached until structures change.

Validation: all 93 test files pass, including fifteen new AI scenarios covering
all six configured cities on the actual map, minute-long patrol simulation,
L-shaped wall routing, replanning, flanking, trap limits, ownership, role snapshots,
replacement delay and city cooldowns. Workspace typechecks, unused-symbol checks
and production client build pass. A full-suite runtime-file failure did not
reproduce in its direct run, six repeated runtime runs, or the subsequent full
suite. Difficulty and feel still require human multiplayer playtesting; this is
an automated correctness check, not a claim of complete classic AI parity.

## 2026-10-01 — Performance without reducing visual quality

Prepare battlefield world transforms once for the color/AO/shadow passes, freeze
static terrain transforms, and avoid uploading unchanged building instance
buffers. Newly generated factories/research buildings now join the shared part
batches; demolition unregisters them safely. Research specimen captures use a
conservative camera-frustum bound to skip offscreen screens. Inventory headers
and status text update only when their content changes, and live-world cleanup
uses existing entity maps rather than allocating temporary membership sets.

Antialiasing, pixel ratio, render-target samples, shadow size/cadence, terrain
mesh density, materials, bloom, AO, and visible animation cadence are preserved.
F3 now includes GPU backend and scene/update versus draw/driver timings in both
live and demo routes. Draw submission timing includes driver stalls; it is not
an isolated GPU measurement.

Validation: all 93 test files, workspace typechecks and production build pass.
Batch tests cover animated/nested transforms, float precision, visibility,
removal and live registration. An isolated browser construction/house-selection
check passed without runtime errors; its screenshot retained the approved scene.
A synthetic 2,880-part transform benchmark including repeated render-pass matrix
updates measured about 1.18 -> 0.47 ms for unchanged parts, and 1.11 -> 0.94 ms
with animated parts. These are CPU subtask measurements, not claimed player FPS
improvements. Actual hardware performance still needs F3 evidence from the
player's browser; the isolated browser used software rendering.


## 2026-10-02 — Profiled shell collision bottleneck and hardware browser testing

The player's F3 screenshot reports Intel UHD Graphics (CML GT2), not software
rendering. A stage breakdown and Chrome CPU profile identified triangle raycasts
in demo combat as the large scene/update cost. F3 now separates world updates,
animation, research captures, inventory UI, combat, matrices, batches and drawing;
its main-thread timings include driver calls and are not GPU timings.

Added three-mesh-bvh 0.9.15 for collision queries against rigid mesh geometry.
Indirect trees retain the original vertex/index buffers and triangle order.
Queries request the nearest surface and keep the original material groups,
transforms, normals and instance identity. Rock instances use local proxies,
without patching Three's global prototypes. Deforming geometry retains native
raycasting. Tank bounds are prepared once per combat frame and refreshed after
movement/recoil on the next frame. Visible geometry, materials, shadows, AA,
resolution and animation settings are unchanged.

An isolated software-rendered browser comparison sampled combat at about
24.5 -> 1.7 ms, with the same 866 draws and 1,200,817 rendered triangles in the
captured scene. Average scene/update submission fell from about 29.5 -> 6.8 ms.
This demonstrates CPU work removed, not an FPS comparison on player hardware.
Inventory thumbnails rendered correctly in the final capture.

GPU diagnostics confirmed the YAAF-owned browser explicitly uses
`--use-angle=swiftshader-webgl`, with software-only WebGL. The separate isolated
Chrome test browser can access the player's Intel GPU using
`--enable-gpu --use-angle=gl`. A warmed-up 32-frame run at 1920x1080, DPR 1,
reported the same Intel UHD CML GT2 backend, approximately 8.6 FPS, 3.8 ms average
scene/update and 18.1 ms average total render submission, without browser errors.
A shorter 1280x800 run measured about 14.7 FPS. These are different-resolution
measurements, not a controlled FPS before/after result. Full-resolution drawing
still needs further GPU profiling; removing CPU work does not remove that limit.
The test browser is closed after each run.

Validation: all 94 test files, workspace typechecks, unused-symbol checks and
production build pass. Collision checks cover native/accelerated hit equivalence,
material groups, unchanged buffers, transformed rock instances, finite sweep
length, deforming-mesh fallback and moving/recoiling tank cache invalidation.
A recurring AI integration-test failure was traced to setup turret rounds
sometimes destroying the newly inserted bomb before target selection. The
fixture now clears those existing rounds and asserts the bomb remains active;
bot gameplay logic was unchanged. The full suite passes after this correction.


## 2026-10-02 — Preserve scene AA while simplifying post-processing buffers

Reviewed the official Three.js render-target/post-processing guidance and MDN's
WebGL best practices. In particular, resolved depth need not be copied when no
later pass reads it: https://threejs.org/docs/pages/RenderTarget.html and
https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices.

GPU timer queries on the Intel UHD CML GT2 at 1920x1080 measured the original
scene pass around 65 ms, GTAO 24.7 ms, bloom 9.0 ms, heat 7.3 ms and output 1.9 ms.
The compositor was keeping four-sample color/depth attachments for fullscreen
effects as well as geometry, repeatedly resolving unused depth.

MultisampleScenePass now renders the geometry into a dedicated four-sample HDR
target, resolves its color once, and copies that antialiased image into the
composer. Subsequent fullscreen effects use single-sample HDR color targets
without depth attachments. GTAO retains its own normal/depth target and all
existing settings. Main resolution/DPR, geometry, textures, lighting, shadows,
animation, four-sample scene AA and all effect strengths remain unchanged.

The first matched idle hardware runs measured about 8.54 -> 10.22 FPS. GPU timing
for GTAO/bloom/heat fell to approximately 17.4/4.7/1.8 ms respectively; the scene
plus its new color copy remained around 64.2 ms. These are local measurements,
not a guaranteed FPS uplift on every machine or under concurrent workloads.

Verification rendered both original and optimized pipelines on the same scene
state and read back the final frame: zero differing channels out of 8,294,400
at 1920x1080. After resizing to 1280x800 and rotating the tank, the comparison
again found zero differences across 4,096,000 channels. Both paths redrew the
same shadows, and comparisons included the final tone mapping and color output.
No browser errors. All 94 test files, workspace typechecks and production build
pass. The captured checks are in /tmp/battlecity-post-verified.log; the temporary
browser closes after the run.

## 2026-10-02 — Share terrain vertices and fuse heat/output shading

Terrain now indexes identical grid vertices directly while generating quads.
Coordinates, triangle order, shoreline tessellation, material attributes and
bank displacement remain unchanged. The loaded demo terrain retains all
3,031,126 triangles while reducing stored vertices from 9,093,378 to 1,694,432
(about 81%). The existing area/placement test now follows triangle indices and
checks retained shoreline triangles, normals, terrain-kind attributes and
frustum culling. Indexed geometry is documented at
https://threejs.org/docs/pages/BufferGeometry.html.

Opaque terrain renders after opaque buildings, allowing their depth to reject
covered ground before its detailed surface shading. Terrain chunks, eight-tile
building/rock batches and their bounding spheres remain independently cullable.
Off-screen geometry intersecting the shadow camera can still cast visible
shadows. No detail, viewport resolution, AA, shadow cadence or effect strength
was reduced.

Heat distortion, vignette, tone mapping and output colour conversion now share
one OutputPass. It retains Three's exposure and colour-space handling. Explicit
half-float truncation reproduces the former intermediate's rounding on the
validated Intel GPU. Unheated pixels reuse their existing colour sample,
skipping distortion sine calculations and a redundant texture fetch. Heated
pixels retain the original formula; explicit LOD zero makes the conditional
sample well-defined for the non-mipmapped HDR input. These packing and sampling
operations are WebGL 2 / GLSL ES 3 built-ins:
https://www.khronos.org/files/webgl20-reference-guide.pdf.

Stable canvas diagnostics no longer repeat DOM attribute writes. Timing fields
still publish every frame for FPS observers. Nearest-cargo diagnostics use
squared distances without allocating temporary result objects; selected-house
connection counting avoids temporary arrays and skips work when none is selected.

Individual Intel UHD CML GT2 experiments at 1920x1080 measured the scene pass
around 65.8 -> 62.8 ms for terrain draw order and around 63.3 ms for indexed
terrain. These separate gains must not be added together. A paired session's
separate heat/output passes cost about 5.45 ms together versus about 3.59 ms
for the merged pass, before the additional unheated-pixel shortcut. Paired FPS
samples for the original configuration were 7.66/7.96 versus 8.80/8.59 for
indexed terrain plus merged shading. Shared GPU load caused substantial run-to-run
variation; comparisons involving pixel readback are fidelity checks, not clean
FPS benchmarks.

The final retained pipeline was compared with the original terrain and separate
heat/output passes in the same frame, including redrawn shadows. Zero differing
channels out of 8,294,400 at 1920x1080; again zero out of 4,096,000 after resizing
to 1280x800 and rotating the tank. No browser errors. Evidence is in
/tmp/battlecity-all-kept-comparison.log. Lava-only shader branching and direct
GPU texture copying were tested but not retained because they did not provide
a reliable improvement. The isolated test browser closes after each run.

Validation: all 94 test files, workspace typechecks, unused-symbol checks and
production build pass. Existing large-bundle build warning remains.

## 2026-10-02 — Remove avoidable distance and angle calculations

Audited client presentation maths after the fast-inverse-square-root suggestion.
The original Quake routine uses a 32-bit float bit reinterpretation plus a Newton
iteration (https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/q_math.c).
V8 already provides a native Float64Sqrt intrinsic
(https://github.com/v8/v8/blob/main/src/builtins/math.tq). A local V8 benchmark
found the JavaScript Quake port roughly tied with native inverse square root
across runs, while introducing up to 0.175% relative error in the sampled values.
That approximation was not introduced.

Client bullet/effect visibility, research-display range, population-panel range,
demo pickup selection and turret activation now compare squared distances.
These coordinates are finite and bounded by the game map. Turrets retain actual
distance for predictive aiming when a target is in range; unrelated collision
and movement calculations remain unchanged.

Turret servo and remote-tank angle wrapping use bounded arithmetic for the common
one-turn range, retaining native trigonometric argument reduction for larger or
non-finite inputs. A regression compares 1,024 servo states with the original
trajectory within 1e-12 radians, including wrap direction, pitch/yaw speed and
large-angle cases. Existing turret firing/cover and live-world tests still pass.

Remote-player interpolation computes its shared exponential once per frame.
Turret glow computes shared intensity once per turret; orb illumination computes
its shared pulse once per frame. Turret velocity measurement reuses its vector.
All animation formulas, intensities and servo limits are retained.

The isolated 500,000-operation median benchmark measured radius comparisons at
35.7 -> 4.6 ms and servo calculations at 96.4 -> 24.0 ms (about 8x and 4x for
those operations). These are arithmetic microbenchmarks, not whole-game FPS gains.
Evidence: /tmp/battlecity-math-bench-clean.log.

A terrain-shader prototype compared squared Voronoi/shoreline distances before
taking square roots of the winning distances. It matched pixels exactly at both
1920x1080 and 1280x800, but paired GPU measurements did not establish a reliable
frame-time benefit. It was not retained; the validated terrain shader is unchanged.
Evidence: /tmp/battlecity-squared-noise-paired.log.

Validation: all 94 test files, workspace typechecks, unused-symbol checks and
production build pass. No graphics quality setting was reduced.

## 2026-10-02 — Restore compact construction and classic cargo controls

Construction now opens at the right-click position, with compact DX icon rows,
numbered choices and edge clamping that keeps it out of the inventory. The full
sandbox tree occupies about 298×414 pixels at 1280×800; a normal early city uses
one column. F4 / Ctrl+B opens construction, 0 selects demolition, Escape and an
outside click dismiss it. The command HUD is smaller too. Menu positioning runs
on opening, entry changes and resizing, without measuring layout every frame.

Restored D (G alias) / Shift+X / Shift+H cargo drops, B armed bomb, V bomb arming,
O orb, C cloak, H medkit, F1 help, F2 map and L leave. Arrow keys drive; W/A/S
remain movement aliases and D keeps its classic cargo meaning. U now retries
pickup every 800ms while held, so pressing it before reaching an icon works.
Live pickup resolves nearby friendly items instead of silently requesting a
remote factory's stock. Existing under-tank placement and blocked-drop behaviour
remain intact. Text inputs and browser shortcuts do not trigger cargo actions.

Bombs now have isolated red lamp materials and a shrinking, increasingly rapid
fuse warning. An optional remainingMs on hazard.spawn carries the actual server
fuse when joining mid-countdown. Bomb and destroyed-defense events produce blast
feedback, with a brief shockwave, fire, sparks, smoke and ground scorching using
bounded effects. Offline armed bombs now detonate, remove affected structures,
clear their collisions and stop destroyed turrets firing. Disarmed bombs remain
collectible. Server and demo share the unchanged five-second fuse, 25-damage
constant and footprint/radius predicate; gameplay remains tile based, regardless
of the rounded presentation. Live damage still comes exclusively from the server.

Validation: all 96 test files passed with four-file concurrency (one AI file
failed in the initial unrestricted run and passed alone and in the complete
rerun). Typechecking, unused-symbol checks and production build passed. Isolated
Intel GPU browser verified cursor/edge anchoring, numeric construction, F1/F2,
D mine drop, U pickup, B armed drop and five-second building destruction with
zero console/runtime errors. Approved terrain and rendering settings preserved.

Follow-up arming fix: restored clicking the already-selected bomb to toggle its
armed state. The inventory ARM/DISARM button now toggles that same state rather
than immediately deploying a separate bomb, and works in demo and live modes.
The next D/button drop carries armed=true; its fuse starts on deployment, not
while selecting/arming in inventory. Browser confirmed inventory stayed at three
bombs while arming, fell to two on drop, and the bomb then detonated. Added
regressions for repeated-click arming and live request armed flags. Final full
96-file run, typecheck and build passed; browser reported zero errors.

## 2026-10-02 — Cinematic bomb blasts and physical structure breakup

Replaced the enlarged impact puff with procedural HDR fire lobes, delayed rolling
smoke, an outward ground-dust front, hot sparks, fading scorch/embers and a layered
low-frequency detonation sound. Fire retains orange turbulent detail rather than
summing into a white bloom blob. Billboard fire/smoke and ground decals use a
separate camera layer excluded from GTAO's depth/normal pass. Their shaders compile
asynchronously during loading to avoid compiling on the first bomb.

Destroyed buildings/turrets now transfer to a visual collapse rig. The roof and
substantial asset meshes become spinning ballistic fragments that bounce, darken
and settle; the remaining structure buckles before disappearing into the smoke.
The reusable original model keeps its geometry/transforms intact. Visual remnants
lose live entity/selection IDs, use owned material clones, and never enter gameplay
collision or targeting. Live effects start from authoritative demolition/removal
notifications; reconnect/world clearing does not produce spurious blasts.
Research screens and machinery effects detach before their resources are released.

Resources are bounded to six collapse rigs, eighteen actual parts per rig and
256 cloud instances in two draws. Offscreen structure effects beyond 35 tiles are
skipped. Debris/clouds clean up within roughly 7.5 seconds; ground scorching fades
by eighteen seconds. Bomb damage, fuse, tile blast footprint and under-tank
placement are unchanged.

Validation: all 97 test files passed; final targeted destruction/live-world/bomb
regressions, typecheck, unused-symbol checks and production build passed. Timed
Intel GPU browser captures verified command-centre roof breakup, orb-factory
components, and an actual turret destruction (four firing turrets reduced to
three). Final combined building/turret blast showed sixteen actual fragments and
210 cloud instances; both returned to zero by 7.5 seconds. Seven captured phases,
including cleanup at nineteen seconds, reported no runtime/console errors.

### 2026-10-02 — Research progress and item-ready architecture

Research terminals now show a contained amber plasma hourglass, a segmented progress dial, and a countdown while their own city/type is researching. Confirmed completion reveals the rotating item hologram, an ITEM READY caption and a teal confirmation mark. Waiting for crew and queued laboratories have explicit subdued states. The chamber rim, containment specimen and reactor use matching amber/teal lighting, making the state visible at normal map scale without adding a floating HUD or enlarging the building footprint.

The renderer follows authoritative city research snapshots with a per-city deadline that continues outside the viewport; an expired countdown remains FINALISING until completion is received. A replacement snapshot updates the deadline without resetting observed progress, and reconnect/cleared state removes stale clocks. No gameplay, staffing, unlock or production rules changed. In the offline showroom only, the existing rocket research lab demonstrates a 14-second research / 10-second ready cycle while the mine lab stays ready and sandbox construction remains unlocked.

Existing distance/frustum culling and 10 Hz item-view capture are retained. Status text uploads only when its caption/countdown changes; shader clocks animate between captures. Each lab adds one small transparent rim ring and owns its status materials/textures for cleanup. Stable research diagnostics use the display system's cached signature.

Validation: focused research-state, population, mayor and live-world tests pass (four test files); monorepo typecheck and client production build pass. Isolated Intel GPU browser captures verified active, halfway, ready and restarted states with no console/runtime/shader errors; screenshots inspected at normal map scale and with the full research buildings in view.

## 2026-10-02 — Focused commits and preservation of production scores

Grouped the port into asset/tooling, authoritative server, AI opponents, Three.js
client and documentation commits. Generated builds, caches and local exploratory
images/scripts are excluded. The original master is an ancestor of the port, so
promotion can preserve all history by fast-forwarding.

Inspection of the former master found `battlecity_data:/app/server/data` and a
SQLite-equipped runtime image. The TypeScript deployment template had lost both.
Restored the original service/container/volume identity, explicitly configured
`/app/server/data/scores.db`, installed SQLite, retained external port 8021 and
updated its internal proxy target to 8121. Corrected the legacy database fallback
to the original root `server/data` path. Docker build context excludes local
runtime databases, worktrees, virtual environments and generated outputs.
A restart regression verifies existing score rows persist, new scores survive
adapter recreation and an unrelated legacy users table remains unchanged.

This is a Git promotion, not a production deployment. The checked GitHub workflow
only builds/publishes images for feature-branch pushes or tags; master pushes run
verification. The existing production volume/project identity must be confirmed
and backed up before a later container update. No live database or container was
modified. Public client serving and strict complexity/maintainability failures
remain release blockers and have not been waived.

Final promotion verification: an isolated archive of the committed tree installed
from the lockfile, typechecked, built the production client and passed all 98 test
files with four-file concurrency. The SQLite adapter's three detailed tests ran
without skips, including the existing-database restart case. Compose validation
confirmed the retained data mount and public 8021-to-internal-8121 mapping. Lint
and whitespace checks pass. The strict check passes tests/event inventory and
stops at its existing complexity limits; it is not a clean strict release gate.


October 2 CI repair validation: all 99 test files and the complete strict gate
pass, including unused-code checks. Lint and the production client build pass.
The parser has regression coverage for comments, GLSL text, optional types,
concise arrows, methods/accessors, nested callbacks, malformed input and functions
that exceed the unchanged limits. Reports now list every violating file, including
average-complexity failures that previously fell outside the top-20 list.

The GPU browser exercised researching/ready/restart states and the full armed
bomb, explosion, building-collapse, debris and cleanup sequence with zero runtime
errors. The relocated shader literals are byte-for-byte identical to the approved
version. No production container, deployment settings or database was changed.

October 2 movement follow-up: live Three.js driving now uses sequenced inputs,
shared collision/turn integration and acknowledgement/replay. This replaces
arrival-time simulation and local snapshot extrapolation for updated clients.
The debug HUD reports acknowledged/pending inputs and correction distances.
Roundtrip regression coverage checks low and high frame rates with WAN jitter,
curved driving, reverse, terrain collisions and clock skew.

October 2 live-browser burst repair: an approved capture from playbattlecity.com
showed 1083–1217 ms of valid inputs arriving together and overflowing the old
1000 ms authority credit cap. The authority now retains 3000 ms of credit; the
client bounds outstanding prediction at 2000 ms and retries missing prefixes.
A 70-command burst allowance retains the 35/s sustained rate limit. Tests replay
the sanitized captured turning inputs, 1400 ms transport stalls at 6–144 FPS,
and a five-second outage with dropped commands. The HUD exposes buffered and
clipped input time. Camera edge clamps prevent views beyond the finite map.

October 2 city-entry preparation: reproduced a 2083 ms first-view stall on the
public server in an isolated Chrome session using the Intel GPU. Joining now
precompiles the hydrated scene against the same linear render target used by the
composer, uploads shared city geometries/textures once, and primes research
screens. The loading transition waits for hydration and blocks movement while
GPU preparation runs. No terrain pre-render, quality changes or recurring GPU
work were added; steady frames perform no loading-UI DOM writes.

The optimized preparation took 1.5–1.6 seconds on that GPU. First-view stalls in
the sampled cities fell to 150–267 ms. Sequential public-server comparisons
measured 88.3 vs 88.8 ms and 124.1 vs 127.2 ms average steady frame time. These
short runs show comparable steady performance, not a guaranteed FPS increase.
Regression coverage checks shared resources, renderer-state restoration and the
hydration/loading transition. Strict verification, lint and the client build pass.

The dense-city follow-up registers live housing/support buildings with the same
spatial batches used by factories, including unregistering before destruction.
It also skips Three's point-light loop for fragments beyond a light's existing
finite range. Attenuation is already exactly zero there; the shortcut avoids
normalization and PBR work without changing light ranges, shadows or materials.
Infinite-range lights retain their original path. A GPU reference comparison
covered metallic/rough surfaces, finite and unbounded lights: all 1,048,576
8-bit colour channels matched exactly. The installed Three shader layout and
unchanged directional/spot/indirect portions have regression coverage.

On the same public AI cities and Intel GPU, the sampled steady rates rose from
11.3 to 17.6 FPS and 7.9 to 14.5 FPS with the same camera and quality settings.
These are measurements on this GPU, not guarantees for other hardware. First-use
shader preparation can take longer with an empty shader cache (12.3 seconds in
the first optimized run); that work occurs in the joining transition.


The next shader pass selects molten-floor or rocky-bank shading before computing
procedural noise; it retains all noise octaves, flow, geometry, material settings
and lighting. Texture fetches and relief derivatives stay outside divergent
control flow. Eight GPU reference views/times compared 8,388,608 colour channels:
one differed by one 8-bit rounding step, with no other differences. Three paired
GPU-timer measurements of the terrain fixture averaged 4.82 ms before and 3.79 ms
after (about 21% less terrain GPU time, not a whole-game FPS claim).

Factory steam, research arcs and orb motes now have conservative bounds covering
their complete shader animation, allowing distant effects to be frustum culled.
A trajectory/frustum regression checks the bounds; twelve GPU reference captures,
including screen edges, matched all 18,874,368 colour channels exactly. Point
lights and nearby particle counts remain unchanged. In two public-server AI-city
views at 1440x900 on Intel UHD, combined average frame times changed from
57.21/57.37 ms to 56.13/56.29 ms. Around 230 draw calls per frame were removed;
these are small incremental gains after the larger point-light optimization.

Centred views deeper inside the same cities measured 69.38 to 65.75 ms and
71.28 to 69.38 ms (14.4 to 15.2 FPS and 14.0 to 14.4 FPS respectively).
No graphics settings, animation rates or effect densities were reduced. These
short runs indicate roughly 3–6% additional FPS in those dense views; results
remain dependent on hardware and the live scene.
Strict verification passes all 502 tests and all structural/type checks; lint
and the production client build pass.


The following postprocessing cleanup keeps the 4x MSAA scene and every AO/bloom
setting. Compatible resolved HDR targets use a GPU texture copy instead of an
extra fullscreen shader draw; screen output, masks and format conversions retain
the previous draw path. Thirteen colour-only AO/bloom filter targets no longer
allocate depth attachments. The scene depth and AO normal/depth target remain.
At 1440x900 this removes 1,835,550 depth pixels (about 7 MB with 32-bit storage).

Separate GPU comparisons of the copy and depth-storage changes each matched all
7,326,724 half-float channel values exactly across four viewport sizes, including
odd dimensions and resizing. Four alternating GPU-timer pairs measured the
postprocessing fixture at 10.54 ms before / 10.39 ms after removing unused depth;
the copy fixture averaged 4.04 / 3.92 ms. These are small isolated savings.
Public AI-city comparisons at 1440x900 measured 70.39 / 70.19 ms on v1.0.8 and
69.80 / 69.57 ms with both changes. This is below 1% and too small to promise a
noticeable FPS improvement from short live-world runs. No quality setting or
animation rate changed. Shadow-trigonometry, light-facing and transform-cache
experiments were discarded after inconsistent city results.
Strict verification passes all 503 tests and all structural/type checks; lint
and the production client build pass.
