import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeDefense, RuntimeHazard, RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { createLayoutOccupiedSet } from "./fake-city-layout.js";
import type { FakeCityDefenseEntry, FakeCityLayoutEntry } from "./fake-city-model.js";
import {
    DEFENSE_MAX_HEALTH,
    DEFENSE_TYPE_BY_KEY,
    ITEM_TYPE_DFG,
    ITEM_TYPE_MINE,
    asFiniteNumber,
    mapMaxTileFromConfig
} from "./fake-city-model.js";

type ResolvedDefensePlacement = {
    column: number;
    row: number;
    tileKey: string;
    worldX: number;
    worldY: number;
    normalizedType: number | string;
    orientation: number;
};

type DefenseDeploymentContext = {
    state: RuntimeState;
    runtimeConfig: RuntimeConfig;
    emitter: RuntimeEmitter;
    cityId: number;
    ownerId: string;
    baseTileX: number;
    baseTileY: number;
    mapMaxTile: number;
    layoutOccupied: Set<string>;
    placedTiles: Set<string>;
    defenseIds: string[];
    hazardIds: string[];
};

const HAZARD_DEFENSE_TYPES = new Set(["mine", "mines", "minefield", "dfg"]);

const resolveDefenseItemType = (type: number | string | undefined): number | null => {
    if (type === undefined || type === null) {
        return null;
    }
    if (typeof type === "number" && Number.isFinite(type)) {
        return type;
    }
    const normalized = String(type).toLowerCase();
    return DEFENSE_TYPE_BY_KEY[normalized] ?? null;
};

const resolveDefensePlacement = (
    defense: FakeCityDefenseEntry,
    context: DefenseDeploymentContext
): ResolvedDefensePlacement | null => {
    if (defense.type === undefined || defense.type === null) {
        return null;
    }
    const dx = asFiniteNumber(defense.dx, Number.NaN);
    const dy = asFiniteNumber(defense.dy, Number.NaN);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    const tileX = context.baseTileX + dx;
    const tileY = context.baseTileY + dy;
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return null;
    }
    if (tileX < 0 || tileY < 0 || tileX > context.mapMaxTile || tileY > context.mapMaxTile) {
        return null;
    }

    const column = Math.floor(tileX);
    const row = Math.floor(tileY);
    const normalizedType = typeof defense.type === "string" ? defense.type.toLowerCase() : defense.type;
    const orientation = Math.max(0, Math.min(31, Math.floor(asFiniteNumber(defense.angle, 0)) % 32));
    return {
        column,
        row,
        tileKey: `${column}_${row}`,
        worldX: tileX * context.runtimeConfig.tileSize,
        worldY: tileY * context.runtimeConfig.tileSize,
        normalizedType,
        orientation
    };
};

const canPlaceDefenseAtTile = (
    defense: FakeCityDefenseEntry,
    tileKey: string,
    layoutOccupied: Set<string>,
    placedTiles: Set<string>
): boolean => {
    if (defense.allowOverlap === true) {
        return true;
    }
    return !layoutOccupied.has(tileKey) && !placedTiles.has(tileKey);
};

const isHazardDefenseType = (normalizedType: number | string): normalizedType is string => {
    return typeof normalizedType === "string" && HAZARD_DEFENSE_TYPES.has(normalizedType);
};

const spawnFakeCityHazard = (
    context: DefenseDeploymentContext,
    defense: FakeCityDefenseEntry,
    placement: ResolvedDefensePlacement
): void => {
    const normalizedType = placement.normalizedType;
    if (!isHazardDefenseType(normalizedType)) {
        return;
    }
    context.state.seq += 1;
    const hazard: RuntimeHazard = {
        id: defense.id ?? `fake_hazard_${context.cityId}_${context.state.seq}`,
        ownerId: context.ownerId,
        cityId: context.cityId,
        type: normalizedType === "dfg" ? ITEM_TYPE_DFG : ITEM_TYPE_MINE,
        x: placement.worldX,
        y: placement.worldY,
        radius: context.runtimeConfig.tileSize,
        damage: normalizedType === "dfg" ? context.runtimeConfig.hazardDefaultDamage : 19,
        remainingMs: Number.POSITIVE_INFINITY,
        armed: true,
        active: true
    };
    context.state.hazards.set(hazard.id, hazard);
    context.hazardIds.push(hazard.id);
    context.placedTiles.add(placement.tileKey);
    context.emitter.emit("hazard.spawn", {
        id: hazard.id,
        cityId: context.cityId,
        type: hazard.type,
        position: { x: hazard.x, y: hazard.y },
        radius: hazard.radius,
        armed: true,
        active: true
    });
};

const spawnFakeCityDefense = (
    context: DefenseDeploymentContext,
    defense: FakeCityDefenseEntry,
    placement: ResolvedDefensePlacement,
    itemType: number
): void => {
    context.state.seq += 1;
    const maxHealth = DEFENSE_MAX_HEALTH[itemType] ?? 20;
    const runtimeDefense: RuntimeDefense = {
        id: defense.id ?? `fake_defense_${context.cityId}_${context.state.seq}`,
        cityId: context.cityId,
        type: itemType,
        tileX: placement.column,
        tileY: placement.row,
        health: maxHealth,
        maxHealth,
        orientation: placement.orientation,
        nextShotAt: 0
    };
    context.state.defenses.set(runtimeDefense.id, runtimeDefense);
    context.defenseIds.push(runtimeDefense.id);
    context.placedTiles.add(placement.tileKey);
    const basePayload = {
        id: runtimeDefense.id,
        cityId: context.cityId,
        type: runtimeDefense.type,
        tileX: runtimeDefense.tileX,
        tileY: runtimeDefense.tileY,
        health: runtimeDefense.health,
        maxHealth: runtimeDefense.maxHealth
    };
    const payload: KnownEventPayloadByType["defense.spawn"] =
        typeof runtimeDefense.orientation === "number" && Number.isFinite(runtimeDefense.orientation)
            ? { ...basePayload, orientation: runtimeDefense.orientation }
            : basePayload;
    context.emitter.emit("defense.spawn", payload);
};

const deploySingleDefense = (
    context: DefenseDeploymentContext,
    defense: FakeCityDefenseEntry
): void => {
    const placement = resolveDefensePlacement(defense, context);
    if (!placement) {
        return;
    }
    if (!canPlaceDefenseAtTile(defense, placement.tileKey, context.layoutOccupied, context.placedTiles)) {
        return;
    }
    if (isHazardDefenseType(placement.normalizedType)) {
        spawnFakeCityHazard(context, defense, placement);
        return;
    }
    const itemType = resolveDefenseItemType(placement.normalizedType);
    if (itemType === null) {
        return;
    }
    spawnFakeCityDefense(context, defense, placement, itemType);
};

export const deployDefenses = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    cityId: number,
    baseTileX: number,
    baseTileY: number,
    layout: FakeCityLayoutEntry[],
    ownerId: string,
    defenses: FakeCityDefenseEntry[]
): { defenseIds: string[]; hazardIds: string[] } => {
    const defenseIds: string[] = [];
    const hazardIds: string[] = [];
    if (!defenses.length) {
        return { defenseIds, hazardIds };
    }

    const context: DefenseDeploymentContext = {
        state,
        runtimeConfig,
        emitter,
        cityId,
        ownerId,
        baseTileX,
        baseTileY,
        mapMaxTile: mapMaxTileFromConfig(runtimeConfig),
        layoutOccupied: createLayoutOccupiedSet(layout, baseTileX, baseTileY),
        placedTiles: new Set<string>(),
        defenseIds,
        hazardIds
    };

    for (const defense of defenses) {
        deploySingleDefense(context, defense);
    }

    return { defenseIds, hazardIds };
};
