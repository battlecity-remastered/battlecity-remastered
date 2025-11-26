#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const watPath = path.resolve(projectRoot, 'src/defenders/wasm/astar.wat');
const wasmPath = path.resolve(projectRoot, 'src/defenders/wasm/astar.wasm');
const precompiledBase64 = 'AGFzbQEAAAABBwFgAn9/AX0DAgEABwoBBm9jdGlsZQAACi8BLQECfyAAIAFIBEAgACECIAEhAwUgASECIAAhAwsgAyACa7IgArJDMzOzP5SSCw==';

async function tryLoadWabt() {
    try {
        const wabtModule = await import('wabt');
        return wabtModule.default ? wabtModule.default() : wabtModule();
    } catch (err) {
        if (err?.code !== 'ERR_MODULE_NOT_FOUND') {
            console.warn('wabt import failed, falling back to precompiled wasm:', err?.message || err);
        }
        return null;
    }
}

async function ensureWasm() {
    const wabtInstance = await tryLoadWabt();

    if (wabtInstance) {
        const watSource = await fs.readFile(watPath, 'utf8');
        const wasmModule = wabtInstance.parseWat(watPath, watSource);
        const { buffer } = wasmModule.toBinary({ write_debug_names: true });
        await fs.mkdir(path.dirname(wasmPath), { recursive: true });
        await fs.writeFile(wasmPath, Buffer.from(buffer));
        console.log(`Built wasm from WAT: ${path.relative(projectRoot, wasmPath)}`);
        return;
    }

    await fs.mkdir(path.dirname(wasmPath), { recursive: true });
    await fs.writeFile(wasmPath, Buffer.from(precompiledBase64, 'base64'));
    console.log(`Wrote precompiled wasm bytes: ${path.relative(projectRoot, wasmPath)}`);
}

ensureWasm().catch((err) => {
    console.error('Failed to build astar.wasm:', err);
    process.exitCode = 1;
});
