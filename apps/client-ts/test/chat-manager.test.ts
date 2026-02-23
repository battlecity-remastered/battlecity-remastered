import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildChatLines, parseChatDraft } from "../src/ui/chat/ChatManager.js";

test("parseChatDraft maps team and global chat inputs", () => {
    assert.equal(parseChatDraft(""), null);
    assert.deepEqual(parseChatDraft("hello"), {
        text: "hello",
        scope: "team"
    });
    assert.deepEqual(parseChatDraft("/g hello world"), {
        text: "hello world",
        scope: "global"
    });
    assert.equal(parseChatDraft("/g "), null);
});

test("buildChatLines renders newest history with scope markers", () => {
    const state = createClientState();
    state.chat.history = [
        {
            id: "1",
            from: "p1",
            city: 1,
            text: "team msg",
            ts: 1,
            scope: "team"
        },
        {
            id: "2",
            from: "p2",
            city: 2,
            text: "global msg",
            ts: 2,
            scope: "global"
        }
    ];

    const lines = buildChatLines(state);
    assert.equal(lines[0], "[T] p1: team msg");
    assert.equal(lines[1], "[G] p2: global msg");
    assert.equal(lines.at(-1), "Rate limit: clear");
});
