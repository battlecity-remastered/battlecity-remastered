import type { NotificationProfile, JoinNotification } from "../adapters/notifications/DiscordNotifier.js";
import type { Effect } from "effect";
import type { UserStoreAdapter } from "../adapters/persistence/UserStoreAdapter.js";
import type { Broadcaster, RuntimeEmitter } from "./emitter.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";
export type DispatchContext = { state: RuntimeState; config: RuntimeConfig; emitter: RuntimeEmitter; broadcaster: Broadcaster; nextSeq: () => number; userStore?: UserStoreAdapter; initializeJoinedPlayer?: (state: RuntimeState, city: number, playerId: string, config: RuntimeConfig) => void; notifyPlayerJoin?: (details: JoinNotification) => Effect.Effect<void>; notifyOrbVictory?: (playerId: string, sourceCityId: number, targetCityId: number, profile?: NotificationProfile) => Effect.Effect<void> };
