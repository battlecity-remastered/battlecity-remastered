import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createMaterialBatches } from "../src/render/three/material-batches.js";
import { createBuildingMaterialPool } from "../src/render/three/material-pool.js";
import { createTerrainChunks } from "../src/render/three/terrain-chunks.js";
import { summarize } from "../src/performance/statistics.js";
import { freezeBuildingTransforms, thawBuildingTransforms } from "../src/render/three/building-transforms.js";
import { prepareRenderPasses } from "../src/render/three/prepare-render-passes.js";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { createClientState } from "../src/app/state.js";
import { createNetworkCombat } from "../src/render/three/network-combat.js";
import { createCombatReplay } from "../src/performance/replay-combat.js";

test("mixed geometry batches retain original vertex coordinates and articulated world transforms", () => {
    const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
    const roots = [new THREE.Group(), new THREE.Group()];
    roots[0]!.position.set(1, 0, 1); roots[1]!.position.set(3, 0, 2);
    const parts = [new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.SphereGeometry(.3), material)];
    roots.forEach((root, index) => { root.add(parts[index]!); scene.add(root); });
    const originals = parts.map(part => Array.from(part.geometry.attributes.position!.array));
    const batches = createMaterialBatches(scene, roots);
    const batch = scene.children.find(object => object instanceof THREE.BatchedMesh) as THREE.BatchedMesh;
    assert.ok(batch); assert.equal(batch.instanceCount, 2); assert.ok(batch.perObjectFrustumCulled);
    const matrix = new THREE.Matrix4();
    roots[1]!.rotation.y = .4; parts[1]!.position.y = .8; batches.update(); batch.getMatrixAt(1, matrix);
    matrix.elements.forEach((value, index) => assert.ok(Math.abs(value - parts[1]!.matrixWorld.elements[index]!) < 1e-6));
    parts.forEach((part, index) => assert.deepEqual(Array.from(part.geometry.attributes.position!.array), originals[index]));
    roots[0]!.visible = false; batches.update(); assert.equal(batch.getVisibleAt(0), false);
    roots[0]!.visible = true; batches.update(); assert.equal(batch.getVisibleAt(0), true);
    batches.unregister(roots[1]!); assert.equal(batches.count, 0); assert.equal(parts[0]!.visible, true);
    batches.dispose();
});

test("building materials share only matching static finishes and retain shader variants", () => {
    const pool = createBuildingMaterialPool(), root = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: .3 }); steel.name = "Brushed steel";
    const same = steel.clone(), housing = steel.clone(), shader = steel.clone(), glow = steel.clone();
    housing.roughness = .55; shader.customProgramCacheKey = () => "different-finish"; glow.name = "Research reactor glow";
    const sources = [steel, same, housing, shader, glow, glow.clone()];
    for (const material of sources) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    pool(root);
    const materials = root.children.map(object => (object as THREE.Mesh).material);
    assert.equal(materials[0], materials[1]); assert.notEqual(materials[0], materials[2]); assert.notEqual(materials[0], materials[3]); assert.notEqual(materials[4], materials[5]);
});

test("terrain culling preserves offscreen shadow casters and skips immutable matrix work", () => {
    const scene = new THREE.Scene(), chunks = createTerrainChunks(scene);
    const root = chunks.add(256, 256, 8), rock = new THREE.Mesh(new THREE.BoxGeometry()); root.add(rock);
    chunks.prepare(); const matrix = rock.matrixWorld.clone(); let updates = 0;
    const original = rock.updateMatrixWorld.bind(rock); rock.updateMatrixWorld = force => { updates++; original(force); };
    scene.matrixAutoUpdate = false; scene.updateMatrixWorld(); scene.updateMatrixWorld();
    assert.equal(updates, 0); assert.deepEqual(rock.matrixWorld.elements, matrix.elements);
    const camera = new THREE.PerspectiveCamera(60, 1, .1, 100); camera.position.set(4, 10, 20); camera.lookAt(4, 0, 4); camera.updateMatrixWorld();
    const nearby = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    camera.position.x = 200; camera.lookAt(200, 0, 4); camera.updateMatrixWorld();
    const distant = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    chunks.updateVisibility(distant, nearby); assert.equal(root.visible, true, "shadow-only contributors must remain visible");
    chunks.updateVisibility(distant, distant); assert.equal(root.visible, false);
    root.position.x = 1; root.updateMatrix(); scene.updateMatrixWorld(); assert.equal(rock.matrixWorld.elements[12], 1);
});

test("frame statistics include tail latency and use a stable nearest-rank percentile", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1), stats = summarize(values.reverse());
    assert.equal(stats.p50, 50); assert.equal(stats.p95, 95); assert.equal(stats.p99, 99); assert.equal(stats.worst, 100); assert.equal(stats.mean, 50.5);
});

test("static building transforms retain animation descendants and thaw for destruction", () => {
    const root = new THREE.Group(), assembly = new THREE.Group(), base = new THREE.Mesh(new THREE.BoxGeometry());
    const rotor = new THREE.Mesh(new THREE.BoxGeometry()); assembly.userData.animated = true; assembly.add(rotor); root.add(base, assembly);
    root.position.x = 3; freezeBuildingTransforms(root); assert.equal(root.matrixAutoUpdate, false); assert.equal(base.matrixAutoUpdate, false);
    assert.equal(assembly.matrixAutoUpdate, true); assert.equal(rotor.matrixAutoUpdate, true);
    const baseBefore = base.matrixWorld.clone(); assembly.rotation.y = .5; root.updateMatrixWorld();
    assert.deepEqual(base.matrixWorld.elements, baseBefore.elements); assert.ok(Math.abs(rotor.matrixWorld.elements[0]! - Math.cos(.5)) < 1e-10);
    thawBuildingTransforms(root); assert.equal(root.matrixAutoUpdate, true); root.position.y = -.6; root.updateMatrixWorld(); assert.equal(base.matrixWorld.elements[13], -.6);
});

test("failed shader preparation restores every original material and render target", async () => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); scene.add(mesh);
    const material = mesh.material, normal = new THREE.MeshNormalMaterial(), original = new THREE.WebGLRenderTarget(8, 8);
    let current: THREE.WebGLRenderTarget | null = original, rendered = false;
    const renderer = {
        getRenderTarget: () => current, setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { current = target; },
        compileAsync: async () => { assert.equal(mesh.material, normal); throw new Error("compile failed"); }, shadowMap: { needsUpdate: false }
    } as unknown as THREE.WebGLRenderer;
    const composer = { render: () => { rendered = true; } } as unknown as EffectComposer;
    await assert.rejects(prepareRenderPasses(renderer, scene, new THREE.Camera(), normal, composer), /compile failed/);
    assert.equal(mesh.material, material); assert.equal(current, original); assert.equal(rendered, false);
    original.dispose(); mesh.geometry.dispose(); material.dispose(); normal.dispose();
});

test("static mixed geometry keeps local shading coordinates, world positions and lifecycle visibility", () => {
    const scene = new THREE.Scene(), root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const parts = [new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.SphereGeometry(.3), material)];
    root.position.set(4, 0, 2); parts[1]!.position.set(0, .8, 1); root.add(...parts); scene.add(root); freezeBuildingTransforms(root);
    const batches = createMaterialBatches(scene, [root]);
    const batch = scene.children.find(object => object.name === "Spatial building batch") as THREE.Mesh;
    assert.ok(batch); assert.equal(batch instanceof THREE.BatchedMesh, false); assert.equal(batch instanceof THREE.InstancedMesh, false);
    const point = new THREE.Vector3(); let offset = 0;
    for (const source of parts) {
        const position = source.geometry.attributes.position!;
        for (let index = 0; index < position.count; index++) {
            point.fromBufferAttribute(position, index);
            const local = new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.buildingLocalPosition!, offset + index);
            assert.ok(point.distanceTo(local) < 1e-7);
            point.applyMatrix4(source.matrixWorld);
            const world = new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.position!, offset + index);
            assert.ok(point.distanceTo(world) < 1e-6);
        }
        offset += position.count;
    }
    root.visible = false; batches.update(); assert.equal(batch.geometry.boundingSphere!.radius, 0);
    root.visible = true; root.position.x = 6; root.updateMatrix(); batches.update();
    assert.ok(batch.geometry.boundingSphere!.center.x > 5);
    batches.unregister(root); assert.equal(parts[0]!.visible, true); assert.equal(batch.parent, null);
    batches.dispose(); for (const source of parts) source.geometry.dispose(); material.dispose();
});

test("live performance replay presents moving projectiles and impacts through production network events", () => {
    const state = createClientState(), combat = createNetworkCombat(); state.local.id = "pilot";
    state.local.x = 31 * 48; state.local.y = 29 * 48;
    const replay = createCombatReplay(state, (event, client) => combat.observe(event, client));
    const weapons = new Set<string>(); let activeFrames = 0, shots = 0, impacts = 0;
    for (let frame = 0; frame <= 180; frame++) {
        replay(frame); const visual = combat.frame(state);
        shots += visual.shots.length; impacts += visual.impacts.length;
        if (visual.shells.length) activeFrames++;
        for (const shell of visual.shells) weapons.add(shell.weapon);
        assert.ok(state.bullets.size <= 5);
    }
    assert.equal(activeFrames, 181); assert.equal(shots, 16); assert.ok(impacts >= 6, "close impacts are presented; distant laser impacts are culled");
    assert.deepEqual([...weapons].sort(), ["cannon", "laser", "rocket"]);
    assert.ok([...state.bullets.values()].some(bullet => bullet.x !== state.local.x + 24), "shell positions must advance, not just emit muzzle flashes");
});
