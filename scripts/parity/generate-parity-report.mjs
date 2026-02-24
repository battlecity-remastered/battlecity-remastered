#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const CHECKLIST_PATH = "docs/parity-checklist.md";
const PROGRESS_PATH = "docs/rewrite-progress.md";
const OUTPUT_PATH = "parity-report.json";

const toAssertion = (id, passed, detail) => ({ id, passed, detail });

const parseUncheckedChecklistItems = (markdown) => {
    return markdown
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- [ ]"))
        .map((line) => line.slice(5).trim());
};

const parsePhaseStatuses = (markdown) => {
    const rows = markdown
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\|\s*\d+\s*\|/.test(line));

    return rows.map((row) => {
        const columns = row.split("|").map((value) => value.trim()).filter(Boolean);
        return {
            phase: Number(columns[0]),
            status: columns[2] ?? "unknown"
        };
    });
};

const run = async () => {
    const [checklistMarkdown, progressMarkdown] = await Promise.all([
        readFile(CHECKLIST_PATH, "utf8"),
        readFile(PROGRESS_PATH, "utf8")
    ]);

    const uncheckedChecklist = parseUncheckedChecklistItems(checklistMarkdown);
    const phaseStatuses = parsePhaseStatuses(progressMarkdown);
    const incompletePhases = phaseStatuses.filter((row) => row.status !== "done");

    const assertions = [
        toAssertion(
            "checklist-all-checked",
            uncheckedChecklist.length === 0,
            uncheckedChecklist.length === 0
                ? "All parity checklist items are checked"
                : `Unchecked items: ${uncheckedChecklist.length}`
        ),
        toAssertion(
            "rewrite-phases-all-done",
            incompletePhases.length === 0,
            incompletePhases.length === 0
                ? "All rewrite phases are marked done"
                : `Pending phases: ${incompletePhases.map((row) => row.phase).join(", ")}`
        )
    ];

    const failed = assertions.filter((assertion) => !assertion.passed);
    const report = {
        generatedAt: new Date().toISOString(),
        summary: {
            assertions: assertions.length,
            failed: failed.length
        },
        assertions,
        unresolvedChecklist: uncheckedChecklist,
        incompletePhases
    };

    await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));

    if (process.argv.includes("--strict") && failed.length > 0) {
        process.exit(1);
    }
};

await run();
