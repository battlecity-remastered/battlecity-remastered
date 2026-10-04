import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const label = process.argv[2] ?? "p2-final";
const output = `docs/performance/evidence/${label}-visual-checks`;
try { await access(output); throw new Error(`Choose a fresh evidence label: ${output} already exists`); }
catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(output, { recursive: true });
const results = [];
const run = async (name, command, args) => {
    let log = "";
    const code = await new Promise((resolve, reject) => {
        const child = spawn(command, args);
        child.stdout.on("data", data => { log += data; }); child.stderr.on("data", data => { log += data; });
        child.on("error", reject); child.on("exit", resolve);
    });
    await writeFile(`${output}/${name}.log`, log);
    results.push({ name, command: [command, ...args], exitCode: code });
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.at(-1)));
    if (code !== 0) throw new Error(`${name} failed; see ${output}/${name}.log`);
};
for (const [mode, captures] of [["demo", ["close", "normal", "wide", "lava"]], ["live", ["normal", "defenders", "pickup"]]]) {
    for (const capture of captures) {
        const suffix = `${mode}-${capture}`;
        await run(`capture-${suffix}`, "node", ["scripts/performance/run.mjs", label, mode, "720", capture]);
        await run(`compare-${suffix}`, ".venv/bin/python", ["scripts/performance/compare.py", `docs/performance/evidence/gameplay-final-${suffix}/frame.png`, `docs/performance/evidence/${label}-${suffix}/frame.png`, `docs/performance/evidence/${label}-${suffix}-comparison`]);
    }
}
