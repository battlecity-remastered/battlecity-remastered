"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const HazardManager = require("../src/hazards/HazardManager");
const DefenseManager = require("../src/DefenseManager");
const BuildingFactory = require("../src/BuildingFactory");
const { POPULATION_MAX_NON_HOUSE } = require("../src/constants");
const { ITEM_TYPES } = require("../src/items");

test("bomb detonation destroys defenses server-side", () => {
    const game = { tick: 0, map: [], players: {} };

    const playerFactory = {
        getPlayer: () => ({ id: "player1", city: 1 }),
        getPlayerTeam: () => 1,
    };

    const defenseManager = new DefenseManager({ game, playerFactory });
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    buildingFactory.setManagers({ defenseManager });

    // Research + factory to keep city wiring consistent (population for factories)
    const researchBuilding = {
        id: "research",
        type: 409,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
        attachments: [],
    };
    buildingFactory.buildings.set(researchBuilding.id, researchBuilding);

    defenseManager.addDefense({
        id: "def_to_destroy",
        type: ITEM_TYPES.TURRET,
        cityId: 1,
        teamId: 1,
        ownerId: "player1",
        x: 0,
        y: 0,
    }, { broadcast: false });

    const hazardManager = new HazardManager(game, playerFactory);
    hazardManager.setDefenseManager(defenseManager);
    hazardManager.broadcastHazard = () => {}; // silence network chatter

    const bomb = {
        id: "bomb_1",
        type: "bomb",
        x: 0,
        y: 0,
        ownerId: "player1",
        teamId: 1,
        active: true,
        armed: true,
    };
    hazardManager.hazards.set(bomb.id, bomb);

    hazardManager.detonateBomb(bomb);

    assert.ok(!defenseManager.defensesById.has("def_to_destroy"), "defense should be removed by bomb");
});
