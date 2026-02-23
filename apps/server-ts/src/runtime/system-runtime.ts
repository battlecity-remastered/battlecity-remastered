import type { RuntimeEmitter } from "./emitter.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";
import { tickCityEconomy } from "../domain/economy/CityEconomyService.js";
import { tickResearch } from "../domain/research/ResearchService.js";
import { tickFactories } from "../domain/factories/FactoryService.js";
import { tickHazards } from "../domain/hazards/HazardService.js";
import { tickHospitalHealing } from "../domain/health/HealingService.js";

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
    tickHospitalHealing(state, config, emitter);
};
