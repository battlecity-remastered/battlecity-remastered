# Three.js performance work: reproduction and evidence

Read [REPORT.md](REPORT.md) for conclusions and [EXPERIMENTS.md](EXPERIMENTS.md) for every attempted optimisation, diagnostic, rejection and measurement correction. [experiment-inventory.json](experiment-inventory.json) indexes raw artifacts; [summary.json](summary.json) contains pooled original/final statistics. The repository's `AGENTS.md` points here so future agents can find this work.

The subsequent cycle is recorded separately in [FOLLOWUP-2026-10-04.md](FOLLOWUP-2026-10-04.md). Use fresh labels for its visual suite (`node scripts/performance/run-followup-validation.mjs my-new-label`) and larger city-arrival diagnostic (`PERF_TRANSITION=city node scripts/performance/run.mjs my-new-label live 360`). Loading preparation now has a separate real-wall-clock `preparationMs` field; the older `cityPrepareMs` diagnostic uses the replay's frozen simulation clock and is not a valid loading timer.

## Workload

`apps/client-ts/performance.html` is a separate development entry. It calls the production Three.js battlefield, movement/collision, turret simulation, live-world interpolation and cannon effects. It does not replace the renderer with a synthetic scene.

Each fresh page uses seed 1729 and fixed 60 Hz simulation time. The local player patrols east/west through Balkh's populated industrial district, reversing every 120 simulation frames. The camera follows. The demo continuously fires and its four turrets track/fire. The corrected live-world replay includes six moving enemy tanks and a production bullet-fired event every twelve frames, cycling laser/rocket/cannon. It advances bullets with shared simulation motion and resolves them after 54 frames to present impacts; 3–5 shells remain active. It does not emulate server collision/AI decisions. Factory animation, research displays, steam, arcs, lava, embers, shadows and transparent effects remain active. This is a deterministic renderer/gameplay replay, not an end-to-end network/server benchmark. Simulation advances once per RAF; it need not run at real-time speed when rendering is below 60 FPS. Timing uses a separate real wall clock.

A run has 120 warm-up frames followed by 720 measured frames. Frame interval includes browser scheduling; CPU timing wraps movement and rendering; asynchronous disjoint GPU timers measure submitted frame work. Shader compile/link interception includes warm-up and measurement, but excludes explicit loading preparation. Chrome CPU profiles and native top-level MinorGC/MajorGC trace durations are saved. GPU timer intervals can include CPU submission gaps: CPU and GPU timings must not be added together.

Screenshots run 181 fixed simulation steps, then capture at close zoom 2, normal zoom 1, wide zoom .55, or the alternate lava-area starting position. Zoom changes are confined to this visual test. Scene-construction changes can shift the seeded random sequence consumed by particle effects/AO noise; compare images and diffs visually as well as numerically. Pixel-identical output is not claimed.

## Run

Requirements: installed workspace dependencies, Node with global WebSocket, Chrome with hardware WebGL2, and Pillow (`.venv/bin/python` in this workspace). Run the server and browser in separate terminals. Choose an unused debug port/profile and keep other GPU workloads closed.

```sh
npm run dev --workspace @battlecity/client-ts -- --port 8221 --strictPort
```

This investigation used an isolated browser, not a personal Chrome profile:

```sh
google-chrome --headless=new --no-sandbox \
  --user-data-dir=/tmp/battlecity-perf-chrome \
  --remote-debugging-port=9223 \
  --remote-allow-origins=http://localhost:9223 \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --use-gl=angle --use-angle=gl --enable-webgl --ignore-gpu-blocklist about:blank
```

The `--no-sandbox` flag was required in this managed execution environment. Normal local Chrome installations should retain their sandbox when possible. Verify the recorded `gpu` string: software rendering invalidates a hardware comparison.

```sh
node scripts/performance/run.mjs my-change demo 720
node scripts/performance/run.mjs my-change live 720
node scripts/performance/run.mjs my-change demo 720 normal
.venv/bin/python scripts/performance/compare.py \
  docs/performance/evidence/baseline-demo-normal/frame.png \
  docs/performance/evidence/my-change-demo-normal/frame.png \
  docs/performance/evidence/my-change-normal-comparison
node scripts/performance/profile.mjs docs/performance/evidence/my-change-demo
```

Defaults: `PERF_URL=http://127.0.0.1:8221`, `PERF_CDP=http://127.0.0.1:9223`, `PERF_PREPARE=1`. Set these environment variables to change the server/browser/loading path. Arguments are label, mode, frames, optional capture, optional diagnostic, optional GPU pass name. Capture names are `close`, `normal`, `wide`, `lava`. Do not reuse labels when preserving history.

Diagnostics alter only the benchmark page, not production settings:

```sh
node scripts/performance/run.mjs fill-probe demo 360 '' half-resolution
node scripts/performance/run.mjs shadow-probe demo 360 '' no-shadows
node scripts/performance/run.mjs ao-probe demo 360 '' no-ao
node scripts/performance/run.mjs bloom-probe demo 360 '' '' _UnrealBloomPass
node scripts/performance/run.mjs colour-probe demo 360 '' '' MultisampleScenePass
```

The Vite-native AO pass class is `_GTAOPass`; inspect `result.stages` if class names change with another bundler/version. A pass-selective timer measures that pass instead of the whole frame. Do not compare selective timer values with whole-frame values as if they measured the same scope.

## Recover the original renderer

Original git revision: `7c098d6a6c53dbffd1da00129feff927f3d51099`.

```sh
node scripts/performance/run-baseline.mjs 7c098d6a6c53dbffd1da00129feff927f3d51099
node scripts/performance/run-baseline.mjs 7c098d6a6c53dbffd1da00129feff927f3d51099 live baseline-combat
node scripts/performance/run-final.mjs combat live
```

The baseline controller temporarily restores the original renderer files and adds only the resource-inspection callback needed by the harness. It saves/restores exact current bytes in `finally`. Run it with no concurrent editing, build, tests, or other benchmark. It overwrites the selected labels; copy those first if retaining historical runs. The second command selects only live mode and the corrected combat labels/capture; the third runs corresponding finals and their visual comparison. Original demo preparation is disabled (matching its old boot path); original live preparation is enabled (matching real joined-world preparation). Earlier recorded live repeat labels used the old muzzle-effects-only fixture; current harness runs use corrected active projectiles.

Warm the browser/driver and run multiple original and changed trials on the same hardware. The first cold run was substantially slower even when the original source was later restored. Do not use the cold 15 FPS run as proof of an 80% implementation gain. Changing source during a run triggers Vite HMR and invalidates the measurement. Do not run checks/builds alongside benchmarks.

## Artifact contract

Each benchmark directory contains `result.json` with individual frame records, GPU samples, renderer counters, heap samples, scene graph/material counts, shader events, CPU stages, pass counters, errors, browser/device/configuration and GC durations. It also contains `cpu.cpuprofile` and `trace.json`; captures instead contain `frame.png`. Comparisons contain numeric `comparison.json` and 8x amplified `diff.png`.

New runs also save `source.json.gz` containing exact renderer, harness, demo and lockfile contents with SHA-256 hashes, plus a readable `source-manifest.json`. Earlier intermediate runs predate source archival: their full intermediate source snapshots were not retained. Their results and decisions are retained; do not pretend they contain complete patches. `evidence/measured-source/` preserves the renderer used for the main final trials; later check-confirmation runs archive the final source after a behavior-preserving complexity refactor. The original source is recoverable from the git revision above.

Image guard thresholds: mean absolute RGB channel error at most 0.5/255 and at most .5% of pixels with any channel error above 32. These are diagnostic thresholds, not perceptual proof. Inspect original/final captures and amplified differences even after a pass.

```sh
node scripts/performance/checks.mjs
node scripts/performance/report.mjs
```

The first command records focused/full tests, typecheck, production build, configured formatting/lint, benchmark script lint, strict event inventory, complexity, duplication, cycles, imports, maintainability, unused checks and movement simulation in `evidence/checks/`. Socket tests and the isolated browser need local process/network permissions in restricted environments. The second regenerates statistics/inventory and rejects runs with browser errors. `run-final.mjs` reproduces final trial/capture labels and also overwrites them; use fresh labels for subsequent experiments.
