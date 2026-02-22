#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const EVENT_REGEX = /\b(?:socket|io|this\.io|target|targetSocket|emitter)\.(?:on|emit)\(\s*['"]([^'"]+)['"]/g;
const EVENT_TYPE_REGEX = /"([^"]+)"/g;

const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        const stderr = result.stderr?.trim();
        throw new Error(stderr || `Command failed: ${cmd} ${args.join(" ")}`);
    }
    return result.stdout;
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

const fileListRaw = run("rg", ["--files", "client/src", "server", "apps/client-ts/src", "apps/server-ts/src"]);
const files = fileListRaw.split("\n").filter(Boolean);
const legacyEvents = new Set();

for (const file of files) {
    const text = await readFile(file, "utf8");
    const events = collectSocketEvents(text);
    for (const event of events) {
        legacyEvents.add(event);
    }
}

const envelopeSource = await readFile("packages/protocol/src/envelope.ts", "utf8");
const protocolEvents = collectProtocolEventTypes(envelopeSource);

const missingInProtocol = [...legacyEvents].filter((event) => !protocolEvents.has(event)).sort();
const protocolOnly = [...protocolEvents].filter((event) => !legacyEvents.has(event)).sort();

const report = {
    generatedAt: new Date().toISOString(),
    summary: {
        totalSocketEvents: legacyEvents.size,
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
