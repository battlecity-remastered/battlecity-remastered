import {
    BUILDING_COMMAND_CENTER,
    CAN_BUILD_ORB_FACTORY,
    ITEM_TYPE_LASER,
    ITEM_TYPE_ORB,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_TURRET,
} from "../constants.js";
import { triggerCameraShake } from "../effects/camera-shake.js";

const TILE_SIZE_PX = 48;
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
                id: 'build_menu',
                title: 'Open the build menu',
                detail: 'Left-click the map to reveal your city build menu.',
                event: 'build_menu_opened',
            },
            {
                id: 'place_building',
                title: 'Place a structure',
                detail: 'Select any structure and click to place it near your city.',
                event: 'building_placed',
            },
            {
                id: 'pickup_item',
                title: 'Collect a drop',
                detail: 'Drive over glowing loot and press U to pick up an item or icon.',
                event: 'item_picked',
            },
            {
                id: 'use_item',
                title: 'Deploy your gear',
                detail: 'Press D to drop your selected inventory item (B for bombs, O for orbs).',
                event: 'item_deployed',
            },
            {
                id: 'arm_heavy_weapon',
                title: 'Grab a bazooka or laser',
                detail: 'Loot the glowing crates near the turret to equip a bazooka (stationary) or laser (mobile) shot.',
                event: 'heavy_weapon_ready',
            },
            {
                id: 'destroy_training_turret',
                title: 'Destroy the practice turret',
                detail: 'Circle strafe the turret, time Shift shots between its salvo, and blow it up.',
                event: 'training_turret_destroyed',
            },
            {
                id: 'fake_orb',
                title: 'Orb a dummy command center',
                detail: 'Pick up the tutorial orb and drop it on the marked CC to trigger the detonation and screen shake.',
                event: 'tutorial_orb_detonated',
            }
        ];
        this.state = this.loadState();
        this.injectStyles();
        this.container = this.createContainer();
        this.trainingScenario = {
            turretId: null,
            orbTargetCenter: null,
            orbTargetTile: null,
            orbFactoryId: null,
        };

        // Only auto-pop the card for brand-new players; returning sessions keep the toggle hidden
        // state intact until the player explicitly opens it again.
        this.pendingAutoShow = !this.state.hidden
            && this.state.completed instanceof Set
            && this.state.completed.size === 0;

        if (this.pendingAutoShow) {
            this.state.hidden = true;
        }

        this.render();
        this.scheduleAutoShow();
        this.scheduleScenarioSetup();
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
                left: 18px;
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
            }
            #battlecity-tutorial-toggle[data-visible="true"] {
                display: block;
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
            toggle.addEventListener('click', () => this.show());
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

    recordEvent(eventName) {
        if (!eventName) {
            return;
        }
        const step = this.steps.find((candidate) => candidate.event === eventName);
        if (step) {
            this.completeStep(step.id);
        }
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
        this.state = { completed: new Set(), hidden: false };
        this.pendingAutoShow = true;
        this.saveState();
        this.render();
        this.scheduleAutoShow();
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

        this.container.innerHTML = '';

        if (this.state.hidden) {
            if (toggle) {
                toggle.dataset.visible = 'true';
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

        const chip = document.createElement('div');
        chip.className = 'battlecity-tutorial-chip';
        chip.textContent = allComplete ? 'You are mission-ready' : 'Build • Fight • Orb';

        const intro = document.createElement('p');
        intro.textContent = allComplete
            ? 'Nice work. You opened the build menu, placed a structure, collected loot, deployed gear, destroyed the turret, and executed a fake orb drop.'
            : 'Follow these quick steps to learn how to construct buildings, grab drops, deploy your equipment, shred a turret, and slam a practice orb onto a command center.';

        const list = document.createElement('ul');
        list.className = 'battlecity-tutorial-steps';
        this.renderSteps(list);

        const actions = document.createElement('div');
        actions.className = 'battlecity-tutorial-actions';

        const hideButton = document.createElement('button');
        hideButton.className = 'battlecity-tutorial-button';
        hideButton.textContent = allComplete ? 'Hide card' : 'Skip for now';
        hideButton.addEventListener('click', () => this.hide());

        const resetButton = document.createElement('button');
        resetButton.className = 'battlecity-tutorial-button';
        resetButton.textContent = 'Restart';
        resetButton.addEventListener('click', () => this.reset());

        actions.appendChild(chip);
        actions.appendChild(resetButton);
        actions.appendChild(hideButton);

        card.appendChild(heading);
        card.appendChild(intro);
        card.appendChild(list);
        card.appendChild(actions);

        this.container.appendChild(card);
    }

    scheduleScenarioSetup(retries = 0) {
        const maxRetries = 30;
        if (!this.game || typeof window === 'undefined') {
            return;
        }
        if (this.game.player && this.game.itemFactory && this.game.iconFactory && this.game.buildingFactory) {
            this.initialiseScenario();
            return;
        }
        if (retries >= maxRetries) {
            return;
        }
        window.setTimeout(() => this.scheduleScenarioSetup(retries + 1), 350);
    }

    initialiseScenario() {
        if (this.trainingScenario.initialised) {
            return;
        }
        this.trainingScenario.initialised = true;
        this.spawnCombatDrill();
        this.spawnOrbDrill();
    }

    getAnchorTile() {
        const offset = this.game?.player?.offset || { x: TILE_SIZE_PX * 10, y: TILE_SIZE_PX * 10 };
        const mapWidth = Array.isArray(this.game?.map) ? this.game.map.length : 512;
        const mapHeight = Array.isArray(this.game?.map?.[0]) ? this.game.map[0].length : 512;
        const baseTileX = clampTile(offset.x / TILE_SIZE_PX, mapWidth - 3);
        const baseTileY = clampTile(offset.y / TILE_SIZE_PX, mapHeight - 3);
        return { x: baseTileX, y: baseTileY };
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

    spawnCombatDrill() {
        const anchor = this.getAnchorTile();
        const turretTile = { x: anchor.x + 3, y: anchor.y - 1 };
        const weaponTile = { x: anchor.x + 1, y: anchor.y - 1 };
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
            }
        }

        if (this.game?.iconFactory?.newIcon) {
            const weaponPosition = this.toWorldFromTile(weaponTile.x, weaponTile.y);
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
            }
            const laser = this.game.iconFactory.newIcon(null, weaponPosition.x + 32, weaponPosition.y + 32, ITEM_TYPE_LASER, sharedDropOptions);
            if (laser) {
                laser.tutorialTag = 'training_weapon';
            }
        }
    }

    spawnOrbDrill() {
        const anchor = this.getAnchorTile();
        const factoryTile = { x: anchor.x + 4, y: anchor.y + 2 };
        const orbTile = { x: factoryTile.x + 1, y: factoryTile.y };
        const targetTile = { x: factoryTile.x + 3, y: factoryTile.y };

        if (this.game?.buildingFactory?.newBuilding) {
            const orbFactory = this.game.buildingFactory.newBuilding(null, factoryTile.x, factoryTile.y, CAN_BUILD_ORB_FACTORY, {
                notifyServer: false,
                id: 'tutorial_orb_factory',
                city: this.game.player?.city ?? 0,
            });
            if (orbFactory) {
                this.trainingScenario.orbFactoryId = orbFactory.id;
            }

            const cc = this.game.buildingFactory.newBuilding(null, targetTile.x, targetTile.y, BUILDING_COMMAND_CENTER, {
                notifyServer: false,
                id: 'tutorial_orb_target',
                city: 99,
            });
            if (cc) {
                this.trainingScenario.orbTargetTile = targetTile;
                this.trainingScenario.orbTargetCenter = this.toCenterFromTile(targetTile.x, targetTile.y);
            }
        }

        if (this.game?.iconFactory?.newIcon) {
            const orbPosition = this.toWorldFromTile(orbTile.x, orbTile.y);
            const orb = this.game.iconFactory.newIcon(this.game.player?.id ?? null, orbPosition.x, orbPosition.y, ITEM_TYPE_ORB, {
                quantity: 1,
                selected: true,
                skipProductionUpdate: true,
                city: this.game.player?.city ?? null,
                teamId: this.game.player?.city ?? null,
                synced: false,
            });
            if (orb) {
                orb.tutorialTag = 'tutorial_orb';
            }
        }
    }

    handleIconPickup(icon) {
        if (!icon) {
            return;
        }
        if (icon.type === ITEM_TYPE_LASER || icon.type === ITEM_TYPE_ROCKET) {
            this.recordEvent('heavy_weapon_ready');
        }
    }

    handleItemDestroyed(item) {
        if (!item) {
            return;
        }
        if (item.tutorialTag === 'combat_turret' || item.type === ITEM_TYPE_TURRET) {
            this.recordEvent('training_turret_destroyed');
        }
    }

    handleItemDrop(dropInfo, position, item) {
        if (!dropInfo || !position || !this.trainingScenario.orbTargetCenter) {
            return;
        }
        if (dropInfo.type !== ITEM_TYPE_ORB) {
            return;
        }
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
    }
}

export default TutorialManager;
