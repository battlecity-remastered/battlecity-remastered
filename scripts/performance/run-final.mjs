import { spawn } from "node:child_process";

const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`)));
});
const trials = process.argv[2] === "combat" ? ["combat-2", "combat-3"] : process.argv[2] === "confirmation" ? ["check"] : [2, 3];
const modes = process.argv[3] ? [process.argv[3]] : ["demo", "live"];
for (const mode of modes) {
    for (const trial of trials) await run(process.execPath, ["scripts/performance/run.mjs", `final-${trial}`, mode, "720"]);
    for (const view of mode === "demo" ? ["close", "normal", "wide", "lava"] : ["normal"]) {
        await run(process.execPath, ["scripts/performance/run.mjs", "final", mode, "720", view]);
        const original = process.argv[2] === "combat" ? `baseline-combat-${mode}-${view}` : `baseline-${mode}-${view}`;
        await run(".venv/bin/python", ["scripts/performance/compare.py", `docs/performance/evidence/${original}/frame.png`, `docs/performance/evidence/final-${mode}-${view}/frame.png`, `docs/performance/evidence/final-${mode}-${view}-comparison`]);
    }
}
