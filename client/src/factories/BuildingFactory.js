import {checkBuildingCollision} from "../collision/collision-building.js";
import {
    LABELS,
    CAN_BUILD_HOUSE,
    HAS_BUILT,
    CAN_BUILD,
    CANT_BUILD,
    RESEARCH_PENDING,
    DEPENDENCY_TREE,
    COST_BUILDING,
    TIMER_RESEARCH,
    DEFAULT_CITY_CAN_BUILD,
} from "../constants.js";
import _ from 'underscore';
import {BUILDING_COMMAND_CENTER} from "../constants.js";
import {MAP_SQUARE_BUILDING} from "../constants.js";
import {getCityDisplayName} from '../utils/citySpawns.js';
import { SOUND_IDS } from '../audio/AudioManager.js';

const { clearTimeout, setTimeout } = globalThis;

const TILE_SIZE = 48;
const MAX_BUILDING_CHAIN_DISTANCE = TILE_SIZE * 20;
const MAX_BUILDING_CHAIN_DISTANCE_SQ = MAX_BUILDING_CHAIN_DISTANCE * MAX_BUILDING_CHAIN_DISTANCE;

const toFinite = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

var unflatten = function (array, parent, tree) {

    tree = typeof tree !== 'undefined' ? tree : [];
    parent = typeof parent !== 'undefined' ? parent : {id: 0};

    var children = _.filter(array, function (child) {
        return child.parentid == parent.id;
    });

    if (!_.isEmpty(children)) {
        if (parent.id == 0) {
            tree = children;
        } else {
            parent['children'] = children;
        }
        _.each(children, function (child) {
            unflatten(array, child)
        });
    }

    return tree;
};


var dependencyTree = unflatten(DEPENDENCY_TREE);

const TYPE_LABEL_LOOKUP = Object.keys(LABELS).reduce((acc, key) => {
    acc[LABELS[key].TYPE] = key;
    return acc;
}, {});

const isFactoryType = (type) => type >= 100 && type < 200;
const isResearchType = (type) => Math.floor(Number(type) / 100) === 4;
const researchTimerKey = (cityId, researchType) => `${cityId}:${researchType}`;

const playEffect = (game, soundId, position) => {
    if (!game || !game.audio || !soundId) {
        return;
    }
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        game.audio.playEffect(soundId, { position });
    } else {
        game.audio.playEffect(soundId);
    }
};

class BuildingFactory {

    constructor(game) {
        this.game = game
        this.buildingListHead = null;
        this.buildingsById = {};
        this.buildingsByCoord = {};
        this.pendingBuildCosts = new Map();
        this.pendingDemolish = new Set();
        this.researchStatus = new Map();
        this.researchTimers = new Map();
    }

    cycle() {
    }

    getResearchBucket(cityId, create = false) {
        const numericCity = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        if (!Number.isFinite(numericCity)) {
            return null;
        }
        if (!this.researchStatus.has(numericCity)) {
            if (!create) {
                return null;
            }
            this.researchStatus.set(numericCity, new Map());
        }
        return this.researchStatus.get(numericCity);
    }

    getResearchState(cityId, researchType, { create = false } = {}) {
        const bucket = this.getResearchBucket(cityId, create);
        const numericType = Number.isFinite(researchType) ? researchType : parseInt(researchType, 10);
        if (!bucket || !Number.isFinite(numericType)) {
            return null;
        }
        if (!bucket.has(numericType)) {
            if (!create) {
                return null;
            }
            bucket.set(numericType, {
                state: 'idle',
                completeAt: null,
                notifiedComplete: false,
                seenPending: false,
            });
        }
        return bucket.get(numericType);
    }

    clearResearchTimer(cityId, researchType) {
        const key = researchTimerKey(cityId, researchType);
        if (!this.researchTimers.has(key)) {
            return;
        }
        const timerId = this.researchTimers.get(key);
        clearTimeout(timerId);
        this.researchTimers.delete(key);
    }

    scheduleResearchTimer(cityId, researchType, completeAt = null) {
        const key = researchTimerKey(cityId, researchType);
        this.clearResearchTimer(cityId, researchType);
        const now = this.game.tick || Date.now();
        const target = Number.isFinite(completeAt) ? completeAt : now + TIMER_RESEARCH;
        const delay = Math.max(0, target - now);
        if (!Number.isFinite(delay)) {
            return;
        }
        const timerId = setTimeout(() => {
            this.handleResearchCompletion(cityId, researchType);
        }, delay);
        this.researchTimers.set(key, timerId);
    }

    applyResearchState(cityId, researchType, state = 'idle') {
        const cityIndex = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        const city = this.game.cities?.[cityIndex];
        if (!city || !city.canBuild) {
            return;
        }
        const node = this.searchTree(dependencyTree[0], researchType);
        if (!node || !node.children) {
            return;
        }
        let nextState = CANT_BUILD;
        if (state === 'pending') {
            nextState = RESEARCH_PENDING;
        } else if (state === 'complete') {
            nextState = CAN_BUILD;
        }
        node.children.forEach((child) => {
            const unlockKey = TYPE_LABEL_LOOKUP[child.id];
            if (unlockKey && city.canBuild[unlockKey] !== HAS_BUILT) {
                city.canBuild[unlockKey] = nextState;
            }
        });
        this.game.forceDraw = true;
    }

    shouldNotifyResearch(cityId) {
        const playerCity = Number.isFinite(this.game?.player?.city) ? this.game.player.city : null;
        return Number.isFinite(playerCity) && playerCity === cityId;
    }

    maybeNotifyResearchComplete(cityId, researchType) {
        if (!this.shouldNotifyResearch(cityId) || !this.game?.notify) {
            return;
        }
        const labelKey = TYPE_LABEL_LOOKUP[researchType];
        const researchLabel = labelKey && LABELS[labelKey] ? LABELS[labelKey].LABEL : 'Research';
        const node = this.searchTree(dependencyTree[0], researchType);
        const unlocks = [];
        if (node && node.children) {
            node.children.forEach((child) => {
                const childKey = TYPE_LABEL_LOOKUP[child.id];
                if (childKey && LABELS[childKey]) {
                    unlocks.push(LABELS[childKey].LABEL);
                }
            });
        }
        const unlockMessage = unlocks.length ? `Unlocked: ${unlocks.join(', ')}.` : '';
        const cityName = getCityDisplayName(cityId);
        const message = [`${cityName} finished ${researchLabel}.`, unlockMessage].filter(Boolean).join(' ');
        this.game.notify({
            title: 'Research Complete',
            message,
            variant: 'success',
            timeout: 4200,
        });
    }

    markBuildingConstructed(cityId, buildingType) {
        const cityIndex = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        const city = this.game.cities?.[cityIndex];
        if (!city || !city.canBuild) {
            return;
        }
        const typeKey = Number(buildingType);
        const labelKey = TYPE_LABEL_LOOKUP[typeKey];
        if (!labelKey) {
            return;
        }
        if (typeKey !== CAN_BUILD_HOUSE) {
            city.canBuild[labelKey] = HAS_BUILT;
            this.game.forceDraw = true;
        }
    }

    recomputeCityBuildPermissions(cityId) {
        const cityIndex = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        const city = Number.isFinite(cityIndex) ? this.game.cities?.[cityIndex] : null;
        if (!city) {
            return;
        }

        const base = { ...DEFAULT_CITY_CAN_BUILD };
        const target = (city.canBuild && typeof city.canBuild === 'object') ? city.canBuild : {};
        Object.keys(target).forEach((key) => delete target[key]);
        Object.assign(target, base);
        city.canBuild = target;

        const researchBucket = this.getResearchBucket(cityIndex);
        if (researchBucket) {
            for (const [researchType, state] of researchBucket.entries()) {
                const status = state?.state || 'idle';
                this.applyResearchState(cityIndex, researchType, status);
            }
        }

        let node = this.getHead();
        while (node) {
            const nodeCity = Number.isFinite(node.city) ? node.city : parseInt(node.city, 10);
            if (Number.isFinite(nodeCity) && nodeCity === cityIndex) {
                this.markBuildingConstructed(cityIndex, node.type);
            }
            node = node.next;
        }

        this.game.forceDraw = true;
    }

    handleResearchCompletion(cityId, researchType) {
        const state = this.getResearchState(cityId, researchType, { create: true });
        if (!state) {
            return;
        }
        this.clearResearchTimer(cityId, researchType);
        state.state = 'complete';
        state.completeAt = null;
        if (state.seenPending && !state.notifiedComplete) {
            this.maybeNotifyResearchComplete(cityId, researchType);
            state.notifiedComplete = true;
        }
        this.applyResearchState(cityId, researchType, 'complete');
    }

    handleResearchUpdate(update) {
        if (!update) {
            return;
        }
        const cityId = toFinite(update.cityId ?? update.city, null);
        const researchType = toFinite(update.researchType ?? update.type, null);
        if (cityId === null || researchType === null) {
            return;
        }
        const state = this.getResearchState(cityId, researchType, { create: true });
        if (!state) {
            return;
        }
        const status = typeof update.state === 'string' ? update.state : 'idle';
        state.state = status === 'pending' || status === 'complete' ? status : 'idle';
        state.completeAt = toFinite(update.completeAt, null);
        if (state.state === 'pending') {
            state.seenPending = true;
            state.notifiedComplete = false;
        }
        if (state.state === 'idle') {
            state.seenPending = false;
            state.notifiedComplete = false;
        }
        this.clearResearchTimer(cityId, researchType);
        if (state.state === 'pending') {
            this.scheduleResearchTimer(cityId, researchType, state.completeAt);
        }
        if (state.state === 'complete' && state.seenPending && !state.notifiedComplete) {
            this.maybeNotifyResearchComplete(cityId, researchType);
            state.notifiedComplete = true;
        }
        if (state.state !== 'complete') {
            state.notifiedComplete = false;
        }
        this.applyResearchState(cityId, researchType, state.state);
    }

    newBuilding(owner, x, y, type, options = {}) {

        const {
            notifyServer = true,
            id = `${x}_${y}`,
            population = 0,
            attachedHouseId = null,
            updateCity,
            itemsLeft = 0,
            city = this.game.player?.city ?? 0,
        } = options;

        const coordKey = `${x}_${y}`;
        const cityId = Number.isFinite(city) ? city : parseInt(city, 10) || 0;
        const isLocalPlacement = notifyServer && owner !== null && owner !== undefined && this.game?.player && owner === this.game.player.id;
        if (isLocalPlacement && !this.game?.player?.isMayor) {
            if (this.game.notify) {
                this.game.notify({
                    title: 'Construction Restricted',
                    message: 'Only mayors can authorise new construction.',
                    variant: 'warn',
                    timeout: 3600
                });
            } else {
                console.warn('Construction restricted: only mayors may build.');
            }
            this.game.forceDraw = true;
            return false;
        }
        if (isLocalPlacement) {
            const cityState = this.game.cities?.[cityId];
            if (!cityState) {
                console.warn('Cannot place building without city state');
                return false;
            }
            const availableCash = Number.isFinite(cityState.cash) ? cityState.cash : parseInt(cityState.cash, 10) || 0;
            if (availableCash < COST_BUILDING) {
                console.warn('City lacks funds for new building');
                this.game.forceDraw = true;
                return false;
            }
        }

        var building = {
            "id": id,
            "owner": owner,
            "x": x,
            "y": y,
            "items": 1,
            "type": type,
            "population": population,
            "attachedHouseId": attachedHouseId,
            "next": null,
            "previous": null,
            "coordKey": coordKey,
            "city": city,
            "itemsLeft": itemsLeft

        };

        if (checkBuildingCollision(this.game, building)) {
            console.log("Collision");
            return false;
        }

        if (isLocalPlacement && type !== BUILDING_COMMAND_CENTER) {
            const buildingCenter = {
                x: (toFinite(x, 0) + 1.5) * TILE_SIZE,
                y: (toFinite(y, 0) + 1.5) * TILE_SIZE
            };
            const layout = this.measureCityLayout(cityId, buildingCenter);
            if (layout.buildingCount > 0) {
                const nearestSq = layout.nearestDistanceSq;
                if (nearestSq !== null && nearestSq > MAX_BUILDING_CHAIN_DISTANCE_SQ) {
                    if (typeof this.game.notify === 'function') {
                        const cityName = getCityDisplayName(cityId);
                        const maxTiles = Math.round(MAX_BUILDING_CHAIN_DISTANCE / TILE_SIZE);
                        this.game.notify({
                            title: 'Construction Denied',
                            message: `New structures must be within ${maxTiles} tiles of your existing ${cityName} build grid. Try placing closer to your city.`,
                            variant: 'warn',
                            timeout: 6500
                        });
                    }
                    return false;
                }
            }
        }

        if (notifyServer && this.game.socketListener && this.game.socketListener.sendNewBuilding) {
            this.game.socketListener.sendNewBuilding(building);
        }

        if (this.buildingListHead) {
            this.buildingListHead.previous = building;
            building.next = this.buildingListHead
        }

        const shouldUpdateCity = updateCity !== undefined ? updateCity : (!owner || owner === this.game.player.id);

        if (shouldUpdateCity) {
            this.adjustAllowedBuilds(building)
        } else {
            this.applyResearchProgress(building.city, building.type);
        }
        console.log("Created building");
        console.log(building);

        this.buildingListHead = building;
        this.buildingsById[building.id] = building;
        this.buildingsByCoord[coordKey] = building;
        this.syncFactoryItems(building);

        if (!this.game.tiles[x]) {
            this.game.tiles[x] = [];
        }
        this.game.tiles[x][y] = type;
        if (this.game.map && this.game.map[x]) {
            this.game.map[x][y] = MAP_SQUARE_BUILDING;
        }

        playEffect(this.game, SOUND_IDS.BUILD, { x: x * TILE_SIZE, y: y * TILE_SIZE });

        if (isLocalPlacement) {
            const cityState = this.game.cities?.[cityId];
            if (cityState) {
                const availableCash = Number.isFinite(cityState.cash) ? cityState.cash : parseInt(cityState.cash, 10) || 0;
                cityState.cash = Math.max(0, availableCash - COST_BUILDING);
                cityState.construction = (Number.isFinite(cityState.construction) ? cityState.construction : parseInt(cityState.construction, 10) || 0) + COST_BUILDING;
                cityState.updatedAt = Date.now();
                this.pendingBuildCosts.set(building.id, {
                    cityId,
                    cost: COST_BUILDING,
                });
                this.game.forceDraw = true;
            }
        }

        return building;
    }

    outputBuildings() {
        console.log("here");
        var buildingNode = this.getHead();

        while (buildingNode) {

            if (buildingNode.type !== 0) {
                console.log(buildingNode.type + "," + buildingNode.x + "," + buildingNode.y);
            }

            buildingNode = buildingNode.next;
        }

        return false;
    }

    demolishBuilding(x, y) {

        console.log("Trying to demolish building at " + x + " " + y);
        if (!this.game?.player?.isMayor) {
            if (this.game.notify) {
                this.game.notify({
                    title: 'Demolition Restricted',
                    message: 'Only mayors can order demolitions.',
                    variant: 'warn',
                    timeout: 3200
                });
            } else {
                console.warn('Demolition restricted: only mayors may demolish buildings.');
            }
            this.game.isDemolishing = false;
            return false;
        }

        const buildingNode = this.findBuildingAtTile(x, y);
        if (!buildingNode) {
            return false;
        }
        if (this.pendingDemolish.has(buildingNode.id)) {
            return false;
        }
        if (this.game.socketListener?.sendDemolishBuilding) {
            this.pendingDemolish.add(buildingNode.id);
            this.game.socketListener.sendDemolishBuilding(buildingNode.id);
            return true;
        }
        return false;
    }

    deleteBuilding(building, notifyServer = true) {


        this.game.map[building.x][building.y] = 0;
        this.game.tiles[building.x][building.y] = 0;

        if (this.pendingDemolish.has(building.id)) {
            this.pendingDemolish.delete(building.id);
        }

        if (Array.isArray(this.game.explosions)) {
            const tileX = Number.isFinite(building.x) ? Number(building.x) : 0;
            const tileY = Number.isFinite(building.y) ? Number(building.y) : 0;
            this.game.explosions.push({
                x: tileX * 48,
                y: tileY * 48,
                frame: 0,
                nextFrameTick: (this.game.tick || Date.now()) + 75,
                variant: 'large'
            });
            playEffect(this.game, SOUND_IDS.DEMOLISH, { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE });
        }

        if (isFactoryType(building.type)) {
            const drop = this.getFactoryDropPosition(building);
            const itemType = building.type % 100;
            const teamId = building.city ?? building.cityId ?? null;
            const excess = this.game.iconFactory.countUnownedIconsNear(drop.x, drop.y, itemType, 48, teamId);
            if (excess > 0) {
                this.game.iconFactory.removeUnownedIconsNear(drop.x, drop.y, itemType, excess, 48, teamId);
            }
            building.itemsLeft = 0;
        }

        if (notifyServer && this.game.socketListener && this.game.socketListener.sendDemolishBuilding) {
            this.game.socketListener.sendDemolishBuilding(building.id);
        }

        var returnBuilding = building.next;

        if (building.next) {
            building.next.previous = building.previous;
        }

        if (building.previous) {
            building.previous.next = building.next
        } else {
            this.buildingListHead = building.next;
        }

        delete this.buildingsById[building.id];
        const coordKey = building.coordKey || `${building.x}_${building.y}`;
        delete this.buildingsByCoord[coordKey];
        if (this.pendingBuildCosts.has(building.id)) {
            this.pendingBuildCosts.delete(building.id);
        }

        this.recomputeCityBuildPermissions(building.city ?? this.game?.player?.city ?? null);

        return returnBuilding;
    }

    handleDemolishDenied(data) {
        const id = data?.id;
        if (id && this.pendingDemolish.has(id)) {
            this.pendingDemolish.delete(id);
        }
        if (data?.reason) {
            console.warn(`Demolish denied (${data.reason}) for building ${id || '(unknown)'}`);
        }
    }

    removeBuildingById(id) {
        let node = this.getHead();
        while (node) {
            if (node.id === id) {
                this.deleteBuilding(node, false);
                break;
            }
            node = node.next;
        }
    }

    handleBuildDenied(data) {
        if (!data) {
            return;
        }
        const id = data.id || `${data.x}_${data.y}`;
        if (!id) {
            return;
        }
        if (data.reason === 'research_pending' && this.game.notify) {
            const eta = toFinite(data.completeAt, null);
            const remainingSeconds = eta ? Math.max(0, Math.round((eta - (this.game.tick || Date.now())) / 1000)) : null;
            const suffix = Number.isFinite(remainingSeconds) ? ` (~${remainingSeconds}s)` : '';
            this.game.notify({
                title: 'Research Pending',
                message: `Research must finish before this structure can be built${suffix}.`,
                variant: 'info',
                timeout: 3600
            });
        }
        const pending = this.pendingBuildCosts.get(id);
        if (pending) {
            const cityState = this.game.cities?.[pending.cityId];
            if (cityState) {
                const currentCash = Number.isFinite(cityState.cash) ? cityState.cash : parseInt(cityState.cash, 10) || 0;
                cityState.cash = currentCash + pending.cost;
                const currentConstruction = Number.isFinite(cityState.construction) ? cityState.construction : parseInt(cityState.construction, 10) || 0;
                cityState.construction = Math.max(0, currentConstruction - pending.cost);
                cityState.updatedAt = Date.now();
            }
            this.pendingBuildCosts.delete(id);
        }
        const building = this.getBuildingById(id);
        if (building && building.owner === this.game.player.id) {
            this.deleteBuilding(building, false);
        }
        this.game.forceDraw = true;
    }

    searchTree(element, matchingId) {
        if (element.id == matchingId) {
            return element;
        } else if (element.children != null) {
            var i;
            var result = null;
            for (i = 0; result == null && i < element.children.length; i++) {
                result = this.searchTree(element.children[i], matchingId);
            }
            return result;
        }
        return null;
    }

    adjustAllowedBuilds(building) {

        if (building.type == BUILDING_COMMAND_CENTER) {
            return;
        }

        const cityId = building.city ?? this.game.player.city;
        const buildingType = this.game.isBuilding || building.type;
        this.applyResearchProgress(cityId, buildingType);
    }


    getHead() {
        return this.buildingListHead;
    }

    getBuildingById(id) {
        return this.buildingsById[id];
    }

    getBuildingByCoord(x, y) {
        return this.buildingsByCoord[`${x}_${y}`];
    }

    findBuildingAtTile(tileX, tileY) {
        let node = this.getHead();
        const targetX = Number.isFinite(tileX) ? tileX : parseInt(tileX, 10);
        const targetY = Number.isFinite(tileY) ? tileY : parseInt(tileY, 10);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
            return null;
        }
        while (node) {
            const baseX = Number.isFinite(node.x) ? node.x : parseInt(node.x, 10) || 0;
            const baseY = Number.isFinite(node.y) ? node.y : parseInt(node.y, 10) || 0;
            if (targetX >= baseX && targetX <= baseX + 2 &&
                targetY >= baseY && targetY <= baseY + 2) {
                return node;
            }
            node = node.next;
        }
        return null;
    }

    measureCityLayout(cityId, candidateCenter = null) {
        const numericCityId = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        const city = this.game.cities?.[numericCityId];
        const baseX = toFinite(city?.x, 0);
        const baseY = toFinite(city?.y, 0);
        const cityCenter = {
            x: baseX + (TILE_SIZE * 1.5),
            y: baseY + (TILE_SIZE * 1.5)
        };

        let node = this.getHead();
        let maxRadiusSq = 0;
        const hasCandidate = Number.isFinite(candidateCenter?.x) && Number.isFinite(candidateCenter?.y);
        let nearestDistanceSq = hasCandidate ? Infinity : null;
        let buildingCount = 0;

        while (node) {
            const nodeCity = Number.isFinite(node.city) ? node.city : parseInt(node.city, 10);
            if (Number.isFinite(nodeCity) && Number.isFinite(numericCityId) && nodeCity !== numericCityId) {
                node = node.next;
                continue;
            }
            const centerX = (toFinite(node.x, 0) + 1.5) * TILE_SIZE;
            const centerY = (toFinite(node.y, 0) + 1.5) * TILE_SIZE;
            const radiusSq = distanceSquared(centerX, centerY, cityCenter.x, cityCenter.y);
            if (radiusSq > maxRadiusSq) {
                maxRadiusSq = radiusSq;
            }
            if (nearestDistanceSq !== null) {
                const candidateSq = distanceSquared(centerX, centerY, candidateCenter.x, candidateCenter.y);
                if (candidateSq < nearestDistanceSq) {
                    nearestDistanceSq = candidateSq;
                }
            }
            buildingCount += 1;
            node = node.next;
        }

        return {
            cityCenter,
            maxRadiusSq,
            nearestDistanceSq,
            buildingCount
        };
    }

    countBuildingsForCity(cityId) {
        const numericCity = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        if (!Number.isFinite(numericCity)) {
            return 0;
        }
        let count = 0;
        let node = this.getHead();
        while (node) {
            const nodeCity = Number.isFinite(node.city) ? node.city : parseInt(node.city, 10) || 0;
            if (nodeCity === numericCity) {
                count += 1;
            }
            node = node.next;
        }
        return count;
    }

    applyPopulationUpdate(update) {
        if (!update || !update.id) {
            return;
        }

        if (update.removed) {
            this.removeBuildingById(update.id);
            this.game.forceDraw = true;
            return;
        }

        let building = this.getBuildingById(update.id);
        if (!building && update.x !== undefined && update.y !== undefined && update.type !== undefined) {
            building = this.newBuilding(update.ownerId || null, update.x, update.y, update.type, {
                notifyServer: false,
                id: update.id,
                population: update.population || 0,
                attachedHouseId: update.attachedHouseId || null,
                updateCity: false,
                itemsLeft: update.itemsLeft || 0,
                city: update.city ?? 0,
            });
            if (building) {
                this.applyResearchProgress(building.city ?? 0, building.type);
            }
        }
        if (!building) {
            return;
        }

        building.coordKey = building.coordKey || `${building.x}_${building.y}`;

        if (typeof update.population === 'number') {
            building.population = update.population;
        }

        if (update.attachedHouseId !== undefined) {
            building.attachedHouseId = update.attachedHouseId;
        }

        if (update.city !== undefined) {
            building.city = update.city;
        }

        if (update.smokeActive !== undefined) {
            building.smokeActive = update.smokeActive;
        }

        if (update.smokeFrame !== undefined) {
            building.smokeFrame = update.smokeFrame;
        }

        if (update.itemsLeft !== undefined) {
            building.itemsLeft = update.itemsLeft;
        }

        this.syncFactoryItems(building);

        if (update.id && this.pendingBuildCosts.has(update.id)) {
            this.pendingBuildCosts.delete(update.id);
        }

        this.game.forceDraw = true;
    }

    applyResearchProgress(cityId, buildingType) {
        if (buildingType == null || cityId == null || cityId === undefined) {
            return;
        }
        const typeKey = Number(buildingType);
        this.markBuildingConstructed(cityId, typeKey);
        if (isResearchType(typeKey)) {
            const state = this.getResearchState(cityId, typeKey);
            this.applyResearchState(cityId, typeKey, state?.state || 'idle');
        }
    }

    assignIconSource(icon) {
        if (!icon || typeof icon.type !== 'number') {
            return null;
        }
        if (icon.sourceBuildingId && this.buildingsById[icon.sourceBuildingId]) {
            return this.buildingsById[icon.sourceBuildingId];
        }
        const building = this.findFactoryForIcon(icon.type, icon.x, icon.y);
        if (building) {
            icon.sourceBuildingId = building.id;
        }
        return building;
    }

    findFactoryForIcon(itemType, x, y) {
        let candidate = null;
        let distance = Infinity;
        let building = this.getHead();
        while (building) {
            if (isFactoryType(building.type) && (building.type % 100) === itemType) {
                const drop = this.getFactoryDropPosition(building);
                const diffX = drop.x - x;
                const diffY = drop.y - y;
                const dist = Math.sqrt((diffX * diffX) + (diffY * diffY));
                if (dist < distance && dist <= 96) {
                    candidate = building;
                    distance = dist;
                }
            }
            building = building.next;
        }
        return candidate;
    }

    handleIconProduced(icon) {
        const building = this.assignIconSource(icon);
        if (!building) {
            return;
        }
        building.itemsLeft = (building.itemsLeft || 0) + 1;
        this.syncFactoryItems(building);
    }

    handleIconCollected(icon) {
        const building = this.assignIconSource(icon);
        if (!building) {
            return;
        }
        if (typeof building.itemsLeft === 'number' && building.itemsLeft > 0) {
            building.itemsLeft -= 1;
        }
        if (this.game.socketListener && typeof this.game.socketListener.collectFactoryItem === 'function' && building.id) {
            this.game.socketListener.collectFactoryItem({
                buildingId: building.id,
                type: icon.type,
                quantity: Math.max(1, icon.quantity ?? 1),
            });
        }
        this.syncFactoryItems(building);
    }

    getFactoryDropPosition(building) {
        return {
            x: (building.x * 48) + 56,
            y: (building.y * 48) + 102,
        };
    }

    syncFactoryItems(building) {
        if (!building || !isFactoryType(building.type)) {
            return;
        }
        if (!this.game.iconFactory ||
            typeof this.game.iconFactory.countUnownedIconsNear !== 'function' ||
            typeof this.game.iconFactory.removeUnownedIconsNear !== 'function') {
            return;
        }
        const expected = building.itemsLeft || 0;
        const itemType = building.type % 100;
        const drop = this.getFactoryDropPosition(building);
        const teamId = building.city ?? building.cityId ?? null;
        const existing = this.game.iconFactory.countUnownedIconsNear(drop.x, drop.y, itemType, 48, teamId);
        if (existing > expected) {
            this.game.iconFactory.removeUnownedIconsNear(drop.x, drop.y, itemType, existing - expected, 48, teamId);
        } else if (existing < expected) {
            const missing = expected - existing;
            for (let i = 0; i < missing; i++) {
                this.game.iconFactory.newIcon(null, drop.x, drop.y, itemType, {
                    sourceBuildingId: building.id,
                    teamId,
                    skipProductionUpdate: true,
                });
            }
        }
    }

}


export default BuildingFactory;
