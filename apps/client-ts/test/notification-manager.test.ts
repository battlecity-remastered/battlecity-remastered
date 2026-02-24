import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildNotificationLines, collectNotificationEvents } from "../src/ui/notifications/NotificationManager.js";

test("collectNotificationEvents appends notices for promotion, denials, and orb", () => {
    const state = createClientState();
    state.events.promotions.push({ cityId: 1, score: 100, rank: "captain" });
    state.events.lastBuildDeniedReason = "research_required";
    state.events.lastDemolishDeniedReason = "not_mayor";
    state.events.lastOrbedCityId = 2;

    const queue: Array<{ id: string; text: string; createdAt: number; }> = [];
    const next = collectNotificationEvents(
        state,
        {
            promotionCount: 0,
            lastBuildDeniedReason: null,
            lastDemolishDeniedReason: null,
            lastOrbedCityId: null
        },
        queue
    );

    assert.equal(queue.length, 4);
    assert.ok(queue.some((entry) => entry.text.includes("Promotion: captain")));
    assert.ok(queue.some((entry) => entry.text.includes("Build denied: research_required")));
    assert.ok(queue.some((entry) => entry.text.includes("Demolish denied: not_mayor")));
    assert.ok(queue.some((entry) => entry.text.includes("City 2 was orbed")));
    assert.equal(next.promotionCount, 1);
});

test("buildNotificationLines returns fallback when queue is empty", () => {
    assert.deepEqual(buildNotificationLines([]), ["No notifications"]);
});
