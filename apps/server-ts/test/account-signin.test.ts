import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { Effect } from "effect";
import { makeEnvelope, type KnownTypedEventEnvelope } from "@battlecity/protocol";
import { AccountStore } from "../src/adapters/persistence/AccountStore.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import { createHttpApp } from "../src/http-app.js";
import { verifyIdentityToken } from "../src/domain/identity/IdentityService.js";
import { issueAccountToken, persistIdentitySecret } from "../src/domain/identity/account-token.js";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState } from "../src/runtime/types.js";
import citySpawns from "../data/citySpawns.json" with { type: "json" };

test("Google subject reuses the original UUID, custom callsign and score without rewriting the account", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bc-account-")), db = path.join(dir, "scores.db");
    try {
        const accounts = new AccountStore(db);
        execFileSync("sqlite3", [db, "INSERT INTO users VALUES ('original-uuid','Champion 😎','google','google-subject','private@example.invalid',1,2);"]);
        const scores = new UserStoreAdapter({ dbPath: db, useSqlStorage: true });
        Effect.runSync(scores.addScore("original-uuid", 19940, "Champion 😎"));
        const before = execFileSync("sqlite3", [db, "SELECT * FROM users;"], { encoding: "utf8" });
        assert.deepEqual(accounts.googleAccount("google-subject", "Google Legal Name"), { id: "original-uuid", name: "Champion 😎", provider: "google" });
        assert.equal(execFileSync("sqlite3", [db, "SELECT * FROM users;"], { encoding: "utf8" }), before);
        assert.equal(Effect.runSync(new UserStoreAdapter({ dbPath: db }).getOrCreate("original-uuid")).score, 19940);
        const newcomer = accounts.googleAccount("different-subject", "Champion 😎");
        assert.notEqual(newcomer.id, "original-uuid"); assert.notEqual(newcomer.name, "Champion 😎");
        assert.equal(accounts.googleAccount("different-subject").id, newcomer.id);
        persistIdentitySecret(db);
        const token = issueAccountToken("original-uuid", "Champion 😎").authToken;
        persistIdentitySecret(db);
        assert.equal(verifyIdentityToken(token)?.userId, "original-uuid");
        assert.equal(verifyIdentityToken(`${token}.extra`), null);
        const payload = Buffer.from(JSON.stringify({ sub: "stolen", kind: "account", exp: Date.now() + 10000 })).toString("base64url");
        assert.equal(verifyIdentityToken(`${payload}.${token.split(".")[1]}`), null);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sign-in endpoint issues a verified session only after credential verification, with no private account data", async () => {
    let verified = 0;
    const app = createHttpApp("/tmp/nonexistent-bc-dist", { clientIds: ["test-google-client"], authenticate: async credential => {
        verified++; if (credential !== "valid-google-credential") throw new Error("Invalid credential");
        return { id: "original-uuid", name: "Champion", provider: "google" };
    } });
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    try {
        const post = (body: unknown) => fetch(`${origin}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        assert.equal((await post({ userId: "original-uuid" })).status, 400);
        assert.equal((await post({ credential: "forged" })).status, 401);
        const response = await post({ credential: "valid-google-credential" });
        assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
        const body = await response.json() as { authToken: string; userId: string };
        assert.equal(body.userId, "original-uuid"); assert.equal(verified, 2);
        assert.equal(verifyIdentityToken(body.authToken)?.userId, "original-uuid");
        const session = await fetch(`${origin}/api/auth/session`, { headers: { Authorization: `Bearer ${body.authToken}` } });
        assert.deepEqual(await session.json(), { userId: "original-uuid", callsign: "Champion", provider: "google" });
        assert.equal((await fetch(`${origin}/api/auth/session`)).status, 401);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("an authenticated orb victory adds to the original SQLite score and survives runtime and socket replacement", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bc-score-orb-")), db = path.join(dir, "scores.db");
    try {
        const store = new UserStoreAdapter({ dbPath: db, useSqlStorage: true });
        Effect.runSync(store.getOrCreate("original-uuid", "Champion", "google"));
        Effect.runSync(store.addScore("original-uuid", 19940, "Champion"));
        const profiles: number[] = [], rejected: string[] = [], state = createRuntimeState();
        const broadcaster = { emitAll: () => {}, reject: (_id: string, reason: string) => rejected.push(reason), emitTo: (_id: string, event: unknown) => {
            const typed = event as KnownTypedEventEnvelope;
            if (typed.type === "score.profile") profiles.push(typed.payload.score);
        } };
        const runtime = new GameRuntime(broadcaster, {}, state, { userStore: store });
        const authToken = issueAccountToken("original-uuid", "Champion").authToken;
        runtime.handleRawEvent("pilot", makeEnvelope("lobby.join.request", 1, { desiredCity: 1, authToken, callsign: "Champion" }));
        assert.equal(profiles.at(-1), 19940);
        const spawn = citySpawns["2"];
        state.buildings.set("target-cc", { id: "target-cc", ownerId: "opponent", cityId: 2, type: 0,
            tileX: spawn.tileX, tileY: spawn.tileY, health: 100, maxHealth: 100, population: 0 });
        state.playerInventory.set("pilot", new Map([[5, 1]]));
        runtime.handleRawEvent("pilot", makeEnvelope("orb.drop.request", 2, { sourceCityId: 1, targetCityId: 2,
            position: { x: spawn.tileX * 48, y: (spawn.tileY + 2) * 48 } }));
        assert.deepEqual(rejected, []);
        assert.equal(profiles.at(-1), 20190);
        const reopened = new UserStoreAdapter({ dbPath: db, useSqlStorage: true });
        const persisted = Effect.runSync(reopened.getOrCreate("original-uuid"));
        assert.equal(persisted.score, 20190); assert.equal(persisted.orbs, 2); assert.equal(persisted.provider, "google");
        const restarted = new GameRuntime(broadcaster, {}, createRuntimeState(), { userStore: reopened });
        restarted.handleRawEvent("new-socket", makeEnvelope("lobby.join.request", 1, { desiredCity: 1, authToken }));
        assert.equal(profiles.at(-1), 20190);
        assert.equal(Effect.runSync(reopened.listTop()).length, 1, "reconnect creates no second score account");
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
