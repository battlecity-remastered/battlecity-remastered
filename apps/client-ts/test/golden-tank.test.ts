import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createClientState, updateFromSnapshot } from "../src/app/state.js";
import { createTankCloak } from "../src/render/three/tank-cloak.js";
import { createRoleTank, updateTankRole, updateTankTeam } from "../src/render/three/tank-role.js";
import { acceptAccountSession, identityJoinFields } from "../src/ui/identity/account-session.js";
import { buildReconnectJoinPayload } from "../src/network/socket.js";
import { isTankLabelVisible, tankLabelText } from "../src/render/three/pilot-presentation.js";

test("snapshots award and remove gold for local and remote tanks, including older servers", () => {
    const state = createClientState(); state.local.id = "self";
    const player = { city: 0, direction: 0, offset: { x: 0, y: 0 } };
    const update = (local: boolean, remote: boolean) => updateFromSnapshot(state, { serverTime: Date.now(), players: [
        { ...player, id: "self", ...(local ? { isScoreLeader: true } : {}) },
        { ...player, id: "other", ...(remote ? { isScoreLeader: true } : {}) }
    ] });
    update(true, false); assert.equal(state.local.isScoreLeader, true); assert.equal(state.remotePlayers.get("other")!.isScoreLeader, false);
    update(false, true); assert.equal(state.local.isScoreLeader, false); assert.equal(state.remotePlayers.get("other")!.isScoreLeader, true);
    update(false, false); assert.equal(state.remotePlayers.get("other")!.isScoreLeader, false);
});

test("actual recruit and mayor assets turn gold independently, preserve team optics and cloak, and restore their original finish", async () => {
    const models = await Promise.all(["tank", "mayor-tank"].map(async name => {
        const buffer = await readFile(new URL(`../public/assets/models/battlecity-${name}.glb`, import.meta.url));
        return (await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "")).scene;
    }));
    const root = createRoleTank(models[0]!, models[1]!), other = root.clone(true);
    const cloak = createTankCloak(root), otherCloak = createTankCloak(other);
    const original: Array<{ part: THREE.Mesh; material: THREE.MeshStandardMaterial; color: string; roughness: number; metalness: number }> = [];
    root.traverse(part => { if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial) original.push({ part, material: part.material,
        color: part.material.color.getHexString(), roughness: part.material.roughness, metalness: part.material.metalness }); });
    const geometry = original.map(o => o.part.geometry); updateTankTeam(root, false, true);
    const armour = original.filter(o => /DX .*armour|Mayor .*armour|Mayor .*dome/.test(o.material.name));
    assert.equal(armour.length, 4);
    for (const entry of armour) assert.equal(entry.material.color.getHexString(), /cyan|dome/.test(entry.material.name) ? "f2cb70" : "b98932");
    updateTankRole(root, true); assert.equal(root.children[1]!.visible, true); assert.equal(root.children[0]!.visible, false);
    cloak.update(true); updateTankTeam(root, true, true);
    assert.ok(original.every(o => o.material.opacity === .24 && !o.material.depthWrite));
    const optics = original.find(o => o.material.name === "Command glow"); assert.ok(optics); assert.equal(optics.material.color.getHexString(), "ff563e");
    cloak.update(false); updateTankTeam(root, false, false);
    for (const entry of original) {
        assert.equal(entry.material.color.getHexString(), entry.color);
        assert.equal(entry.material.roughness, entry.roughness); assert.equal(entry.material.metalness, entry.metalness);
        assert.equal(entry.material.opacity, 1);
    }
    assert.deepEqual(original.map(o => o.part.geometry), geometry, "no geometry added or changed");
    let otherGold = false; other.traverse(part => { if (part instanceof THREE.Mesh) otherGold ||= part.material.userData.tankOriginalFinish !== undefined; });
    assert.equal(otherGold, false); cloak.dispose(); otherCloak.dispose();
});

test("authenticated joins and reconnects send the server-issued token", () => {
    const state = createClientState();
    acceptAccountSession(state, { userId: "original", callsign: "Champion", authToken: "signed-token", expiresAt: Date.now() + 10000 });
    assert.equal(identityJoinFields(state).authToken, "signed-token");
    assert.equal(buildReconnectJoinPayload(state, 2).authToken, "signed-token");
});

test("pilot labels preserve names and rank, distinguish the mayor, and never reveal cloaked enemies", () => {
    const pilot = { id: "pilot", city: 1, x: 0, y: 0, direction: 0, health: 100, callsign: "Champion 😎", rankTitle: "Brigadier", isScoreLeader: true, cloakedUntil: 2000 };
    assert.deepEqual(tankLabelText(pilot, true), { name: "Champion 😎", rank: "★ #1 · Brigadier · Mayor" });
    assert.equal(isTankLabelVisible(pilot, 0, 1000), false);
    assert.equal(isTankLabelVisible(pilot, 1, 1000), true, "teammates can see cloaked allies");
    assert.equal(isTankLabelVisible(pilot, 0, 2000), true);
    assert.equal(isTankLabelVisible({ ...pilot, health: 0 }, 1, 1000), false);
    assert.equal(tankLabelText({ ...pilot, isScoreLeader: false, rankTitle: "Colonel" }, false).rank, "Colonel");
});
