import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { resolveWorldViewport, TILE_SIZE } from "../src/gameplay/world-viewport.js";
import { createBattlefieldCamera, positionBattlefieldCamera, resizeBattlefieldCamera } from "../src/render/three/camera.js";

const close = (actual: number, expected: number): void => {
    assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);
};

const screenPosition = (camera: THREE.Camera, x: number, z: number, width: number, height: number): THREE.Vector2 => {
    const ndc = new THREE.Vector3(x, 0, z).project(camera);
    return new THREE.Vector2((ndc.x + 1) * width / 2, (1 - ndc.y) * height / 2);
};

for (const [width, height] of [[1024, 768], [1440, 960], [1920, 1080], [2560, 1440], [3440, 1440]]) {
    test(`3D floor matches the Pixi viewport at ${width}×${height}`, () => {
        const viewport = resolveWorldViewport(width!, height!);
        const camera = createBattlefieldCamera(width!, height!);
        const playerX = -200.6354, playerZ = -200.6146;
        positionBattlefieldCamera(camera, playerX, playerZ);
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-10, -7], [10, 7]]) {
            const point = screenPosition(camera, playerX + dx!, playerZ + dz!, width!, height!);
            close(point.x, viewport.centerX + TILE_SIZE / 2 + dx! * TILE_SIZE);
            close(point.y, viewport.centerY + TILE_SIZE / 2 + dz! * TILE_SIZE);
        }
        // A three-tile building must occupy 144px at the near and far edges,
        // with identical east/west and north/south floor dimensions.
        for (const depth of [-9, 0, 9]) {
            const a = screenPosition(camera, playerX, playerZ + depth, width!, height!);
            const b = screenPosition(camera, playerX + 3, playerZ + depth + 3, width!, height!);
            close(b.x - a.x, 144);
            close(b.y - a.y, 144);
        }
    });
}

test("the camera stays over the terrain when the tank reaches any map edge", () => {
    const camera = createBattlefieldCamera(3440, 1440);
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const x of [-255.5, 0, 255.5]) for (const z of [-255.5, 0, 255.5]) {
        positionBattlefieldCamera(camera, x, z);
        for (const u of [-1, 1]) for (const v of [-1, 1]) {
            ray.setFromCamera(new THREE.Vector2(u, v), camera);
            const corner = ray.ray.intersectPlane(floor, new THREE.Vector3())!;
            assert.ok(Math.abs(corner.x) <= 256 + 1e-6 && Math.abs(corner.z) <= 256 + 1e-6,
                `camera over (${x}, ${z}) exposes void at (${corner.x}, ${corner.z})`);
        }
    }
});

test("resizing and moving the camera preserve a one-tile 48px step", () => {
    const camera = createBattlefieldCamera(1024, 768);
    resizeBattlefieldCamera(camera, 1920, 1080);
    positionBattlefieldCamera(camera, 200, -100);
    const a = screenPosition(camera, 200, -100, 1920, 1080);
    const b = screenPosition(camera, 201, -99, 1920, 1080);
    close(b.x - a.x, 48);
    close(b.y - a.y, 48);
});

test("the exported tank stays inside a 48px silhouette at every legacy heading", async () => {
    const bytes = await readFile(new URL("../public/assets/models/battlecity-tank.glb", import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const asset = await new GLTFLoader().parseAsync(buffer, "");
    const camera = createBattlefieldCamera(1920, 1080);
    const point = new THREE.Vector3();
    for (let direction = 0; direction < 32; direction++) {
        asset.scene.rotation.y = -direction / 32 * Math.PI * 2;
        asset.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box2();
        asset.scene.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            const positions = child.geometry.getAttribute("position");
            for (let i = 0; i < positions.count; i++) {
                point.fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld).project(camera);
                bounds.expandByPoint(new THREE.Vector2((point.x + 1) * 960, (1 - point.y) * 540));
            }
        });
        const size = bounds.getSize(new THREE.Vector2());
        assert.ok(size.x <= 48 && size.y <= 48, `heading ${direction}: ${size.x}×${size.y}px`);
    }
});
