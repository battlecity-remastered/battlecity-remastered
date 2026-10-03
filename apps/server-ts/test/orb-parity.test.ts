import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { makeEnvelope } from "@battlecity/protocol";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { getOrCreateCity, buildCityFinancePayload } from "../src/domain/economy/CityEconomyService.js";
import { cityOrbBounty, refreshCityOrbHistory, isCityOrbable } from "../src/domain/orb/CityOrbRules.js";
import { dropOrb } from "../src/domain/orb/OrbService.js";
import { initializeJoinedPlayer } from "../src/domain/spawn/CityBootstrap.js";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import { issueAccountToken } from "../src/domain/identity/account-token.js";
import citySpawns from "../data/citySpawns.json" with { type: "json" };

const config = DEFAULT_RUNTIME_CONFIG;
const addBuilding = (state: ReturnType<typeof createRuntimeState>, type: number, index = 0, cityId = 2): string => {
    const id = `building-${cityId}-${index}`, spawn = citySpawns["2"];
    state.buildings.set(id, { id, cityId, ownerId: "target", type, tileX: spawn.tileX + index * 3, tileY: spawn.tileY,
        health: 120, maxHealth: 120, population: 0 });
    return id;
};
const payload = () => ({ sourceCityId: 1, targetCityId: 2, position: { x: citySpawns["2"].tileX * 48, y: (citySpawns["2"].tileY + 2) * 48 } });

test("orb eligibility and bounty retain original factory history and peak building thresholds", () => {
    for (const [type, count, expected] of [[300, 20, 0], [103, 2, 10], [105, 2, 20], [300, 21, 30], [105, 26, 40], [103, 31, 50]]) {
        const state = createRuntimeState(), city = getOrCreateCity(state, 2, config);
        addBuilding(state, 0);
        for (let index = 1; index < count!; index++) addBuilding(state, type!, index);
        assert.equal(isCityOrbable(state, city), expected! > 0);
        assert.equal(cityOrbBounty(city), expected);
        assert.equal(buildCityFinancePayload(state, 2, config).isOrbable, expected! > 0);
        for (const [id, building] of state.buildings) if (building.type !== 0) state.buildings.delete(id);
        assert.equal(isCityOrbable(state, city), expected! > 0, "demolition cannot erase history");
        assert.equal(cityOrbBounty(city), expected);
        city.orbVictories = 3;
        assert.equal(cityOrbBounty(city), expected! + 15);
        state.buildings.clear();
        assert.equal(isCityOrbable(state, city), false, "destroyed cities are not targets");
    }
});

test("a fresh city rejects orbs without consuming the carrier's item or resetting the target", () => {
    const state = createRuntimeState(); addBuilding(state, 0);
    state.playerInventory.set("carrier", new Map([[5, 1]]));
    assert.equal(dropOrb(state, "carrier", payload(), config).ok, false);
    assert.equal(state.playerInventory.get("carrier")!.get(5), 1);
    assert.equal(state.buildings.size, 1);
    addBuilding(state, 103, 1);
    const result = dropOrb(state, "carrier", payload(), config);
    assert.equal(result.ok, true);
    if (!result.ok) throw Error("orb rejected");
    assert.equal(result.value.cityOrbed.awardedScore, 10);
    assert.equal(state.playerInventory.get("carrier")!.get(5), undefined);
    assert.equal(buildCityFinancePayload(state, 2, config).isOrbable, false);
    addBuilding(state, 0);
    assert.equal(buildCityFinancePayload(state, 2, config).isOrbable, false, "new city starts protected");
    assert.equal(getOrCreateCity(state, 1, config).orbVictories, 1);
});

test("orb victory awards each teammate once, credits carrier/assists, and resets and evicts the target", () => {
    const state = createRuntimeState(), store = new UserStoreAdapter({ useSqlStorage: false });
    const runtime = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: (_id, reason) => assert.fail(reason) }, {}, state, { userStore: store, initializeJoinedPlayer });
    for (const [id, userId, city] of [["carrier", "a", 1], ["second-tab", "a", 1], ["teammate", "b", 1], ["victim", "v", 2]] as const) {
        const authToken = issueAccountToken(userId, userId).authToken;
        runtime.handleRawEvent(id, makeEnvelope("lobby.join.request", 1, { desiredCity: city, authToken }));
    }
    state.playerInventory.set("carrier", new Map([[5, 1]]));
    state.playerInventory.set("victim", new Map([[5, 1], [3, 10]]));
    const factory = addBuilding(state, 105, 1);
    const target = getOrCreateCity(state, 2, config);
    refreshCityOrbHistory(state, target); target.maxBuildings = 31; target.orbVictories = 3; target.score = 99;
    state.factoryStock.set(2, new Map([[5, 5]]));
    state.factoryProductionNextAtMs.set(factory, 5000);
    state.research.get(2)!.completed.push(405);
    runtime.handleRawEvent("carrier", makeEnvelope("orb.drop.request", 2, payload()));
    const holder = Effect.runSync(store.getOrCreate("a")), mate = Effect.runSync(store.getOrCreate("b"));
    assert.equal(holder.score, 65); assert.equal(holder.orbs, 1); assert.equal(holder.assists, 0);
    assert.equal(mate.score, 65); assert.equal(mate.orbs, 0); assert.equal(mate.assists, 1);
    assert.equal(state.cities.get(1)!.score, 65);
    assert.equal(target.score, 0); assert.equal(target.orbVictories, 0); assert.equal(target.maxBuildings, 1);
    assert.equal(target.hadOrbFactory, false); assert.equal(target.hadBombFactory, false);
    assert.equal(state.research.has(2), false); assert.equal(state.factoryStock.has(2), false);
    assert.equal(state.factoryProductionNextAtMs.has(factory), false);
    assert.equal(state.players.has("victim"), false); assert.equal(state.socketCities.has("victim"), false);
    assert.equal(state.playerInventory.has("victim"), false);
});
