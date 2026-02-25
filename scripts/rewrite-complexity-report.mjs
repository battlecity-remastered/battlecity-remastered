#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const FUNCTION_START_PATTERNS = [
    /function\s+\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g,
    /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>\s*\{/g,
    /(?:public|private|protected)?\s*(?:readonly\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g
];
const DECISION_REGEX = /\b(if|else\s+if|for|while|switch|case|catch)\b|\?|&&|\|\|/g;
const FILE_MAX_OVERRIDES = {};

const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `Command failed: ${cmd} ${args.join(" ")}`);
    }
    return result.stdout;
};

const getFunctions = (text) => {
    const functions = [];
    for (const pattern of FUNCTION_START_PATTERNS) {
        let match = pattern.exec(text);
        while (match) {
            const start = match.index + match[0].length;
            let depth = 1;
            let end = start;

            while (end < text.length && depth > 0) {
                const char = text[end];
                if (char === "{") {
                    depth += 1;
                }
                if (char === "}") {
                    depth -= 1;
                }
                end += 1;
            }

            const body = text.slice(start, Math.max(start, end - 1));
            const decisions = body.match(DECISION_REGEX)?.length ?? 0;
            const complexity = 1 + decisions;
            functions.push({ complexity });

            match = pattern.exec(text);
        }
    }

    return functions;
};

const filesRaw = run("rg", ["--files", "apps/client-ts/src", "apps/server-ts/src", "packages/protocol/src", "packages/sim-core/src"]);
const files = filesRaw.split("\n").filter(Boolean).filter((file) => file.endsWith(".ts"));

const reportRows = [];
for (const file of files) {
    const text = await readFile(file, "utf8");
    const funcs = getFunctions(text);
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
    worstFiles: reportRows.slice(0, 20)
};

console.log(JSON.stringify(report, null, 4));

if (process.argv.includes("--strict")) {
    const exceeded = reportRows.filter((row) => {
        const maxAllowed = FILE_MAX_OVERRIDES[row.file] ?? 15;
        return row.maxComplexity > maxAllowed || row.averageComplexity > 8;
    });
    if (exceeded.length > 0) {
        process.exit(1);
    }
}
