import { spawn } from "node:child_process";

const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`)));
});
for (const [mode, view] of [["demo", "close"], ["demo", "normal"], ["demo", "wide"], ["demo", "lava"], ["live", "normal"], ["live", "defenders"], ["live", "pickup"]]) {
    await run(process.execPath, ["scripts/performance/run.mjs", "gameplay-final", mode, "240", view]);
    if (view === "defenders" || view === "pickup") continue;
    await run(".venv/bin/python", ["scripts/performance/compare.py", `docs/performance/evidence/final-${mode}-${view}/frame.png`, `docs/performance/evidence/gameplay-final-${mode}-${view}/frame.png`, `docs/gameplay/evidence/final-${mode}-${view}-comparison`]);
}
