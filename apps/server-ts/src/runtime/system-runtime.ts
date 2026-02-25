import type { RuntimeEmitter } from "./emitter.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";
import { tickCityEconomy } from "../domain/economy/CityEconomyService.js";
import { tickResearch } from "../domain/research/ResearchService.js";
import { tickFactories } from "../domain/factories/FactoryService.js";
import { tickHazards } from "../domain/hazards/HazardService.js";
import { tickPopulation } from "../domain/population/PopulationService.js";
import { tickFakeCityLifecycle } from "../domain/fake-cities/FakeCityService.js";
import { tickDefenderBots } from "../domain/bots/DefenderBotService.js";
import { tickRogueBots } from "../domain/bots/RogueBotService.js";
import { tickDefenseTurrets } from "../domain/defense/DefenseTurretService.js";
import { emitPlayersSnapshot } from "./snapshot.js";

export const tickRuntimeSystems = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    tickCityEconomy(state, config, emitter, deltaMs);
    tickResearch(state, config, emitter, deltaMs);
    tickFactories(state, config, emitter, deltaMs);
    tickHazards(state, emitter, deltaMs);
    const populationUpdates = tickPopulation(state, config, deltaMs);
    for (const update of populationUpdates) {
        emitter.emit("population.update", update);
    }

    state.botTickAccumulatorMs += deltaMs;
    if (state.botTickAccumulatorMs < config.botTickMs) {
        return;
    }
    state.botTickAccumulatorMs = 0;
    const now = Date.now();
    tickFakeCityLifecycle(state, config, emitter, now);
    tickDefenseTurrets(state, config, emitter, now);
    const defenderDirty = tickDefenderBots(state, config, emitter, now, config.botTickMs);
    const rogueDirty = tickRogueBots(state, config, emitter, now, config.botTickMs);
    if (defenderDirty || rogueDirty) {
        emitPlayersSnapshot(state, emitter);
    }
};
