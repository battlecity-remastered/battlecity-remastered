import {
    normalizeHeading32,
    stepBulletAndResolve,
    type BulletStepResult,
    type BulletState,
    type CombatBuildingState
} from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeEmitter } from "./emitter.js";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeState
} from "./types.js";
import { asCombatPlayers, removePlayer } from "./player-runtime.js";
import { emitPlayersSnapshot } from "./snapshot.js";

export const createBulletFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["bullet.fire.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<BulletState> => {
    const player = state.players.get(socketId);
    if (!player) {
        return rejectResult("player_not_joined");
    }

    const bullet: BulletState = {
        id: `bullet_${nextSeq()}`,
        ownerId: socketId,
        city: player.city,
        x: player.x,
        y: player.y,
        direction: normalizeHeading32(payload.direction),
        speed: config.bulletSpeed,
        type: payload.type
    };

    state.bullets.set(bullet.id, bullet);
    return okResult(bullet);
};

type TickContext = {
    state: RuntimeState;
    emitter: RuntimeEmitter;
};

const handleOutOfBounds = (emitter: RuntimeEmitter, bulletId: string): void => {
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "out_of_bounds"
    });
};

const handlePlayerHit = (
    context: TickContext,
    bullet: BulletState,
    bulletId: string,
    result: Extract<BulletStepResult, { kind: "hit_player" }>
): boolean => {
    const { state, emitter } = context;
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "hit_player",
        hitPlayerId: result.playerId
    });

    const player = state.players.get(result.playerId);
    if (!player) {
        return false;
    }

    const nextHealth = result.nextHealth;
    state.players.set(result.playerId, {
        ...player,
        health: nextHealth
    });

    emitter.emit("player.health", {
        id: result.playerId,
        health: nextHealth,
        maxHealth: player.maxHealth,
        source: "bullet"
    });

    if (!result.isDead) {
        return false;
    }

    emitter.emit("player.dead", {
        id: result.playerId,
        by: bullet.ownerId
    });
    const removedBulletIds = removePlayer(state, result.playerId);
    for (const ownedBulletId of removedBulletIds) {
        handleOutOfBounds(emitter, ownedBulletId);
    }
    return true;
};

const handleBuildingHit = (
    context: TickContext,
    bulletId: string,
    result: Extract<BulletStepResult, { kind: "hit_building" }>
): void => {
    const { state, emitter } = context;
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "hit_building",
        hitBuildingId: result.buildingId
    });

    const building = state.buildings.get(result.buildingId);
    if (!building) {
        return;
    }

    if (result.isDemolished) {
        state.buildings.delete(building.id);
        emitter.emit("building.demolished", {
            id: building.id,
            cityId: building.cityId
        });
        return;
    }

    state.buildings.set(building.id, {
        ...building,
        health: result.nextHealth
    });
};

const resolveBulletStep = (
    context: TickContext,
    bullet: BulletState,
    bulletId: string,
    result: BulletStepResult
): boolean => {
    if (result.kind === "none") {
        context.state.bullets.set(bulletId, result.bullet);
        return false;
    }

    context.state.bullets.delete(bulletId);

    if (result.kind === "out_of_bounds") {
        handleOutOfBounds(context.emitter, bulletId);
        return false;
    }

    if (result.kind === "hit_player") {
        return handlePlayerHit(context, bullet, bulletId, result);
    }

    handleBuildingHit(context, bulletId, result);
    return false;
};

export const tickBullets = (state: RuntimeState, config: RuntimeConfig, emitter: RuntimeEmitter): void => {
    const context: TickContext = { state, emitter };
    let snapshotDirty = false;

    for (const [bulletId, bullet] of state.bullets.entries()) {
        const result = stepBulletAndResolve(
            bullet,
            config.bulletTickMs,
            config.mapMax,
            config.mapMax,
            asCombatPlayers(state),
            state.buildings.values() as Iterable<CombatBuildingState>
        );
        snapshotDirty = resolveBulletStep(context, bullet, bulletId, result) || snapshotDirty;
    }

    if (snapshotDirty) {
        emitPlayersSnapshot(state, emitter);
    }
};
