import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";

test("default runtime config keeps legacy starting cash parity", () => {
    assert.equal(DEFAULT_RUNTIME_CONFIG.cityStartingCash, 95_000_000);
});
