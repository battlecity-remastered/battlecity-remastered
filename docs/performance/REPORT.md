# Three.js performance report — 2026-10-03

Representative moving gameplay now renders about **5.0% faster in the demo replay** and **3.7% faster in the corrected live combat replay**, with about **19% fewer draw calls**. P50, p95 and p99 improve in both workloads. The first gameplay frames perform no shader compile/link calls after loading preparation. Five fixed-state image comparisons pass; antialiasing, resolution, shadows, material detail, AO, bloom and gameplay rates are preserved.

[EXPERIMENTS.md](EXPERIMENTS.md) records all attempts, rejected changes and invalid measurements. [README.md](README.md) gives reproduction commands and metric limitations. Raw results, frame samples, profiles, traces and images are in [evidence/](evidence/); the complete machine-readable comparison is [summary.json](summary.json), with an [artifact inventory](experiment-inventory.json). `AGENTS.md` links these records for future agents.

## Original and final benchmarks

Hardware: Chrome 148.0.7778.178, ANGLE Intel UHD Graphics CML GT2, Mesa OpenGL 4.6, Three.js 0.185.1. Separate development entry on Vite, isolated headless Chrome, 1280×720 framebuffer at DPR 1. Production DPR remains capped at 1.75 as before; neither test uses a production resolution reduction. Scene target remains linear half-float HDR with 4× MSAA. One 2048×2048 PCF shadow-casting directional light remains.

Workload: production movement/collision and rendering through the populated Balkh district; local player and follow camera move ~357 legacy pixels horizontally each patrol cycle, turrets track/fire, factory/research animation, lava/embers, steam, arcs and transparent effects run. The corrected live replay also moves six enemy tanks and feeds production bullet-fired/resolved presentation with laser, rocket and cannon projectiles. It consistently renders 3–5 active projectiles. This is a deterministic gameplay/rendering replay, not a network latency benchmark. No idle-camera timings are used.

Each run excludes 120 warm-up frames from steady statistics, then measures 720 frames at a fixed 60 Hz simulation step using independent real wall-clock timing. Original demo is two warmed runs; final demo is four (including confirmation after a complexity-only helper extraction). Corrected live uses two original and two final runs. Percentiles below are calculated from pooled individual frame samples, not averaged per-run percentiles. All these runs have zero browser errors.

| Metric | Original demo | Final demo | Original live combat | Final live combat |
|---|---:|---:|---:|---:|
| Measured frames | 1,440 | 2,880 | 1,440 | 1,440 |
| FPS | 27.32 | 28.68 | 26.03 | 26.99 |
| Mean frame, ms | 36.60 | 34.86 | 38.42 | 37.05 |
| p50 frame, ms | 35.80 | 34.20 | 37.50 | 36.10 |
| p95 frame, ms | 43.20 | 41.20 | 46.10 | 45.50 |
| p99 frame, ms | 49.50 | 47.30 | 57.80 | 55.30 |
| Worst frame, ms | 66.90 | 72.40 | 89.70 | 69.60 |
| CPU mean, ms | 15.60 | 13.80 | 16.06 | 14.60 |
| GPU timer mean, ms | 31.55 | 29.80 | 33.37 | 31.79 |
| Draw calls/frame, mean | 868.83 | 702.75 | 845.22 | 679.15 |
| Rendered triangles/frame, mean | 1,250,077 | 1,120,510 | 1,408,416 | 1,278,849 |
| Visible world meshes, mean¹ | 274.61 | 225.02 | 264.91 | 215.32 |
| `renderer.info.memory.geometries` | 201 | 253 | 223 | 253 |
| `renderer.info.memory.textures` | 55 | 81 | 60 | 81 |
| `renderer.info.programs` | 75 | 97 | 81 | 97 |
| Compile/link calls in initial gameplay warm-up, per run | 189 | 0 | 72 | 0 |
| Compile/link calls in measured steady window | 0 | 0 | 0 | 0 |

¹ Unique object IDs in the last world render list, the AO normal/depth pass. This measures visible world meshes; that pass deliberately excludes line/point effects and the overlay inventory scene. It is not the count of all scene nodes or every colour-pass particle. Raw `geometry` listings are diagnostic allocated-buffer listings and can overcount native BatchedMesh capacity; rendered triangle totals above use the renderer's actual draw counters.

FPS improves **4.98% demo / 3.70% live**. CPU mean improves **11.53% / 9.09%**, GPU mean **5.55% / 4.73%**. Draw calls improve **19.11% / 19.65%**, triangles **10.36% / 9.20%**. Demo p50/p95/p99 improve **4.47% / 4.63% / 4.44%**; live **3.73% / 1.30% / 4.33%**. The live p95 gain is small and should not be overstated. These are empirical results on one GPU, not guarantees for other devices.

The first cold original demo was 15.22 FPS (p50 56.7, p95 128.6, p99 160.7, worst 190.8 ms). The first unprepared live run was 15.70 FPS. Restoring the original source after the browser/driver warmed recovered ~27/26 FPS. Therefore the apparent early ~80% gain was confounded and is explicitly rejected. The real baseline is the warmed original table above. Older live repeat/final files used moving enemies and muzzle effects but no active network shells; they remain recorded for history and are excluded from the corrected live comparison.

Individual demo final trials range 28.52–28.83 FPS; corrected live finals 26.92–27.07. The final complexity-refactor confirmation demo measures 28.69 FPS with unchanged counters and screenshots. Occasional outliers remain: worst demo frame is worse in the larger final sample set, despite improved p95/p99. Do not claim all steady hitches are eliminated.

## Bottlenecks discovered

**GPU shading/fill rate dominates this device.** A diagnostic quarter-pixel-count framebuffer (half each dimension) reaches 57.61 FPS and 13.13 ms GPU versus full-resolution ~27.6 FPS and 31.05 ms before the last optimisations. It was never applied to production. CPU submission and GPU work overlap; GPU timer intervals can include submission gaps and are not pure fragment-only time.

Selective timers measured scene colour plus shadows at 21.64 ms, native AO including geometry/denoising at 7.52 ms, and bloom at 1.43 ms in intermediate warmed runs. A final-architecture diagnostic replacing AO with a colour copy gives 34.10 FPS / 24.23 ms GPU. Disabling shadows for diagnosis gives 30.31 FPS / 27.56 ms GPU. This distinguishes the main expensive components; neither AO nor shadows were disabled in the retained game.

**CPU work is concentrated in render-list/scene traversal, shader parameter/cache lookup, draw submission and transform work.** Saved CPU profiles show `projectObject`, `traverse`, `getParameters`, `renderBufferDirect`, `setProgram`, matrix transforms and binding/state changes. Movement costs roughly .4–.5 ms, so changing simulation frequency was not justified. Native mixed-geometry batching lowered calls but increased per-vertex matrix-texture work and CPU traversal/sorting; static merging was a better compromise than blindly maximising multi-draw.

**First-use shader/target work occurred after gameplay began.** Original demo performs 189 compile/link calls during the first ~20 simulation frames; prepared original live combat performs 72 in its initial gameplay warm-up. Explicit full-pipeline preparation moves this work into loading and records zero compile/link calls from the first gameplay frame in the final replays. Shader count increases because dormant variants are prepared. The steady originals already record zero after warm-up, so this improves initial responsiveness rather than explaining every steady frame gain.

**Allocation spikes still exist.** Specific projectile/particle/collider allocations were removed, but native top-level GC collections do not decline overall. Original warmed demo has 16 collections/run; final 21–22, with total pauses ~16–18 ms/run and worst ~1.6–2.0 ms. Corrected live originals have 17 collections (~15 ms/run, worst 2.53–2.66 ms); finals have 22–23 (~17–19 ms, worst 1.47–2.64 ms). No global GC-elimination claim is justified. Early nested-GC span totals were corrected separately in the artifact history.

## Implemented changes

- Split lava into 8-tile render chunks without changing shoreline tessellation, displacement, triangles or normals. Preserve 32-tile earth underlays and the original 8-tile instanced rocks.
- Group immutable terrain by 32-tile cells, skip unchanged matrix recursion and cull only outside both camera and shadow frusta. Offscreen shadow contributors remain.
- Reuse identical static building finishes after building-specific adjustments. Preserve independent animated/status/cloak/team materials and shader hooks.
- Use a shared spatial batch lifecycle: identical geometry instanced; static mixed geometry merged with original local shading coordinates in an extra attribute; articulated mixed geometry uses native multi-draw with individual culling. Keep transparent, skinned and morph meshes separate. Rebuild/update only changed batches and retain collision/animation source ownership.
- Freeze genuinely static building local matrices, retain animation descendants, and restore normal updates for destruction/release.
- Resolve the original 4× MSAA scene directly into the composer scene buffer, avoiding a separate full-frame HDR copy while preserving AO/bloom/output buffer order and resize behavior.
- Specialise AO's orthographic reconstruction and equivalent fixed-exponent arithmetic; preserve sampling, normals/depth, denoising, radius and intensity.
- Prepare shaders and the full render pipeline before gameplay; warm inventory specimens and allocate shell instance colours before preparation.
- Reuse hot-path particle/projectile/collider scratch storage and cache stable diagnostic strings. Movement, collisions, AI frequencies, effect density and gameplay behavior are unchanged.

Architectural trade-offs: final demo total scene nodes increase 3,887→6,245 and meshes 3,405→5,507 because smaller terrain cells and hidden source objects remain for lifecycle/collision/animation. Static local matrices increase 2,116→5,585. Static material count falls 252→198 despite added variant ownership; visible submitted meshes fall. GPU memory *counts* increase as the table shows; they are not byte estimates. Static merging increases submitted triangles relative to aggressive per-object multi-draw (~28k/frame), but lowers its CPU cost and matrix-texture overhead. The fallback without native multi-draw retains instancing; hardware-specific fallback performance was covered structurally, not benchmarked on a second GPU.

## Visual regression

Fixed cameras/states cover close building/tank/rock detail; normal combat view; wide industrial district with substantial lava; alternate lava-area scenery; and six enemy tanks with real projectile presentation. Tests preserve original resolution, 4× MSAA, shadow size/filter, geometry detail, terrain shader, material finish, bloom, heat distortion and transparent effects. No LOD or adaptive resolution was introduced.

| Capture | Mean absolute RGB error /255 | Pixels with a channel error >32 |
|---|---:|---:|
| Demo close | .1563 | .00467% |
| Demo normal | .0960 | .00206% |
| Demo wide | .0763 | .00109% |
| Demo lava area | .0141 | .00033% |
| Live normal, corrected combat | .1026 | .00315% |

All pass the .5/255 mean and .5% high-difference-pixel guards. Original/final images and amplified diffs were inspected: differences are small noise/effect/rounding changes, not lost geometry, softened resolution or removed shadows. No perceptible visual regression was found in these views; broader hardware/camera-state coverage is still valuable. An initial housing material-sharing bug failed this comparison and was fixed before acceptance.

## Rejected work

Detailed results and reasons are in [EXPERIMENTS.md](EXPERIMENTS.md). Reverted terrain FBM/cellular arithmetic restructuring, global front-to-back sorting, a fused AO copy/blend subclass, shared PCF rotation arithmetic and cubic denoiser weights because they did not show reliable benefits. The first AO specialization run was invalid due to a shader error and excluded. Instancing-only was slightly faster in one trial but returned almost all original draw calls; its result informed the cheaper static hybrid rather than being hidden. Bloom tap pairing was investigated but not implemented because bloom is a small budget share and naive downsampled-mip pairing changes the filter.

Diagnostic reductions in resolution, shadows and AO were never promoted to game changes. Static-shadow caching, LOD and lower simulation rates were considered and left untouched because no validated implementation preserved moving shadows, imperceptible geometry transitions or gameplay behavior.

## Remaining limits and next opportunities

The retained work improves measured frame times and initial readiness, while full-resolution shading/AO still limits this integrated GPU to ~27–29 FPS in these demanding views. Occasional browser/driver/CPU/GC outliers remain. The benchmark does not measure input-to-photon latency, server latency, every late-game deployment/destruction state, or performance on mobile/discrete GPUs.

Next three highest-value opportunities:

1. **Isolate terrain versus building fragment cost inside the colour pass.** Profile individual material groups on this GPU before considering a cache of repeated static material calculations. Preserve procedural wear, shoreline boundaries and animated lava normals; any texture/cache proposal needs close/moving image comparisons and bandwidth/memory accounting. The fill-rate probe proves shading is worth investigating but does not prove a particular terrain cache will help.
2. **Reduce traversal of retained source hierarchies.** Profiles still spend substantial CPU in scene/render-list traversal and shader parameter lookup; final node count is larger. Separate rendering proxies from animation/collision sources more deliberately, preserve light/effect ownership, and consider static batching independently of multi-draw availability. Validate lifecycle, culling and shadows before accepting a new render graph.
3. **Extend preparation and replay coverage to new factories, cloak, deployment, destruction and larger multiplayer populations.** Current replay proves zero first-use compiles for its states, not every possible later material/light variant. Measure loading cost and GPU memory, preload only relevant variants, and test on at least one mobile/discrete GPU before adopting hardware-specific batch choices.

## Verification and durable handoff

All configured checks pass. The verification records are [evidence/checks/results.json](evidence/checks/results.json), with exact commands, exit codes, elapsed times and full logs: **112 focused renderer tests and 552 full-suite tests**, all-workspace typecheck, production build, configured formatting/lint, benchmark lint, strict event inventory, complexity, duplication, cycles, imports, maintainability, unused checks and movement simulation. Focused tests exercise topology/normals, original local/world shader coordinates, batch visibility/unregistration, articulated transforms, static culling/shadow contributors, destruction thawing, buffer swapping/resize, shader-preparation failure cleanup and live replay projectiles/impacts.

The prior failed strict-complexity run and intermediate check failures remain recorded; a helper extraction resolves complexity without changing behavior. Exact final and corrected original renderer/harness/lockfile snapshots are archived with SHA-256 manifests. Earlier intermediate full source trees were not archived; their measurements, concepts and rejection reasons are recorded explicitly rather than inventing missing patches. The owner subsequently requested committing and deploying this work; release verification is recorded separately from these benchmark results.
