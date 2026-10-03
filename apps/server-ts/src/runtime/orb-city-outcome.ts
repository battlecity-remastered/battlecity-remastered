import { Effect } from "effect";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { resolveSocketUserId } from "../domain/identity/IdentityService.js";
import { awardOrbProfileScore, profileForSocket } from "../domain/score/ScoreService.js";
import type { DispatchContext } from "./dispatch-context.js";
import { eliminatePlayer } from "./player-elimination.js";

export const evictOrbedCityPlayers = (context: DispatchContext, cityId: number): void => {
    const residents = [...context.state.socketCities].filter(([, city]) => city === cityId);
    for (const [id] of residents) eliminatePlayer(context.state, context.emitter, context.config, id, { emitDeathEvent: false });
};

export const awardCityOrbProfiles = (context: DispatchContext, actorId: string, event: KnownEventPayloadByType["city.orbed"]): void => {
    const store = context.userStore;
    if (!store) return;
    const holder = resolveSocketUserId(context.state, actorId);
    const participants = new Set<string>();
    for (const [id, city] of context.state.socketCities) {
        if (city === event.sourceCityId) participants.add(resolveSocketUserId(context.state, id));
    }
    for (const userId of participants) Effect.runSync(awardOrbProfileScore(store, actorId, userId, event.awardedScore, userId !== holder));
    for (const [id, userId] of context.state.socketUserIds) {
        if (!participants.has(userId)) continue;
        const profile = Effect.runSync(profileForSocket(store, id, userId));
        context.emitter.emitTo(id, "score.profile", profile);
        const label = context.state.playerProfiles.get(id);
        if (label) label.rankTitle = profile.rank;
    }
};
