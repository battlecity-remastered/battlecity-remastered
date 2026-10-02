import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

test("exported command center animates its machinery without moving the NO PARKING apron", async () => {
    const bytes = await readFile(new URL("../public/assets/models/battlecity-command-center.glb", import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const asset = await new GLTFLoader().parseAsync(buffer, "");
    assert.ok(asset.animations.length > 0, "Blender must export the machinery animation clips");
    const rotors: THREE.Object3D[] = [];
    let apron: THREE.Object3D | undefined;
    asset.scene.traverse(child => {
        if (child.userData.animated) rotors.push(child);
        if (child instanceof THREE.Mesh && (child.material as THREE.Material).name === "Pale stone apron") apron = child;
    });
    assert.equal(rotors.length, 2);
    assert.ok(apron);
    asset.scene.updateMatrixWorld(true);
    const apronBefore = apron.matrixWorld.clone();
    const mixer = new THREE.AnimationMixer(asset.scene);
    for (const clip of asset.animations) mixer.clipAction(clip).play();
    mixer.update(0.01);
    const before = rotors.map(rotor => rotor.quaternion.clone());
    mixer.update(0.85);
    asset.scene.updateMatrixWorld(true);
    rotors.forEach((rotor,i) => assert.ok(before[i]!.angleTo(rotor.quaternion) > 0.3, "iris must visibly rotate"));
    assert.deepEqual(apron.matrixWorld.elements, apronBefore.elements);
    const size = new THREE.Box3().setFromObject(asset.scene).getSize(new THREE.Vector3());
    assert.ok(size.x <= 3 && size.z <= 3, "animated machinery must stay inside the original building footprint");
});
