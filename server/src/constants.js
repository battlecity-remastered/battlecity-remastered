"use strict";

const POPULATION_INTERVAL_MS = 250;
const POPULATION_INCREMENT = 5;
const POPULATION_MAX_HOUSE = 100;
const POPULATION_MAX_NON_HOUSE = 50;
const MONEY_MAX_VALUE = 95000000;
const MONEY_STARTING_VALUE = 95000000;
const MONEY_TICK_INTERVAL = 7000;
const COST_BUILDING = 500000;
const COST_ITEM = 750000;
const COST_INCOME_POPULATION = 10000;
const COST_UPKEEP_HOSPITAL = 2000000;

const getFamilyCode = (type) => Math.floor(type / 100);

const isHouse = (type) => getFamilyCode(type) === 3;
const isResearch = (type) => getFamilyCode(type) === 4;
const isFactory = (type) => getFamilyCode(type) === 1;
const isCommandCenter = (type) => type === 0;
const HOSPITAL_TYPE_CODES = new Set([200, 301]);

const isHospital = (type) => {
    const numeric = Number.isFinite(type) ? type : Number(type);
    if (!Number.isFinite(numeric)) {
        return false;
    }
    const expanded = (Number.isInteger(numeric) && numeric >= 0 && numeric < 100)
        ? numeric * 100
        : numeric;
    if (HOSPITAL_TYPE_CODES.has(expanded)) {
        return true;
    }
    const family = getFamilyCode(expanded);
    return family === 2 && expanded >= 200 && expanded < 300;
};

const FACTORY_ITEM_LIMITS = {
    100: 4,   // Cloak factory (ITEM_TYPE_CLOAK)
    101: 4,   // Bazooka/Rocket factory (ITEM_TYPE_ROCKET)
    102: 20,  // Medkit factory (ITEM_TYPE_MEDKIT)
    103: 20,  // Bomb factory (ITEM_TYPE_BOMB)
    104: 10,  // Mine factory (ITEM_TYPE_MINE)
    105: 1,   // Orb factory (ITEM_TYPE_ORB)
    106: 4,   // Flare factory (legacy walkie)
    107: 5,   // DFG factory
    108: 20,  // Wall factory
    109: 10,  // Turret factory
    110: 5,   // Sleeper factory
    111: 5,   // Plasma factory
    112: 4,   // Laser factory (parity with legacy rocket cap)
};

module.exports = {
    POPULATION_INTERVAL_MS,
    POPULATION_INCREMENT,
    POPULATION_MAX_HOUSE,
    POPULATION_MAX_NON_HOUSE,
    MONEY_MAX_VALUE,
    MONEY_STARTING_VALUE,
    MONEY_TICK_INTERVAL,
    COST_BUILDING,
    COST_ITEM,
    COST_INCOME_POPULATION,
    COST_UPKEEP_HOSPITAL,
    isHouse,
    isResearch,
    isFactory,
    isCommandCenter,
    isHospital,
    FACTORY_ITEM_LIMITS,
};
