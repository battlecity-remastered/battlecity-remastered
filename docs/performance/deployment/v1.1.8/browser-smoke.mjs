import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { connect, evaluate } from "../../../../scripts/performance/cdp.mjs";

const output = new URL(".", import.meta.url).pathname;
await mkdir(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--remote-debugging-port=9231", "--user-data-dir=/tmp/battlecity-v118-deploy-chrome", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--use-gl=angle", "--use-angle=gl", "--enable-webgl", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore" });
const errors = [], badResponses = [], states = [];
let cdp, snapshots = 0;
const wait = async (expression, label) => {
    for (let attempt = 0; attempt < 120; attempt++) {
        const value = await evaluate(cdp, expression);
        if (value) return value;
        await sleep(500);
    }
    throw new Error(label);
};
const key = async (key, code, windowsVirtualKeyCode, duration = 0) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
    await sleep(duration);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
};
const diagnostics = () => evaluate(cdp, `({ ...document.querySelector('canvas[data-renderer="three-battlefield"]').dataset })`);
const capture = async name => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(`${output}/${name}.png`, Buffer.from(data, "base64"));
};
try {
    let tabs;
    for (let attempt = 0; attempt < 40; attempt++) {
        try { tabs = await (await fetch("http://127.0.0.1:9231/json")).json(); break; } catch { await sleep(250); }
    }
    assert.ok(tabs, "Isolated Chrome did not start");
    cdp = await connect(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
    cdp.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails));
    cdp.on("Runtime.consoleAPICalled", event => { if (event.type === "error") errors.push(event.args.map(arg => arg.value ?? arg.description)); });
    cdp.on("Network.responseReceived", event => { if (event.response.status >= 400) badResponses.push({ url: event.response.url, status: event.response.status }); });
    cdp.on("Network.webSocketFrameReceived", event => { if (event.response.payloadData.includes('"players.snapshot"')) snapshots++; });
    await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('battlecity.identity.v2', JSON.stringify({userId:'local:deployment-performance-v118',callsign:'Release check',provider:'local'}));` });
    await cdp.send("Page.navigate", { url: "https://playbattlecity.com/" });
    await wait(`document.querySelector('[data-ui="lobby"]')?.textContent.includes('Balkh')`, "Public lobby did not synchronize");
    console.log("Public lobby synchronized");
    const button = await evaluate(cdp, `(() => { const buttons = [...document.querySelectorAll('[data-ui="lobby"] button')]; const button = buttons.find(b => b.textContent === 'Join Recruit' && !b.disabled) ?? buttons.find(b => b.textContent === 'Join Mayor' && !b.disabled); if (!button) return null; const label = button.textContent; button.click(); return label; })()`);
    assert.ok(button, "No joinable city");
    await wait(`document.querySelector('[data-ui="game-command"]')?.hidden === false`, "Joined world did not become ready");
    await sleep(1500); await key("F3", "F3", 114);
    await wait(`document.querySelector('canvas[data-renderer="three-battlefield"]')?.dataset.tankPosition`, "Live diagnostics absent");
    const before = await diagnostics();
    await evaluate(cdp, "document.activeElement?.blur(); true");
    await key("ArrowDown", "ArrowDown", 40, 1100); await sleep(700);
    const after = await diagnostics();
    const start = JSON.parse(before.tankPosition), end = JSON.parse(after.tankPosition);
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    assert.ok(distance > 1, "Live tank did not move");
    assert.ok(snapshots > 2, "Authoritative snapshots absent");
    assert.ok(Number(after.drawCalls) > 0 && Number(after.triangles) > 0, "Live scene did not render");
    states.push({ mode: "live", join: button, movementPixels: distance, receivedSnapshots: snapshots, diagnostics: after });
    await capture("public-live");
    await evaluate(cdp, `document.querySelector('[data-action="leave"]').click(); true`);
    await wait(`document.querySelector('[data-ui="lobby"]')?.getBoundingClientRect().height > 0`, "Leaving did not restore lobby");
    console.log("Live join, movement, rendering and leave passed");
    await cdp.send("Page.navigate", { url: "https://playbattlecity.com/?demo=1" });
    await wait(`document.querySelector('[data-ui="game-command"]')?.hidden === false`, "Demo did not become ready");
    await sleep(1500); await key("F3", "F3", 114);
    await wait(`document.querySelector('canvas[data-renderer="three-battlefield"]')?.dataset.tankPosition`, "Demo diagnostics absent");
    await evaluate(cdp, "document.activeElement?.blur(); true");
    await key("ArrowRight", "ArrowRight", 39, 1000); await key(" ", "Space", 32, 1500); await sleep(300);
    const demo = await diagnostics();
    assert.ok(Number(demo.drawCalls) > 0 && Number(demo.triangles) > 0, "Demo did not render");
    assert.ok(Number(demo.shotsFired) > 0, "Demo gunfire absent");
    states.push({ mode: "demo", diagnostics: demo });
    await capture("public-demo");
    assert.deepEqual(errors, [], "Runtime/shader/console errors occurred");
    assert.deepEqual(badResponses, [], "HTTP asset failures occurred");
    console.log("Demo movement, effects and rendering passed; no browser errors");
    await writeFile(`${output}/browser-smoke.json`, JSON.stringify({ status: "passed", timestamp: new Date().toISOString(), states, errors, badResponses }, null, 2));
} catch (error) {
    await writeFile(`${output}/browser-smoke.json`, JSON.stringify({ status: "failed", error: error.message, states, errors, badResponses }, null, 2));
    throw error;
} finally {
    if (cdp) { await cdp.send("Page.navigate", { url: "about:blank" }).catch(() => {}); cdp.close(); }
    browser.kill();
}
