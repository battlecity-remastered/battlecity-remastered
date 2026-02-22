import test from "node:test";
import assert from "node:assert/strict";
import { KnownEventTypes } from "../src/envelope.js";
import { EventPayloadSchemas } from "../src/events.js";

test("KnownEventTypes stays in sync with EventPayloadSchemas keys", () => {
    const fromSchemas = Object.keys(EventPayloadSchemas).sort();
    const fromEnvelope = [...KnownEventTypes].sort();

    assert.deepEqual(fromEnvelope, fromSchemas);
});
