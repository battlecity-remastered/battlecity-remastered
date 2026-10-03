import { readFile, writeFile } from "node:fs/promises";

const directory = process.argv[2];
const profile = JSON.parse(await readFile(`${directory}/cpu.cpuprofile`, "utf8"));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const totals = new Map();
for (let index = 0; index < profile.samples.length; index++) {
    const node = nodes.get(profile.samples[index]);
    const frame = node.callFrame;
    const key = `${frame.functionName || "anonymous"} ${frame.url}:${frame.lineNumber + 1}`;
    totals.set(key, (totals.get(key) ?? 0) + profile.timeDeltas[index] / 1000);
}
const report = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([functionName, selfMs]) => ({ functionName, selfMs }));
await writeFile(`${directory}/hotspots.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.slice(0, 25), null, 2));
