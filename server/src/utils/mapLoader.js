"use strict";

const fs = require('fs');
const path = require('path');

const MAP_SIZE = 512;

const MAP_DATA_PATH = path.resolve(__dirname, '../../../client/data/map.dat');

const ensureBuffer = (data) => {
    if (!data) {
        return null;
    }
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (typeof data === 'string') {
        return Buffer.from(data, 'binary');
    }
    return Buffer.from(data);
};

const buildEmptyMap = () => {
    const map = new Array(MAP_SIZE);
    for (let x = 0; x < MAP_SIZE; x += 1) {
        map[x] = new Array(MAP_SIZE);
        for (let y = 0; y < MAP_SIZE; y += 1) {
            map[x][y] = 0;
        }
    }
    return map;
};

const decodeMapBuffer = (buffer) => {
    const map = buildEmptyMap();
    if (!buffer || !buffer.length) {
        return map;
    }
    const view = new Uint8Array(buffer);
    const total = MAP_SIZE * MAP_SIZE;
    if (view.length < total) {
        return map;
    }
    for (let x = 0; x < MAP_SIZE; x += 1) {
        for (let y = 0; y < MAP_SIZE; y += 1) {
            const sourceX = (MAP_SIZE - 1) - y;
            const sourceY = (MAP_SIZE - 1) - x;
            const index = sourceX + (sourceY * MAP_SIZE);
            map[x][y] = view[index] ?? 0;
        }
    }
    return map;
};

const loadMapData = () => {
    let buffer = null;
    try {
        buffer = fs.readFileSync(MAP_DATA_PATH);
    } catch (error) {
        console.warn(`Failed to read map data from ${MAP_DATA_PATH}: ${error.message}`);
    }
    const decoded = decodeMapBuffer(ensureBuffer(buffer));
    return {
        map: decoded
    };
};

module.exports = {
    MAP_SIZE,
    loadMapData
};
