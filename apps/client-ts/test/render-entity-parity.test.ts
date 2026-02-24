import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const scenePath = path.resolve("apps/client-ts/src/render/scene.ts");
const effectsPath = path.resolve("apps/client-ts/src/render/effects/EffectsRenderer.ts");

test("tank row contracts match local/remote mayor and city parity rules", () => {
    const source = fs.readFileSync(scenePath, "utf8");
    assert.match(source, /const localRow = resolveLocalRole\(state\) === "mayor" \? 1 : 0;/);
    assert.match(source, /const remoteRow = isSameCity \? \(isMayor \? 1 : 0\) : \(isMayor \? 3 : 2\);/);
});

test("tank sprite origin uses top-left anchor to avoid center drift", () => {
    const source = fs.readFileSync(scenePath, "utf8");
    assert.match(source, /sprite\.anchor\.set\(0,\s*0\);/);
    assert.doesNotMatch(source, /sprite\.anchor\.set\(0\.5,\s*0\.5\);/);
});

test("effects renderer uses large explosion texture variant path", () => {
    const effectsSource = fs.readFileSync(effectsPath, "utf8");
    const sceneSource = fs.readFileSync(scenePath, "utf8");

    assert.match(effectsSource, /explosion\.variant === "large" \? largeExplosionTexture : smallExplosionTexture/);
    assert.match(sceneSource, /layers\.textures\.largeExplosion/);
});
