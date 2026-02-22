import test from "node:test";
import assert from "node:assert/strict";
import { decodeTypedEnvelope, makeTypedEnvelope } from "../src/index.js";

test("decodeTypedEnvelope validates known payload shapes", () => {
    const envelope = makeTypedEnvelope("player.update", 1, {
        id: "p1",
        city: 3,
        direction: 8,
        isMoving: true,
        offset: { x: 100, y: 200 }
    });

    const decoded = decodeTypedEnvelope(envelope);
    assert.equal(decoded._tag, "Right");
    if (decoded._tag === "Right") {
        assert.equal(decoded.right.type, "player.update");
        assert.equal((decoded.right.payload as { id: string }).id, "p1");
    }
});

test("decodeTypedEnvelope rejects malformed known payloads", () => {
    const decoded = decodeTypedEnvelope({
        type: "player.update",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: { id: "p1", city: "wrong" }
    });

    assert.equal(decoded._tag, "Left");
});
