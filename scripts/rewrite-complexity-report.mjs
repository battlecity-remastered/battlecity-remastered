#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { measureSource } from "./source-metrics.mjs";

const FILE_MAX_OVERRIDES = {};
const SOURCE_ROOTS = [
    "apps/client-ts/src",
    "apps/server-ts/src",
    "packages/protocol/src",
    "packages/sim-core/src"
];

const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        if (result.error?.code === "ENOENT") {
            throw new Error(`Command not found: ${cmd}`);
        }
        throw new Error(result.stderr?.trim() || `Command failed: ${cmd} ${args.join(" ")}`);
    }
    return result.stdout;
};

const walkFiles = async (root, out) => {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            await walkFiles(fullPath, out);
            continue;
        }
        if (entry.isFile() && fullPath.endsWith(".ts")) {
            out.push(fullPath);
        }
    }
};

const collectSourceFiles = async () => {
    try {
        const filesRaw = run("rg", ["--files", ...SOURCE_ROOTS]);
        return filesRaw.split("\n").filter(Boolean).filter((file) => file.endsWith(".ts"));
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Command not found: rg")) {
            throw error;
        }
        const files = [];
        for (const root of SOURCE_ROOTS) {
            await walkFiles(root, files);
        }
        return files;
    }
};

const files = await collectSourceFiles();

const reportRows = [];
for (const file of files) {
    const text = await readFile(file, "utf8");
    const funcs = measureSource(text, file);
    const maxComplexity = funcs.reduce((max, fn) => Math.max(max, fn.complexity), 0);
    const totalComplexity = funcs.reduce((sum, fn) => sum + fn.complexity, 0);
    const averageComplexity = funcs.length === 0 ? 0 : Number((totalComplexity / funcs.length).toFixed(2));

    reportRows.push({
        file,
        functionCount: funcs.length,
        maxComplexity,
        averageComplexity
    });
}

reportRows.sort((a, b) => b.maxComplexity - a.maxComplexity || b.averageComplexity - a.averageComplexity);

const maxOverall = reportRows.reduce((max, row) => Math.max(max, row.maxComplexity), 0);
const avgOverall = reportRows.length === 0
    ? 0
    : Number((reportRows.reduce((sum, row) => sum + row.averageComplexity, 0) / reportRows.length).toFixed(2));

const violations = reportRows.filter((row) => {
    const maxAllowed = FILE_MAX_OVERRIDES[row.file] ?? 15;
    return row.maxComplexity > maxAllowed || row.averageComplexity > 8;
});

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        files: reportRows.length,
        maxOverall,
        avgOverall
    },
    thresholds: {
        maxFunctionComplexity: 15,
        averageFileComplexity: 8
    },
    worstFiles: reportRows.slice(0, 20),
    violations
};

console.log(JSON.stringify(report, null, 4));

if (process.argv.includes("--strict") && violations.length > 0) {
    process.exit(1);
}
