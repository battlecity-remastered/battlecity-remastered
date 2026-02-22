import {
    decodeKnownEnvelope,
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
import { removePlayer } from "./player-runtime.js";
import { tickBullets } from "./bullet-runtime.js";
import { dispatchRuntimeEvent } from "./dispatch.js";

export class GameRuntime {
    private readonly state: RuntimeState;
    private readonly config: RuntimeConfig;
    private readonly broadcaster: Broadcaster;
    private readonly emitter: RuntimeEmitter;

    constructor(
        broadcaster: Broadcaster,
        config: Partial<RuntimeConfig> = {},
        initialState: RuntimeState = createRuntimeState()
    ) {
        this.broadcaster = broadcaster;
        this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
        this.state = initialState;
        this.emitter = createRuntimeEmitter(this.state, this.broadcaster);
    }

    public handleRawEvent(socketId: string, raw: unknown): void {
        Effect.runSync(this.handleRawEventEffect(socketId, raw));
    }

    public handleRawEventEffect(socketId: string, raw: unknown): Effect.Effect<void> {
        return Effect.suspend(() => {
            const decoded = decodeKnownEnvelope(raw);
            if (decoded._tag !== "Right") {
                return Effect.sync(() => {
                    this.broadcaster.reject(socketId, "invalid_envelope");
                });
            }

            return Effect.sync(() => {
                this.handleEvent(socketId, decoded.right);
            });
        });
    }

    public handleDisconnect(socketId: string): void {
        Effect.runSync(this.handleDisconnectEffect(socketId));
    }

    public handleDisconnectEffect(socketId: string): Effect.Effect<void> {
        return Effect.sync(() => {
            this.state.socketCities.delete(socketId);
            this.state.socketRoles.delete(socketId);
            if (this.state.players.has(socketId)) {
                this.emitter.emit("player.removed", { id: socketId });
            }
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
        dispatchRuntimeEvent(socketId, event, {
            state: this.state,
            config: this.config,
            emitter: this.emitter,
            broadcaster: this.broadcaster,
            nextSeq: () => this.nextSeq()
        });
    }

    private nextSeq(): number {
        this.state.seq += 1;
        return this.state.seq;
    }
}
