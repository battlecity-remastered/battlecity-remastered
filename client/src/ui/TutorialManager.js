import {
    BUILDING_COMMAND_CENTER,
    CAN_BUILD_BOMB_FACTORY,
    CAN_BUILD_HOUSE,
    CAN_BUILD_LASER_FACTORY,
    CAN_BUILD_LASER_RESEARCH,
    CAN_BUILD_ORB_FACTORY,
    CAN_BUILD,
    CANT_BUILD,
    DEFAULT_CITY_CAN_BUILD,
    ITEM_TYPE_BOMB,
    ITEM_TYPE_LASER,
    ITEM_TYPE_ORB,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_TURRET,
} from "../constants.js";
import { triggerCameraShake } from "../effects/camera-shake.js";
import IntroModal from "./IntroModal.js";

const TILE_SIZE_PX = 48;
const { clearTimeout } = globalThis;
const TRAINING_MAP_SIZE = 64;
const clampTile = (value, max) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const upper = Number.isFinite(max) ? max : value;
    return Math.max(0, Math.min(upper, Math.floor(value)));
};

class TutorialManager {
    constructor(options = {}) {
        this.game = options.game || null;
        this.storageKey = options.storageKey || 'battlecity-tutorial-v1';
        this.autoShowDelayMs = Number.isFinite(options.autoShowDelayMs) ? options.autoShowDelayMs : 1200;
        this.steps = [
            {
                id: 'move_keys',
                title: 'Move your tank',
                detail: 'Press the arrow keys to move.',
                event: 'move_keys',
            },
            {
                id: 'build_menu',
                title: 'Open the build menu',
                detail: 'Left-click the map to reveal your city build menu.',
                event: 'build_menu_opened',
            },
            {
                id: 'laser_research',
                title: 'Place a laser research center',
                detail: 'Build the laser research center so you can unlock heavy weapons.',
                event: 'laser_research_built',
            },
            {
                id: 'laser_factory',
                title: 'Place the laser factory',
                detail: 'Wait for the research to complete, and then build a lazer factory.',
                event: 'laser_factory_built',
            },
            {
                id: 'pickup_laser',
                title: 'Pick up the laser',
                detail: 'Drive onto the laser factory and press U to load it into your tank.',
                event: 'laser_picked_up',
            },
            {
                id: 'destroy_training_turret',
                title: 'Destroy the practice turret',
                detail: 'Point at the turret and press shift to shoot; tutorial turrets are defenseless.',
                event: 'training_turret_destroyed',
            },
            {
                id: 'pickup_orb',
                title: 'Pick up the orbing essentials',
                detail: 'Grab the Orb and bombs so you can level the city.',
                event: 'tutorial_orb_collected',
            },
            {
                id: 'fake_orb',
                title: 'Orb a dummy command center',
                detail: 'Drop a bomb next to a house with B, then drive onto the CC and press O.',
                event: 'tutorial_orb_detonated',
            }
        ];
        this.state = this.loadState();
        this.lastToggleVisibility = null;
        this.injectStyles();
        this.container = this.createContainer();
        this.trainingScenario = {
            active: false,
            turretId: null,
            orbTargetCenter: null,
            orbTargetTile: null,
            orbFactoryId: null,
            bombFactoryId: null,
            anchorTile: null,
            offline: false,
            networkPaused: false,
            cleanup: {
                icons: [],
                items: [],
                buildings: [],
                timers: [],
            },
            pickups: {
                orb: false,
                bomb: false,
            }
        };

        // Always start hidden; surface a toggle for players who haven't finished the tutorial.
        this.pendingAutoShow = false;
        this.state.hidden = true;

        this.render();
    }

    loadState() {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
            return { completed: new Set(), hidden: false };
        }
        try {
            const raw = window.localStorage.getItem(this.storageKey);
            if (!raw) {
                return { completed: new Set(), hidden: false };
            }
            const parsed = JSON.parse(raw);
            const completed = new Set(Array.isArray(parsed.completed) ? parsed.completed : []);
            const hidden = parsed.hidden === true;
            return { completed, hidden };
        } catch (error) {
            console.warn('Failed to load tutorial state', error);
            return { completed: new Set(), hidden: false };
        }
    }

    saveState() {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
            return;
        }
        try {
            const payload = {
                completed: Array.from(this.state.completed || []),
                hidden: this.state.hidden || false,
            };
            window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
        } catch (error) {
            console.warn('Failed to persist tutorial state', error);
        }
    }

    injectStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-tutorial-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-tutorial-styles';
        style.textContent = `
            #battlecity-tutorial-wrapper {
                position: fixed;
                left: 18px;
                bottom: 18px;
                z-index: 1300;
                color: #e7edff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                max-width: 360px;
            }
            #battlecity-tutorial-card {
                background: linear-gradient(145deg, rgba(10, 16, 38, 0.96), rgba(16, 24, 52, 0.96));
                border: 1px solid rgba(104, 134, 210, 0.5);
                box-shadow: 0 22px 50px rgba(4, 10, 24, 0.6);
                border-radius: 14px;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                backdrop-filter: blur(6px);
            }
            #battlecity-tutorial-card h3 {
                margin: 0;
                font-size: 15px;
                letter-spacing: 0.4px;
                color: #f7fbff;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #battlecity-tutorial-card p {
                margin: 0;
                font-size: 13px;
                line-height: 1.5;
                color: rgba(231, 237, 255, 0.82);
            }
            .battlecity-tutorial-steps {
                margin: 0;
                padding: 0;
                list-style: none;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .battlecity-tutorial-step {
                display: grid;
                grid-template-columns: 22px 1fr;
                gap: 8px;
                align-items: start;
                padding: 10px 12px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
            }
            .battlecity-tutorial-step[data-complete="true"] {
                background: rgba(98, 193, 129, 0.16);
                border-color: rgba(98, 193, 129, 0.6);
            }
            .battlecity-tutorial-step__icon {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, rgba(62, 110, 221, 0.9), rgba(73, 138, 255, 0.9));
                color: #f4f7ff;
                font-weight: 700;
                font-size: 12px;
                box-shadow: 0 6px 14px rgba(23, 52, 128, 0.5);
            }
            .battlecity-tutorial-step[data-complete="true"] .battlecity-tutorial-step__icon {
                background: linear-gradient(135deg, rgba(68, 188, 128, 0.96), rgba(52, 160, 112, 0.92));
            }
            .battlecity-tutorial-step__title {
                margin: 0;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.2px;
                color: #f1f6ff;
            }
            .battlecity-tutorial-step__detail {
                margin: 2px 0 0;
                font-size: 12px;
                line-height: 1.4;
                color: rgba(231, 237, 255, 0.78);
            }
            .battlecity-tutorial-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .battlecity-tutorial-chip {
                font-size: 11px;
                letter-spacing: 0.35px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 6px 10px;
                border-radius: 999px;
                color: rgba(231, 237, 255, 0.84);
            }
            .battlecity-tutorial-button {
                background: rgba(255, 255, 255, 0.09);
                border: 1px solid rgba(118, 143, 212, 0.7);
                color: #f2f7ff;
                border-radius: 10px;
                padding: 6px 10px;
                font-weight: 700;
                letter-spacing: 0.3px;
                cursor: pointer;
                transition: all 120ms ease;
            }
            .battlecity-tutorial-button:hover {
                background: rgba(255, 255, 255, 0.14);
                transform: translateY(-1px);
            }
            #battlecity-tutorial-toggle {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 1299;
                padding: 10px 14px;
                background: rgba(20, 28, 56, 0.92);
                color: #dfe8ff;
                border: 1px solid rgba(104, 134, 210, 0.5);
                border-radius: 12px;
                cursor: pointer;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                letter-spacing: 0.3px;
                display: none;
                animation: battlecity-tutorial-pulse 1.4s ease-in-out infinite;
            }
            #battlecity-tutorial-toggle[data-visible="true"] {
                display: block;
            }
            @keyframes battlecity-tutorial-pulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(118, 143, 212, 0.65);
                    transform: translateY(0);
                }
                55% {
                    box-shadow: 0 0 0 12px rgba(118, 143, 212, 0);
                    transform: translateY(-1px);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(118, 143, 212, 0);
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    createContainer() {
        if (typeof document === 'undefined') {
            return null;
        }
        let wrapper = document.getElementById('battlecity-tutorial-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'battlecity-tutorial-wrapper';
            const gameContainer = document.getElementById('game');
            if (gameContainer) {
                gameContainer.appendChild(wrapper);
            } else {
                document.body.appendChild(wrapper);
            }
        }
        let toggle = document.getElementById('battlecity-tutorial-toggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.id = 'battlecity-tutorial-toggle';
            toggle.textContent = 'Show Tutorial';
            toggle.addEventListener('click', () => this.startTrainingSession());
            const gameContainer = document.getElementById('game');
            if (gameContainer) {
                gameContainer.appendChild(toggle);
            } else {
                document.body.appendChild(toggle);
            }
        }
        return wrapper;
    }

    getToggleButton() {
        if (typeof document === 'undefined') {
            return null;
        }
        return document.getElementById('battlecity-tutorial-toggle');
    }

    isComplete(stepId) {
        return this.state.completed instanceof Set && this.state.completed.has(stepId);
    }

    hasFinishedTutorial() {
        if (!Array.isArray(this.steps) || !(this.state.completed instanceof Set)) {
            return false;
        }
        return this.steps.every((step) => this.state.completed.has(step.id));
    }

    shouldShowToggle() {
        const player = this.game?.player;
        if (!player) {
            return false;
        }
        const rankTitle = typeof player.rankTitle === 'string' ? player.rankTitle.trim().toLowerCase() : '';
        const points = Number.isFinite(player.points) ? player.points : null;
        const isPrivate = rankTitle === 'private';
        const hasNoPoints = points === 0;
        return isPrivate && hasNoPoints;
    }

    handlePlayerProfileUpdate() {
        const shouldShowToggle = this.shouldShowToggle();
        if (shouldShowToggle === this.lastToggleVisibility) {
            return;
        }
        this.render();
    }

    isOfflineTrainingActive() {
        return !!(this.trainingScenario?.active && this.trainingScenario.offline);
    }

    recordEvent(eventName) {
        if (!eventName) {
            return;
        }
        const step = this.steps.find((candidate) => candidate.event === eventName);
        if (!step) {
            return;
        }
        if (!this.trainingScenario.active && step.id !== 'build_menu') {
            return;
        }
        this.completeStep(step.id);
    }

    completeStep(stepId) {
        if (!(this.state.completed instanceof Set)) {
            this.state.completed = new Set();
        }
        if (this.state.completed.has(stepId)) {
            return;
        }
        this.state.completed.add(stepId);
        this.state.hidden = false;
        this.saveState();
        this.render();
        this.handleStepProgression(stepId);
    }

    hide() {
        this.state.hidden = true;
        this.saveState();
        this.render();
    }

    show() {
        this.state.hidden = false;
        this.saveState();
        this.render();
    }

    reset() {
        this.state = { completed: new Set(), hidden: true };
        this.pendingAutoShow = false;
        this.cleanupTrainingEntities();
        this.trainingScenario.active = false;
        this.saveState();
        this.render();
    }

    pauseNetworking() {
        if (!this.game?.socketListener) {
            return;
        }
        if (this.trainingScenario.networkPaused) {
            return;
        }
        this.trainingScenario.networkPaused = true;
        if (typeof this.game.socketListener.disconnectSocket === 'function') {
            this.game.socketListener.disconnectSocket();
        }
        this.hideHud();
    }

    resumeNetworking() {
        if (!this.trainingScenario.networkPaused || !this.game?.socketListener) {
            return;
        }
        this.trainingScenario.networkPaused = false;
        if (typeof this.game.socketListener.reconnect === 'function') {
            this.game.socketListener.reconnect();
        }
        this.restoreHud();
    }

    shouldAutoShow() {
        const hasCompletedAny = this.state.completed instanceof Set && this.state.completed.size > 0;
        return this.pendingAutoShow && !this.state.hidden && !hasCompletedAny;
    }

    scheduleAutoShow() {
        if (typeof window === 'undefined') {
            return;
        }
        if (!this.shouldAutoShow()) {
            return;
        }
        window.setTimeout(() => {
            if (this.shouldAutoShow()) {
                this.show();
                this.pendingAutoShow = false;
            }
        }, this.autoShowDelayMs);
    }

    renderSteps(container) {
        container.innerHTML = '';
        this.steps.forEach((step, index) => {
            const li = document.createElement('li');
            li.className = 'battlecity-tutorial-step';
            li.dataset.complete = this.isComplete(step.id) ? 'true' : 'false';

            const icon = document.createElement('div');
            icon.className = 'battlecity-tutorial-step__icon';
            icon.textContent = this.isComplete(step.id) ? '✓' : index + 1;

            const body = document.createElement('div');

            const title = document.createElement('p');
            title.className = 'battlecity-tutorial-step__title';
            title.textContent = step.title;

            const detail = document.createElement('p');
            detail.className = 'battlecity-tutorial-step__detail';
            detail.textContent = step.detail;

            body.appendChild(title);
            body.appendChild(detail);

            li.appendChild(icon);
            li.appendChild(body);
            container.appendChild(li);
        });
    }

    render() {
        if (!this.container) {
            return;
        }
        const toggle = this.getToggleButton();
        const allComplete = this.steps.every((step) => this.isComplete(step.id));
        const shouldShowToggle = this.shouldShowToggle();
        this.lastToggleVisibility = shouldShowToggle;

        this.container.innerHTML = '';

        if (this.state.hidden) {
            if (toggle) {
                toggle.dataset.visible = shouldShowToggle ? 'true' : 'false';
            }
            return;
        }

        if (toggle) {
            toggle.dataset.visible = 'false';
        }

        const card = document.createElement('div');
        card.id = 'battlecity-tutorial-card';

        const heading = document.createElement('h3');
        heading.textContent = allComplete ? 'Tutorial complete' : 'New Commander Tutorial';

        const intro = document.createElement('p');
        intro.textContent = allComplete
            ? 'Nice work. You opened the build menu, built the laser research + factory chain, armed a laser, shredded the turret, and executed a fake orb detonation.'
            : 'Follow these quick steps on the training map: build laser research and factory, pick up the laser, destroy the practice turret, then pick up and drop a fake orb onto a dummy command center.';

        const list = document.createElement('ul');
        list.className = 'battlecity-tutorial-steps';
        this.renderSteps(list);

        const actions = document.createElement('div');
        actions.className = 'battlecity-tutorial-actions';

        const restartButton = document.createElement('button');
        restartButton.className = 'battlecity-tutorial-button';
        restartButton.textContent = 'Restart Tutorial';
        restartButton.addEventListener('click', () => this.reset());

        const exitButton = document.createElement('button');
        exitButton.className = 'battlecity-tutorial-button';
        exitButton.textContent = 'Exit Tutorial';
        exitButton.addEventListener('click', () => this.returnToLobby('Exiting tutorial...'));

        actions.appendChild(restartButton);
        actions.appendChild(exitButton);

        card.appendChild(heading);
        card.appendChild(intro);
        card.appendChild(list);
        card.appendChild(actions);

        this.container.appendChild(card);
    }

    handleStepProgression(stepId) {
        if (!stepId) {
            return;
        }
        if (stepId === 'pickup_laser') {
            this.spawnCombatTurret();
        }
        if (stepId === 'destroy_training_turret') {
            this.spawnOrbDrill();
        }
        if (stepId === 'fake_orb' || stepId === 'tutorial_orb_detonated') {
            this.finishTutorial();
            return;
        }
        const allComplete = this.steps.every((step) => this.isComplete(step.id));
        if (allComplete) {
            this.finishTutorial();
        }
    }

    finishTutorial() {
        this.trainingScenario.active = false;
        this.state.hidden = true;
        this.saveState();
        this.returnToLobby('Tutorial complete. Returning to the lobby.');
        const timerId = (typeof window !== 'undefined')
            ? window.setTimeout(() => this.showCompletionModal(), 1100)
            : null;
        if (timerId) {
            this.registerTrainingTimer(timerId);
        }
        this.resumeNetworking();
        this.render();
    }

    startTrainingSession() {
        this.state.hidden = false;
        this.trainingScenario.active = true;
        this.trainingScenario.offline = true;
        this.pendingAutoShow = false;
        if (this.game?.player) {
            this.game.player.isMayor = true;
        }
        this.cleanupTrainingEntities();
        this.saveState();
        this.render();
        this.runWhenReady(() => {
            this.pauseNetworking();
            if (this.game?.lobby?.hide) {
                this.game.lobby.hide();
            }
            this.enterOfflineTrainingMap();
            this.prepareTrainingGround();
        });
    }

    hideHud() {
        if (typeof document === 'undefined') {
            return;
        }
        const chat = document.getElementById('battlecity-chat-container');
        if (chat) {
            chat.dataset.hiddenByTutorial = 'true';
            chat.style.display = 'none';
        }
        if (this.game) {
            if (this.game.orbHintElement) {
                this.trainingScenario.cachedOrbHintDisplay = this.game.orbHintElement.style.display;
                this.game.orbHintElement.style.display = 'none';
            }
            if (typeof this.game.updateOrbHint === 'function') {
                this.trainingScenario.originalUpdateOrbHint = this.game.updateOrbHint;
                this.game.updateOrbHint = () => {};
            }
        }
    }

    restoreHud() {
        if (typeof document === 'undefined') {
            return;
        }
        const chat = document.getElementById('battlecity-chat-container');
        if (chat && chat.dataset.hiddenByTutorial === 'true') {
            delete chat.dataset.hiddenByTutorial;
            chat.style.display = '';
        }
        if (this.game) {
            if (this.game.orbHintElement) {
                this.game.orbHintElement.style.display = this.trainingScenario.cachedOrbHintDisplay || 'none';
            }
            if (this.trainingScenario.originalUpdateOrbHint) {
                this.game.updateOrbHint = this.trainingScenario.originalUpdateOrbHint;
                this.trainingScenario.originalUpdateOrbHint = null;
            }
        }
    }

    skipTutorial() {
        this.returnToLobby('Tutorial skipped. Returning to the lobby.');
        this.state.hidden = true;
        this.saveState();
        this.render();
    }

    returnToLobby(message = 'Returning to the lobby...') {
        this.cleanupTrainingEntities();
        this.trainingScenario.active = false;
        this.trainingScenario.offline = false;
        this.resumeNetworking();
        this.restoreHud();
        if (this.game?.lobby?.completeReturnToLobby) {
            this.game.lobby.completeReturnToLobby({ message, type: 'info' });
        }
    }

    runWhenReady(callback, retries = 0) {
        const maxRetries = 30;
        if (!callback || typeof callback !== 'function' || !this.game || typeof window === 'undefined') {
            return;
        }
        if (this.game.player && this.game.itemFactory && this.game.iconFactory && this.game.buildingFactory) {
            callback();
            return;
        }
        if (retries >= maxRetries) {
            return;
        }
        window.setTimeout(() => this.runWhenReady(callback, retries + 1), 350);
    }

    cleanupTrainingEntities() {
        const registry = this.trainingScenario.cleanup || {};
        if (Array.isArray(registry.items) && this.game?.itemFactory?.deleteItem) {
            registry.items.forEach((item) => {
                if (item) {
                    this.game.itemFactory.deleteItem(item, { notifyServer: false, reason: 'tutorial_cleanup' });
                }
            });
        }
        if (Array.isArray(registry.icons) && this.game?.iconFactory?.deleteIcon) {
            registry.icons.forEach((icon) => {
                if (icon) {
                    this.game.iconFactory.deleteIcon(icon);
                }
            });
        }
        if (Array.isArray(registry.buildings) && this.game?.buildingFactory?.deleteBuilding) {
            registry.buildings.forEach((buildingId) => {
                const building = this.game.buildingFactory.getBuildingById(buildingId);
                if (building) {
                    this.game.buildingFactory.deleteBuilding(building, false, 'tutorial_cleanup');
                }
            });
        }
        if (Array.isArray(registry.timers)) {
            registry.timers.forEach((timerId) => {
                if (timerId) {
                    clearTimeout(timerId);
                }
            });
        }
        this.trainingScenario.cleanup = { icons: [], items: [], buildings: [], timers: [] };
        this.trainingScenario.turretId = null;
        this.trainingScenario.orbTargetCenter = null;
        this.trainingScenario.orbTargetTile = null;
        this.trainingScenario.orbFactoryId = null;
        this.trainingScenario.bombFactoryId = null;
        this.restoreHud();
        this.trainingScenario.pickups = { orb: false, bomb: false };
    }

    incrementCityPopulation(cityId, population = 0, housing = 0) {
        const cityIndex = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10) || 0;
        const cityState = Array.isArray(this.game?.cities) ? this.game.cities[cityIndex] : null;
        if (!cityState) {
            return;
        }
        const popIncrement = Number.isFinite(population) ? population : 0;
        const housingIncrement = Number.isFinite(housing) ? housing : 0;
        cityState.population = Math.max(0, (Number.isFinite(cityState.population) ? cityState.population : 0) + popIncrement);
        cityState.housing = Math.max(0, (Number.isFinite(cityState.housing) ? cityState.housing : 0) + housingIncrement);
    }

    seedFactoryProduction(building, { intervalMs = 2800, maxItems = 3 } = {}) {
        if (!building || !this.isOfflineTrainingActive() || typeof window === 'undefined') {
            return;
        }
        const productionTick = () => {
            if (!this.isOfflineTrainingActive()) {
                return;
            }
            const current = Number.isFinite(building.itemsLeft) ? building.itemsLeft : 0;
            if (current < maxItems) {
                building.itemsLeft = current + 1;
                if (typeof this.game?.buildingFactory?.syncFactoryItems === 'function') {
                    this.game.buildingFactory.syncFactoryItems(building);
                }
            }
            const timerId = window.setTimeout(productionTick, intervalMs);
            this.registerTrainingTimer(timerId);
        };
        const initialTimer = window.setTimeout(productionTick, intervalMs);
        this.registerTrainingTimer(initialTimer);
    }

    simulateResearchProgress(researchType, delayMs = 1600) {
        if (!this.isOfflineTrainingActive() || !this.game?.buildingFactory || typeof window === 'undefined') {
            return;
        }
        const cityId = this.game.player?.city ?? 0;
        const state = typeof this.game.buildingFactory.getResearchState === 'function'
            ? this.game.buildingFactory.getResearchState(cityId, researchType, { create: true })
            : null;
        const completeAt = Date.now() + delayMs;
        if (state) {
            state.state = 'pending';
            state.completeAt = completeAt;
            state.seenPending = true;
            state.notifiedComplete = false;
        }
        if (typeof this.game.buildingFactory.applyResearchState === 'function') {
            this.game.buildingFactory.applyResearchState(cityId, researchType, 'pending');
        }
        const timerId = window.setTimeout(() => {
            if (typeof this.game.buildingFactory.applyResearchState === 'function') {
                this.game.buildingFactory.applyResearchState(cityId, researchType, 'complete');
            }
            this.game.forceDraw = true;
        }, delayMs);
        this.registerTrainingTimer(timerId);
    }

    bootstrapOfflineCityState() {
        if (!this.game) {
            return;
        }
        const canBuild = {};
        Object.keys(DEFAULT_CITY_CAN_BUILD).forEach((key) => {
            const base = DEFAULT_CITY_CAN_BUILD[key];
            const isResearch = key.includes('_RESEARCH');
            const isFactory = key.includes('_FACTORY');
            if (isResearch) {
                canBuild[key] = CAN_BUILD;
            } else if (isFactory) {
                canBuild[key] = CANT_BUILD;
            } else {
                canBuild[key] = base;
            }
        });
        const cityState = {
            id: 0,
            name: 'Tutorial City',
            canBuild,
            cash: Number.MAX_SAFE_INTEGER,
            construction: 0,
            population: 50,
            housing: 50,
            updatedAt: Date.now(),
        };
        this.game.cities = [cityState];
        this.game.maxCities = 1;
        if (this.game.player) {
            this.game.player.city = 0;
        }
        if (this.game.buildingFactory) {
            this.game.buildingFactory.researchStatus = new Map();
            this.game.buildingFactory.researchTimers = new Map();
            if (typeof this.game.buildingFactory.recomputeCityBuildPermissions === 'function') {
                this.game.buildingFactory.recomputeCityBuildPermissions(0);
            }
        }
        this.game.otherPlayers = {};
        if (this.game.iconFactory?.removeUnownedIconsNear) {
            const anchor = this.getTrainingAnchorTile();
            const center = this.toWorldFromTile(anchor.x, anchor.y);
            this.game.iconFactory.removeUnownedIconsNear(center.x, center.y, ITEM_TYPE_LASER, 999, 720, null);
            this.game.iconFactory.removeUnownedIconsNear(center.x, center.y, ITEM_TYPE_BOMB, 999, 720, null);
            this.game.iconFactory.removeUnownedIconsNear(center.x, center.y, ITEM_TYPE_ORB, 999, 720, null);
            this.game.iconFactory.removeUnownedIconsNear(center.x, center.y, ITEM_TYPE_ROCKET, 999, 720, null);
        }
    }

    enterOfflineTrainingMap() {
        if (!this.game) {
            return;
        }
        this.bootstrapOfflineCityState();
        const dimension = TRAINING_MAP_SIZE;
        const map = [];
        const tiles = [];
        for (let x = 0; x < dimension; x += 1) {
            map[x] = [];
            tiles[x] = [];
            for (let y = 0; y < dimension; y += 1) {
                map[x][y] = 0;
                tiles[x][y] = 0;
            }
        }
        this.game.map = map;
        this.game.tiles = tiles;
        this.game.maxMapX = Math.max(window.innerWidth - 200, 0);
        this.game.maxMapY = Math.max(window.innerHeight, 0);
        if (typeof this.game.updateInteractionHitArea === 'function') {
            this.game.updateInteractionHitArea();
        }
        if (this.game.player) {
            const centerTile = Math.floor(dimension / 2);
            const center = this.toCenterFromTile(centerTile, centerTile);
            this.game.player.offset = { x: center.x, y: center.y };
            this.game.player.lastSafeOffset = { x: center.x, y: center.y };
        }
        this.game.forceDraw = true;
    }

    registerTrainingIcon(icon) {
        if (!icon) {
            return;
        }
        if (!Array.isArray(this.trainingScenario.cleanup.icons)) {
            this.trainingScenario.cleanup.icons = [];
        }
        this.trainingScenario.cleanup.icons.push(icon);
    }

    registerTrainingItem(item) {
        if (!item) {
            return;
        }
        if (!Array.isArray(this.trainingScenario.cleanup.items)) {
            this.trainingScenario.cleanup.items = [];
        }
        this.trainingScenario.cleanup.items.push(item);
    }

    registerTrainingBuilding(building) {
        if (!building || building.id === undefined || building.id === null) {
            return;
        }
        if (!Array.isArray(this.trainingScenario.cleanup.buildings)) {
            this.trainingScenario.cleanup.buildings = [];
        }
        this.trainingScenario.cleanup.buildings.push(building.id);
    }

    registerTrainingTimer(timerId) {
        if (!timerId) {
            return;
        }
        if (!Array.isArray(this.trainingScenario.cleanup.timers)) {
            this.trainingScenario.cleanup.timers = [];
        }
        this.trainingScenario.cleanup.timers.push(timerId);
    }

    getTrainingAnchorTile() {
        const mapWidth = Array.isArray(this.game?.map) ? this.game.map.length : 512;
        const mapHeight = Array.isArray(this.game?.map?.[0]) ? this.game.map[0].length : 512;
        const baseTileX = clampTile(Math.floor(mapWidth / 2), mapWidth - 1);
        const baseTileY = clampTile(Math.floor(mapHeight / 2), mapHeight - 1);
        return { x: baseTileX, y: baseTileY };
    }

    clearTrainingTiles(anchor, radius = 16) {
        if (!anchor || !this.game || !Array.isArray(this.game.map)) {
            return;
        }
        const startX = clampTile(anchor.x - radius, this.game.map.length - 1);
        const endX = clampTile(anchor.x + radius, this.game.map.length - 1);
        const startY = clampTile(anchor.y - radius, this.game.map[0].length - 1);
        const endY = clampTile(anchor.y + radius, this.game.map[0].length - 1);
        for (let x = startX; x <= endX; x += 1) {
            for (let y = startY; y <= endY; y += 1) {
                if (!this.game.map[x]) {
                    this.game.map[x] = [];
                }
                if (!this.game.tiles[x]) {
                    this.game.tiles[x] = [];
                }
                this.game.map[x][y] = 0;
                this.game.tiles[x][y] = 0;
                const existing = this.game.buildingFactory?.findBuildingAtTile(x, y);
                if (existing) {
                    this.game.buildingFactory.deleteBuilding(existing, false, 'tutorial_reset_zone');
                }
            }
        }
    }

    prepareTrainingGround() {
        this.cleanupTrainingEntities();
        const anchor = this.getTrainingAnchorTile();
        this.trainingScenario.anchorTile = anchor;
        this.clearTrainingTiles(anchor, 18);
        const startTile = { x: anchor.x + 2, y: anchor.y + 6 };
        const startCenter = this.toCenterFromTile(startTile.x, startTile.y);
        if (this.game?.player) {
            this.game.player.offset = { x: startCenter.x, y: startCenter.y };
            this.game.player.lastSafeOffset = { x: startCenter.x, y: startCenter.y };
        }
        this.game.forceDraw = true;
    }

    toWorldFromTile(tileX, tileY) {
        return {
            x: (clampTile(tileX) * TILE_SIZE_PX),
            y: (clampTile(tileY) * TILE_SIZE_PX),
        };
    }

    toCenterFromTile(tileX, tileY) {
        return {
            x: (clampTile(tileX) * TILE_SIZE_PX) + (TILE_SIZE_PX / 2),
            y: (clampTile(tileY) * TILE_SIZE_PX) + (TILE_SIZE_PX / 2),
        };
    }

    spawnCombatDrops() {
        const anchor = this.trainingScenario.anchorTile || this.getTrainingAnchorTile();
        const weaponTile = { x: anchor.x + 4, y: anchor.y + 6 };
        const weaponPosition = this.toWorldFromTile(weaponTile.x, weaponTile.y);

        if (this.game?.iconFactory?.newIcon) {
            const sharedDropOptions = {
                isSharedDrop: true,
                skipProductionUpdate: true,
                city: null,
                teamId: null,
                synced: false,
            };
            const bazooka = this.game.iconFactory.newIcon(null, weaponPosition.x, weaponPosition.y, ITEM_TYPE_ROCKET, sharedDropOptions);
            if (bazooka) {
                bazooka.tutorialTag = 'training_weapon';
                this.registerTrainingIcon(bazooka);
            }
            const laser = this.game.iconFactory.newIcon(null, weaponPosition.x + 48, weaponPosition.y - 48, ITEM_TYPE_LASER, sharedDropOptions);
            if (laser) {
                laser.tutorialTag = 'training_weapon';
                this.registerTrainingIcon(laser);
            }
        }
    }

    spawnCombatTurret() {
        if (this.trainingScenario.turretId) {
            return;
        }
        const anchor = this.trainingScenario.anchorTile || this.getTrainingAnchorTile();
        const turretTile = { x: anchor.x + 12, y: anchor.y + 2 };
        const turretPosition = this.toWorldFromTile(turretTile.x, turretTile.y);

        if (this.game?.itemFactory?.newItem) {
            const turret = this.game.itemFactory.newItem(null, turretPosition.x, turretPosition.y, ITEM_TYPE_TURRET, {
                notifyServer: false,
                snapToPlayer: false,
                teamId: -1,
            });
            if (turret) {
                turret.tutorialTag = 'combat_turret';
                turret.life = Math.min(20, turret.life ?? 20);
                this.trainingScenario.turretId = turret.id || 'tutorial_turret';
                this.registerTrainingItem(turret);
            }
        }
    }

    spawnOrbDrill() {
        const anchor = this.trainingScenario.anchorTile || this.getTrainingAnchorTile();
        const orbFactoryTile = { x: anchor.x + 6, y: anchor.y + 14 };
        const bombFactoryTile = { x: anchor.x + 14, y: anchor.y + 6 };
        const targetTile = { x: anchor.x + 12, y: anchor.y + 12 };
        if (this.game?.buildingFactory?.newBuilding) {
            const orbFactory = this.game.buildingFactory.newBuilding(null, orbFactoryTile.x, orbFactoryTile.y, CAN_BUILD_ORB_FACTORY, {
                notifyServer: false,
                id: 'tutorial_orb_factory',
                city: this.game.player?.city ?? 0,
                itemsLeft: 1,
            });
            if (orbFactory) {
                orbFactory.tutorialTag = 'tutorial_orb_factory';
                orbFactory.itemsLeft = 1;
                if (typeof this.game.buildingFactory.syncFactoryItems === 'function') {
                    this.game.buildingFactory.syncFactoryItems(orbFactory);
                }
                this.trainingScenario.orbFactoryId = orbFactory.id;
                this.registerTrainingBuilding(orbFactory);
            }

            const bombFactory = this.game.buildingFactory.newBuilding(null, bombFactoryTile.x, bombFactoryTile.y, CAN_BUILD_BOMB_FACTORY, {
                notifyServer: false,
                id: 'tutorial_bomb_factory',
                city: this.game.player?.city ?? 0,
                itemsLeft: 1,
            });
            if (bombFactory) {
                bombFactory.tutorialTag = 'tutorial_bomb_factory';
                bombFactory.itemsLeft = 1;
                if (typeof this.game.buildingFactory.syncFactoryItems === 'function') {
                    this.game.buildingFactory.syncFactoryItems(bombFactory);
                }
                this.trainingScenario.bombFactoryId = bombFactory.id;
                this.registerTrainingBuilding(bombFactory);
            }

            const cc = this.game.buildingFactory.newBuilding(null, targetTile.x, targetTile.y, BUILDING_COMMAND_CENTER, {
                notifyServer: false,
                id: 'tutorial_orb_target',
                city: this.game.player?.city ?? 0,
            });
            if (cc) {
                cc.tutorialTag = 'tutorial_orb_target';
                this.trainingScenario.orbTargetTile = targetTile;
                this.trainingScenario.orbTargetCenter = this.toCenterFromTile(targetTile.x + 1, targetTile.y + 1);
                this.registerTrainingBuilding(cc);
            }

            const houseOffsets = [
                { dx: -3, dy: 0 },
                { dx: 3, dy: 0 },
                { dx: 0, dy: -3 },
                { dx: 0, dy: 3 },
            ];
            houseOffsets.forEach((offset) => {
                const houseTileX = targetTile.x + offset.dx;
                const houseTileY = targetTile.y + offset.dy;
                const house = this.game.buildingFactory.newBuilding(null, houseTileX, houseTileY, CAN_BUILD_HOUSE, {
                    notifyServer: false,
                    id: `tutorial_house_${houseTileX}_${houseTileY}`,
                    city: this.game.player?.city ?? 0,
                });
                if (house) {
                    house.tutorialTag = 'tutorial_orb_house';
                    house.population = 20;
                    this.incrementCityPopulation(this.game.player?.city ?? 0, house.population, house.population);
                    this.registerTrainingBuilding(house);
                }
            });
        }

        // Icon drops are handled by itemsLeft via syncFactoryItems; no manual spawns here.
    }

    handleBuildingPlaced(building) {
        if (!building || !this.trainingScenario.active) {
            return;
        }
        if (building.type === CAN_BUILD_LASER_RESEARCH) {
            this.simulateResearchProgress(CAN_BUILD_LASER_RESEARCH);
            this.recordEvent('laser_research_built');
        }
        if (building.type === CAN_BUILD_LASER_FACTORY) {
            building.itemsLeft = 1;
            if (typeof this.game?.buildingFactory?.syncFactoryItems === 'function') {
                this.game.buildingFactory.syncFactoryItems(building);
            }
            this.recordEvent('laser_factory_built');
        }
        if (building.type === CAN_BUILD_HOUSE) {
            const pop = Number.isFinite(building.population) ? building.population : 6;
            building.population = pop;
            this.incrementCityPopulation(building.city ?? this.game.player?.city ?? 0, pop, pop);
        }
    }

    handleIconPickup(icon) {
        if (!icon) {
            return;
        }
        if (icon.type === ITEM_TYPE_LASER) {
            this.recordEvent('laser_picked_up');
        }
        this.registerPickup(icon);
    }

    handleItemDestroyed(item) {
        if (!item) {
            return;
        }
        if (item.tutorialTag === 'combat_turret' || item.type === ITEM_TYPE_TURRET) {
            this.trainingScenario.turretId = null;
            this.recordEvent('training_turret_destroyed');
        }
    }

    handleItemDrop(dropInfo, position, item) {
        if (!dropInfo || !position || !this.trainingScenario.orbTargetCenter || !this.trainingScenario.active) {
            return;
        }
        if (dropInfo.type === ITEM_TYPE_ORB) {
            const dx = position.x - this.trainingScenario.orbTargetCenter.x;
            const dy = position.y - this.trainingScenario.orbTargetCenter.y;
            const distanceSq = (dx * dx) + (dy * dy);
            const maxDistanceSq = 80 * 80;
            if (distanceSq > maxDistanceSq) {
                return;
            }

            if (this.game?.itemFactory?.spawnExplosion) {
                this.game.itemFactory.spawnExplosion(this.trainingScenario.orbTargetCenter.x, this.trainingScenario.orbTargetCenter.y);
            }
            triggerCameraShake(this.game, { intensity: 11, duration: 900 });
            this.recordEvent('tutorial_orb_detonated');
            if (item && this.game?.itemFactory?.deleteItem) {
                this.game.itemFactory.deleteItem(item, { notifyServer: false, reason: 'orb_detonated' });
            }
            return;
        }

        if (dropInfo.type === ITEM_TYPE_BOMB && this.isOfflineTrainingActive()) {
            const centerTileX = Math.floor((position.x + 24) / 48);
            const centerTileY = Math.floor((position.y + 24) / 48);
            if (this.game?.itemFactory?.detonateBombAt) {
                const timerId = window.setTimeout(() => {
                    this.game.itemFactory.detonateBombAt(centerTileX, centerTileY, {
                        notifyServer: false,
                        reportDemolish: false,
                        radiusOverride: 3,
                        spawnExplosion: true,
                    });
                }, 900);
                this.registerTrainingTimer(timerId);
            }
        }
    }

    registerPickup(payload) {
        if (!payload) {
            return;
        }
        const isOrb = payload.type === ITEM_TYPE_ORB || payload.tutorialTag === 'tutorial_orb';
        const isBomb = payload.type === ITEM_TYPE_BOMB || payload.tutorialTag === 'tutorial_bomb';
        if (isOrb) {
            this.trainingScenario.pickups.orb = true;
        }
        if (isBomb) {
            this.trainingScenario.pickups.bomb = true;
        }
        if (this.trainingScenario.pickups.orb && this.trainingScenario.pickups.bomb) {
            this.recordEvent('tutorial_orb_collected');
        }
    }

    showCompletionModal() {
        if (typeof window === 'undefined') {
            return;
        }
        const onStart = async () => {
            this.restoreHud();
            if (typeof window.location?.reload === 'function') {
                window.location.reload();
            }
        };
        new IntroModal({
            heading: "First city destroyed!",
            blurb: 'Use the Help button in-game to see every keyboard shortcut.',
            buttonLabel: 'Play Now',
            onStart,
        });
    }
}

export default TutorialManager;
