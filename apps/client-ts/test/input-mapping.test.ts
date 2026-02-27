import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const inputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/app/input.ts");

test("keyboard mapping keeps ArrowDown backward and reserves S for output", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /arrowdown:\s*"moveBackward"/);
    assert.match(source, /down:\s*"moveBackward"/);
    assert.doesNotMatch(source, /s:\s*"moveForward"/);
    assert.doesNotMatch(source, /arrowdown:\s*"moveForward"/);
    assert.doesNotMatch(source, /s:\s*"moveBackward"/);
    assert.doesNotMatch(source, /keys:\s*"moveBackward"/);
});

test("keyboard mapping supports arrow-based turn-right aliases", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /arrowright:\s*"turnRight"/);
    assert.match(source, /right:\s*"turnRight"/);
    assert.doesNotMatch(source, /d:\s*"turnRight"/);
    assert.doesNotMatch(source, /keyd:\s*"turnRight"/);
    assert.doesNotMatch(source, /e:\s*"turnRight"/);
    assert.match(source, /const fromCode = KEY_TO_CONTROL\[code\];/);
});

test("keyboard mapping uses classic pickup/use/cloak/output keys", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /u:\s*"collectFactory"/);
    assert.match(source, /c:\s*"useCloak"/);
    assert.match(source, /h:\s*"useItem"/);
    assert.match(source, /outputBuildings\(state\)/);
});

test("keyboard mapping treats Shift as both modifier and shoot", () => {
    const source = fs.readFileSync(inputPath, "utf8");
    assert.match(source, /shift:\s*"shift"/);
    assert.match(source, /shiftleft:\s*"shift"/);
    assert.match(source, /shiftright:\s*"shift"/);
    assert.match(source, /state\.controls\.shift = value;/);
    assert.match(source, /state\.controls\.shoot = value;/);
});
