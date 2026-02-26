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
    state.events.lastPlayerDead = { id: "enemy_1", by: "ally_7" };
    state.events.lastRejectedReason = "rate_limited";
    state.events.lastIconPickupConfirmed = {
        playerId: "self",
        cityId: 1,
        itemType: 3,
        amount: 1
    };
    state.chat.rateLimitedUntil = Date.now() + 2000;
    state.chat.rateLimitedScope = "team";

    const queue: Array<{ id: string; text: string; createdAt: number; }> = [];
    const next = collectNotificationEvents(
        state,
        {
            promotionCount: 0,
            lastBuildDeniedReason: null,
            lastDemolishDeniedReason: null,
            lastOrbedCityId: null,
            lastPlayerDeadSignature: null,
            lastRejectedReason: null,
            lastPickupSignature: null,
            lastChatRateLimitSignature: null
        },
        queue
    );

    assert.equal(queue.length, 8);
    assert.ok(queue.some((entry) => entry.text.includes("Promotion: Promoted to captain (+100).")));
    assert.ok(queue.some((entry) => entry.text.includes("Research Pending: Research must finish")));
    assert.ok(queue.some((entry) => entry.text.includes("Demolition Restricted: Only mayors can order demolitions.")));
    assert.ok(queue.some((entry) => entry.text.includes("City Orbed: ")));
    assert.ok(queue.some((entry) => entry.text.includes("Elimination: enemy_1 killed by ally_7.")));
    assert.ok(queue.some((entry) => entry.text.includes("Action Rate Limit: Please wait")));
    assert.ok(queue.some((entry) => entry.text.includes("Chat Rate Limit: Team chat cooling down")));
    assert.ok(queue.some((entry) => entry.text.includes("Item Pickup: Item 3 x1")));
    assert.equal(next.promotionCount, 1);
});

test("buildNotificationLines returns fallback when queue is empty", () => {
    assert.deepEqual(buildNotificationLines([]), [
        "No recent events."
    ]);
});

test("buildNotificationLines returns event text rows when queue has events", () => {
    const lines = buildNotificationLines([
        { id: "1", text: "Build denied: research_required", createdAt: Date.now() }
    ]);
    assert.equal(lines[0], "Build denied: research_required");
});
