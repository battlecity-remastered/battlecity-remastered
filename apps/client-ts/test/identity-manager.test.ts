import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { restoreIdentity } from "../src/ui/identity/IdentityManager.js";

class MemoryStorage implements Storage {
    private readonly map = new Map<string, string>();

    get length(): number {
        return this.map.size;
    }

    clear(): void {
        this.map.clear();
    }

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.map.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
}

test("restoreIdentity hydrates user id, callsign and provider", () => {
    const storage = new MemoryStorage();
    storage.setItem("battlecity.identity.v2", JSON.stringify({
        userId: "u1",
        callsign: "Raptor",
        provider: "google"
    }));

    const state = createClientState();
    restoreIdentity(state, storage);

    assert.equal(state.identity.userId, "u1");
    assert.equal(state.identity.callsign, "Raptor");
    assert.equal(state.identity.provider, "google");
});

test("new guests receive a stable themed callsign across refreshes", () => {
    const storage = new MemoryStorage(), first = createClientState();
    restoreIdentity(first, storage);
    assert.notEqual(first.identity.callsign, "Pilot");
    assert.ok(first.identity.callsign.length <= 20);
    const second = createClientState(); restoreIdentity(second, storage);
    assert.equal(second.identity.callsign, first.identity.callsign);
});
test("old default guest names are replaced while custom and Google names survive", () => {
    for (const [callsign, provider] of [["Pilot", "local"], ["My Tank", "local"], ["Pilot", "google"]] as const) {
        const storage = new MemoryStorage(), state = createClientState();
        storage.setItem("battlecity.identity.v2", JSON.stringify({ callsign, provider }));
        restoreIdentity(state, storage);
        if (provider === "local" && callsign === "Pilot") assert.notEqual(state.identity.callsign, "Pilot");
        else assert.equal(state.identity.callsign, callsign);
    }
});
