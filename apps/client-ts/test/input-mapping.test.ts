import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve("apps/client-ts/src/app/input.ts");

test("keyboard mapping preserves backward controls for S and ArrowDown", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /s:\s*"moveBackward"/);
    assert.match(source, /arrowdown:\s*"moveBackward"/);
    assert.match(source, /keys:\s*"moveBackward"/);
    assert.doesNotMatch(source, /s:\s*"moveForward"/);
    assert.doesNotMatch(source, /arrowdown:\s*"moveForward"/);
});

test("keyboard mapping supports arrow-based turn-right aliases", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /arrowright:\s*"turnRight"/);
    assert.match(source, /right:\s*"turnRight"/);
    assert.doesNotMatch(source, /d:\s*"turnRight"/);
    assert.doesNotMatch(source, /keyd:\s*"turnRight"/);
    assert.doesNotMatch(source, /e:\s*"turnRight"/);
    assert.match(source, /const fromCode = KEY_TO_CONTROL\[asLower\(event\.code\)\];/);
});

test("keyboard mapping uses legacy pickup/use keys", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /u:\s*"collectFactory"/);
    assert.match(source, /c:\s*"useItem"/);
    assert.match(source, /h:\s*"useItem"/);
});

test("keyboard mapping treats Shift as both modifier and shoot", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /shift:\s*"shift"/);
    assert.match(source, /shiftleft:\s*"shift"/);
    assert.match(source, /shiftright:\s*"shift"/);
    assert.match(source, /state\.controls\.shift = value;/);
    assert.match(source, /state\.controls\.shoot = value;/);
});
