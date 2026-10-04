import { readdir, readFile, writeFile } from "node:fs/promises";

const root = "docs/performance/evidence";
const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
    return { samples: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), worst: sorted.at(-1) };
};
const inventory = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("p2-")) continue;
    let result;
    try { result = JSON.parse(await readFile(`${root}/${entry.name}/result.json`, "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (result.errors?.length) throw new Error(`Invalid trial: ${entry.name}`);
    inventory.push({ label: entry.name, fps: result.fps, frameMs: result.frameMs, cpuMs: result.cpuMs, gpuMs: result.gpuMs, calls: result.drawCalls, triangles: result.triangles, visible: result.visibleObjects, memory: result.memory, programs: result.programs, gc: result.gc, graph: result.graph, preparationMs: result.preparationMs, shaderEvents: result.shaderEvents?.length, shaderEventsAfterWarmup: result.shaderEvents?.filter(event => event.time >= result.warmup * 1000 / 60).length, arrivalCpuMs: result.rows?.find(row => row.frame === 180)?.cpuMs, configuration: result.configuration });
}
const pooled = async labels => {
    const runs = await Promise.all(labels.map(async label => JSON.parse(await readFile(`${root}/${label}/result.json`, "utf8"))));
    const rows = runs.flatMap(run => run.rows);
    const frameMs = stats(rows.map(row => row.intervalMs));
    return { labels, fps: 1000 / frameMs.mean, frameMs, cpuMs: stats(rows.map(row => row.cpuMs)), gpuMs: stats(runs.flatMap(run => run.gpuSamples.map(sample => sample.ms))), calls: stats(rows.map(row => row.calls)), triangles: stats(rows.map(row => row.triangles)), visible: stats(rows.map(row => row.objects)), programs: runs.map(run => run.programs), memory: runs.map(run => run.memory), gc: runs.map(run => run.gc), arrivalCpuMs: stats(runs.map(run => run.rows.find(row => row.frame === 180).cpuMs)) };
};
const before = await pooled([1, 2, 3].map(i => `p2-city-control-${i}-live`));
const after = await pooled([1, 2, 3].map(i => `p2-city-edge-cache-${i}-live`));
const comparison = (before, after) => ({ before, after, fpsChangePercent: (after.fps / before.fps - 1) * 100, arrivalCpuReductionPercent: (1 - after.arrivalCpuMs.mean / before.arrivalCpuMs.mean) * 100, worstFrameReductionPercent: (1 - after.frameMs.worst / before.frameMs.worst) * 100 });
const longBefore = await pooled([1, 2].map(i => `p2-long-control-${i}-live`));
const longAfter = await pooled([1, 2].map(i => `p2-long-final-${i}-live`));
const result = { ...comparison(before, after), long: comparison(longBefore, longAfter), inventory };
await writeFile("docs/performance/p2-summary.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ short: comparison(before, after), long: result.long }, null, 2));
