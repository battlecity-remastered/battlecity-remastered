import {
    makeEnvelope,
    type EventEnvelope,
    type KnownEventPayloadByType
} from "@battlecity/protocol";
import {
    advancePlayer,
    stepBulletAndResolve,
    type BulletState,
    type CombatBuildingState,
    type CombatPlayerState
} from "@battlecity/sim-core";
import { decodeTypedEnvelope } from "@battlecity/protocol";
import {
    createRuntimeState,
    DEFAULT_RUNTIME_CONFIG,
    type RuntimeBuilding,
    type RuntimeConfig,
    type RuntimePlayer,
    type RuntimeState
} from "./types.js";

type EnvelopeType = EventEnvelope["type"];

type Broadcaster = {
    emitAll: (event: EventEnvelope) => void;
    emitTo: (socketId: string, event: EventEnvelope) => void;
    reject: (socketId: string, reason: string) => void;
};

const normalizeDirection = (direction: number): number => {
    const wrapped = Math.floor(direction) % 32;
    return wrapped < 0 ? wrapped + 32 : wrapped;
};

export class GameRuntime {
    private readonly state: RuntimeState;
    private readonly config: RuntimeConfig;
    private readonly broadcaster: Broadcaster;

    constructor(
        broadcaster: Broadcaster,
        config: Partial<RuntimeConfig> = {},
        initialState: RuntimeState = createRuntimeState()
    ) {
        this.broadcaster = broadcaster;
        this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
        this.state = initialState;
    }

    public handleRawEvent(socketId: string, raw: unknown): void {
        const decoded = decodeTypedEnvelope(raw);
        if (decoded._tag !== "Right") {
            this.broadcaster.reject(socketId, "invalid_envelope");
            return;
        }

        this.handleEvent(socketId, decoded.right);
    }

    public handleDisconnect(socketId: string): void {
        this.state.socketCities.delete(socketId);
        this.state.socketRoles.delete(socketId);
        this.removePlayer(socketId);
        this.emitSnapshot();
    }

    public tickBullets(): void {
        let snapshotDirty = false;

        for (const [bulletId, bullet] of this.state.bullets.entries()) {
            const result = stepBulletAndResolve(
                bullet,
                this.config.bulletTickMs,
                this.config.mapMax,
                this.config.mapMax,
                this.state.players.values() as Iterable<CombatPlayerState>,
                this.state.buildings.values() as Iterable<CombatBuildingState>
            );

            if (result.kind === "none") {
                this.state.bullets.set(bulletId, result.bullet);
                continue;
            }

            this.state.bullets.delete(bulletId);

            if (result.kind === "out_of_bounds") {
                this.emit("bullet.resolved", {
                    id: bulletId,
                    reason: "out_of_bounds"
                });
                continue;
            }

            if (result.kind === "hit_player") {
                this.emit("bullet.resolved", {
                    id: bulletId,
                    reason: "hit_player",
                    hitPlayerId: result.playerId
                });

                const player = this.state.players.get(result.playerId);
                if (!player) {
                    continue;
                }

                const nextPlayer: RuntimePlayer = {
                    ...player,
                    health: result.nextHealth
                };

                this.emit("player.health", {
                    id: nextPlayer.id,
                    health: nextPlayer.health,
                    maxHealth: nextPlayer.maxHealth,
                    source: "bullet"
                });

                if (result.isDead) {
                    this.emit("player.dead", {
                        id: nextPlayer.id,
                        by: bullet.ownerId
                    });
                    this.removePlayer(nextPlayer.id);
                    snapshotDirty = true;
                } else {
                    this.state.players.set(nextPlayer.id, nextPlayer);
                }

                continue;
            }

            this.emit("bullet.resolved", {
                id: bulletId,
                reason: "hit_building",
                hitBuildingId: result.buildingId
            });

            const building = this.state.buildings.get(result.buildingId);
            if (!building) {
                continue;
            }

            if (result.isDemolished) {
                this.state.buildings.delete(building.id);
                this.emit("building.demolished", {
                    id: building.id,
                    cityId: building.cityId
                });
                continue;
            }

            this.state.buildings.set(building.id, {
                ...building,
                health: result.nextHealth
            });
        }

        if (snapshotDirty) {
            this.emitSnapshot();
        }
    }

    public getReadonlyState(): Readonly<RuntimeState> {
        return this.state;
    }

    private handleEvent(socketId: string, event: EventEnvelope): void {
        switch (event.type) {
            case "lobby.join.request": {
                this.handleLobbyJoin(socketId, event.payload as KnownEventPayloadByType["lobby.join.request"]);
                return;
            }
            case "player.update": {
                this.handlePlayerUpdate(socketId, event.payload as KnownEventPayloadByType["player.update"]);
                return;
            }
            case "bullet.fire.request": {
                this.handleBulletFire(socketId, event.payload as KnownEventPayloadByType["bullet.fire.request"]);
                return;
            }
            case "building.place.request": {
                this.handleBuildingPlace(socketId, event.payload as KnownEventPayloadByType["building.place.request"]);
                return;
            }
            case "building.demolish.request": {
                this.handleBuildingDemolish(socketId, event.payload as KnownEventPayloadByType["building.demolish.request"]);
                return;
            }
            default:
                return;
        }
    }

    private handleLobbyJoin(socketId: string, payload: KnownEventPayloadByType["lobby.join.request"]): void {
        const city = typeof payload.desiredCity === "number"
            ? Math.max(0, Math.floor(payload.desiredCity))
            : this.config.defaultCity;
        const role = "recruit" as const;

        this.state.socketCities.set(socketId, city);
        this.state.socketRoles.set(socketId, role);

        this.emitTo(socketId, "lobby.assignment", {
            id: socketId,
            city,
            role
        });

        this.emitSnapshot();
    }

    private handlePlayerUpdate(socketId: string, payload: KnownEventPayloadByType["player.update"]): void {
        const city = this.state.socketCities.get(socketId) ?? payload.city ?? this.config.defaultCity;
        this.state.socketCities.set(socketId, city);

        const current = this.state.players.get(socketId) ?? {
            id: socketId,
            city,
            x: payload.offset.x,
            y: payload.offset.y,
            direction: normalizeDirection(payload.direction),
            speed: this.config.playerSpeed,
            health: 100,
            maxHealth: 100
        };

        const withDirection: RuntimePlayer = {
            ...current,
            city,
            direction: normalizeDirection(payload.direction)
        };

        const next = payload.isMoving
            ? {
                ...advancePlayer(withDirection, this.config.serverStepMs, this.config.mapMax, this.config.mapMax),
                city,
                health: current.health,
                maxHealth: current.maxHealth
            }
            : withDirection;

        this.state.players.set(socketId, next);
        this.emitSnapshot();
    }

    private handleBulletFire(socketId: string, payload: KnownEventPayloadByType["bullet.fire.request"]): void {
        const player = this.state.players.get(socketId);
        if (!player) {
            return;
        }

        const bullet: BulletState = {
            id: `bullet_${this.nextSeq()}`,
            ownerId: socketId,
            city: player.city,
            x: player.x,
            y: player.y,
            direction: normalizeDirection(payload.direction),
            speed: this.config.bulletSpeed,
            type: payload.type
        };

        this.state.bullets.set(bullet.id, bullet);
        this.emit("bullet.fired", {
            id: bullet.id,
            ownerId: bullet.ownerId,
            city: bullet.city,
            position: {
                x: bullet.x,
                y: bullet.y
            },
            direction: bullet.direction,
            type: bullet.type
        });
    }

    private handleBuildingPlace(socketId: string, payload: KnownEventPayloadByType["building.place.request"]): void {
        const city = this.state.socketCities.get(socketId);
        if (city === undefined || city !== payload.cityId) {
            return;
        }

        const tileX = Math.max(0, Math.floor(payload.tileX));
        const tileY = Math.max(0, Math.floor(payload.tileY));

        const building: RuntimeBuilding = {
            id: `building_${this.nextSeq()}`,
            ownerId: socketId,
            cityId: city,
            type: payload.type,
            tileX,
            tileY,
            health: this.config.defaultBuildingHealth,
            maxHealth: this.config.defaultBuildingHealth
        };

        this.state.buildings.set(building.id, building);
        this.emit("building.placed", building);
    }

    private handleBuildingDemolish(socketId: string, payload: KnownEventPayloadByType["building.demolish.request"]): void {
        const city = this.state.socketCities.get(socketId);
        const building = this.state.buildings.get(payload.id);
        if (city === undefined || !building || building.cityId !== city || payload.cityId !== city) {
            return;
        }

        if (payload.ownerId && payload.ownerId !== building.ownerId) {
            return;
        }

        this.state.buildings.delete(building.id);
        this.emit("building.demolished", {
            id: building.id,
            cityId: building.cityId
        });
    }

    private buildSnapshot(): KnownEventPayloadByType["players.snapshot"] {
        return Array.from(this.state.players.values()).map((player) => {
            return {
                id: player.id,
                city: player.city,
                direction: player.direction,
                offset: {
                    x: player.x,
                    y: player.y
                },
                health: player.health,
                maxHealth: player.maxHealth
            };
        });
    }

    private emitSnapshot(): void {
        this.emit("players.snapshot", this.buildSnapshot());
    }

    private removeOwnedBullets(ownerId: string): void {
        for (const [bulletId, bullet] of this.state.bullets.entries()) {
            if (bullet.ownerId !== ownerId) {
                continue;
            }
            this.state.bullets.delete(bulletId);
            this.emit("bullet.resolved", {
                id: bulletId,
                reason: "out_of_bounds"
            });
        }
    }

    private removePlayer(playerId: string): void {
        this.state.players.delete(playerId);
        this.removeOwnedBullets(playerId);
    }

    private nextSeq(): number {
        this.state.seq += 1;
        return this.state.seq;
    }

    private emit<TType extends EnvelopeType>(
        type: TType,
        payload: KnownEventPayloadByType[TType & keyof KnownEventPayloadByType]
    ): void {
        this.broadcaster.emitAll(makeEnvelope(type, this.nextSeq(), payload));
    }

    private emitTo<TType extends EnvelopeType>(
        socketId: string,
        type: TType,
        payload: KnownEventPayloadByType[TType & keyof KnownEventPayloadByType]
    ): void {
        this.broadcaster.emitTo(socketId, makeEnvelope(type, this.nextSeq(), payload));
    }
}
