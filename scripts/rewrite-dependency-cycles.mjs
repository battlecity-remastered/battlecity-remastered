#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
    "apps/client-ts/src",
    "apps/server-ts/src",
    "packages/protocol/src",
    "packages/sim-core/src"
];

const STRICT = process.argv.includes("--strict");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const IMPORT_RE = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

const toPosix = (value) => value.split(path.sep).join("/");

const isSourceFile = (filePath) => EXTENSIONS.some((ext) => filePath.endsWith(ext));

const resolveImport = (fromFile, specifier) => {
    if (!specifier.startsWith(".")) {
        return null;
    }

    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.mts`,
        `${base}.cts`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
        path.join(base, "index.mts"),
        path.join(base, "index.cts")
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && isSourceFile(candidate)) {
            return candidate;
        }
    }

    return null;
};

const walkFiles = (dir, out = []) => {
    if (!fs.existsSync(dir)) {
        return out;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(full, out);
            continue;
        }
        if (entry.isFile() && isSourceFile(full)) {
            out.push(full);
        }
    }
    return out;
};

const files = TARGETS.flatMap((target) => walkFiles(path.join(ROOT, target)));
const fileSet = new Set(files.map((file) => path.resolve(file)));
const graph = new Map();

for (const file of files) {
    const abs = path.resolve(file);
    const src = fs.readFileSync(abs, "utf8");
    const deps = new Set();
    IMPORT_RE.lastIndex = 0;
    for (let match = IMPORT_RE.exec(src); match; match = IMPORT_RE.exec(src)) {
        const specifier = match[1];
        if (!specifier) {
            continue;
        }
        const resolved = resolveImport(abs, specifier);
        if (!resolved) {
            continue;
        }
        const normalized = path.resolve(resolved);
        if (fileSet.has(normalized)) {
            deps.add(normalized);
        }
    }
    graph.set(abs, Array.from(deps.values()));
}

const cycles = [];
const stack = [];
const stackSet = new Set();
const seen = new Set();
const cycleSet = new Set();

const keyForCycle = (cycle) => {
    const nodes = cycle.slice(0, -1);
    const minIndex = nodes.reduce((best, node, index, arr) => {
        if (toPosix(node) < toPosix(arr[best])) {
            return index;
        }
        return best;
    }, 0);
    const rotated = nodes.slice(minIndex).concat(nodes.slice(0, minIndex));
    return rotated.map((node) => toPosix(path.relative(ROOT, node))).join("->");
};

const dfs = (node) => {
    seen.add(node);
    stack.push(node);
    stackSet.add(node);

    for (const dep of graph.get(node) ?? []) {
        if (!seen.has(dep)) {
            dfs(dep);
            continue;
        }

        if (!stackSet.has(dep)) {
            continue;
        }

        const start = stack.indexOf(dep);
        const cycle = stack.slice(start).concat(dep);
        const key = keyForCycle(cycle);
        if (!cycleSet.has(key)) {
            cycleSet.add(key);
            cycles.push(cycle);
        }
    }

    stack.pop();
    stackSet.delete(node);
};

for (const node of graph.keys()) {
    if (!seen.has(node)) {
        dfs(node);
    }
}

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        filesScanned: files.length,
        cycles: cycles.length
    },
    cycles: cycles.map((cycle) => cycle.map((node) => toPosix(path.relative(ROOT, node))))
};

console.log(JSON.stringify(report, null, 4));

if (STRICT && cycles.length > 0) {
    process.exitCode = 1;
}
