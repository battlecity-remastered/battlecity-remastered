"use strict";

// Precompiled WASM binary for the octile distance helper used by defender pathfinding.
// Generated from client/src/defenders/wasm/astar.wat to keep server bots behaviour-aligned
// with the legacy client implementation without pulling in additional build tooling.
// prettier-ignore
const OCTILE_WASM_BYTES = Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 7, 1, 96, 2, 127, 127, 1, 125, 3, 2, 1, 0,
    7, 10, 1, 6, 111, 99, 116, 105, 108, 101, 0, 0, 10, 48, 1, 46, 45, 1, 2,
    127, 32, 0, 32, 1, 72, 4, 64, 32, 0, 33, 2, 32, 1, 33, 3, 5, 32, 1, 33, 2,
    32, 0, 33, 3, 11, 32, 3, 32, 2, 107, 178, 32, 2, 178, 67, 51, 51, 179, 63,
    148, 146, 11
]);

let octileFn = null;
let initError = null;

const ensureWasm = () => {
    if (octileFn || initError) {
        return;
    }
    try {
        const module = new WebAssembly.Module(OCTILE_WASM_BYTES);
        const instance = new WebAssembly.Instance(module);
        octileFn = instance.exports && typeof instance.exports.octile === 'function'
            ? instance.exports.octile
            : null;
    } catch (error) {
        initError = error;
        octileFn = null;
    }
};

const octileCost = (dx, dy) => {
    ensureWasm();
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (octileFn) {
        return octileFn(absDx | 0, absDy | 0);
    }
    const min = Math.min(absDx, absDy);
    const max = Math.max(absDx, absDy);
    return (max - min) + (1.4 * min);
};

module.exports = { octileCost };

