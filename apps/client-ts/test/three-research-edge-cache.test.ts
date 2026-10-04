import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createResearchEdgeCache } from "../src/render/three/research-edge-cache.js";

test("research outlines retain native edges and share immutable geometry across displays", () => {
    const source = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial(), template = new THREE.Group();
    template.add(new THREE.Mesh(source, material));
    const cache = createResearchEdgeCache(); cache.prepare([template]);
    const edges = cache.get(source), otherDisplay = cache.get(source), native = new THREE.EdgesGeometry(source, 32);
    assert.equal(edges, otherDisplay);
    assert.deepEqual(Array.from(edges.attributes.position!.array), Array.from(native.attributes.position!.array));
    const lineMaterial = new THREE.LineBasicMaterial();
    const first = new THREE.LineSegments(edges, lineMaterial), second = new THREE.LineSegments(otherDisplay, lineMaterial), parent = new THREE.Group();
    let releases = 0; edges.addEventListener("dispose", () => releases++);
    parent.add(first, second); first.removeFromParent(); assert.equal(releases, 0);
    assert.equal(second.geometry, edges, "removing one display retains the other's outline");
    cache.prepare([template]); assert.equal(cache.get(source), edges);
    cache.dispose(); assert.equal(releases, 1); cache.dispose(); assert.equal(releases, 1);
    native.dispose(); source.dispose(); material.dispose(); lineMaterial.dispose();
});

test("research outline ownership remains local to each battlefield lifecycle", () => {
    const source = new THREE.SphereGeometry(.3), first = createResearchEdgeCache(), second = createResearchEdgeCache();
    const a = first.get(source), b = second.get(source);
    assert.notEqual(a, b); let sourceReleases = 0, secondReleases = 0;
    source.addEventListener("dispose", () => sourceReleases++); b.addEventListener("dispose", () => secondReleases++);
    first.dispose(); assert.equal(sourceReleases, 0); assert.equal(secondReleases, 0);
    second.dispose(); assert.equal(secondReleases, 1); source.dispose();
});
