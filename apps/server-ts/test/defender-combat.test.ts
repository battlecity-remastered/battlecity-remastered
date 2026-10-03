import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { tickBullets } from "../src/runtime/bullet-runtime.js";
import { buildPlayersSnapshot } from "../src/runtime/snapshot.js";
import { tickDefenderBots } from "../src/domain/bots/DefenderBotService.js";

for (const role of ["mayor", "shooter", "bomb_defuser", "miner"] as const) {
    test(`enemy ${role} defender loses hull on every laser hit and dies after four hits`, () => {
        const state = createRuntimeState();
        const events: Array<{ type: string; payload: unknown }> = [];
        const emitter = createRuntimeEmitter(state, { emitAll: event => events.push(event), emitTo: () => {}, reject: () => {} });
        state.players.set("defender", { id: "defender", city: 17, x: 480, y: 480, direction: 0, speed: 220, health: 20, maxHealth: 20, isBot: true, botType: "defender" });
        state.botControllers.set("defender", { id: "defender", botType: "defender", botRole: role, homeCityId: 17, targetCityId: 17, nextShotAt: 0, nextRetargetAt: 0 });
        for (let hit = 1; hit <= 4; hit++) {
            state.bullets.set(`shot-${hit}`, { id: `shot-${hit}`, ownerId: "attacker", city: 0, x: 478, y: 504, direction: 0, speed: 800, type: 0, remainingRange: 260 });
            tickBullets(state, DEFAULT_RUNTIME_CONFIG, emitter);
            assert.equal(events.filter(event => event.type === "player.health").length, hit);
            if (hit < 4) {
                const snapshot = buildPlayersSnapshot(state).players.find(player => player.id === "defender")!;
                assert.equal(snapshot.health, 20 - hit * 5);
                assert.equal(snapshot.maxHealth, 20);
                assert.equal(snapshot.botRole, role);
            }
        }
        assert.equal(state.players.has("defender"), false);
        tickDefenderBots(state, DEFAULT_RUNTIME_CONFIG, emitter, 1000, 100);
        assert.equal(state.botControllers.has("defender"), false);
        assert.ok(events.some(event => event.type === "player.dead"));
        assert.ok(events.some(event => event.type === "player.removed"));
    });
}
