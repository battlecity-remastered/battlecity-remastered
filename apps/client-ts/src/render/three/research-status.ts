import type { ClientState } from "../../app/state.js";

type Building = ClientState["buildings"] extends Map<string, infer B> ? B : never;
type ActiveResearch = NonNullable<ClientState["research"] extends Map<number, infer R> ? R extends { active?: infer A } ? A : never : never>;
export type ResearchDisplayStatus = { phase: "waiting" | "queued" | "researching" | "ready"; progress: number; remainingMs: number; label: string };

// One clock per city, updated even when its laboratory is outside the viewport.
// Completion is confirmed by the server, never inferred from an expired timer.
export const createResearchStatus = () => {
    const clocks = new Map<number, { source: ActiveResearch; endsAt: number; duration: number }>();
    return {
        sync(state: ClientState, now: number): void {
            for (const cityId of clocks.keys()) if (!state.research.get(cityId)?.active) clocks.delete(cityId);
            for (const [cityId, research] of state.research) {
                const active = research.active;
                if (!active) continue;
                const previous = clocks.get(cityId);
                if (previous?.source === active) continue;
                const remaining = Math.max(0, active.remainingMs);
                const duration = previous?.source.researchType === active.researchType ? Math.max(previous.duration, remaining) : remaining;
                clocks.set(cityId, { source: active, endsAt: now + remaining, duration: Math.max(1, duration) });
            }
        },
        resolve(state: ClientState, building: Building, now: number): ResearchDisplayStatus {
            const research = state.research.get(building.cityId);
            if (research?.completed.includes(building.type)) return { phase: "ready", progress: 1, remainingMs: 0, label: "ITEM READY" };
            const clock = clocks.get(building.cityId);
            if (clock?.source.researchType === building.type) {
                const remainingMs = Math.max(0, clock.endsAt - now);
                return { phase: "researching", progress: Math.min(1, Math.max(0, 1 - remainingMs / clock.duration)), remainingMs, label: remainingMs > 0 ? "RESEARCHING" : "FINALISING" };
            }
            return { phase: building.population < 50 ? "waiting" : "queued", progress: 0, remainingMs: 0, label: building.population < 50 ? "AWAITING CREW" : "QUEUED" };
        }
    };
};

// The offline showroom keeps construction unlocked, but demonstrates both states.
export const demoResearchStatus = (seconds: number): ResearchDisplayStatus => {
    const age = ((seconds % 24) + 24) % 24;
    return age < 14 ? { phase: "researching", progress: age / 14, remainingMs: (14 - age) * 1000, label: "RESEARCHING" }
        : { phase: "ready", progress: 1, remainingMs: 0, label: "ITEM READY" };
};
