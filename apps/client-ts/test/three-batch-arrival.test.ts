import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createMaterialBatches } from "../src/render/three/material-batches.js";
import { freezeBuildingTransforms } from "../src/render/three/building-transforms.js";

test("buildings arriving together build one batch with their final world transforms", () => {
    const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
    const batches = createMaterialBatches(scene, []), roots: THREE.Group[] = [];
    let builds = 0;
    scene.addEventListener("childadded", event => { if (event.child.name === "Spatial building batch") builds++; });
    for (let index = 0; index < 3; index++) {
        const root = new THREE.Group(); root.position.set(index + 1, 0, 2);
        root.add(new THREE.Mesh(geometry, material)); scene.add(root); roots.push(root);
        batches.register(root, true);
    }
    assert.equal(builds, 0, "deferred registration does not repeatedly rebuild the same cell");
    batches.update(); assert.equal(builds, 1);
    const mesh = scene.children.find(object => object instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    assert.equal(mesh.count, 3);
    for (let index = 0; index < roots.length; index++) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        assert.equal(matrix.elements[12], index + 1); assert.equal(matrix.elements[14], 2);
        assert.equal(roots[index]!.children[0]!.visible, false);
    }
    batches.update(); assert.equal(builds, 1, "unchanged frames do not rebuild");
    batches.dispose(); geometry.dispose(); material.dispose();
});

test("removal before deferred rebuild retains originals and never resurrects a removed batch", () => {
    const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
    const roots = [new THREE.Group(), new THREE.Group()];
    roots.forEach(root => { root.add(new THREE.Mesh(geometry, material)); scene.add(root); });
    const batches = createMaterialBatches(scene, []);
    roots.forEach(root => batches.register(root, true)); batches.unregister(roots[1]!);
    roots[1]!.removeFromParent(); batches.update(); assert.equal(batches.count, 0);
    assert.equal(roots[0]!.children[0]!.visible, true);
    batches.dispose(); assert.equal(scene.children.some(object => object.name === "Spatial building batch"), false);
    geometry.dispose(); material.dispose();
});

test("a static batch merges each source once using its final transform", () => {
    const scene = new THREE.Scene(), root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const geometries: THREE.BufferGeometry[] = [new THREE.BoxGeometry(), new THREE.SphereGeometry(.3)];
    let copies = 0;
    for (const geometry of geometries) {
        const clone = geometry.clone.bind(geometry);
        geometry.clone = () => { copies++; return clone(); };
        root.add(new THREE.Mesh(geometry, material));
    }
    root.position.set(4, 0, 2); scene.add(root); freezeBuildingTransforms(root);
    const batches = createMaterialBatches(scene, [root]);
    assert.equal(copies, 2, "no provisional merge immediately discarded by the first update");
    const mesh = scene.children.find(object => object.name === "Spatial building batch") as THREE.Mesh;
    assert.ok(mesh.geometry.boundingSphere!.center.x > 3);
    batches.update(); assert.equal(copies, 2);
    batches.dispose(); geometries.forEach(geometry => geometry.dispose()); material.dispose();
});
