"use strict";

const fs = require("fs");

const stepDefinitions = [];
let WorldConstructor = class {};
const beforeHooks = [];
const afterHooks = [];

const defineStep = (pattern, handler) => {
    stepDefinitions.push({ pattern, handler });
};

const Given = defineStep;
const When = defineStep;
const Then = defineStep;

const setWorldConstructor = (ctor) => {
    WorldConstructor = ctor || WorldConstructor;
};

const Before = (handler) => {
    beforeHooks.push(handler);
};

const After = (handler) => {
    afterHooks.push(handler);
};

const parseFeatureFile = (filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const scenarios = [];
    let currentScenario = null;
    let pendingTags = [];

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            return;
        }
        if (line.startsWith("Feature:")) {
            return;
        }
        if (line.startsWith("@")) {
            pendingTags = pendingTags.concat(
                line
                    .split(/\s+/)
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .map((tag) => tag.replace(/^@/, ""))
            );
            return;
        }
        if (line.startsWith("Scenario:")) {
            if (currentScenario) {
                scenarios.push(currentScenario);
            }
            currentScenario = {
                name: line.slice("Scenario:".length).trim(),
                steps: [],
                tags: pendingTags
            };
            pendingTags = [];
            return;
        }
        if (!currentScenario) {
            return;
        }
        const prefixes = ["Given ", "When ", "Then ", "And ", "But "];
        for (const prefix of prefixes) {
            if (line.startsWith(prefix)) {
                const text = line.slice(prefix.length).trim();
                currentScenario.steps.push({
                    keyword: prefix.trim(),
                    text
                });
                return;
            }
        }
    });

    if (currentScenario) {
        scenarios.push(currentScenario);
    }

    return scenarios;
};

const matchStep = (text) => {
    for (const definition of stepDefinitions) {
        if (definition.pattern instanceof RegExp) {
            const matches = text.match(definition.pattern);
            if (matches) {
                return { definition, args: matches.slice(1) };
            }
        } else if (typeof definition.pattern === "string" && definition.pattern === text) {
            return { definition, args: [] };
        }
    }
    return null;
};

const runStep = async (world, step) => {
    const match = matchStep(step.text);
    if (!match) {
        throw new Error(`No step definition found for: ${step.text}`);
    }
    try {
        await match.definition.handler.apply(world, match.args);
    } catch (error) {
        if (error && error.name === "PendingStepError") {
            return { pending: true, reason: error.message };
        }
        throw error;
    }
};

const shouldIncludePending = process.argv.includes("--include-pending")
    || process.env.INCLUDE_PENDING === "1"
    || String(process.env.INCLUDE_PENDING || "").toLowerCase() === "true";

const SKIPPED_TAGS = new Set(
    ["pending", "todo", "wip", "skip", "spec-only", "known-bug"].filter((tag) => !(shouldIncludePending && tag === "pending"))
);

const runScenario = async (scenario) => {
    const shouldSkip = Array.isArray(scenario.tags) && scenario.tags.some((tag) => SKIPPED_TAGS.has(tag));
    if (shouldSkip) {
        const skippedTags = scenario.tags.filter((tag) => SKIPPED_TAGS.has(tag));
        console.log(`○ ${scenario.name} (skipped: ${skippedTags.join(", ")})`);
        return { skipped: true };
    }

    const world = new WorldConstructor();
    let failure = null;
    let pendingReason = null;
    try {
        for (const hook of beforeHooks) {
            await hook.call(world);
        }
        for (const step of scenario.steps) {
            const result = await runStep(world, step);
            if (result && result.pending) {
                pendingReason = result.reason || "pending";
                break;
            }
        }
    } catch (error) {
        failure = error;
    }

    try {
        for (const hook of afterHooks) {
            await hook.call(world);
        }
    } catch (hookError) {
        if (!failure) {
            failure = hookError;
        }
    }

    if (failure) {
        throw failure;
    }

    if (pendingReason) {
        return { skipped: false, pending: true, reason: pendingReason };
    }

    return { skipped: false };
};

const runFeatures = async (featurePaths) => {
    for (const featurePath of featurePaths) {
        const scenarios = parseFeatureFile(featurePath);
        for (const scenario of scenarios) {
            try {
                const result = await runScenario(scenario);
                if (result && result.pending) {
                    const reason = result.reason ? `: ${result.reason}` : "";
                    console.log(`○ ${scenario.name} (pending${reason})`);
                } else if (!(result && result.skipped)) {
                    console.log(`✔ ${scenario.name}`);
                }
            } catch (error) {
                console.error(`✖ ${scenario.name}`);
                console.error(error);
                throw error;
            }
        }
    }
};

class PendingStepError extends Error {

    constructor(message) {
        super(message || "Pending step");
        this.name = "PendingStepError";
    }
}

const Pending = (message) => {
    throw new PendingStepError(message);
};

module.exports = {
    defineStep,
    Given,
    When,
    Then,
    Before,
    After,
    Pending,
    setWorldConstructor,
    runFeatures
};
