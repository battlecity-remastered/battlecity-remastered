"use strict";

const fs = require("fs");
const path = require("path");
const { runFeatures } = require("./localCucumber.js");

const stepFiles = [
    path.join(__dirname, "support", "world.js"),
    path.join(__dirname, "steps", "cityAssignments.steps.js"),
    path.join(__dirname, "steps", "bugReports.steps.js"),
    path.join(__dirname, "steps", "buildingCollision.steps.js"),
    path.join(__dirname, "steps", "defenseReplenishment.steps.js"),
    path.join(__dirname, "steps", "factoryCaps.steps.js")
];

stepFiles.forEach((filePath) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(filePath);
});

const parseTags = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^@/, ""))
        .filter(Boolean);
};

const argv = process.argv.slice(2);
let cliTags = [];
for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tags" || arg === "-t") {
        const value = argv[index + 1];
        if (value) {
            cliTags = cliTags.concat(parseTags(value));
            index += 1;
        }
    }
}

const envTags = parseTags(process.env.TAGS || "");
const tagFilter = cliTags.length ? cliTags : envTags;

const featureFiles = fs.readdirSync(__dirname)
    .filter((entry) => entry.endsWith(".feature"))
    .map((entry) => path.join(__dirname, entry));

global.__tagFilter = tagFilter;

runFeatures(featureFiles).catch((error) => {
    process.exitCode = 1;
    console.error(error);
});
