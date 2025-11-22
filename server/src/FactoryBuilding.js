/*jslint node: true */
"use strict";


var debug = require('debug')('BattleCity:FactoryBuilding');
const { POPULATION_MAX_NON_HOUSE, FACTORY_ITEM_LIMITS, COST_ITEM } = require('./constants');
const { ITEM_TYPES } = require('./items');

class FactoryBuilding {

    constructor(game, building) {

        this.game = game;
        this.building = building;
        this.productionTick = 0;
    }

    cycle(factory, io) {
        if (!io) {
            return;
        }
        if (this.building.population < POPULATION_MAX_NON_HOUSE) {
            return;
        }

        const limit = FACTORY_ITEM_LIMITS[this.building.type];
        const cityId = this.building.cityId ?? this.building.city ?? 0;
        const itemType = this.building.type % 100;
        if (factory && typeof factory.hasActiveResearchForBuildingType === 'function') {
            if (!factory.hasActiveResearchForBuildingType(cityId, this.building.type)) {
                this.productionTick = this.game.tick + 1000;
                return;
            }
        }
        if (limit !== undefined) {
            let outstanding = this.building.itemsLeft || 0;
            if (factory && typeof factory.getCityOutstandingItemCount === 'function') {
                outstanding = factory.getCityOutstandingItemCount(cityId, itemType);
            }
            if (outstanding >= limit) {
                return;
            }
        }

        if (this.game.tick > this.productionTick) {
            const cityManager = factory ? factory.cityManager : null;
            if (itemType === ITEM_TYPES.ORB && cityManager && !cityManager.canProduceOrb(cityId, limit !== undefined ? limit : 1)) {
                return;
            }
            if (cityManager && !cityManager.trySpendForFactory(cityId, COST_ITEM)) {
                this.productionTick = this.game.tick + 1000;
                return;
            }

            this.productionTick = this.game.tick + 7000;

            const icon = {
                x: (this.building.x * 48) + 56,
                y: (this.building.y * 48) + 102,
                type: this.building.type % 100,
                ownerId: null,
                cityId: this.building.cityId ?? null,
                teamId: this.building.cityId ?? null,
                buildingId: this.building.id,
                producedBy: this.building.ownerId || null,
            };

            debug("Factory produced icon", icon);
            io.emit("new_icon", JSON.stringify(icon));

            const current = this.building.itemsLeft || 0;
            this.building.itemsLeft = limit !== undefined ? Math.min(limit, current + 1) : current + 1;
            if (itemType === ITEM_TYPES.ORB && cityManager) {
                cityManager.registerOrbProduced(cityId);
            }
            this.building.smokeActive = true;
            this.building.smokeFrame = 1;
            this.building.smokeTick = this.game.tick + 200;
            this.building.smokeEndTick = this.game.tick + 4000;
            factory.emitPopulationUpdate(this.building);
        }
    }
}

module.exports = FactoryBuilding;
