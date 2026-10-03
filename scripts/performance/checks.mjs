import { mkdir, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const output = process.env.PERF_CHECK_OUTPUT ?? "docs/performance/evidence/checks";
await mkdir(output, { recursive: true });
const focused = (await readdir("apps/client-ts/test")).filter(file => file.startsWith("three-") && file.endsWith(".test.ts")).map(file => `apps/client-ts/test/${file}`);
const benchmarkScripts = (await readdir("scripts/performance")).filter(file => file.endsWith(".mjs")).map(file => `scripts/performance/${file}`);
const checks = [
    ["focused-tests", "node", ["--test", "--import", "tsx", ...focused]],
    ["typecheck", "npm", ["run", "typecheck"]],
    ["build", "npm", ["run", "build"]],
    ["full-tests", "npm", ["test"]],
    ["lint", "npm", ["run", "lint"]],
    ["benchmark-lint", "npx", ["eslint", ...benchmarkScripts]],
    ...["event-inventory", "complexity", "duplication", "cycles", "imports", "maintainability"].map(name => [name, "npm", ["run", `rewrite:${name}:strict`]]),
    ["unused", "npm", ["run", "rewrite:unused"]],
    ["movement-simulation", "npm", ["run", "rewrite:movement:sim"]]
];
const results = [];
for (const [name, command, args] of checks) {
    const start = Date.now();
    let log = "";
    const code = await new Promise((resolve, reject) => {
        const child = spawn(command, args);
        child.stdout.on("data", data => { log += data; }); child.stderr.on("data", data => { log += data; });
        child.on("error", reject); child.on("exit", resolve);
    });
    await writeFile(`${output}/${name}.log`, log);
    const result = { name, command: [command, ...args], exitCode: code, elapsedMs: Date.now() - start };
    results.push(result); console.log(JSON.stringify(result));
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1;
