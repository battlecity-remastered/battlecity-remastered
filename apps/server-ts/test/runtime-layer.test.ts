import assert from "node:assert/strict";
import test from "node:test";
import { makeRuntimeServices } from "../src/layers/RuntimeLayer.js";
import type { EventEnvelope } from "@battlecity/protocol";

const broadcaster = {
    emitAll: (_event: EventEnvelope) => {},
    emitTo: (_socketId: string, _event: EventEnvelope) => {},
    reject: (_socketId: string, _reason: string) => {}
};

test("runtime layer hydrates blocking tiles from legacy map data", async () => {
    const services = makeRuntimeServices(broadcaster);
    try {
        const state = services.runtime.getReadonlyState();
        assert.ok(state.blockingTiles.size > 0);
        assert.ok(state.buildBlockingTiles.size > 0);
        assert.ok(state.fakeCities.size > 0);
    } finally {
        await services.runtimeScope.close();
    }
});
