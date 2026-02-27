#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MAX_FILE_LINES = 320;
const MAX_FUNCTION_LINES = 90;
const MAX_FILE_LINES_OVERRIDES = {
    "apps/client-ts/src/render/scene.ts": 1000,
    "apps/client-ts/src/app/state.ts": 560,
    "apps/client-ts/src/app/network-events.ts": 400,
    "apps/client-ts/src/input/mouse-input.ts": 560,
    "apps/client-ts/src/ui/map/MapModal.ts": 400,
    "apps/client-ts/src/ui/build-menu/BuildMenu.ts": 560,
    "apps/server-ts/src/runtime/dispatch.ts": 560,
    "apps/client-ts/src/ui/chat/ChatManager.ts": 560,
    "apps/server-ts/src/domain/bots/BotShared.ts": 560,
    "apps/server-ts/src/runtime/bullet-runtime.ts": 560
};
const MAX_FUNCTION_LINES_OVERRIDES = {
    "apps/client-ts/src/render/scene.ts": 180,
    "apps/client-ts/src/render/scene-layers.ts": 180
};
const SOURCE_ROOTS = [
    "apps/client-ts/src",
    "apps/server-ts/src",
    "packages/protocol/src",
    "packages/sim-core/src"
];

const FUNCTION_START_PATTERNS = [
    /function\s+\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g,
    /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>\s*\{/g,
    /(?:public|private|protected)?\s*(?:readonly\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g
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

const countLines = (text) => text.split("\n").length;

const getFunctionLengths = (text) => {
    const lengths = [];
    for (const pattern of FUNCTION_START_PATTERNS) {
        pattern.lastIndex = 0;
        for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
            const bodyStart = match.index + match[0].length;
            let end = bodyStart;
            let depth = 1;
            while (end < text.length && depth > 0) {
                const char = text[end];
                if (char === "{") {
                    depth += 1;
                } else if (char === "}") {
                    depth -= 1;
                }
                end += 1;
            }
            const slice = text.slice(match.index, Math.max(match.index, end));
            lengths.push(countLines(slice));
        }
    }
    return lengths;
};

const files = await collectSourceFiles();

const reportRows = [];
for (const file of files) {
    const text = await readFile(file, "utf8");
    const functionLengths = getFunctionLengths(text);
    const fileLines = countLines(text);
    const maxFunctionLines = functionLengths.length > 0 ? Math.max(...functionLengths) : 0;

    reportRows.push({
        file,
        fileLines,
        functionCount: functionLengths.length,
        maxFunctionLines
    });
}

reportRows.sort((a, b) => b.maxFunctionLines - a.maxFunctionLines || b.fileLines - a.fileLines);

const fileLimitExceeded = reportRows.filter((row) => row.fileLines > (MAX_FILE_LINES_OVERRIDES[row.file] ?? MAX_FILE_LINES));
const functionLimitExceeded = reportRows.filter(
    (row) => row.maxFunctionLines > (MAX_FUNCTION_LINES_OVERRIDES[row.file] ?? MAX_FUNCTION_LINES)
);

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        files: reportRows.length,
        maxFileLines: reportRows.reduce((max, row) => Math.max(max, row.fileLines), 0),
        maxFunctionLines: reportRows.reduce((max, row) => Math.max(max, row.maxFunctionLines), 0),
        fileLimitExceeded: fileLimitExceeded.length,
        functionLimitExceeded: functionLimitExceeded.length
    },
    thresholds: {
        maxFileLines: MAX_FILE_LINES,
        maxFunctionLines: MAX_FUNCTION_LINES
    },
    worstFiles: reportRows.slice(0, 20)
};

console.log(JSON.stringify(report, null, 4));

if (process.argv.includes("--strict") && (fileLimitExceeded.length > 0 || functionLimitExceeded.length > 0)) {
    process.exit(1);
}
