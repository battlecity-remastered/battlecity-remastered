import { readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";

// Repeat the original measurements without a second browser/GPU workload.
// Replace only renderer files and restore their exact bytes in finally.
// Run with no other edit/build/test process using this workspace.
const revision = process.argv[2];
const modes = process.argv[3] ? [process.argv[3]] : ["demo", "live"];
const label = process.argv[4] ?? "baseline-repeat";
if (!revision) throw new Error("Usage: node scripts/performance/run-baseline.mjs <original-git-revision>");
const paths = ["ThreeBattlefield", "battlefield-frame", "battlefield-setup", "building-batches", "cannon-effects", "inventory-panel", "multisample-scene-pass", "projectile-collider", "terrain", "terrain-shaders"];
const files = paths.map(name => `apps/client-ts/src/render/three/${name}.ts`);
const saved = new Map(), originals = new Map();
for (const file of files) {
    saved.set(file, await readFile(file));
    originals.set(file, execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" }));
}
const factoryPath = files[0];
let factory = originals.get(factoryPath);
const marker = "actions?: ReturnType<typeof createThreeGameActions>): Promise<ThreeBattlefield>";
if (!factory.includes(marker)) throw new Error("Original factory instrumentation marker changed");
factory = factory.replace(marker, "actions?: ReturnType<typeof createThreeGameActions>, inspect?: (resources: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; composer: EffectComposer; cannon: ReturnType<typeof createCannonEffects> }) => void): Promise<ThreeBattlefield>");
factory = factory.replace("    await cannon.prepareDestruction(renderer, camera);", "    inspect?.({ renderer, scene, camera, composer, cannon });\n    await cannon.prepareDestruction(renderer, camera);");
originals.set(factoryPath, factory);
const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/performance/run.mjs", ...args], { stdio: "inherit", env: { ...process.env, PERF_PREPARE: args[1] === "demo" ? "0" : "1" } });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Benchmark exit ${code}`)));
});
try {
    for (const [file, content] of originals) await writeFile(file, content);
    for (const mode of modes) for (const trial of [2, 3]) await run([`${label}-${trial}`, mode, "720"]);
    if (label === "baseline-combat") await run([label, "live", "720", "normal"]);
} finally {
    for (const [file, content] of saved) await writeFile(file, content);
}
