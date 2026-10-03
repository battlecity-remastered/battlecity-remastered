# Gameplay parity and AI-arrival performance follow-up — 2026-10-03

This follows the shipped v1.1.6 performance work. Read [the original report](../performance/REPORT.md) and [experiment log](../performance/EXPERIMENTS.md) first. The changes here address the subsequent player reports. The unrelated YAAF mobile layout request was explicitly withdrawn and is excluded.

## Player-facing changes and evidence

| Report | Finding and resulting behaviour | Focused evidence / trade-off |
|---|---|---|
| Rockets stopped, lasers moving | Confirmed in `v0.0.79:client/src/input/input-keyboard.js`, lines 201–249. Stationary rockets take priority; lasers fire while moving and provide stationary fallback without rockets. Moving with rockets alone cannot fire. Inventory selection controls cargo, not primary fire. Both client action paths share this rule; the online inventory label reflects it. | `three-game-actions.test.ts` covers forward/reverse/opposed inputs and inventory combinations. Server ownership, cooldown and ammunition rules remain authoritative. Offline demo retains its selected-weapon showcase. |
| Shooting across lava | Classic bullet collision blocks rocks/building map values, not lava. The new runtime had reused tank movement terrain for projectiles. Added a separate projectile terrain set and used it for bot line of sight too. Movement and construction still block lava. | `map-services.test.ts`, `gameplay-regressions.test.ts`; existing swept/high-speed terrain tests pass. Default test/runtime initialization shares terrain sets unless projectile terrain is explicitly supplied. |
| Turret friendly fire | Same-city players were already protected. Defense shots could damage their own empty buildings. Tagged authoritative turret bullets and prevented same-city structure damage; friendly structures still stop shots. | Three building-hit cases test friendly turret, enemy turret and ordinary player fire. This protection is requested behaviour; do not claim the old client had an equivalent friendly-building guard. |
| Rogue frequency and proximity | The runtime continually replaced rogues at its five-second population check and used a fixed radius unrelated to city extent. Kept the existing classic 18-building eligibility threshold and restored the 32-building second-rogue threshold, one/two-rogue wave sizes, city-extent + four-tile engagement buffer + sixteen-tile spawn buffer, and 60–120-second delay between defeated waves. Bounds and terrain validation still apply. | `rogue-waves.test.ts` and existing runtime rogue/mine tests. Intentional balance choice: no replacement while any member of a wave survives. This is not an exact recreation of every classic rogue rule; four-minute lifetime and bombing parity are outside this correction. |
| Factory destroyed but DFGs remain | Destruction already purged the city's associated output, hazards, defenses and held stock. AI miners then recreated mine/DFG hazards without a surviving factory. Miners now require a live matching factory and only lay its available product. | `ai-opponents.test.ts` destroys the DFG factory, verifies purge/no DFG recreation, then destroys the mine factory and verifies no further hazards. Both factories retain the previous 60/40 choice. |
| Items draw over tank | Reproduced with the orb output beneath a recruit tank. Give ground pickups their own material ownership and an earlier transparent render layer; tanks follow while retaining normal shading and depth testing. | `three-ground-pickups.test.ts`, before/after orb screenshots. Desired overlap change is visible; no texture, geometry, glow, shadow or resolution downgrade. Owned pickup materials are disposed on permanent removal, not reparenting. |
| AI aim compared with Pixi | Classic client rogues apply four discrete spread outcomes (−2/−1/0/+1 heading steps) and 0–800 ms shot-delay jitter. The new server had omitted both. Restored them only for rogues; classic defenders also aim directly. | `bot-aim-parity.test.ts` verifies all spread outcomes, matching muzzle/bullet trajectories and cooldowns, plus unchanged defender defaults. Classic server rogues differed from the classic client; this intentionally follows the player-facing Pixi behaviour. |
| AI arrival freezes | Profile proves point-light count changes trigger material/shadow/AO shader permutations and synchronous driver waits. Reserve 16 zero-contribution light slots, conservatively cull finite non-shadow light volumes completely outside the camera frustum, and prepare city geometry/textures/template materials during loading. | Moving arrival measurements below. Real contributing lights are never capped or discarded. Capacity can grow; rare growth remains a limitation. |
| Defenders cannot die / missing health bars | **Not reproduced, not claimed fixed.** All four roles have 20 HP, lose 5 per laser hit, emit hull snapshots, die and are removed after four hits. Actual renderer capture shows all four enemy bars at 100/75/50/25%. Snapshot reconciliation preserves health/maxHealth/role. | `defender-combat.test.ts`, `gameplay-final-live-defenders/result.json` and screenshot. This verifies the exercised path, not the player's exact incident. A city/location/replay is still needed. Hospital bays can heal tanks; no unsupported balance change was made. Lava blocking could prevent shots reaching defenders, but is not proven to explain the incident. |

Classic source files used for parity are retained under `evidence/classic-*.js`, extracted from tag `v0.0.79`. They are evidence, not active runtime code.

## Repeatable benchmark

Same isolated Chrome 148, Intel UHD / Mesa ANGLE OpenGL, 1280×720 framebuffer, DPR 1, seed 1729, 60-Hz deterministic simulation. The live replay drives the tank and camera, moves enemies, keeps real laser/rocket/flare projectiles and effects active and shows industrial scenery. At simulation frame 180 it adds four defenders and an orb factory/output. Each normal run has 120 warmup and 240 measured frames; the overflow experiment has 360 measured frames and adds ten orb factories. Tests/builds were not run concurrently with timed captures. Every trial retains exact renderer source archives, manifests, CPU profile, trace, per-frame/GPU samples and configuration.

The archived control renderer is the exact `ai-arrival-before-live/source.json.gz` renderer, served separately on port 8224 with the same replay. Warm controls run in the same browser after the original cold run. These are short deterministic arrival tests, not long multiplayer soak tests.

| Run | FPS | p50 ms | p95 ms | p99 ms | Worst ms | Programs | Shader instrumentation events |
|---|---:|---:|---:|---:|---:|---:|---:|
| Original cold arrival | 8.44 | 38.4 | 51.1 | 100.5 | 17,020.6 | 182 | 195 |
| Warm original control 1 | 22.90 | 38.1 | 44.1 | 60.1 | 1,282.4 | 182 | 253 |
| Warm original control 2 | 22.58 | 38.1 | 54.0 | 68.1 | 1,148.7 | 182 | 253 |
| Final with culling 1 | 23.21 | 40.1 | 57.7 | 65.4 | 109.7 | 118 | 4 |
| Final with culling 2 | 24.34 | 39.8 | 52.0 | 63.7 | 102.0 | 118 | 4 |

**Typical arrival hitch is about 91% smaller than the warmed original, and 99.4% smaller than the original cold driver stall.** Mean run FPS is 22.74→23.78 (+4.6%) in these matched warmed controls. Do not claim the cold 8.44→23–24 FPS difference as a steady performance gain. Nor do these runs establish improved p95/p99: p95 is variable and p50 is roughly 5% worse. The fixed light capacity has some steady shader overhead in exchange for eliminating the observed arrival permutation change. This is an explicit responsiveness trade-off, with no graphical quality reduction.

| Other metrics, warm original → final | Result |
|---|---|
| Mean draw calls (all render passes) | 893.30 → 893.30 |
| Mean rendered triangles (all passes) | 1,619,850.26 → 1,619,850.26 |
| Mean visible render objects | 246.33 → 246.33 |
| `renderer.info.memory` geometries / textures | 259 / 86 → 224 / 86 |
| CPU p50 (two runs) | 19.4–21.5 ms → 20.1–21.0 ms |
| CPU worst (two runs) | 1,145.7–1,277.3 ms → 99.9–107.6 ms |
| GPU p50 (two runs) | 33.10–33.30 ms → 34.85–34.96 ms |
| GPU worst (two runs) | 521–570 ms → 54–55 ms |
| GC events / worst pause | 28 / 1.74–2.25 ms → 26 / 1.78–2.02 ms |

GPU and CPU times overlap and must not be summed. `renderer.info.memory` counts resources, not byte-accurate VRAM. Shader events include compile/link/log probes, not a unique program count. GC was not the cause of the original multi-second freeze. The original CPU profile records 16.42 seconds in `getProgramInfoLog` and 2.57 seconds in `getShaderInfoLog`.

## Experiments and rejected approaches

Retain failed captures: they explain why simple asynchronous prewarming was insufficient.

| Evidence label(s) | Attempt / result / disposition |
|---|---|
| `ai-arrival-warmup-live` | Invalid initial camera initialization/TDZ failure; not a timing result. |
| `ai-arrival-warmup-2-live`, `*-shadow-warmup-live` | Asynchronous color preparation alone still encountered native shadow/AO variants and first-use template materials. Multi-second hitches remained; rejected as sufficient fix. |
| `ai-arrival-all-pass-warmup-live` | Invalid initial ReferenceError/HMR recovery, one browser error. Exclude from comparisons. |
| `ai-arrival-all-pass-warmup-2-live`, `*-shadow-fog-match-live` | Matched native shadow depth packing/fog and prepared normal pass. This fixed key mismatches but did not stabilize live material light counts. |
| `ai-arrival-program-diagnostic-live` | Added blocking program-log cache-key diagnostics to identify the remaining permutations. |
| `ai-arrival-retained-light-state-live` | Restored renderer light state after asynchronous compilation, including before native shadows. Useful correction; 360 measured frames, not directly comparable with 240-frame arrival trials. |
| `ai-arrival-template-materials-live` | Prepared real template materials and cloned native mesh types for geometry uploads. Still insufficient alone; warmed arrival hitches remained around 1.2–1.8 seconds. |
| `ai-arrival-stable-capacity-live` | Initial accepted capacity approach: 130.6-ms worst, 118 programs, 4 shader events; unchanged calls/triangles. Later refactored material ownership and postprocessing helpers. |
| `ai-arrival-final-{1,2}-live` | Verified/refactored capacity before culling: 102.8/104.2-ms worst, 24.41/24.31 FPS. Retain as intermediate evidence, not the final culling version. |
| `ai-arrival-overflow-live` | Ten offscreen orb factories exceed global capacity; **22.5-second freeze despite `compileAsync`**, CPU profile dominated by `getProgramParameter`. Rejected as acceptable fallback behaviour for this case. |
| `ai-arrival-overflow-culled-live` | Frustum/influence-volume culling removes lights that cannot contribute: **190-ms worst**, 24.62 FPS, p95 46.9, p99 56.5; same 813.81 calls / 1,632,618.31 triangles as uncullled overflow. 120 programs / 11 shader instrumentation events. Camera-turn unit test verifies culled finite lights return. |
| Rocket/turret pickup capture fixtures | Weak original overlap cases; retained, then replaced by the meaningful orb/recruit fixture that visibly reproduced the player's complaint. |
| `evidence/checks/` | First code-check failures: separate default terrain sets, incomplete coordinate-less old rogue fixtures, complexity/function layout. Corrected contracts/fixtures and refactored helpers; limits were not weakened. |
| `evidence/checks-final/` | Sandbox verification produced an empty failing full-test log. Not authoritative full-test evidence; unrestricted verification was rerun successfully. |

No shadow, AA, AO, bloom, material, texture, geometry, LOD or rendering-resolution quality reductions were attempted in this follow-up. Simulation tick rates were not reduced.

## Visual regression and final checks

`run-gameplay-validation.mjs` captures close/normal/wide/lava demo views, normal live gameplay, enemy defenders and tank-on-orb overlap. All five general comparisons against deployed v1.1.6 captures pass the existing guard. Images were inspected for buildings, shadows, rocks, lava, transparent effects and tank detail. The intentional tank-over-orb change also passes the diagnostic guard, with 0.214% of pixels exceeding channel delta 32. This small whole-image fraction does not conceal the intended visible local change.

Authoritative final checks are `evidence/checks-release/results.json`: **all 14 checks pass, including 580 tests**, typecheck, client build, configured ESLint/style checks, benchmark lint, strict event inventory, complexity, duplication, cycles, import extensions, maintainability, unused code and movement simulation. New validation script has a separate passing lint log. `evidence/focused-final.log` records 53 focused gameplay/loading tests; `evidence/bot-aim-parity.log` records the five additional aiming cases; `evidence/visual-validation.log` records browser assertions and comparisons. Earlier failed logs remain intentionally preserved. The repository has no separate configured formatter command; its configured style checks were run.

Reproduction (owned local browser on port 9223, Vite on 8221):

```sh
PERF_CHECK_OUTPUT=docs/gameplay/evidence/checks-repeat node scripts/performance/checks.mjs
PERF_TRANSITION=ai node scripts/performance/run.mjs followup-arrival live 240
PERF_TRANSITION=overflow node scripts/performance/run.mjs followup-overflow live 360
node scripts/performance/run-gameplay-validation.mjs
```

Follow [the benchmark runbook](../performance/README.md) for the isolated hardware Chrome flags. Reusing an evidence label overwrites that trial; choose new labels for new experiments. Replay archives contain renderer/replay source, not the entire server; the release commit preserves all gameplay changes.

## Player aiming investigation

The user subsequently suggested aim precision might explain the defender complaint. Human muzzle offsets are still the classic sprite offsets and headings still use 32 steps. The live server hits a 24-pixel-radius circle around each tank centre; classic Pixi used a 32×32 inset rectangle with a four-pixel bullet. This is not evidence that the new target was globally made smaller.

`evidence/aiming-diagnostic.mjs` exercises the actual live-world presentation at 24/60/120 FPS, 20-Hz received positions and 220 px/s movement. Existing exponential smoothing leaves mean displayed/latest-received position offsets of 11.55/13.94/14.81 pixels (max 13.55/17.30/19.44). This is an observed presentation discrepancy, not a measured internet latency or proof of the reported misses. Camera elevation also displaces elevated model surfaces relative to their floor footprint. No player aim assist, hitbox enlargement or abrupt removal of smoothing was applied. Resolve this with a real shot/authoritative-hit overlay and replay before changing combat. Rogue accuracy was independently confirmed against old client source and corrected as described above.

## Remaining bottlenecks and next three opportunities

1. **Rare contributing-light capacity growth:** the offscreen factory case is fixed, but genuinely more than 16 simultaneously contributing lights can still enter the asynchronous growth fallback. The native driver demonstrated a blocking completion query; do not describe `compileAsync` as universally hitch-free. Investigate preparing larger *needed* capacities during loading or stable per-chunk light lists without dropping any visible illumination. Test wide-city camera transitions and other GPUs before claiming this eliminated.
2. **Steady GPU shading/pass cost:** final GPU medians remain about 35 ms on this integrated GPU. Profile a smaller reserve against worst-case real visible lights, then independent AO/shadow/material pass costs. Preserve the screenshot baseline and lighting; avoid globally reducing DPR or effect quality. The original performance report lists further image-preserving terrain/material work.
3. **Real multiplayer incident coverage:** run a seeded full-runtime AI city spawn/defender combat journey with network snapshots and actual weapon cooldowns, on the player's hardware where possible. Resolve the unreplicated health-bar/invulnerability report and soak-test spawn/destruction/recreation over several waves. Synthetic arrival isolates rendering stalls; it does not measure every server city-generation/pathfinding cost.

See [benchmark-summary.json](evidence/benchmark-summary.json) for the complete compact measurements and the `docs/performance/evidence/ai-arrival-*` directories for raw evidence. Deployment details are recorded separately after publication.
