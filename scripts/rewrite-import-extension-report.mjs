#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const STRICT = process.argv.includes("--strict");
const IMPORT_RE = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const ALLOWED_SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".json"];
const TARGETS = [
    "apps/client-ts/src",
    "apps/server-ts/src",
    "packages/protocol/src",
    "packages/sim-core/src"
];

const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `Command failed: ${cmd} ${args.join(" ")}`);
    }
    return result.stdout;
};

const extensionOf = (specifier) => {
    const index = specifier.lastIndexOf(".");
    if (index < 0) {
        return "";
    }
    return specifier.slice(index);
};

const hasAllowedExtension = (specifier) => {
    return ALLOWED_SOURCE_EXTENSIONS.includes(extensionOf(specifier));
};

const filesRaw = run("rg", ["--files", ...TARGETS]);
const files = filesRaw
    .split("\n")
    .filter(Boolean)
    .filter((file) => file.endsWith(".ts"));

const violations = [];
for (const file of files) {
    const text = await readFile(file, "utf8");
    IMPORT_RE.lastIndex = 0;

    for (let match = IMPORT_RE.exec(text); match; match = IMPORT_RE.exec(text)) {
        const specifier = match[1];
        if (!specifier || !specifier.startsWith(".")) {
            continue;
        }

        if (hasAllowedExtension(specifier)) {
            continue;
        }

        const uptoMatch = text.slice(0, match.index);
        const line = uptoMatch.split("\n").length;
        violations.push({
            file,
            line,
            specifier
        });
    }
}

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        filesScanned: files.length,
        relativeImportsWithoutAllowedExtensions: violations.length
    },
    rules: {
        allowedRelativeImportExtensions: ALLOWED_SOURCE_EXTENSIONS
    },
    violations: violations.slice(0, 200)
};

console.log(JSON.stringify(report, null, 4));

if (STRICT && violations.length > 0) {
    process.exitCode = 1;
}
