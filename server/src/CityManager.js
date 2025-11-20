"use strict";

const {
    MONEY_MAX_VALUE,
    MONEY_STARTING_VALUE,
    MONEY_TICK_INTERVAL,
    COST_BUILDING,
    COST_UPKEEP_HOSPITAL,
} = require('./constants');
const { ITEM_TYPES, normalizeItemType } = require('./items');
const { ORBABLE_SIZE } = require('./gameplay/constants');

const REFUND_CHANCE = 0.25;
const BOMB_FACTORY_TYPES = new Set([103]);
const ORB_FACTORY_TYPES = new Set([105]);

const toCityId = (cityId) => {
    if (typeof cityId === 'number' && Number.isFinite(cityId)) {
        return cityId;
    }
    const parsed = parseInt(cityId, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
};

class CityManager {
    constructor(game) {
        this.game = game;
        this.io = null;
        this.cities = new Map();
        this.orbHolders = new Map();
        this.inventoryByCity = new Map();
        this.inventoryByPlayer = new Map();
    }

    setIo(io) {
        this.io = io;
    }

    ensureDerivedFields(city) {
        if (!city) {
            return;
        }
        const now = Date.now();
        if (city.currentBuildings === undefined || city.currentBuildings === null) {
            city.currentBuildings = 1;
        }
        if (city.maxBuildings === undefined || city.maxBuildings === null) {
            city.maxBuildings = Math.max(1, city.currentBuildings);
        }
        if (city.hadBombFactory === undefined) {
            city.hadBombFactory = false;
        }
        if (city.hadOrbFactory === undefined) {
            city.hadOrbFactory = false;
        }
        if (city.isOrbable === undefined) {
            city.isOrbable = false;
        }
        if (city.orbs === undefined || city.orbs === null) {
            city.orbs = 0;
        }
        if (city.score === undefined || city.score === null) {
            city.score = 0;
        }
        if (city.lastOrbBounty === undefined || city.lastOrbBounty === null) {
            city.lastOrbBounty = 0;
        }
        if (city.lastOrbReward === undefined || city.lastOrbReward === null) {
            city.lastOrbReward = 0;
        }
        if (!city.startedAt) {
            city.startedAt = now;
        }
        if (city.destroyedAt === undefined) {
            city.destroyedAt = null;
        }
        if (city.activeOrbCount === undefined || city.activeOrbCount === null) {
            city.activeOrbCount = 0;
        }
        this.updateOrbableState(city);
    }

    ensureCity(cityId) {
        const id = toCityId(cityId);
        if (!this.cities.has(id)) {
            const now = Date.now();
            const city = {
                id,
                cash: MONEY_STARTING_VALUE,
                income: 0,
                itemProduction: 0,
                research: 0,
                hospital: 0,
                construction: 0,
                nextFinanceTick: 0,
                updatedAt: now,
                startedAt: now,
                destroyedAt: null,
                currentBuildings: 1,
                maxBuildings: 1,
                hadBombFactory: false,
                hadOrbFactory: false,
                isOrbable: false,
                orbs: 0,
                score: 0,
                lastOrbBounty: 0,
                lastOrbReward: 0,
            };
            this.cities.set(id, city);
            if (!this.game.cities) {
                this.game.cities = [];
            }
            this.game.cities[id] = city;
        }
        const city = this.cities.get(id);
        this.ensureDerivedFields(city);
        this.ensureCityInventory(id);
        return city;
    }

    ensureCityInventory(cityId) {
        if (!Number.isFinite(cityId)) {
            return new Map();
        }
        if (!this.inventoryByCity.has(cityId)) {
            this.inventoryByCity.set(cityId, new Map());
        }
        return this.inventoryByCity.get(cityId);
    }

    ensurePlayerInventory(socketId, cityId) {
        if (!socketId) {
            return null;
        }
        const cityNumeric = Number.isFinite(cityId) ? Math.max(0, Math.floor(cityId)) : null;
        if (cityNumeric === null) {
            return null;
        }
        if (!this.inventoryByPlayer.has(socketId)) {
            this.inventoryByPlayer.set(socketId, {
                cityId: cityNumeric,
                items: new Map(),
            });
        }
        const record = this.inventoryByPlayer.get(socketId);
        if (record.cityId !== cityNumeric) {
            record.cityId = cityNumeric;
            record.items.clear();
        }
        return record;
    }

    recordInventoryPickup(socketId, cityId, itemType, quantity = 1) {
        const numericCity = toCityId(cityId);
        const type = normalizeItemType(itemType, null);
        const amount = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
        if (!Number.isFinite(numericCity) || type === null || amount <= 0) {
            return 0;
        }
        const city = this.ensureCity(numericCity);
        const cityInventory = this.ensureCityInventory(numericCity);
        const current = cityInventory.get(type) || 0;
        cityInventory.set(type, current + amount);

        if (socketId) {
            const playerInventory = this.ensurePlayerInventory(socketId, numericCity);
            if (playerInventory) {
                // [SECURITY] Enforce inventory limit (e.g., 5 items per type)
                const MAX_INVENTORY_PER_TYPE = 5;
                const existing = playerInventory.items.get(type) || 0;
                if (existing >= MAX_INVENTORY_PER_TYPE) {
                    return 0;
                }
                const allowed = Math.min(amount, MAX_INVENTORY_PER_TYPE - existing);
                if (allowed > 0) {
                    playerInventory.items.set(type, existing + allowed);
                } else {
                    return 0;
                }
                city.updatedAt = Date.now();
                return allowed;
            }
        }

        city.updatedAt = Date.now();
        return amount;
    }

    recordInventoryConsumption(socketId, cityId, itemType, quantity = 1) {
        const numericCity = toCityId(cityId);
        const type = normalizeItemType(itemType, null);
        const amount = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
        if (!Number.isFinite(numericCity) || type === null || amount <= 0) {
            return 0;
        }

        // [SECURITY] If socketId is provided, check PLAYER inventory first
        if (socketId) {
            const playerInventory = this.ensurePlayerInventory(socketId, numericCity);
            if (!playerInventory) {
                return 0;
            }
            const owned = playerInventory.items.get(type) || 0;
            if (owned < amount) {
                return 0;
            }
            // Deduct from player
            const remaining = owned - amount;
            if (remaining > 0) {
                playerInventory.items.set(type, remaining);
            } else {
                playerInventory.items.delete(type);
                if (playerInventory.items.size === 0) {
                    this.inventoryByPlayer.delete(socketId);
                }
            }
        }

        // Also deduct from city (shared pool)
        const city = this.ensureCity(numericCity);
        const cityInventory = this.ensureCityInventory(numericCity);
        const current = cityInventory.get(type) || 0;

        // Even if player had it, if city doesn't (shouldn't happen in sync), we clamp? 
        // Or we just deduct what we can? 
        // Logic: Player inventory is a subset/view of city inventory in this game design?
        // Actually, looking at pickup: cityInventory gets +amount, player gets +amount.
        // So they should be in sync.

        const applied = Math.min(current, amount);
        const nextValue = current - applied;
        if (nextValue > 0) {
            cityInventory.set(type, nextValue);
        } else {
            cityInventory.delete(type);
        }

        city.updatedAt = Date.now();
        return amount; // Return requested amount since we validated player had it
    }

    getInventoryCount(cityId, itemType) {
        const numericCity = toCityId(cityId);
        const type = normalizeItemType(itemType, null);
        if (!Number.isFinite(numericCity) || type === null) {
            return 0;
        }
        const cityInventory = this.inventoryByCity.get(numericCity);
        if (!cityInventory) {
            return 0;
        }
        return cityInventory.get(type) || 0;
    }

    releasePlayerInventory(socketId, options = {}) {
        if (!socketId || !this.inventoryByPlayer.has(socketId)) {
            return;
        }
        const record = this.inventoryByPlayer.get(socketId);
        this.inventoryByPlayer.delete(socketId);
        if (!record || record.cityId === null || record.cityId === undefined) {
            return;
        }
        const { returnToCity = false } = options || {};
        const cityInventory = this.ensureCityInventory(record.cityId);
        for (const [type, count] of record.items.entries()) {
            const current = cityInventory.get(type) || 0;
            const baseValue = Math.max(0, current - count);
            const nextValue = returnToCity ? baseValue + count : baseValue;
            if (nextValue > 0) {
                cityInventory.set(type, nextValue);
            } else {
                cityInventory.delete(type);
            }
        }
        const city = this.getCity(record.cityId);
        if (city) {
            city.updatedAt = Date.now();
        }
    }

    clearCityInventory(cityId) {
        const numericCity = toCityId(cityId);
        if (!Number.isFinite(numericCity)) {
            return;
        }
        this.inventoryByCity.delete(numericCity);
        for (const [socketId, record] of Array.from(this.inventoryByPlayer.entries())) {
            if (record && record.cityId === numericCity) {
                this.inventoryByPlayer.delete(socketId);
            }
        }
        const city = this.getCity(numericCity);
        if (city) {
            city.updatedAt = Date.now();
        }
    }

    clearInventoryForType(cityId, itemType) {
        const numericCity = toCityId(cityId);
        const type = normalizeItemType(itemType, null);
        if (!Number.isFinite(numericCity) || type === null) {
            return;
        }
        const cityInventory = this.inventoryByCity.get(numericCity);
        if (cityInventory) {
            cityInventory.delete(type);
        }
        for (const [socketId, record] of Array.from(this.inventoryByPlayer.entries())) {
            if (!record || record.cityId !== numericCity) {
                continue;
            }
            if (record.items.has(type)) {
                record.items.delete(type);
                if (record.items.size === 0) {
                    this.inventoryByPlayer.delete(socketId);
                }
            }
        }
        const city = this.getCity(numericCity);
        if (city) {
            city.updatedAt = Date.now();
        }
    }

    addIncome(cityId, amount) {
        if (!amount || amount <= 0) {
            return;
        }
        const city = this.ensureCity(cityId);
        city.cash += amount;
        city.income += amount;
        city.updatedAt = Date.now();
    }

    spendForResearch(cityId, amount) {
        if (!amount || amount <= 0) {
            return false;
        }
        const city = this.ensureCity(cityId);
        if (city.cash < amount) {
            return false;
        }
        city.cash -= amount;
        city.research += amount;
        city.updatedAt = Date.now();
        return true;
    }

    spendForHospital(cityId, amount) {
        if (!amount || amount <= 0) {
            return false;
        }
        const city = this.ensureCity(cityId);
        if (city.cash < amount) {
            return false;
        }
        city.cash -= amount;
        city.hospital += amount;
        city.updatedAt = Date.now();
        return true;
    }

    trySpendForFactory(cityId, amount) {
        if (!amount || amount <= 0) {
            return true;
        }
        const city = this.ensureCity(cityId);
        if (city.cash < amount) {
            return false;
        }
        city.cash -= amount;
        city.itemProduction += amount;
        city.updatedAt = Date.now();
        this.emitFinance(city);
        return true;
    }

    getActiveOrbCount(cityId) {
        const city = this.ensureCity(cityId);
        return Number(city.activeOrbCount) || 0;
    }

    canProduceOrb(cityId, limit = 1) {
        const cap = Number.isFinite(limit) ? Math.max(0, limit) : 1;
        return this.getActiveOrbCount(cityId) < cap;
    }

    registerOrbProduced(cityId) {
        const city = this.ensureCity(cityId);
        city.activeOrbCount = this.getActiveOrbCount(cityId) + 1;
        city.updatedAt = Date.now();
        return city.activeOrbCount;
    }

    registerOrbHolder(socketId, cityId) {
        if (!socketId) {
            return null;
        }
        const city = this.ensureCity(cityId);
        this.orbHolders.set(socketId, city.id);
        this.recordInventoryPickup(socketId, city.id, ITEM_TYPES.ORB, 1);
        return city.id;
    }

    releaseOrbHolder(socketId, options = {}) {
        if (!socketId || !this.orbHolders.has(socketId)) {
            return null;
        }
        const cityId = this.orbHolders.get(socketId);
        this.orbHolders.delete(socketId);
        if (options.consume !== false) {
            this.consumeOrb(cityId, socketId);
        }
        return cityId;
    }

    consumeOrb(cityId, socketId = null) {
        const city = this.ensureCity(cityId);
        city.activeOrbCount = Math.max(0, this.getActiveOrbCount(cityId) - 1);
        city.updatedAt = Date.now();
        this.recordInventoryConsumption(socketId, city.id, ITEM_TYPES.ORB, 1);
        if (socketId && this.orbHolders.get(socketId) === city.id) {
            this.orbHolders.delete(socketId);
        }
        return city.activeOrbCount;
    }

    clearOrbHoldersForCity(cityId, options = {}) {
        const identifiers = [];
        for (const [socketId, holderCityId] of this.orbHolders.entries()) {
            if (holderCityId === cityId) {
                identifiers.push(socketId);
            }
        }
        identifiers.forEach((socketId) => {
            this.orbHolders.delete(socketId);
            if (options.consume !== false) {
                this.consumeOrb(cityId, socketId);
            }
        });
    }

    recordBuildingCost(cityId) {
        if (!COST_BUILDING) {
            return;
        }
        const city = this.ensureCity(cityId);
        city.cash -= COST_BUILDING;
        city.construction += COST_BUILDING;
        city.updatedAt = Date.now();
        this.emitFinance(city);
    }

    getCity(cityId) {
        const id = toCityId(cityId);
        return this.cities.get(id) || null;
    }

    updateOrbableState(city) {
        if (!city) {
            return false;
        }
        const maxBuildings = Number(city.maxBuildings) || 0;
        const isOrbable = !!(city.hadBombFactory || city.hadOrbFactory || maxBuildings >= ORBABLE_SIZE);
        city.isOrbable = isOrbable;
        return isOrbable;
    }

    isOrbable(cityId) {
        const city = this.ensureCity(cityId);
        return this.updateOrbableState(city);
    }

    getOrbBaseValue(city) {
        if (!city) {
            return 0;
        }
        const maxBuildings = Number(city.maxBuildings) || 0;
        if (maxBuildings >= ORBABLE_SIZE + 10) {
            return 50;
        }
        if (maxBuildings >= ORBABLE_SIZE + 5) {
            return 40;
        }
        if (maxBuildings >= ORBABLE_SIZE) {
            return 30;
        }
        if (city.hadOrbFactory) {
            return 20;
        }
        if (city.hadBombFactory) {
            return 10;
        }
        return 0;
    }

    getOrbBonus(city) {
        if (!city) {
            return 0;
        }
        const count = Number(city.orbs) || 0;
        return Math.max(0, count) * 5;
    }

    getOrbValue(city) {
        if (!city) {
            return 0;
        }
        return this.getOrbBaseValue(city) + this.getOrbBonus(city);
    }

    calculateOrbValue(cityId) {
        const city = this.ensureCity(cityId);
        const value = this.getOrbValue(city);
        city.lastOrbBounty = value;
        city.updatedAt = Date.now();
        return value;
    }

    registerBuilding(building) {
        if (!building) {
            return null;
        }
        const cityId = building.cityId ?? building.city ?? 0;
        const city = this.ensureCity(cityId);
        const type = Number(building.type);
        if (type !== 0) {
            city.currentBuildings = Math.max(1, (city.currentBuildings || 1) + 1);
            if (city.currentBuildings > (city.maxBuildings || 1)) {
                city.maxBuildings = city.currentBuildings;
            }
        }
        if (BOMB_FACTORY_TYPES.has(type)) {
            city.hadBombFactory = true;
        }
        if (ORB_FACTORY_TYPES.has(type)) {
            city.hadOrbFactory = true;
        }
        city.updatedAt = Date.now();
        this.updateOrbableState(city);
        this.emitFinance(city);
        return city;
    }

    unregisterBuilding(building) {
        if (!building) {
            return null;
        }
        const cityId = building.cityId ?? building.city ?? 0;
        const city = this.ensureCity(cityId);
        const type = Number(building.type);
        if (type !== 0) {
            const current = Number(city.currentBuildings) || 1;
            city.currentBuildings = Math.max(1, current - 1);
        }
        city.updatedAt = Date.now();
        this.updateOrbableState(city);
        this.emitFinance(city);
        return city;
    }

    recordOrbVictory(cityId, points) {
        const city = this.ensureCity(cityId);
        const numericPoints = Number(points);
        const awarded = Number.isFinite(numericPoints) ? Math.max(0, Math.floor(numericPoints)) : 0;
        city.score = Math.max(0, (Number(city.score) || 0) + awarded);
        city.orbs = Math.max(0, (Number(city.orbs) || 0) + 1);
        city.lastOrbReward = awarded;
        city.updatedAt = Date.now();
        this.emitFinance(city);
        return city;
    }

    resetCity(cityId) {
        const city = this.ensureCity(cityId);
        const now = Date.now();
        city.cash = MONEY_STARTING_VALUE;
        city.income = 0;
        city.itemProduction = 0;
        city.research = 0;
        city.hospital = 0;
        city.construction = 0;
        city.currentBuildings = 1;
        city.maxBuildings = 1;
        city.hadBombFactory = false;
        city.hadOrbFactory = false;
        city.isOrbable = false;
        city.orbs = 0;
        city.score = 0;
        city.lastOrbBounty = 0;
        city.lastOrbReward = 0;
        city.activeOrbCount = 0;
        if ('fakeBotMayorSlots' in city) {
            delete city.fakeBotMayorSlots;
        }
        if ('fakeBotRecruitCapacity' in city) {
            delete city.fakeBotRecruitCapacity;
        }
        this.clearOrbHoldersForCity(city.id, { consume: false });
        this.clearCityInventory(city.id);
        city.destroyedAt = now;
        city.startedAt = now;
        city.updatedAt = now;
        this.emitFinance(city);
        return city;
    }

    cycle(currentTick) {
        if (!this.cities.size) {
            return;
        }
        for (const city of this.cities.values()) {
            if (currentTick <= city.nextFinanceTick) {
                continue;
            }

            city.nextFinanceTick = currentTick + MONEY_TICK_INTERVAL;

            if (city.cash > MONEY_MAX_VALUE) {
                city.cash = MONEY_MAX_VALUE;
            } else if (city.cash < 0) {
                city.cash = 0;
                if (Math.random() < REFUND_CHANCE) {
                    city.cash = COST_UPKEEP_HOSPITAL;
                }
            }

            this.emitFinance(city);

            city.income = 0;
            city.itemProduction = 0;
            city.research = 0;
            city.hospital = 0;
            city.construction = 0;
        }
    }

    emitFinance(city) {
        if (!this.io || !city) {
            return;
        }
        const grossIncome = city.income - (city.itemProduction + city.research + city.hospital + city.construction);
        const payload = {
            id: city.id,
            cash: city.cash,
            income: city.income,
            itemProduction: city.itemProduction,
            research: city.research,
            hospital: city.hospital,
            construction: city.construction,
            grossIncome,
            updatedAt: Date.now(),
            score: Number(city.score) || 0,
            orbs: Number(city.orbs) || 0,
            orbPoints: this.getOrbValue(city),
            isOrbable: !!city.isOrbable,
            currentBuildings: Number(city.currentBuildings) || 0,
            maxBuildings: Number(city.maxBuildings) || 0,
        };
        this.io.emit('city:finance', payload);
    }
}

module.exports = CityManager;
