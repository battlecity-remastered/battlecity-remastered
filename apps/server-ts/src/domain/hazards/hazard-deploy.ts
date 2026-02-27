import type { KnownEventPayloadByType } from "@battlecity/protocol";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeHazard,
    type RuntimeState
} from "../../runtime/types.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";
import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_DFG,
    ITEM_TYPE_MINE,
    LEGACY_BOMB_DAMAGE,
    LEGACY_BOMB_FUSE_MS,
    LEGACY_BOMB_STRUCTURE_TILE_RADIUS,
    LEGACY_MINE_DAMAGE,
    PASSIVE_DROP_RADIUS,
    PASSIVE_DROP_TYPES,
    TILE,
    isHazardPlacementBlocked,
    isHazardType,
    snapToTile
} from "./hazard-constants.js";

export type HazardDeployResult = {
    hazard: KnownEventPayloadByType["hazard.spawn"];
    inventory?: KnownEventPayloadByType["inventory.update"];
};

export const deployHazard = (
    state: RuntimeState,
    socketId: string,
    cityId: number,
    payload: KnownEventPayloadByType["hazard.deploy.request"],
    nextSeq: () => number,
    config: RuntimeConfig
): CommandResult<HazardDeployResult> => {
    if (payload.cityId !== cityId) {
        return rejectResult("hazard_invalid");
    }

    const type = Math.floor(payload.type);
    if (!Number.isFinite(type) || !isHazardType(type)) {
        return rejectResult("hazard_invalid");
    }
    if (!Number.isFinite(payload.position.x) || !Number.isFinite(payload.position.y)) {
        return rejectResult("hazard_invalid");
    }

    const snappedX = snapToTile(payload.position.x);
    const snappedY = snapToTile(payload.position.y);
    const tileX = Math.floor(snappedX / TILE);
    const tileY = Math.floor(snappedY / TILE);
    if (isHazardPlacementBlocked(state, tileX, tileY)) {
        return rejectResult("hazard_invalid");
    }

    const consumed = consumeInventoryItem(state, socketId, type);
    if (!consumed.ok) {
        return consumed;
    }

    const isPassiveDrop = PASSIVE_DROP_TYPES.has(type);
    const isBomb = type === ITEM_TYPE_BOMB;
    const isMine = type === ITEM_TYPE_MINE;
    const isDfg = type === ITEM_TYPE_DFG;
    const armed = isPassiveDrop ? false : (isBomb ? payload.armed !== false : true);
    const active = !isPassiveDrop && armed;
    const requestedFuseMs = typeof payload.fuseMs === "number" && Number.isFinite(payload.fuseMs)
        ? Math.floor(payload.fuseMs)
        : null;
    const defaultFuseMs = isBomb ? LEGACY_BOMB_FUSE_MS : config.hazardDefaultFuseMs;
    const remainingMs = active
        ? Math.max(100, requestedFuseMs ?? defaultFuseMs)
        : Number.POSITIVE_INFINITY;
    const damage = isPassiveDrop
        ? 0
        : Math.max(1, Math.floor(
            payload.damage
            ?? (isMine ? LEGACY_MINE_DAMAGE : (isBomb ? LEGACY_BOMB_DAMAGE : config.hazardDefaultDamage))
        ));

    const hazard: RuntimeHazard = {
        id: `hazard_${nextSeq()}`,
        ownerId: socketId,
        cityId,
        type,
        x: snappedX,
        y: snappedY,
        radius: Math.max(8, Math.floor(
            payload.radius
            ?? (isPassiveDrop
                ? PASSIVE_DROP_RADIUS
                : (isMine || isDfg ? TILE : TILE * LEGACY_BOMB_STRUCTURE_TILE_RADIUS))
        )),
        damage,
        remainingMs,
        armed,
        active
    };
    state.hazards.set(hazard.id, hazard);

    return okResult({
        hazard: {
            id: hazard.id,
            cityId: hazard.cityId,
            type: hazard.type,
            position: { x: hazard.x, y: hazard.y },
            radius: hazard.radius,
            armed: hazard.armed,
            active: hazard.active
        },
        inventory: consumed.value
    });
};
