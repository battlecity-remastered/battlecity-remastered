import test from "node:test";
import assert from "node:assert/strict";
import { buildHelpLines } from "../src/ui/help/HelpModal.js";

test("buildHelpLines includes modal toggle controls", () => {
    const lines = buildHelpLines();
    assert.ok(lines.includes("F1: Toggle help"));
    assert.ok(lines.includes("F2: Toggle map"));
    assert.ok(lines.includes("F3: Toggle options"));
    assert.ok(lines.includes("T: Toggle tutorial"));
});
