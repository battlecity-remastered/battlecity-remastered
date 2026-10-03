import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLightVariantWarmup } from "../src/render/three/light-variant-warmup.js";
import { createShaderWarmupScene } from "../src/render/three/shader-warmup-scene.js";

test("AI light arrival prepares variants asynchronously while retaining the old light count", async () => {
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(), normal = new THREE.MeshNormalMaterial();
    const initial = new THREE.PointLight(), arrival = new THREE.PointLight(); scene.add(initial);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); mesh.castShadow = true; scene.add(mesh);
    let target: THREE.WebGLRenderTarget | null = null;
    const completions: Array<() => void> = [];
    const renderer = { compile: () => new Set(), getRenderTarget: () => target, setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { target = value; }, compileAsync: () => new Promise<void>(resolve => completions.push(resolve)) } as unknown as THREE.WebGLRenderer;
    const warmup = createLightVariantWarmup(renderer, scene, camera, normal);
    warmup.update(); assert.equal(completions.length, 0);
    scene.add(arrival); warmup.update();
    assert.equal(completions.length, 0, "normal arrivals use reserved capacity");
    assert.equal(arrival.visible, true);
    const extra = Array.from({length: 15}, () => new THREE.PointLight()); scene.add(...extra); warmup.update();
    assert.equal(completions.length, 2); assert.equal(target, null);
    assert.equal(extra.at(-1)!.visible, false); assert.equal(initial.visible, true);
    warmup.update(); assert.equal(completions.length, 2, "do not launch more work while pending");
    completions.forEach(resolve => resolve());
    for (let i = 0; i < 5; i++) await Promise.resolve();
    warmup.update(); assert.equal(extra.at(-1)!.visible, true);
    warmup.afterRender(); warmup.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); normal.dispose();
});

test("shadow preparation matches native depth packing and excludes world fog", () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0, .004);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); mesh.castShadow = true;
    scene.add(mesh, new THREE.PointLight(), new THREE.DirectionalLight());
    const normal = new THREE.MeshNormalMaterial(), owned = new Set<THREE.Material>();
    const { warm, shadows, shadowScene } = createShaderWarmupScene(scene, normal, owned);
    assert.equal(shadowScene.fog, null); assert.equal(shadowScene.children.length, 2);
    assert.equal(warm.children.length, 2);
    const depth = (shadows.children[0] as THREE.Mesh).material as THREE.MeshDepthMaterial;
    assert.equal(depth.depthPacking, THREE.BasicDepthPacking); assert.equal(depth.side, THREE.BackSide);
    assert.notEqual((warm.children[0] as THREE.Mesh).material, mesh.material);
    for (const material of owned) material.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); normal.dispose();
});

test("finite off-screen light volumes are culled and restored when the camera turns", () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 100), normal = new THREE.MeshNormalMaterial();
    const near = new THREE.PointLight(0xffffff, 1, 2), far = new THREE.PointLight(0xffffff, 1, 2), unlimited = new THREE.PointLight(0xffffff, 1, 0);
    near.position.set(0, 0, -5); far.position.set(0, 0, 5); unlimited.position.copy(far.position); scene.add(near, far, unlimited);
    const renderer = { compile: () => new Set(), getRenderTarget: () => null, setRenderTarget: () => {}, compileAsync: async () => {} } as unknown as THREE.WebGLRenderer;
    const warmup = createLightVariantWarmup(renderer, scene, camera, normal);
    warmup.update(); assert.equal(near.visible, true); assert.equal(far.visible, false); assert.equal(unlimited.visible, true);
    camera.rotation.y = Math.PI; warmup.update(); assert.equal(near.visible, false); assert.equal(far.visible, true);
    warmup.dispose(); assert.equal(near.visible, true); assert.equal(far.visible, true); normal.dispose();
});
