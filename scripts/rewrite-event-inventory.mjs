#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const EVENT_REGEX = /\b(?:socket|io|this\.io|target|targetSocket|emitter)\.(?:on|emit)\(\s*['"]([^'"]+)['"]/g;
const EVENT_TYPE_REGEX = /"([^"]+)"/g;

const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        if (result.error?.code === "ENOENT") {
            throw new Error(`Command not found: ${cmd}`);
        }
        const stderr = result.stderr?.trim();
        throw new Error(stderr || `Command failed: ${cmd} ${args.join(" ")}`);
    }
    return result.stdout;
};

const SOURCE_ROOTS = [
    "apps/client-ts/src",
    "apps/server-ts/src",
    "packages/protocol/src",
    "packages/sim-core/src"
];

const walkFiles = async (root, out) => {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            await walkFiles(fullPath, out);
            continue;
        }
        if (entry.isFile() && (fullPath.endsWith(".ts") || fullPath.endsWith(".js") || fullPath.endsWith(".mjs"))) {
            out.push(fullPath);
        }
    }
};

const collectSourceFiles = async () => {
    try {
        const fileListRaw = run("rg", ["--files", ...SOURCE_ROOTS]);
        return fileListRaw.split("\n").filter(Boolean);
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

const collectSocketEvents = (text) => {
    const events = new Set();
    let match = EVENT_REGEX.exec(text);
    while (match) {
        events.add(match[1]);
        match = EVENT_REGEX.exec(text);
    }
    return events;
};

const collectProtocolEventTypes = (text) => {
    const marker = "export const EventType = Schema.Literal(";
    const start = text.indexOf(marker);
    if (start < 0) {
        return new Set();
    }
    const end = text.indexOf(");", start);
    if (end < 0) {
        return new Set();
    }
    const block = text.slice(start, end);
    const events = new Set();
    let match = EVENT_TYPE_REGEX.exec(block);
    while (match) {
        events.add(match[1]);
        match = EVENT_TYPE_REGEX.exec(block);
    }
    return events;
};

const files = await collectSourceFiles();
const socketEvents = new Set();

for (const file of files) {
    const text = await readFile(file, "utf8");
    const events = collectSocketEvents(text);
    for (const event of events) {
        socketEvents.add(event);
    }
}

const envelopeSource = await readFile("packages/protocol/src/envelope.ts", "utf8");
const protocolEvents = collectProtocolEventTypes(envelopeSource);

const missingInProtocol = [...socketEvents].filter((event) => !protocolEvents.has(event)).sort();
const protocolOnly = [...protocolEvents].filter((event) => !socketEvents.has(event)).sort();

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        totalSocketEvents: socketEvents.size,
        totalProtocolEvents: protocolEvents.size,
        missingInProtocol: missingInProtocol.length,
        protocolOnly: protocolOnly.length
    },
    missingInProtocol,
    protocolOnly
};

console.log(JSON.stringify(report, null, 4));

if (process.argv.includes("--strict") && missingInProtocol.length > 0) {
    process.exit(1);
}
