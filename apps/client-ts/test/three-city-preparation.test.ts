import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { collectCityMeshes, prepareCityModels } from "../src/render/three/prepare-city-models.js";

test("city preparation shares uploads across clones, including hidden batch sources", () => {
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
    const first = new THREE.Mesh(geometry, material), other = first.clone();
    const separate = new THREE.Mesh(geometry, material.clone());
    first.visible = false;
    const roots = [new THREE.Group(), new THREE.Group()];
    roots[0]!.add(first, separate); roots[1]!.add(other);
    assert.equal(collectCityMeshes(roots).length, 2);
    assert.equal(first.parent, roots[0]);
    assert.equal(first.visible, false);
});

test("preparation restores the render target and shadow state if an upload fails", async () => {
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    scene.add(root, new THREE.DirectionalLight());
    const originalTarget = new THREE.WebGLRenderTarget();
    let target: THREE.WebGLRenderTarget | null = originalTarget;
    const renderer = {
        shadowMap: { needsUpdate: true },
        compileAsync: async () => {},
        getRenderTarget: () => target,
        setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { target = value; },
        render: () => { throw new Error("upload failed"); }
    };
    await assert.rejects(prepareCityModels(renderer as unknown as THREE.WebGLRenderer, scene, camera, [root]), /upload failed/);
    assert.equal(target, originalTarget);
    assert.equal(renderer.shadowMap.needsUpdate, true);
    assert.equal(root.parent, scene);
    assert.equal(scene.children.length, 2);
});
