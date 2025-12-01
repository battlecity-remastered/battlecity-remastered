"use strict";

const fs = require("fs");
const path = require("path");
const { runFeatures } = require("./localCucumber.js");

const stepFiles = [
    path.join(__dirname, "support", "world.js"),
    path.join(__dirname, "steps", "cityAssignments.steps.js")
];

stepFiles.forEach((filePath) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(filePath);
});

const featureFiles = fs.readdirSync(__dirname)
    .filter((entry) => entry.endsWith(".feature"))
    .map((entry) => path.join(__dirname, entry));

runFeatures(featureFiles).catch((error) => {
    process.exitCode = 1;
    console.error(error);
});
