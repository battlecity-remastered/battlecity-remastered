import test from "node:test";
import assert from "node:assert/strict";
import { tickFactories } from "../src/domain/factories/FactoryService.js";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import type { RuntimeEmitter } from "../src/runtime/emitter.js";
import { pickupIcon } from "../src/domain/icons/IconDropService.js";

const ITEM_TYPE_LASER = 12;
const LASER_FACTORY_TYPE = 112;
const FACTORY_CAP_MATRIX: ReadonlyArray<{ buildingType: number; itemType: number; cap: number; }> = [
    { buildingType: 100, itemType: 0, cap: 4 },
    { buildingType: 101, itemType: 1, cap: 4 },
    { buildingType: 102, itemType: 2, cap: 20 },
    { buildingType: 103, itemType: 3, cap: 20 },
    { buildingType: 104, itemType: 4, cap: 10 },
    { buildingType: 105, itemType: 5, cap: 1 },
    { buildingType: 106, itemType: 6, cap: 4 },
    { buildingType: 107, itemType: 7, cap: 5 },
    { buildingType: 108, itemType: 8, cap: 20 },
    { buildingType: 109, itemType: 9, cap: 10 },
    { buildingType: 110, itemType: 10, cap: 5 },
    { buildingType: 111, itemType: 11, cap: 5 },
    { buildingType: 112, itemType: 12, cap: 4 }
];

const createEmitter = (events: Array<{ type: string; payload: unknown }>): RuntimeEmitter => {
    return {
        emit: (type, payload) => {
            events.push({ type, payload });
        },
        emitTo: () => {
            // Not used by factory tick path.
        }
    };
};

test("factory production cap counts city player-held inventory", () => {
    const state = createRuntimeState();
    state.buildings.set("factory_1", {
        id: "factory_1",
        ownerId: "p1",
        cityId: 1,
        type: LASER_FACTORY_TYPE,
        tileX: 10,
        tileY: 10,
        health: 120,
        maxHealth: 120,
        population: 50
    });
    state.socketCities.set("p1", 1);
    state.playerInventory.set("p1", new Map([[ITEM_TYPE_LASER, 3]]));

    const events: Array<{ type: string; payload: unknown }> = [];
    const emitter = createEmitter(events);
    const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        factoryProductionTickMs: 100,
        factoryStockCap: 99
    };

    for (let i = 0; i < 20; i += 1) {
        tickFactories(state, config, emitter, 100);
    }

    const stock = state.factoryStock.get(1)?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(stock, 1);

    const laserStockEvents = events.filter((event) => {
        if (event.type !== "factory.stock") {
            return false;
        }
        const payload = event.payload as { cityId: number; itemType: number };
        return payload.cityId === 1 && payload.itemType === ITEM_TYPE_LASER;
    });
    assert.equal(laserStockEvents.length, 1);
});

test("factory production uses per-building cadence after successful production", () => {
    const state = createRuntimeState();
    state.buildings.set("factory_1", {
        id: "factory_1",
        ownerId: "p1",
        cityId: 1,
        type: LASER_FACTORY_TYPE,
        tileX: 10,
        tileY: 10,
        health: 120,
        maxHealth: 120,
        population: 50
    });

    const events: Array<{ type: string; payload: unknown }> = [];
    const emitter = createEmitter(events);
    const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        factoryProductionTickMs: 7000,
        factoryStockCap: 99
    };

    // First eligible tick produces immediately (classic parity behavior).
    tickFactories(state, config, emitter, 100);
    let stock = state.factoryStock.get(1)?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(stock, 1);

    // Not enough elapsed time for the next production.
    tickFactories(state, config, emitter, 6999);
    stock = state.factoryStock.get(1)?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(stock, 1);

    // Crossing the cadence boundary allows the next production.
    tickFactories(state, config, emitter, 1);
    stock = state.factoryStock.get(1)?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(stock, 2);
});

test("factory production caps match classic per-item limits for all factory types", () => {
    for (const entry of FACTORY_CAP_MATRIX) {
        const state = createRuntimeState();
        state.buildings.set(`factory_${entry.buildingType}`, {
            id: `factory_${entry.buildingType}`,
            ownerId: "p1",
            cityId: 1,
            type: entry.buildingType,
            tileX: 10,
            tileY: 10,
            health: 120,
            maxHealth: 120,
            population: 50
        });

        const events: Array<{ type: string; payload: unknown }> = [];
        const emitter = createEmitter(events);
        const config = {
            ...DEFAULT_RUNTIME_CONFIG,
            factoryProductionTickMs: 100,
            factoryStockCap: 8
        };

        // Run enough cadence ticks to ensure stock reaches cap if clamping is correct.
        for (let i = 0; i < 60; i += 1) {
            tickFactories(state, config, emitter, 100);
        }

        const stock = state.factoryStock.get(1)?.get(entry.itemType) ?? 0;
        assert.equal(
            stock,
            entry.cap,
            `factory ${entry.buildingType} item ${entry.itemType} should cap at ${entry.cap}`
        );
    }
});

test("all factory caps include held and deployed items, isolate cities, and replace only a released slot", () => {
    for (const { buildingType, itemType, cap } of FACTORY_CAP_MATRIX) {
        const state = createRuntimeState(), emitter = createEmitter([]);
        state.buildings.set("factory", { id: "factory", ownerId: "mayor", cityId: 1, type: buildingType, tileX: 10, tileY: 10, health: 100, maxHealth: 100, population: 50 });
        state.socketCities.set("ally", 1); state.socketCities.set("enemy", 2);
        state.playerInventory.set("ally", new Map([[itemType, 1]]));
        state.playerInventory.set("enemy", new Map([[itemType, cap]]));
        const deployed = cap > 1 ? 1 : 0, stock = cap - 1 - deployed;
        state.factoryStock.set(1, new Map([[itemType, stock]]));
        if (deployed) {
            if (itemType >= 8 && itemType <= 11) state.defenses.set("deployed", { id: "deployed", cityId: 1, type: itemType, tileX: 20, tileY: 20, health: 100, maxHealth: 100 });
            else state.hazards.set("deployed", { id: "deployed", cityId: 1, type: itemType, x: 960, y: 960, radius: 24, active: true });
        }
        const tick = (): void => tickFactories(state, DEFAULT_RUNTIME_CONFIG, emitter, DEFAULT_RUNTIME_CONFIG.factoryProductionTickMs);
        tick(); tick();
        assert.equal(state.factoryStock.get(1)!.get(itemType), stock, `held/deployed ${itemType} still counts toward its city cap`);
        if (deployed) { state.defenses.clear(); state.hazards.clear(); }
        else state.playerInventory.get("ally")!.delete(itemType);
        tick(); tick();
        assert.equal(state.factoryStock.get(1)!.get(itemType), stock + 1, `only one replacement ${itemType}; the other city's inventory is separate`);
    }
});

test("two players cannot collect the same last factory item or consume stock with a rejected pickup", () => {
    const state = createRuntimeState(), config = DEFAULT_RUNTIME_CONFIG;
    state.buildings.set("factory", { id: "factory", ownerId: "first", cityId: 1, type: 105, tileX: 10, tileY: 10, health: 100, maxHealth: 100, population: 50 });
    state.factoryStock.set(1, new Map([[5, 1]]));
    for (const id of ["first", "second"]) {
        state.players.set(id, { id, city: 1, x: 528, y: 576, direction: 0, speed: 0, health: 100, maxHealth: 100 });
        state.socketCities.set(id, 1); state.playerInventory.set(id, new Map());
    }
    const request = { cityId: 1, itemType: 5, amount: 1 };
    assert.equal(pickupIcon(state, "first", request, config).ok, true);
    assert.deepEqual(pickupIcon(state, "second", request, config), { ok: false, reason: "factory_empty" });
    assert.deepEqual(pickupIcon(state, "first", request, config), { ok: false, reason: "inventory_empty" });
    assert.equal(state.factoryStock.get(1)!.get(5), 0);
    assert.equal(state.playerInventory.get("first")!.get(5), 1);
    assert.equal(state.playerInventory.get("second")!.get(5) ?? 0, 0);
});
