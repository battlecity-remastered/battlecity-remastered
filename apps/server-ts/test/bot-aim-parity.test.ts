import assert from "node:assert/strict";
import test from "node:test";
import { botFireAtTarget } from "../src/domain/bots/BotShared.js";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG, type RuntimeBotController, type RuntimePlayer } from "../src/runtime/types.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";

for (const [random, expectedHeading] of [[0, 30], [.25, 31], [.5, 0], [.999, 1]] as const) {
    test(`classic rogue aim spread at random=${random} emits the same heading and muzzle trajectory`, () => {
        const original = Math.random; Math.random = () => random;
        try {
            const state = createRuntimeState(), emitted: unknown[] = [];
            const emitter = createRuntimeEmitter(state, { emitAll: event => emitted.push(event), emitTo: () => {}, reject: () => {} });
            const bot: RuntimePlayer = { id: "rogue", city: -1, x: 480, y: 480, direction: 0, speed: 0, health: 20, maxHealth: 20, isBot: true, botType: "rogue" };
            const controller: RuntimeBotController = { id: bot.id, botType: "rogue", homeCityId: -1, targetCityId: 0, nextShotAt: 0, nextRetargetAt: 0 };
            botFireAtTarget(state, emitter, DEFAULT_RUNTIME_CONFIG, bot, controller, { x: 480, y: 240 }, 1000, { shootRangeTiles: 12, muzzleOffsetPx: 30, shootIntervalMs: 1400, bulletCity: -1, aimSpreadSteps: 4, shotJitterMs: 800 });
            const bullet = [...state.bullets.values()][0]!;
            assert.equal(bot.direction, expectedHeading);
            assert.equal(bullet.direction, (expectedHeading + 24) % 32);
            const angle = bullet.direction * Math.PI / 16;
            assert.ok(Math.abs(bullet.x - (504 + Math.cos(angle) * 30)) < 1e-9);
            assert.ok(Math.abs(bullet.y - (504 + Math.sin(angle) * 30)) < 1e-9);
            assert.equal(controller.nextShotAt, 2400 + random * 800);
            assert.equal(emitted.length, 1);
        } finally { Math.random = original; }
    });
}

test("defender defaults retain direct aim and fixed cadence", () => {
    const state = createRuntimeState();
    const emitter = createRuntimeEmitter(state, { emitAll: () => {}, emitTo: () => {}, reject: () => {} });
    const bot: RuntimePlayer = { id: "defender", city: 17, x: 480, y: 480, direction: 8, speed: 0, health: 20, maxHealth: 20 };
    const controller: RuntimeBotController = { id: bot.id, botType: "defender", homeCityId: 17, targetCityId: 17, nextShotAt: 0, nextRetargetAt: 0 };
    botFireAtTarget(state, emitter, DEFAULT_RUNTIME_CONFIG, bot, controller, { x: 480, y: 240 }, 1000, { shootRangeTiles: 12, muzzleOffsetPx: 30, shootIntervalMs: 1300, bulletCity: 17 });
    assert.equal(bot.direction, 0); assert.equal([...state.bullets.values()][0]!.direction, 24);
    assert.equal(controller.nextShotAt, 2300);
});
