import { mkdir, writeFile } from "node:fs/promises";
import { archiveSource } from "./source.mjs";
import { connect, evaluate } from "./cdp.mjs";
import { URLSearchParams } from "node:url";

const [label = "baseline", mode = "demo", framesArg = "720", capture = "", probe = "", gpuPass = ""] = process.argv.slice(2);
const url = process.env.PERF_URL ?? "http://127.0.0.1:8221";
const debugging = process.env.PERF_CDP ?? "http://127.0.0.1:9223";
const output = `docs/performance/evidence/${label}-${mode}${capture ? `-${capture}` : ""}`;
await mkdir(output, { recursive: true });
await archiveSource(output);
const tab = await (await fetch(`${debugging}/json/new?about:blank`, { method: "PUT" })).json();
const cdp = await connect(tab.webSocketDebuggerUrl);
const errors = [], trace = [];
cdp.on("Runtime.exceptionThrown", event => errors.push(event));
cdp.on("Runtime.consoleAPICalled", event => { if (event.type === "error") errors.push(event); });
cdp.on("Tracing.dataCollected", event => trace.push(...event.value));
await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const parameters = new URLSearchParams({ demo: mode === "demo" ? "1" : "0", prepare: process.env.PERF_PREPARE ?? "1" });
if (probe || process.env.PERF_PROBE) parameters.set("probe", probe || process.env.PERF_PROBE);
if (gpuPass || process.env.PERF_GPU_PASS) parameters.set("gpuPass", gpuPass || process.env.PERF_GPU_PASS);
if (process.env.PERF_TRANSITION) parameters.set("transition", process.env.PERF_TRANSITION);
await cdp.send("Page.navigate", { url: `${url}/performance.html?${parameters}` });
for (let i = 0; i < 180; i++) {
    if (await evaluate(cdp, "Boolean(window.benchmark?.ready)")) break;
    await new Promise(resolve => setTimeout(resolve, 500));
}
if (!await evaluate(cdp, "Boolean(window.benchmark?.ready)")) throw new Error(`Benchmark did not initialize: ${JSON.stringify(errors)}`);
let result;
if (capture) {
    await evaluate(cdp, `window.benchmark.capture(${JSON.stringify(capture)})`);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(`${output}/frame.png`, Buffer.from(shot.data, "base64"));
    result = await evaluate(cdp, "({viewport:[innerWidth,innerHeight],diagnostics:{...document.querySelector('canvas[data-renderer]').dataset}})");
    if (capture === "defenders") {
        result.labels = await evaluate(cdp, "[...document.querySelectorAll('.bc-tank-label')].filter(label=>!label.hidden&&label.textContent.includes('City Defender')).map(label=>({text:label.textContent,team:label.dataset.team,hidden:label.querySelector('.bc-tank-hull').hidden,display:getComputedStyle(label.querySelector('.bc-tank-hull')).display,fill:label.querySelector('.bc-tank-hull-fill').style.transform}))");
        if (result.labels.length !== 4 || result.labels.some(label => label.hidden || label.display === "none" || label.team !== "enemy")) throw new Error(`Defender health bars missing: ${JSON.stringify(result.labels)}`);
    }
} else {
    await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-v8.gc,blink.user_timing", options: "record-as-much-as-possible" });
    await cdp.send("Profiler.enable"); await cdp.send("Profiler.start");
    await evaluate(cdp, `window.benchmark.run(${Number(framesArg)})`, true);
    result = await evaluate(cdp, "window.benchmark.result");
    const profile = await cdp.send("Profiler.stop"); await writeFile(`${output}/cpu.cpuprofile`, JSON.stringify(profile.profile));
    const tracingComplete = new Promise(resolve => cdp.on("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end"); await tracingComplete;
    await writeFile(`${output}/trace.json`, JSON.stringify({ traceEvents: trace }));
    const gc = trace.filter(event => event.ph === "X" && (event.name === "MinorGC" || event.name === "MajorGC"));
    result.gc = { events: gc.length, totalMs: gc.reduce((sum, event) => sum + (event.dur ?? 0) / 1000, 0), worstMs: Math.max(0, ...gc.map(event => (event.dur ?? 0) / 1000)) };
}
result.browser = (await (await fetch(`${debugging}/json/version`)).json()).Browser;
result.errors = errors;
result.configuration = { url, parameters: Object.fromEntries(parameters), simulationHz: 60, seed: 1729 };
result.geometry = await evaluate(cdp, "window.benchmark.inspect()");
await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, fps: result.fps, frameMs: result.frameMs, cpuMs: result.cpuMs, gpuMs: result.gpuMs, calls: result.drawCalls?.mean, triangles: result.triangles?.mean, programs: result.programs, gpu: result.gpu, shadersDuringRun: result.shaderEvents?.length, gc: result.gc, errors: errors.length }, null, 2));
cdp.close(); await fetch(`${debugging}/json/close/${tab.id}`);
if (errors.length) process.exitCode = 1;
