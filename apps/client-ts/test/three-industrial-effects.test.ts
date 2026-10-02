import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createIndustrialEffects } from "../src/render/three/effects.js";
import { createBattlefieldCamera } from "../src/render/three/camera.js";

test("industrial effect bounds include animated vertices and cull distant cities", () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { value: { devicePixelRatio: 1 }, configurable: true });
    const effects = createIndustrialEffects(), root = new THREE.Group();
    try {
        effects.registerBuilding(root, "factory"); effects.registerBuilding(root, "research"); effects.registerOrb(root);
        const camera = createBattlefieldCamera(1440, 900);
        const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const object of root.children) {
            if (!(object instanceof THREE.Points || object instanceof THREE.Line)) continue;
            assert.ok(object.frustumCulled);
            const sphere = object.geometry.boundingSphere!;
            assert.ok(sphere && sphere.radius > 0);
            const positions = object.geometry.getAttribute("position");
            for (let frame = 0; frame < 200; frame++) for (let i = 0; i < positions.count; i++) {
                const seconds = frame * 0.073, point = new THREE.Vector3().fromBufferAttribute(positions, i);
                const steamSeed = object.geometry.getAttribute("steamSeed"), moteSeed = object.geometry.getAttribute("moteSeed");
                if (steamSeed) {
                    const seed = steamSeed.getX(i), age = (seconds * .20 + seed) % 1;
                    point.y += age * (.9 + seed * .6); point.x += age * .23 + Math.sin(age * 8 + seed * 31) * .07; point.z += age * .12;
                } else if (moteSeed) {
                    const seed = moteSeed.getX(i), age = (seconds * (.35 + seed * .15) + seed) % 1;
                    const angle = seed * 62.8319 + seconds * (1.2 + seed), radius = .25 + age * .13;
                    point.set(Math.cos(angle) * radius, .18 + age * .60, Math.sin(angle) * radius);
                } else {
                    const t = object.geometry.getAttribute("arcProgress").getX(i), pulse = Math.floor(seconds * 22);
                    point.x += Math.sin(t * 93 + pulse * 2.7) * .025 * Math.sin(t * 3.14159);
                    point.y += Math.sin(t * 79 - pulse * 1.9) * .028 * Math.sin(t * 3.14159);
                }
                assert.ok(sphere.containsPoint(point), "animated particles and arc jitter cannot escape their bounds");
            }
            root.position.set(0, 0, 0); root.updateMatrixWorld(true);
            assert.ok(frustum.intersectsObject(object), "nearby effects still render");
            root.position.set(150, 0, 150); root.updateMatrixWorld(true);
            assert.equal(frustum.intersectsObject(object), false, "distant city effects skip their draw calls");
        }
    } finally {
        effects.unregister(root);
        if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
        else Reflect.deleteProperty(globalThis, "window");
    }
});
