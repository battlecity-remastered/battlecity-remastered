import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createClientState } from "../src/app/state.js";
import { createWorldPreparation } from "../src/app/world-preparation.js";

test("joining waits for hydration and GPU work, then has no per-frame DOM writes", async () => {
    let writes = 0, hidden = false, calls = 0;
    const element = {
        dataset: {},
        style: new Proxy({}, { set(target, key, value) { writes++; Reflect.set(target, key, value); return true; } }),
        setAttribute: () => {}, remove: () => {},
        get hidden() { return hidden; }, set hidden(value: boolean) { writes++; hidden = value; }
    };
    const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => element } });
    try {
        const state = createClientState();
        let finish: () => void = () => {};
        const preparation = createWorldPreparation({ append: () => {} } as unknown as HTMLElement,
            async () => { calls++; await new Promise<void>(resolve => { finish = resolve; }); });
        state.local.id = "pilot";
        assert.equal(preparation.ready(state, false), false);
        assert.equal(calls, 0, "do not prepare an incomplete city snapshot");
        assert.equal(preparation.ready(state, true), false);
        assert.equal(preparation.ready(state, true), false);
        assert.equal(calls, 1);
        finish(); await setImmediate();
        const afterLoading = writes;
        for (let frame = 0; frame < 1000; frame++) assert.equal(preparation.ready(state, true), true);
        assert.equal(writes, afterLoading, "steady gameplay must not mutate the loading UI");
        assert.equal(calls, 1, "steady gameplay must not repeat GPU preparation");

        state.local.id = "reconnected-pilot";
        assert.equal(preparation.ready(state, true), false);
        state.local.id = null;
        assert.equal(preparation.ready(state, false), false, "do not render over an in-flight preparation target");
        finish(); await setImmediate();
        assert.equal(preparation.ready(state, false), true);
        preparation.dispose();
    } finally {
        if (previous) Object.defineProperty(globalThis, "document", previous);
        else Reflect.deleteProperty(globalThis, "document");
    }
});
