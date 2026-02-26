import {
    decodeKnownEnvelope,
    type KnownEventType,
    type KnownTypedEventEnvelope
} from "@battlecity/protocol";
import { Effect } from "effect";
import type { UserStoreAdapter } from "../adapters/persistence/UserStoreAdapter.js";
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
import { tickRuntimeSystems } from "./system-runtime.js";
import { rejectSocket } from "./rejections.js";
import { releasePlayerInventory } from "../domain/inventory/InventoryService.js";
import { lobbyHighScores } from "../domain/score/ScoreService.js";

type RuntimeAdapterServices = {
    userStore?: UserStoreAdapter;
    notifyOrbVictory?: (playerId: string, sourceCityId: number, targetCityId: number) => Effect.Effect<void>;
};

type InboundGuardState = {
    windowStartAt: number;
    totalCount: number;
    perTypeCount: Map<KnownEventType, number>;
    lastSeq: number;
    mutedUntil: number;
};

const INBOUND_WINDOW_MS = 1000;
const INBOUND_TOTAL_LIMIT_PER_WINDOW = 90;
const INBOUND_PLAYER_UPDATE_LIMIT_PER_WINDOW = 35;
const INBOUND_JOIN_LIMIT_PER_WINDOW = 4;
const INBOUND_ACTION_LIMIT_PER_WINDOW = 20;
const INBOUND_MUTE_MS = 3000;

const createInboundGuardState = (now: number): InboundGuardState => {
    return {
        windowStartAt: now,
        totalCount: 0,
        perTypeCount: new Map<KnownEventType, number>(),
        lastSeq: -1,
        mutedUntil: 0
    };
};

const resolvePerTypeLimit = (eventType: KnownEventType): number => {
    if (eventType === "player.update") {
        return INBOUND_PLAYER_UPDATE_LIMIT_PER_WINDOW;
    }
    if (eventType === "lobby.join.request") {
        return INBOUND_JOIN_LIMIT_PER_WINDOW;
    }
    if (eventType.endsWith(".request")) {
        return INBOUND_ACTION_LIMIT_PER_WINDOW;
    }
    return INBOUND_TOTAL_LIMIT_PER_WINDOW;
};

export class GameRuntime {
    private readonly stateRef: RuntimeStateRef;
    private readonly config: RuntimeConfig;
    private readonly broadcaster: Broadcaster;
    private readonly emitter: RuntimeEmitter;
    private readonly services: RuntimeAdapterServices;
    private readonly inboundGuards = new Map<string, InboundGuardState>();

    constructor(
        broadcaster: Broadcaster,
        config: Partial<RuntimeConfig> = {},
        initialState: RuntimeState = createRuntimeState(),
        services: RuntimeAdapterServices = {}
    ) {
        this.broadcaster = broadcaster;
        this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
        this.stateRef = createRuntimeStateRef(initialState);
        this.emitter = createRuntimeEmitter(readRuntimeState(this.stateRef), this.broadcaster);
        this.services = services;
    }

    public handleRawEvent(socketId: string, raw: unknown): void {
        Effect.runSync(this.handleRawEventEffect(socketId, raw));
    }

    public handleRawEventEffect(socketId: string, raw: unknown): Effect.Effect<void> {
        return Effect.suspend(() => {
            const decoded = decodeKnownEnvelope(normalizeInboundEnvelopeType(raw));
            if (decoded._tag !== "Right") {
                return Effect.sync(() => {
                    rejectSocket(this.broadcaster, socketId, "invalid_envelope", {
                        eventType: "runtime.raw_event",
                        rawType: typeof raw
                    });
                });
            }

            return Effect.sync(() => {
                const guardReason = this.guardInboundEvent(socketId, decoded.right);
                if (guardReason) {
                    rejectSocket(this.broadcaster, socketId, guardReason, {
                        eventType: decoded.right.type,
                        seq: decoded.right.seq
                    });
                    return;
                }
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
            state.chatRateLimit.delete(socketId);
            state.socketUserIds.delete(socketId);
            this.inboundGuards.delete(socketId);
            if (state.players.has(socketId)) {
                this.emitter.emit("player.removed", { id: socketId });
            }
            if (released) {
                this.emitter.emit("lobby.released", released);
                this.emitter.emit("lobby.snapshot", buildLobbySnapshot(state, this.config));
                if (this.services.userStore) {
                    this.emitter.emit("lobby.high_scores", Effect.runSync(lobbyHighScores(this.services.userStore)));
                }
            }
            const removedBulletIds = removePlayer(state, socketId);
            releasePlayerInventory(state, socketId);
            for (const bulletId of removedBulletIds) {
                this.emitter.emit("bullet.resolved", {
                    id: bulletId,
                    reason: "out_of_bounds"
                });
            }
            emitPlayersSnapshot(state, this.emitter);
        });
    }

    public emitLobbyBootstrap(socketId: string): void {
        const state = readRuntimeState(this.stateRef);
        this.emitter.emitTo(socketId, "lobby.snapshot", buildLobbySnapshot(state, this.config));
        if (this.services.userStore) {
            this.emitter.emitTo(socketId, "lobby.high_scores", Effect.runSync(lobbyHighScores(this.services.userStore)));
        }
    }

    public tickBullets(): void {
        Effect.runSync(this.tickBulletsEffect());
    }

    public tickBulletsEffect(): Effect.Effect<void> {
        return Effect.sync(() => {
            const state = readRuntimeState(this.stateRef);
            tickBullets(state, this.config, this.emitter);
            tickRuntimeSystems(state, this.config, this.emitter, this.config.bulletTickMs);
        });
    }

    public getReadonlyState(): Readonly<RuntimeState> {
        return readRuntimeState(this.stateRef);
    }

    private handleEvent(socketId: string, event: KnownTypedEventEnvelope): void {
        const state = readRuntimeState(this.stateRef);
        const context = {
            state,
            config: this.config,
            emitter: this.emitter,
            broadcaster: this.broadcaster,
            nextSeq: () => this.nextSeq()
        };
        if (this.services.userStore) {
            Object.assign(context, { userStore: this.services.userStore });
        }
        if (this.services.notifyOrbVictory) {
            Object.assign(context, { notifyOrbVictory: this.services.notifyOrbVictory });
        }
        dispatchRuntimeEvent(socketId, event, context);
    }

    private nextSeq(): number {
        const state = readRuntimeState(this.stateRef);
        state.seq += 1;
        return state.seq;
    }

    private guardInboundEvent(
        socketId: string,
        event: KnownTypedEventEnvelope
    ): "replay_detected" | "rate_limited" | null {
        const now = Date.now();
        const guard = this.inboundGuards.get(socketId) ?? createInboundGuardState(now);
        this.inboundGuards.set(socketId, guard);

        if (now < guard.mutedUntil) {
            return "rate_limited";
        }

        if (event.seq <= guard.lastSeq) {
            return "replay_detected";
        }
        guard.lastSeq = event.seq;

        if ((now - guard.windowStartAt) >= INBOUND_WINDOW_MS) {
            guard.windowStartAt = now;
            guard.totalCount = 0;
            guard.perTypeCount.clear();
        }

        guard.totalCount += 1;
        if (guard.totalCount > INBOUND_TOTAL_LIMIT_PER_WINDOW) {
            guard.mutedUntil = now + INBOUND_MUTE_MS;
            return "rate_limited";
        }

        const currentTypeCount = (guard.perTypeCount.get(event.type) ?? 0) + 1;
        guard.perTypeCount.set(event.type, currentTypeCount);
        if (currentTypeCount > resolvePerTypeLimit(event.type)) {
            guard.mutedUntil = now + INBOUND_MUTE_MS;
            return "rate_limited";
        }

        return null;
    }
}
