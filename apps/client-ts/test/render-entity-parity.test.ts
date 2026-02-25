import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const scenePath = path.resolve("apps/client-ts/src/render/scene.ts");
const effectsPath = path.resolve("apps/client-ts/src/render/effects/EffectsRenderer.ts");
const nameLabelPath = path.resolve("apps/client-ts/src/render/labels/NameLabelRenderer.ts");

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

test("effects renderer preserves camera center when shake is inactive", () => {
    const effectsSource = fs.readFileSync(effectsPath, "utf8");
    assert.match(effectsSource, /const baseStageX = stage\.position\.x;/);
    assert.match(effectsSource, /const baseStageY = stage\.position\.y;/);
    assert.match(effectsSource, /stage\.position\.set\(\s*baseStageX,\s*baseStageY\s*\);/);
    assert.doesNotMatch(effectsSource, /stage\.position\.set\(\s*0,\s*0\s*\);/);
});

test("effects renderer shakes only for non-local orb events", () => {
    const effectsSource = fs.readFileSync(effectsPath, "utf8");
    assert.match(effectsSource, /const lastOrbEvent = state\.events\.lastOrbEvent;/);
    assert.match(effectsSource, /lastOrbEvent\.targetCityId !== state\.local\.city/);
    assert.match(effectsSource, /if \(shouldShakeForOrb\) {/);
    assert.doesNotMatch(effectsSource, /if \(shotAge >= 0 && shotAge < SHAKE_MS\) {/);
});

test("building sprites always animate across bitmap columns", () => {
    const sceneSource = fs.readFileSync(scenePath, "utf8");
    assert.match(sceneSource, /resolveBuildingTexture\(\s*layers\.textures,\s*building\.type,\s*animationCounter\s*\)/);
    assert.doesNotMatch(sceneSource, /building\.health < building\.maxHealth \? animationCounter : null/);
});

test("panel inventory icons use sprite textures for framed item icons", () => {
    const sceneSource = fs.readFileSync(scenePath, "utf8");
    assert.match(sceneSource, /panelInventoryIcons: Map<number, Sprite>/);
    assert.match(sceneSource, /iconSprite\.texture = iconFrame;/);
    assert.match(sceneSource, /panelInventorySelection\.texture = layers\.textures\.inventorySelection;/);
});

test("panel inventory stack counts render as overlay text above item icons", () => {
    const sceneSource = fs.readFileSync(scenePath, "utf8");
    assert.match(sceneSource, /panelInventoryCountTexts: Map<number, Text>/);
    assert.match(sceneSource, /countText\.position\.set\(panelX \+ slot\.x \+ 22,\s*slot\.y \+ 12\);/);
    assert.match(sceneSource, /countText\.visible = true;/);
    assert.doesNotMatch(sceneSource, /panel-count-t:/);
});

test("name labels are centered above tank bounds with outlined high-contrast text", () => {
    const source = fs.readFileSync(nameLabelPath, "utf8");
    assert.match(source, /x: tank\.x \+ \(width \* \(0\.5 - tank\.anchor\.x\)\)/);
    assert.match(source, /y: tank\.y - \(height \* tank\.anchor\.y\) - LABEL_CLEARANCE/);
    assert.match(source, /stroke:\s*{\s*color: 0x101010,\s*width: 3,\s*join: "round"/);
});

test("name labels show city display names instead of numeric city ids", () => {
    const source = fs.readFileSync(nameLabelPath, "utf8");
    assert.match(source, /getCityDisplayName\(city\)/);
    assert.doesNotMatch(source, /\\nCity \\$\\{city\\}/);
});

test("scene top-left hint renders nearest orbable city line instead of legacy debug block", () => {
    const sceneSource = fs.readFileSync(scenePath, "utf8");
    assert.match(sceneSource, /formatNearestOrbableCityLine\(resolveNearestOrbableCity\(state\)\)/);
    assert.doesNotMatch(sceneSource, /buildHudLines/);
});
