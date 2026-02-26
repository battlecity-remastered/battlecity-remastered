import test from "node:test";
import assert from "node:assert/strict";
import { tickFactories } from "../src/domain/factories/FactoryService.js";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import type { RuntimeEmitter } from "../src/runtime/emitter.js";

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

    // First eligible tick produces immediately (legacy parity behavior).
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

test("factory production caps match legacy per-item limits for all factory types", () => {
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
