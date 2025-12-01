"use strict";

const assert = require("assert");
const { test } = require("node:test");
const FakeCityManager = require("../src/FakeCityManager");

test("fake cities respect rebuild cooldown before respawn", () => {
    const manager = new FakeCityManager({
        game: { players: {} },
        buildingFactory: null,
        playerFactory: null,
        hazardManager: null,
        defenseManager: null,
        bulletFactory: null,
        enabled: true
    });
    manager.debug = () => {};

    const cityId = 0;
    const now = Date.now();
    manager.setCityCooldown(cityId, 300000, now);

    const spawned = manager.spawnFakeCity({
        cityId,
        layout: [{ type: 1, dx: 0, dy: 0 }]
    });

    assert.strictEqual(spawned, false, "city should not spawn while on cooldown");
    assert.strictEqual(manager.activeCities.has(cityId), false);
});

test("orbed fake cities clear bots and enter cooldown", () => {
    const game = { players: {} };
    const destroyedCities = [];
    const resets = [];
    const removedPlayers = [];
    const cityId = 42;
    const cityState = { isFake: true, name: "Testopolis" };
    const cityRecords = new Map([[cityId, cityState]]);
    const bot = {
        killed: false,
        kill() {
            this.killed = true;
        }
    };

    const manager = new FakeCityManager({
        game,
        buildingFactory: {
            destroyCity: (id) => destroyedCities.push(id),
            cityManager: {
                getCity: (id) => cityRecords.get(id),
                resetCity: (id) => resets.push(id)
            }
        },
        playerFactory: {
            removeSystemPlayer: (id, options) => {
                removedPlayers.push({ id, options });
                delete game.players[id];
                return true;
            },
            emitLobbySnapshot: () => {}
        },
        hazardManager: null,
        defenseManager: null,
        bulletFactory: null,
        enabled: true
    });
    manager.debug = () => {};
    manager.buildNavGrid = () => {};
    manager.update = () => {};

    manager.botProcesses.set(cityId, new Set([bot]));
    manager.activeCities.set(cityId, { defenseItems: [], hazardIds: [], botProcesses: [bot] });
    manager.recruitsByCity.set(cityId, ["r1"]);
    manager.recruits.set("r1", { id: "r1" });
    game.players.r1 = { id: "r1", city: cityId, isSystemControlled: true };

    manager.onCityOrbed({ targetCityId: cityId });

    const cooldownUntil = manager.cityCooldowns.get(cityId);
    assert.ok(Number.isFinite(cooldownUntil) && cooldownUntil > Date.now(), "city cooldown should be scheduled");
    assert.strictEqual(manager.botProcesses.has(cityId), false, "bot processes should be cleared");
    assert.ok(bot.killed, "bot should be terminated");
    assert.strictEqual(manager.recruitsByCity.has(cityId), false, "city recruits should be cleared");
    assert.strictEqual(manager.recruits.has("r1"), false, "recruit records should be removed");
    assert.strictEqual(game.players.r1, undefined, "recruit player should be removed from game state");
    assert.strictEqual(manager.activeCities.has(cityId), false, "city should be removed from active roster");
    assert.deepStrictEqual(destroyedCities, [cityId], "city should be destroyed");
    assert.deepStrictEqual(resets, [cityId], "city state should be reset");
    assert.deepStrictEqual(removedPlayers, [{ id: "r1", options: { broadcast: true } }]);
});
