import test from "node:test";
import assert from "node:assert/strict";
import { measureSource } from "../source-metrics.mjs";

test("counts decisions in actual function bodies, including concise arrows", () => {
    const metrics = measureSource(`
        const choose = (value?: number): number => value ?? 0;
        function route(x: number) {
            if (x > 0 && x < 10) return x;
            for (const y of [1, 2]) { if (y === x) return y; }
            return x > 20 ? 2 : 0;
        }
    `);
    assert.equal(metrics.find(fn => fn.name === "choose").complexity, 2);
    assert.equal(metrics.find(fn => fn.name === "route").complexity, 6);
});

test("shader text, comments, type annotations and nested callbacks are measured correctly", () => {
    const metrics = measureSource(`
        const setup = (input?: { flag?: boolean }) => {
            // if ? && for while
            const shader = 'if (x) { for (;;) { a ? b : c; } }';
            const tick = () => { if (input?.flag) return shader; return ''; };
            return tick;
        };
    `);
    assert.equal(metrics.length, 2);
    assert.equal(metrics.find(fn => fn.name === "setup").complexity, 1);
    assert.equal(metrics.find(fn => fn.name === "tick").complexity, 2);
    assert.equal(metrics.find(fn => fn.name === "setup").lines, 6);
});

test("checks methods, accessors and constructors without counting types as methods", () => {
    const metrics = measureSource(`
        type Options = { optional?: boolean; run: () => void };
        class Example {
            constructor(flag: boolean) { if (flag) this.run(); }
            run() { try { return 1; } catch { return 0; } }
            get enabled() { return true; }
        }
    `);
    assert.deepEqual(metrics.map(fn => [fn.name, fn.complexity]), [["<callback>", 2], ["run", 2], ["enabled", 1]]);
});

test("a real over-complex function remains above the unchanged strict threshold", () => {
    const body = Array.from({ length: 16 }, (_, i) => `if (x === ${i}) return ${i};`).join("\n");
    assert.equal(measureSource(`function tooLarge(x: number) { ${body} }`)[0].complexity, 17);
    assert.throws(() => measureSource("function malformed( {"), /malformed/);
});

test("nested function lengths are checked independently, keeping shared boundary lines", () => {
    const metrics = measureSource(`function setup() {
        const update = () => {
            if (ready) return 1;
            return 0;
        };
        return update;
    }`);
    assert.equal(metrics.find(fn => fn.name === "setup").lines, 5);
    assert.equal(metrics.find(fn => fn.name === "update").lines, 4);
    const body = Array.from({length: 91}, () => "doWork();").join("\n");
    assert.ok(measureSource(`function long() {\n${body}\n}`)[0].lines > 90);
});
