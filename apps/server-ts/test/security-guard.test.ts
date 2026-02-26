import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import { createRuntimeState } from "../src/runtime/types.js";

const makeHarness = () => {
    const broadcast: EventEnvelope[] = [];
    const direct: Array<{ socketId: string; event: EventEnvelope }> = [];
    const rejected: Array<{ socketId: string; reason: string }> = [];
    const runtime = new GameRuntime({
        emitAll: (event) => {
            broadcast.push(event);
        },
        emitTo: (socketId, event) => {
            direct.push({ socketId, event });
        },
        reject: (socketId, reason) => {
            rejected.push({ socketId, reason });
        }
    }, {}, createRuntimeState(), {
        userStore: new UserStoreAdapter()
    });
    return { runtime, broadcast, direct, rejected };
};

const createIdentityToken = (sub: string, secret: string, expMs: number): string => {
    const payloadPart = Buffer.from(JSON.stringify({ sub, exp: expMs }), "utf8").toString("base64url");
    const signaturePart = createHmac("sha256", secret).update(payloadPart).digest("base64url");
    return `${payloadPart}.${signaturePart}`;
};

test("lobby join binds guest identity when no verified token is provided", () => {
    const { runtime, direct } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, {
        desiredCity: 1,
        userId: "spoofed-user"
    }));

    const profile = direct.find((entry) => entry.socketId === "p1" && entry.event.type === "score.profile");
    assert.ok(profile);
    assert.equal((profile.event.payload as { userId: string }).userId, "guest:p1");
});

test("lobby join binds verified identity when signed token is valid", () => {
    const previousSecret = process.env.BATTLECITY_IDENTITY_SECRET;
    process.env.BATTLECITY_IDENTITY_SECRET = "battlecity-test-secret-0123456789";
    try {
        const { runtime, direct } = makeHarness();
        const token = createIdentityToken("google:user-1", process.env.BATTLECITY_IDENTITY_SECRET, Date.now() + 60_000);
        runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, {
            desiredCity: 1,
            authToken: token
        }));

        const profile = direct.find((entry) => entry.socketId === "p1" && entry.event.type === "score.profile");
        assert.ok(profile);
        assert.equal((profile.event.payload as { userId: string }).userId, "verified:google:user-1");
    } finally {
        if (previousSecret === undefined) {
            delete process.env.BATTLECITY_IDENTITY_SECRET;
        } else {
            process.env.BATTLECITY_IDENTITY_SECRET = previousSecret;
        }
    }
});

test("duplicate inbound sequence is rejected as invalid envelope", () => {
    const { runtime, rejected } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    const updatePayload = {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    };
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, updatePayload));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, updatePayload));

    assert.ok(rejected.some((entry) => entry.socketId === "p1" && entry.reason === "InvalidEnvelope"));
});

test("player update spam is rate-limited", () => {
    const { runtime, rejected } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));

    for (let seq = 2; seq <= 80; seq += 1) {
        runtime.handleRawEvent("p1", makeEnvelope("player.update", seq, {
            id: "p1",
            city: 1,
            direction: 0,
            isMoving: false,
            offset: { x: 100, y: 100 }
        }));
    }

    assert.ok(rejected.some((entry) => entry.socketId === "p1" && entry.reason === "ChatRateLimited"));
});
