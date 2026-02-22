import {
    decodeKnownEnvelope,
    type KnownEventPayloadByType,
    type KnownTypedEventEnvelope
} from "@battlecity/protocol";
import { Effect } from "effect";
import {
    createRuntimeState,
    DEFAULT_RUNTIME_CONFIG,
    type RuntimeConfig,
    type RuntimeState
} from "./types.js";
import { createRuntimeEmitter, type Broadcaster, type RuntimeEmitter } from "./emitter.js";
import { emitPlayersSnapshot } from "./snapshot.js";
import { upsertPlayerFromUpdate, removePlayer } from "./player-runtime.js";
import { placeBuildingFromRequest, demolishBuildingFromRequest } from "./building-runtime.js";
import { createBulletFromRequest, tickBullets } from "./bullet-runtime.js";

type RuntimeHandler<TType extends keyof KnownEventPayloadByType> =
    (socketId: string, payload: KnownEventPayloadByType[TType]) => void;

export class GameRuntime {
    private readonly state: RuntimeState;
    private readonly config: RuntimeConfig;
    private readonly broadcaster: Broadcaster;
    private readonly emitter: RuntimeEmitter;
    private readonly handlers: {
        [K in keyof KnownEventPayloadByType]?: RuntimeHandler<K>;
    };

    constructor(
        broadcaster: Broadcaster,
        config: Partial<RuntimeConfig> = {},
        initialState: RuntimeState = createRuntimeState()
    ) {
        this.broadcaster = broadcaster;
        this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
        this.state = initialState;
        this.emitter = createRuntimeEmitter(this.state, this.broadcaster);
        this.handlers = {
            "lobby.join.request": (socketId, payload) => {
                this.handleLobbyJoin(socketId, payload);
            },
            "player.update": (socketId, payload) => {
                this.handlePlayerUpdate(socketId, payload);
            },
            "bullet.fire.request": (socketId, payload) => {
                this.handleBulletFire(socketId, payload);
            },
            "building.place.request": (socketId, payload) => {
                this.handleBuildingPlace(socketId, payload);
            },
            "building.demolish.request": (socketId, payload) => {
                this.handleBuildingDemolish(socketId, payload);
            }
        };
    }

    public handleRawEvent(socketId: string, raw: unknown): void {
        Effect.runSync(this.handleRawEventEffect(socketId, raw));
    }

    public handleRawEventEffect(socketId: string, raw: unknown): Effect.Effect<void> {
        return Effect.sync(() => {
            const decoded = decodeKnownEnvelope(raw);
            if (decoded._tag !== "Right") {
                this.broadcaster.reject(socketId, "invalid_envelope");
                return;
            }

            this.handleEvent(socketId, decoded.right);
        });
    }

    public handleDisconnect(socketId: string): void {
        Effect.runSync(this.handleDisconnectEffect(socketId));
    }

    public handleDisconnectEffect(socketId: string): Effect.Effect<void> {
        return Effect.sync(() => {
            this.state.socketCities.delete(socketId);
            this.state.socketRoles.delete(socketId);
            const removedBulletIds = removePlayer(this.state, socketId);
            for (const bulletId of removedBulletIds) {
                this.emitter.emit("bullet.resolved", {
                    id: bulletId,
                    reason: "out_of_bounds"
                });
            }
            emitPlayersSnapshot(this.state, this.emitter);
        });
    }

    public tickBullets(): void {
        Effect.runSync(this.tickBulletsEffect());
    }

    public tickBulletsEffect(): Effect.Effect<void> {
        return Effect.sync(() => {
            tickBullets(this.state, this.config, this.emitter);
        });
    }

    public getReadonlyState(): Readonly<RuntimeState> {
        return this.state;
    }

    private handleEvent(socketId: string, event: KnownTypedEventEnvelope): void {
        const handler = this.handlers[event.type];
        if (handler) {
            handler(socketId, event.payload as never);
        }
    }

    private handleLobbyJoin(socketId: string, payload: KnownEventPayloadByType["lobby.join.request"]): void {
        const city = typeof payload.desiredCity === "number"
            ? Math.max(0, Math.floor(payload.desiredCity))
            : this.config.defaultCity;
        const role = "recruit" as const;

        this.state.socketCities.set(socketId, city);
        this.state.socketRoles.set(socketId, role);

        this.emitter.emitTo(socketId, "lobby.assignment", {
            id: socketId,
            city,
            role
        });

        emitPlayersSnapshot(this.state, this.emitter);
    }

    private handlePlayerUpdate(socketId: string, payload: KnownEventPayloadByType["player.update"]): void {
        upsertPlayerFromUpdate(this.state, socketId, payload, this.config);
        emitPlayersSnapshot(this.state, this.emitter);
    }

    private handleBulletFire(socketId: string, payload: KnownEventPayloadByType["bullet.fire.request"]): void {
        const bullet = createBulletFromRequest(this.state, socketId, payload, this.config, () => this.nextSeq());
        if (!bullet) {
            return;
        }

        this.emitter.emit("bullet.fired", {
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
        const building = placeBuildingFromRequest(
            this.state,
            socketId,
            payload,
            this.config,
            () => this.nextSeq()
        );
        if (!building) {
            return;
        }
        this.emitter.emit("building.placed", building);
    }

    private handleBuildingDemolish(socketId: string, payload: KnownEventPayloadByType["building.demolish.request"]): void {
        const building = demolishBuildingFromRequest(this.state, socketId, payload);
        if (!building) {
            return;
        }

        this.emitter.emit("building.demolished", {
            id: building.id,
            cityId: building.cityId
        });
    }

    private nextSeq(): number {
        this.state.seq += 1;
        return this.state.seq;
    }
}
