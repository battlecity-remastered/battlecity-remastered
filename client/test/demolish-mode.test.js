"use strict";

import test from "node:test";
import assert from "node:assert/strict";

class StubContainer {
    constructor() {
        this.children = [];
        this.listeners = {};
        this.cursor = null;
    }

    addChild(child) {
        this.children.push(child);
        return child;
    }

    on(eventName, handler) {
        this.listeners[eventName] = handler;
        return this;
    }
}

class StubRectangle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

const importInputs = () => import("../src/input/input-mouse-core.js");

const createBaseGame = () => ({
    stage: {
        added: null,
        cursor: "cursor",
        addChild(child) {
            this.added = child;
            return child;
        },
    },
    maxMapX: 512,
    maxMapY: 512,
    player: {
        isMayor: true,
        offset: { x: 0, y: 0 },
        defaultOffset: { x: 0, y: 0 },
    },
    map: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    tiles: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    clearPanelMessage: () => {},
});

const buildEvent = (x, y) => ({
    data: {
        global: { x, y },
        originalEvent: { preventDefault() {} },
    },
    stopPropagation() {},
});

test("demolition mode persists after successfully demolishing a building", async () => {
    const { setupMouseInputsWithPixi } = await importInputs();
    const game = createBaseGame();
    const calls = [];
    game.buildingFactory = {
        demolishBuilding(x, y) {
            calls.push({ x, y });
            return true;
        },
    };

    const pixi = { Container: StubContainer, Rectangle: StubRectangle };
    setupMouseInputsWithPixi(game, pixi);

    game.isDemolishing = true;
    game.stage.cursor = "demolish";
    game.interactionLayer.cursor = "demolish";

    game.interactionLayer.listeners.mousedown(buildEvent(48, 48));

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { x: 1, y: 1 });
    assert.equal(game.isDemolishing, true, "demolish mode should stay active");
    assert.equal(game.stage.cursor, "demolish");
    assert.equal(game.interactionLayer.cursor, "demolish");
});

test("demolition mode cancels when clicking an empty tile", async () => {
    const { setupMouseInputsWithPixi } = await importInputs();
    const game = createBaseGame();
    game.buildingFactory = {
        demolishBuilding() {
            return false;
        },
    };

    const pixi = { Container: StubContainer, Rectangle: StubRectangle };
    setupMouseInputsWithPixi(game, pixi);

    game.isDemolishing = true;
    game.stage.cursor = "demolish";
    game.interactionLayer.cursor = "demolish";

    game.interactionLayer.listeners.mousedown(buildEvent(96, 96));

    assert.equal(game.isDemolishing, false, "demolish mode should clear when no building is hit");
    assert.equal(game.stage.cursor, "cursor");
    assert.equal(game.interactionLayer.cursor, "cursor");
});
