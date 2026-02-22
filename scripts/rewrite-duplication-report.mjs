#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const WINDOW_SIZE = 8;
const MAX_ALLOWED_DUPLICATE_BLOCKS = 12;

const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `Command failed: ${cmd} ${args.join(" ")}`);
    }
    return result.stdout;
};

const normalizeLine = (line) => {
    return line
        .replace(/\/\/.*$/, "")
        .replace(/\s+/g, " ")
        .trim();
};

const filesRaw = run("rg", ["--files", "apps/client-ts/src", "apps/server-ts/src", "packages/protocol/src", "packages/sim-core/src"]);
const files = filesRaw.split("\n").filter(Boolean).filter((file) => file.endsWith(".ts"));

const blockMap = new Map();

for (const file of files) {
    const text = await readFile(file, "utf8");
    const lines = text.split("\n").map(normalizeLine);

    for (let index = 0; index <= lines.length - WINDOW_SIZE; index += 1) {
        const window = lines.slice(index, index + WINDOW_SIZE);
        if (window.some((line) => line.length === 0)) {
            continue;
        }

        const key = window.join("\n");
        const list = blockMap.get(key) ?? [];
        list.push({ file, line: index + 1 });
        blockMap.set(key, list);
    }
}

const duplicates = [];
for (const [block, locations] of blockMap.entries()) {
    const uniqueFiles = new Set(locations.map((entry) => entry.file));
    if (uniqueFiles.size <= 1 || locations.length <= 1) {
        continue;
    }
    duplicates.push({
        occurrences: locations.length,
        files: uniqueFiles.size,
        sample: block,
        locations: locations.slice(0, 6)
    });
}

duplicates.sort((a, b) => b.occurrences - a.occurrences || b.files - a.files);

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        filesScanned: files.length,
        duplicateBlocks: duplicates.length,
        windowSize: WINDOW_SIZE,
        maxAllowedDuplicateBlocks: MAX_ALLOWED_DUPLICATE_BLOCKS
    },
    topDuplicates: duplicates.slice(0, 20)
};

console.log(JSON.stringify(report, null, 4));

if (process.argv.includes("--strict") && duplicates.length > MAX_ALLOWED_DUPLICATE_BLOCKS) {
    process.exit(1);
}
