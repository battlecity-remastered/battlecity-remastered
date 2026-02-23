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
import { buildLobbySnapshot, leaveLobby } from "../domain/lobby/LobbyService.js";
import { normalizeInboundEnvelopeType } from "./event-adapter.js";
import { createRuntimeStateRef, readRuntimeState, type RuntimeStateRef } from "./state/RuntimeStateRef.js";

export class GameRuntime {
    private readonly stateRef: RuntimeStateRef;
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
        this.stateRef = createRuntimeStateRef(initialState);
        this.emitter = createRuntimeEmitter(readRuntimeState(this.stateRef), this.broadcaster);
    }

    public handleRawEvent(socketId: string, raw: unknown): void {
        Effect.runSync(this.handleRawEventEffect(socketId, raw));
    }

    public handleRawEventEffect(socketId: string, raw: unknown): Effect.Effect<void> {
        return Effect.suspend(() => {
            const decoded = decodeKnownEnvelope(normalizeInboundEnvelopeType(raw));
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
            const state = readRuntimeState(this.stateRef);
            const released = leaveLobby(state, socketId);
            if (state.players.has(socketId)) {
                this.emitter.emit("player.removed", { id: socketId });
            }
            if (released) {
                this.emitter.emit("lobby.released", released);
                this.emitter.emit("lobby.snapshot", buildLobbySnapshot(state, this.config));
            }
            const removedBulletIds = removePlayer(state, socketId);
            for (const bulletId of removedBulletIds) {
                this.emitter.emit("bullet.resolved", {
                    id: bulletId,
                    reason: "out_of_bounds"
                });
            }
            emitPlayersSnapshot(state, this.emitter);
        });
    }

    public tickBullets(): void {
        Effect.runSync(this.tickBulletsEffect());
    }

    public tickBulletsEffect(): Effect.Effect<void> {
        return Effect.sync(() => {
            tickBullets(readRuntimeState(this.stateRef), this.config, this.emitter);
        });
    }

    public getReadonlyState(): Readonly<RuntimeState> {
        return readRuntimeState(this.stateRef);
    }

    private handleEvent(socketId: string, event: KnownTypedEventEnvelope): void {
        const state = readRuntimeState(this.stateRef);
        dispatchRuntimeEvent(socketId, event, {
            state,
            config: this.config,
            emitter: this.emitter,
            broadcaster: this.broadcaster,
            nextSeq: () => this.nextSeq()
        });
    }

    private nextSeq(): number {
        const state = readRuntimeState(this.stateRef);
        state.seq += 1;
        return state.seq;
    }
}
