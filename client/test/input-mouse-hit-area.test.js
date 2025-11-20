import test from 'node:test';
import assert from 'node:assert/strict';

class StubContainer {
    constructor() {
        this.children = [];
        this.interactive = false;
        this.interactiveChildren = true;
        this.cursor = null;
        this.listeners = {};
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

const importInputs = () => import('../src/input/input-mouse-core.js');

const createGame = (maxMapX = 500, maxMapY = 400) => {
    const stage = {
        added: null,
        addChild(child) {
            this.added = child;
            return child;
        },
    };

    return {
        stage,
        maxMapX,
        maxMapY,
    };
};

test('interaction hit area matches the current map size', async () => {
    const { setupMouseInputsWithPixi } = await importInputs();
    const game = createGame(640, 360);
    const pixi = { Container: StubContainer, Rectangle: StubRectangle };

    setupMouseInputsWithPixi(game, pixi);

    assert.ok(game.interactionLayer instanceof StubContainer);
    assert.equal(game.interactionLayer.hitArea.width, 640);
    assert.equal(game.interactionLayer.hitArea.height, 360);
});

test('interaction hit area is refreshed when dimensions change', async () => {
    const { setupMouseInputsWithPixi } = await importInputs();
    const game = createGame(300, 200);
    const pixi = { Container: StubContainer, Rectangle: StubRectangle };

    setupMouseInputsWithPixi(game, pixi);

    game.maxMapX = 1280;
    game.maxMapY = 720;
    game.updateInteractionHitArea();

    assert.equal(game.interactionLayer.hitArea.width, 1280);
    assert.equal(game.interactionLayer.hitArea.height, 720);
});
