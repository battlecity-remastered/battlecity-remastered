import { readFile, readdir, writeFile } from "node:fs/promises";

const root = "docs/performance/evidence";
const statistics = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
    return { samples: sorted.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), worst: sorted.at(-1) };
};
const combine = async names => {
    const runs = await Promise.all(names.map(async name => JSON.parse(await readFile(`${root}/${name}/result.json`, "utf8"))));
    if (runs.some(run => run.errors.length)) throw new Error("Cannot summarize a run with browser errors");
    const rows = runs.flatMap(run => run.rows), frameMs = statistics(rows.map(row => row.intervalMs));
    return {
        runs: names, fps: 1000 / frameMs.mean, frameMs, cpuMs: statistics(rows.map(row => row.cpuMs)), gpuMs: statistics(runs.flatMap(run => run.gpuSamples.map(sample => sample.ms))),
        drawCalls: statistics(rows.map(row => row.calls)), triangles: statistics(rows.map(row => row.triangles)), visibleObjects: statistics(rows.map(row => row.objects)),
        memory: runs[0].memory, programs: runs[0].programs, graph: runs[0].graph,
        shaderEventsPerRun: runs.map(run => run.shaderEvents.length), gcPerRun: runs.map(run => run.gc),
        workload: { x: [Math.min(...rows.map(row => row.x)), Math.max(...rows.map(row => row.x))], y: [Math.min(...rows.map(row => row.y)), Math.max(...rows.map(row => row.y))], projectiles: [Math.min(...rows.map(row => row.projectiles)), Math.max(...rows.map(row => row.projectiles))] },
        individual: runs.map((run, index) => ({ name: names[index], fps: run.fps, frameMs: run.frameMs }))
    };
};
const summary = {};
for (const mode of ["demo", "live"]) {
    const before = await combine([2, 3].map(trial => `${mode === "demo" ? "baseline-repeat" : "baseline-combat"}-${trial}-${mode}`));
    const after = await combine((mode === "demo" ? [1, 2, 3, "check"] : ["combat-2", "combat-3"]).map(trial => `final-${trial}-${mode}`));
    summary[mode] = { before, after, improvementPercent: { fps: (after.fps / before.fps - 1) * 100, p50: (1 - after.frameMs.p50 / before.frameMs.p50) * 100, p95: (1 - after.frameMs.p95 / before.frameMs.p95) * 100, p99: (1 - after.frameMs.p99 / before.frameMs.p99) * 100, cpu: (1 - after.cpuMs.mean / before.cpuMs.mean) * 100, gpu: (1 - after.gpuMs.mean / before.gpuMs.mean) * 100, calls: (1 - after.drawCalls.mean / before.drawCalls.mean) * 100, triangles: (1 - after.triangles.mean / before.triangles.mean) * 100 } };
}
await writeFile("docs/performance/summary.json", JSON.stringify(summary, null, 2));
const inventory = [];
for (const directory of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory())) {
    const files = await readdir(`${root}/${directory.name}`);
    if (!files.includes("result.json")) continue;
    const result = JSON.parse(await readFile(`${root}/${directory.name}/result.json`, "utf8"));
    inventory.push({ name: directory.name, capture: files.includes("frame.png"), fps: result.fps, frameMs: result.frameMs, cpuMeanMs: result.cpuMs?.mean, gpuMeanMs: result.gpuMs?.mean, calls: result.drawCalls?.mean, triangles: result.triangles?.mean, programs: result.programs, shaderEvents: result.shaderEvents?.length, gc: result.gc, errors: result.errors?.length, configuration: result.configuration, artifacts: files });
}
await writeFile("docs/performance/experiment-inventory.json", JSON.stringify(inventory, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([mode, result]) => [mode, result.improvementPercent])), null, 2));
