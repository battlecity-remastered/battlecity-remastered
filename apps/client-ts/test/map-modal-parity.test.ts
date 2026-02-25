import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    MAP_MODAL_TILE_SIZE,
    collectMapModalMarkers,
    projectTileToMapPixel,
    projectWorldToMapPixel,
    renderMapModalCanvas,
    resolveFootprintCenterPixel,
    resolveMapTerrainColor
} from "../src/ui/map/MapModal.js";

test("map modal terrain colors and coordinate projection are deterministic", () => {
    assert.equal(MAP_MODAL_TILE_SIZE, 2);
    assert.equal(resolveMapTerrainColor(0), "#16231d");
    assert.equal(resolveMapTerrainColor(1), "#6b5a45");
    assert.equal(resolveMapTerrainColor(2), "#7e6746");
    assert.equal(resolveMapTerrainColor(3), "#8f7757");

    assert.equal(projectTileToMapPixel(31), 62);
    assert.equal(projectWorldToMapPixel(1488), 62);

    const center = resolveFootprintCenterPixel(31, 31, 3, 3);
    assert.deepEqual(center, { x: 65, y: 65 });
});

test("map modal markers include structures, city markers, labels and players", () => {
    const state = createClientState();
    state.local.x = 1488;
    state.local.y = 1488;
    state.remotePlayers.set("r1", {
        id: "r1",
        city: 1,
        direction: 0,
        x: 3000,
        y: 2400
    });
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "p1",
        cityId: 0,
        type: 300,
        tileX: 31,
        tileY: 31,
        health: 100,
        maxHealth: 100,
        population: 0
    });
    state.defenses.set("d1", {
        id: "d1",
        cityId: 0,
        type: 900,
        tileX: 34,
        tileY: 33,
        health: 100,
        maxHealth: 100
    });

    const markers = collectMapModalMarkers(state);
    assert.equal(markers.buildings.length, 1);
    assert.deepEqual(markers.buildings[0], {
        x: 65,
        y: 65,
        radius: 2,
        color: "#7dd3fc"
    });

    assert.equal(markers.defenses.length, 1);
    assert.deepEqual(markers.defenses[0], {
        x: 69,
        y: 67,
        radius: 2,
        color: "#fb923c"
    });

    assert.ok(markers.cities.length >= 8);
    assert.ok(markers.cityLabels.some((label) => label.text === "C0"));
    assert.equal(markers.players.length, 2);
    assert.deepEqual(markers.players[0], {
        x: 63,
        y: 63,
        radius: 3,
        color: "#22d3ee"
    });
});

test("map modal canvas render draws terrain pixels and marker overlays", () => {
    const state = createClientState();
    state.local.x = 0;
    state.local.y = 0;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "p1",
        cityId: 0,
        type: 300,
        tileX: 1,
        tileY: 1,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    const mapData = {
        map: [
            [0, 1],
            [2, 3]
        ],
        blockingTiles: new Set<string>(),
        buildBlockingTiles: new Set<string>()
    };

    const operations: string[] = [];
    const context = {
        fillStyle: "",
        strokeStyle: "",
        font: "",
        textAlign: "left" as CanvasTextAlign,
        textBaseline: "top" as CanvasTextBaseline,
        lineWidth: 1,
        clearRect: (x: number, y: number, w: number, h: number) => {
            operations.push(`clear:${x},${y},${w},${h}`);
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
            operations.push(`fillRect:${x},${y},${w},${h}`);
        },
        fillText: (text: string, x: number, y: number) => {
            operations.push(`fillText:${text}:${x},${y}`);
        },
        beginPath: () => {
            operations.push("beginPath");
        },
        arc: (x: number, y: number, r: number) => {
            operations.push(`arc:${x},${y},${r}`);
        },
        fill: () => {
            operations.push("fill");
        },
        stroke: () => {
            operations.push("stroke");
        },
        strokeRect: (x: number, y: number, w: number, h: number) => {
            operations.push(`strokeRect:${x},${y},${w},${h}`);
        }
    };

    renderMapModalCanvas(context, mapData, state);

    assert.ok(operations.includes("clear:0,0,1024,1024"));
    assert.ok(operations.includes("fillRect:0,0,2,2"));
    assert.ok(operations.includes("fillRect:2,2,2,2"));
    assert.ok(operations.some((entry) => entry.startsWith("arc:")));
    assert.ok(operations.some((entry) => entry.startsWith("fillText:C0:")));
    assert.ok(operations.some((entry) => entry.startsWith("strokeRect:")));
});
