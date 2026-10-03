import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CopyShader } from "three/addons/shaders/CopyShader.js";
import { createClientState } from "../app/state.js";
import { initializeDemoMayor } from "../app/demo-mayor.js";
import { createDemoMovement } from "../app/demo-movement.js";
import { loadMapData } from "../world/map-loader.js";
import { createThreeBattlefield } from "../render/three/ThreeBattlefield.js";
import { createIndustrialDemoLayout, createDefenseDemoLayout } from "../render/three/industrial-demo.js";
import { summarize } from "./statistics.js";
import { createCombatReplay } from "./replay-combat.js";

// This separate entry drives production movement, collision, AI and rendering.
// A fixed simulation clock/seed makes workload and screenshots repeatable;
// wall-clock frame intervals, CPU and GPU timers remain independent of it.
const parameters = new URLSearchParams(location.search);
const live = parameters.get("demo") !== "1";
const realNow = performance.now.bind(performance);
let simulationMs = 0, seed = 1729;
Object.defineProperty(performance, "now", { value: () => simulationMs });
Date.now = () => 1800000000000 + simulationMs;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const shaderEvents: Array<{ time: number; kind: string; cpuMs: number; cacheKey?: string | undefined }> = [];
let inspectedRenderer: THREE.WebGLRenderer | undefined;
const originalProgramLog = WebGL2RenderingContext.prototype.getProgramInfoLog;
WebGL2RenderingContext.prototype.getProgramInfoLog = function (program: WebGLProgram): string | null {
    const start = realNow(), result = originalProgramLog.call(this, program), elapsed = realNow() - start;
    if (elapsed > 10) shaderEvents.push({ time: simulationMs, kind: "blockingProgramLog", cpuMs: elapsed, cacheKey: inspectedRenderer?.info.programs?.find(candidate => candidate.program === program)?.cacheKey });
    return result;
};
for (const method of ["compileShader", "linkProgram"] as const) {
    const original = WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method] = function (this: WebGL2RenderingContext, resource: WebGLShader & WebGLProgram): void {
        const start = realNow(); original.call(this, resource);
        shaderEvents.push({ time: simulationMs, kind: method, cpuMs: realNow() - start });
    };
}
const state = createClientState(), map = await loadMapData();
const buildings = createIndustrialDemoLayout(map), defenses = createDefenseDemoLayout(map);
initializeDemoMayor(state, buildings); state.ui.audioEnabled = false;
state.world.blockingTiles = map.blockingTiles; state.world.buildBlockingTiles = map.buildBlockingTiles; state.world.mapSize = map.map.length;
state.local.x = 31 * 48; state.local.y = 29 * 48; state.local.direction = 8;
state.inventory.set(1, 99); state.inventory.set(12, 99);
state.factoryStock.set(0, new Map(Array.from({ length: 13 }, (_, type) => [type, 10])));
if (live) for (let i = 0; i < 6; i++) state.remotePlayers.set(`enemy-${i}`, { id: `enemy-${i}`, city: 1, x: (28 + i * 2) * 48, y: 29 * 48, direction: 8, health: 40, maxHealth: 40 });
let resources!: Parameters<NonNullable<Parameters<typeof createThreeBattlefield>[4]>>[0];
const battlefield = await createThreeBattlefield(map, live ? [] : buildings, defenses, undefined, value => { resources = value; });
document.getElementById("app")!.prepend(battlefield.canvas);
const { renderer, scene, camera, composer } = resources;
inspectedRenderer = renderer;
const replayCombat = createCombatReplay(state, battlefield.observeServerEvent);
const probe = parameters.get("probe");
if (probe === "half-resolution") { renderer.setPixelRatio(.5); composer.setPixelRatio(.5); battlefield.resize(); }
if (probe === "no-ao") composer.passes[1] = new ShaderPass(CopyShader);
if (probe === "no-bloom") composer.passes[2]!.enabled = false;
if (probe === "no-shadows") renderer.shadowMap.enabled = false;
if (probe === "opaque-front") renderer.setOpaqueSort((a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.z - b.z || a.material.id - b.material.id || a.id - b.id);
const movement = createDemoMovement(state);
const stageSamples: Record<string, number[]> = {};
let measured = false;
const captureStage = (name: string, elapsed: number): void => { if (measured) (stageSamples[name] ??= []).push(elapsed); };
const originalRender = renderer.render.bind(renderer);
const passStats: Record<string, { calls: number; triangles: number; cpuMs: number }> = {};
let framePassStats: typeof passStats = {};
renderer.render = (view, viewCamera) => {
    const start = realNow(), calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
    originalRender(view, viewCamera);
    const name = view === scene ? (scene.overrideMaterial ? "aoGeometry" : "colorGeometry") : "auxiliary";
    const stats = framePassStats[name] ??= { calls: 0, triangles: 0, cpuMs: 0 };
    stats.calls += renderer.info.render.calls - calls; stats.triangles += renderer.info.render.triangles - triangles; stats.cpuMs += realNow() - start;
};
for (const pass of composer.passes) {
    const render = pass.render.bind(pass);
    pass.render = (...args) => {
        const query = measured && timer && parameters.get("gpuPass") === pass.constructor.name ? gl.createQuery() : null;
        if (query) gl.beginQuery(timer!.TIME_ELAPSED_EXT, query);
        const start = realNow(); render(...args); captureStage(pass.constructor.name, realNow() - start);
        if (query) { gl.endQuery(timer!.TIME_ELAPSED_EXT); pendingQueries.push({ query, frame: currentFrame }); }
    };
}
const matrixUpdate = scene.updateMatrixWorld.bind(scene);
scene.updateMatrixWorld = (...args) => { const start = realNow(); matrixUpdate(...args); captureStage("worldMatrices", realNow() - start); };
const shadowRender = renderer.shadowMap.render.bind(renderer.shadowMap);
renderer.shadowMap.render = (...args) => {
    const start = realNow(), calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
    shadowRender(...args);
    const stats = framePassStats.shadow ??= { calls: 0, triangles: 0, cpuMs: 0 };
    stats.calls += renderer.info.render.calls - calls; stats.triangles += renderer.info.render.triangles - triangles; stats.cpuMs += realNow() - start;
};
const gl = renderer.getContext() as WebGL2RenderingContext;
const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
const pendingQueries: Array<{ query: WebGLQuery; frame: number }> = [];
const gpuSamples: Array<{ frame: number; ms: number }> = [];
const pollQueries = (): void => {
    while (pendingQueries.length && gl.getQueryParameter(pendingQueries[0]!.query, gl.QUERY_RESULT_AVAILABLE)) {
        const item = pendingQueries.shift()!;
        if (!gl.getParameter(timer!.GPU_DISJOINT_EXT)) gpuSamples.push({ frame: item.frame, ms: gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6 });
        gl.deleteQuery(item.query);
    }
};
const updateInputs = (frame: number): void => {
    if (live && parameters.get("transition") === "ai" && frame === 180) {
        for (let i = 6; i < 10; i++) state.remotePlayers.set(`enemy-${i}`, { id: `enemy-${i}`, city: 2, botRole: "shooter", x: (28 + i) * 48, y: 29 * 48, direction: 8, health: 20, maxHealth: 20 });
        state.buildings.set("arrival-orb-factory", { id: "arrival-orb-factory", ownerId: "ai", cityId: 2, type: 105, tileX: 41, tileY: 35, health: 120, maxHealth: 120, population: 50 });
        state.factoryStock.set(2, new Map([[5, 1]]));
    }
    if (live && parameters.get("transition") === "overflow" && frame === 180) {
        for (let city = 10; city < 20; city++) {
            state.buildings.set(`overflow-${city}`, { id: `overflow-${city}`, ownerId: "ai", cityId: city, type: 105, tileX: 41 + city, tileY: 35, health: 120, maxHealth: 120, population: 50 });
            state.factoryStock.set(city, new Map([[5, 1]]));
        }
    }
    state.controls.moveForward = true;
    state.local.direction = Math.floor(frame / 120) % 2 === 0 ? 8 : 24;
    state.controls.shoot = !live;
    state.ui.selectedInventoryItemType = frame % 360 < 180 ? 1 : 12;
    for (const [id, player] of state.remotePlayers) {
        const i = Number(id.split("-")[1]); player.x = (28 + i * 1.6 + Math.sin(frame / 60 + i) * 1.2) * 48;
        player.y = (29 + Math.sin(frame / 100 + i) * .3) * 48; player.direction = frame % 240 < 120 ? 8 : 24;
    }
    if (live) replayCombat(frame);
};
const step = (frame: number): number => {
    currentFrame = frame;
    simulationMs = (frame + 1) * 1000 / 60; updateInputs(frame);
    const start = realNow(); movement.advanceFrame(simulationMs); captureStage("movement", realNow() - start);
    framePassStats = {}; const renderStart = realNow(); battlefield.render(state); captureStage("battlefield", realNow() - renderStart);
    return realNow() - start;
};
type Row = { frame: number; intervalMs: number; cpuMs: number; calls: number; triangles: number; objects: number; geometries: number; textures: number; programs: number; heap: number; x: number; y: number; projectiles: number };
const rows: Row[] = [];
let currentFrame = 0;
const objectCount = (): number => {
    const list = renderer.renderLists.get(scene, 0);
    return new Set([...list.opaque, ...list.transmissive, ...list.transparent].map(item => item.object.id)).size;
};
const sample = (frame: number, intervalMs: number, cpuMs: number): void => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    rows.push({ frame, intervalMs, cpuMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, objects: objectCount(), ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0, heap: memory?.usedJSHeapSize ?? 0, x: state.local.x, y: state.local.y, projectiles: Number(battlefield.canvas.dataset.projectiles) });
    for (const [name, stats] of Object.entries(framePassStats)) {
        const total = passStats[name] ??= { calls: 0, triangles: 0, cpuMs: 0 };
        total.calls += stats.calls; total.triangles += stats.triangles; total.cpuMs += stats.cpuMs;
    }
};
const graphStats = (): Record<string, number> => {
    const stats = { nodes: 0, meshes: 0, materials: 0, shadowCasters: 0, shadowLights: 0, staticMatrices: 0 };
    const materials = new Set<THREE.Material>();
    scene.traverse(object => {
        stats.nodes++; if (!object.matrixAutoUpdate) stats.staticMatrices++;
        if (object instanceof THREE.Mesh) { stats.meshes++; if (object.castShadow) stats.shadowCasters++; for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); }
        if (object instanceof THREE.Light && object.castShadow) stats.shadowLights++;
    });
    stats.materials = materials.size; return stats;
};
const bench = {
    ready: true, done: false, error: "", result: {} as Record<string, unknown>,
    async run(frames = 720, warmup = 120): Promise<void> {
        rows.length = 0;
        const shaderStart = shaderEvents.length, start = realNow();
        for (let frame = 0; frame < frames + warmup; frame++) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const now = realNow(); measured = frame >= warmup;
            if (timer) pollQueries();
            const query = timer && measured && !parameters.get("gpuPass") ? gl.createQuery() : null;
            if (query) gl.beginQuery(timer!.TIME_ELAPSED_EXT, query);
            const cpuMs = step(frame);
            if (query) { gl.endQuery(timer!.TIME_ELAPSED_EXT); pendingQueries.push({ query, frame }); }
            if (measured) sample(frame, now - previous, cpuMs);
            previous = now;
        }
        measured = false;
        for (let i = 0; i < 10 && pendingQueries.length; i++) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); pollQueries(); }
        const frameTimes = summarize(rows.map(row => row.intervalMs));
        const framebuffer = new THREE.Vector2(); renderer.getDrawingBufferSize(framebuffer);
        this.result = { version: 1, mode: live ? "live" : "demo", frames, warmup, elapsedMs: realNow() - start, fps: 1000 / frameTimes.mean, frameMs: frameTimes, cpuMs: summarize(rows.map(row => row.cpuMs)), gpuMs: timer ? summarize(gpuSamples.map(row => row.ms)) : null, gpu: battlefield.canvas.dataset.gpuRenderer, viewport: [innerWidth, innerHeight], pixelRatio: renderer.getPixelRatio(), framebuffer: framebuffer.toArray(), drawCalls: summarize(rows.map(row => row.calls)), triangles: summarize(rows.map(row => row.triangles)), visibleObjects: summarize(rows.map(row => row.objects)), memory: renderer.info.memory, programs: renderer.info.programs?.length, stages: Object.fromEntries(Object.entries(stageSamples).map(([name, values]) => [name, summarize(values)])), passesPerFrame: Object.fromEntries(Object.entries(passStats).map(([name, stats]) => [name, { calls: stats.calls / frames, triangles: stats.triangles / frames, cpuMs: stats.cpuMs / frames }])), graph: graphStats(), shaderEvents: shaderEvents.slice(shaderStart), rows, gpuSamples, diagnostics: { ...battlefield.canvas.dataset } };
        this.done = true;
    },
    capture(name: string): void {
        camera.zoom = name === "close" ? 2 : name === "wide" ? .55 : 1; camera.updateProjectionMatrix();
        if (name === "lava") { state.local.x = 47 * 48; state.local.y = 30 * 48; }
        for (let frame = 0; frame <= 180; frame++) step(frame);
        if (name === "defenders") {
            state.remotePlayers.clear(); state.controls.shoot = false;
            state.local.x = 31 * 48; state.local.y = 29 * 48;
            for (const [index, botRole] of (["mayor", "shooter", "bomb_defuser", "miner"] as const).entries()) state.remotePlayers.set(`defender-${index}`, { id: `defender-${index}`, city: 17, botRole, callsign: "City Defender", x: (28 + index * 2) * 48, y: 27 * 48, direction: 16, health: 20 - index * 5, maxHealth: 20 });
            battlefield.render(state);
        }
        if (name === "pickup") {
            const factory = [...state.buildings.values()].find(building => building.type === 105)!;
            state.remotePlayers.clear(); state.controls.shoot = false;
            for (const city of state.lobby.assignments) if (city.mayorId === state.local.id) city.mayorId = "other-mayor";
            state.local.x = (factory.tileX + 1) * 48; state.local.y = (factory.tileY + 2) * 48;
            camera.zoom = 2; camera.updateProjectionMatrix(); battlefield.render(state);
        }
    },
    async prepare(): Promise<void> { await battlefield.prepare(state); },
    inspect(): unknown {
        const list = renderer.renderLists.get(scene, 0);
        return [...list.opaque, ...list.transparent].map(item => ({ name: item.object.name, material: item.material.name, type: item.object.type, triangles: (item.geometry?.index?.count ?? item.geometry?.attributes.position!.count ?? 0) / 3 * (item.object instanceof THREE.InstancedMesh ? item.object.count : 1), surface: item.object.userData.terrainSurface })).sort((a, b) => b.triangles - a.triangles);
    }
};
let previous = realNow();
if (parameters.get("prepare") !== "0") await battlefield.prepare(state);
(window as Window & { benchmark?: typeof bench }).benchmark = bench;
