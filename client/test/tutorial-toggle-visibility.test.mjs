import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import TutorialManager from '../src/ui/TutorialManager.js';

class MockElement {
    constructor(tag, ownerDocument) {
        this.tagName = tag.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.dataset = {};
        this.style = {};
        this.textContent = '';
        this.className = '';
        this.innerHTML = '';
        this._id = '';
        this.eventHandlers = {};
    }

    set id(value) {
        this._id = value;
        if (value && this.ownerDocument) {
            this.ownerDocument.registerElementId(value, this);
        }
    }

    get id() {
        return this._id;
    }

    appendChild(child) {
        this.children.push(child);
        if (child.id) {
            this.ownerDocument.registerElementId(child.id, child);
        }
        return child;
    }

    addEventListener(event, handler) {
        this.eventHandlers[event] = handler;
    }
}

class MockDocument {
    constructor() {
        this.elementsById = {};
        this.head = new MockElement('head', this);
        this.body = new MockElement('body', this);
    }

    createElement(tag) {
        return new MockElement(tag, this);
    }

    getElementById(id) {
        return this.elementsById[id] || null;
    }

    registerElementId(id, element) {
        if (!id) {
            return;
        }
        this.elementsById[id] = element;
    }
}

describe('Tutorial toggle visibility', () => {
    let tutorialManager;
    let mockGame;
    let mockDocument;
    let realDocument;
    let realWindow;

    beforeEach(() => {
        realDocument = globalThis.document;
        realWindow = globalThis.window;

        mockDocument = new MockDocument();
        const gameContainer = mockDocument.createElement('div');
        gameContainer.id = 'game';
        mockDocument.body.appendChild(gameContainer);

        let reloadCalled = false;
        globalThis.document = mockDocument;
        globalThis.window = {
            innerWidth: 1920,
            innerHeight: 1080,
            setTimeout,
            clearTimeout,
            location: {
                reload: () => { reloadCalled = true; }
            }
        };

        mockGame = { player: { points: 0 } };
        tutorialManager = new TutorialManager({ game: mockGame, autoShowDelayMs: 0 });
        tutorialManager._reloadCalled = () => reloadCalled;
    });

    afterEach(() => {
        if (realDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = realDocument;
        }
        if (realWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = realWindow;
        }
    });

    it('shows the tutorial toggle only when the player has zero points', () => {
        const toggle = mockDocument.getElementById('battlecity-tutorial-toggle');
        assert.ok(toggle, 'Toggle button should be created');
        assert.equal(toggle.dataset.visible, 'true', 'Toggle should be visible when points are zero');

        mockGame.player.points = 12;
        tutorialManager.handlePointsUpdate(12);
        assert.equal(toggle.dataset.visible, 'false', 'Toggle should hide after the player earns points');

        mockGame.player.points = 0;
        tutorialManager.handlePointsUpdate(0);
        assert.equal(toggle.dataset.visible, 'true', 'Toggle should reappear when points drop back to zero');
    });

    it('reloads the window when Exit Tutorial is clicked', () => {
        tutorialManager.show();
        const exitButton = findByText(tutorialManager.container, 'Exit Tutorial');
        assert.ok(exitButton, 'Exit button should be rendered');

        const handler = exitButton.eventHandlers.click;
        assert.ok(typeof handler === 'function', 'Exit button should have click handler');
        handler();

        assert.equal(tutorialManager._reloadCalled(), true, 'Reload should be invoked on Exit click');
    });
});

const findByText = (root, text) => {
    if (!root) {
        return null;
    }
    if (root.textContent === text) {
        return root;
    }
    if (!Array.isArray(root.children)) {
        return null;
    }
    for (const child of root.children) {
        const found = findByText(child, text);
        if (found) {
            return found;
        }
    }
    return null;
};
