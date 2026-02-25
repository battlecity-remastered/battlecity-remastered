import assert from "node:assert/strict";
import test from "node:test";
import { rejectSocket } from "../src/runtime/rejections.js";

test("rejectSocket emits debug log with rejection context", () => {
    const rejects: Array<{ socketId: string; reason: string }> = [];
    const lines: string[] = [];
    const previousLog = console.log;

    console.log = (line?: unknown, ...rest: unknown[]) => {
        lines.push(String(line));
        if (rest.length > 0) {
            lines.push(rest.map((entry) => String(entry)).join(" "));
        }
    };

    try {
        rejectSocket(
            {
                emitAll: () => {},
                emitTo: () => {},
                reject: (socketId, reason) => {
                    rejects.push({ socketId, reason });
                }
            },
            "socket-1",
            "not_mayor",
            {
                eventType: "building.place.request",
                payload: {
                    cityId: 3,
                    tileX: 40,
                    tileY: 20,
                    type: 500
                }
            }
        );
    } finally {
        console.log = previousLog;
    }

    assert.equal(rejects.length, 1);
    assert.deepEqual(rejects[0], {
        socketId: "socket-1",
        reason: "ValidationFailed"
    });
    assert.ok(lines.length >= 1);

    const parsed = JSON.parse(lines[0] ?? "{}") as {
        level: string;
        message: string;
        meta?: Record<string, unknown>;
    };
    assert.equal(parsed.level, "debug");
    assert.equal(parsed.message, "runtime.reject");
    assert.equal(parsed.meta?.socketId, "socket-1");
    assert.equal(parsed.meta?.reason, "not_mayor");
    assert.equal(parsed.meta?.eventType, "building.place.request");
});
