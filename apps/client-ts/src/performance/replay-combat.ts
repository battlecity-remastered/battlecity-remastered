import { advanceBullet } from "@battlecity/sim-core";
import { makeKnownEnvelope, type KnownTypedEventEnvelope } from "@battlecity/protocol";
import { applyServerEvent } from "../app/network-events.js";
import type { ClientState } from "../app/state.js";

// Drive the production network presentation path, including live shell/trail
// pools. Launching demo shells is insufficient when network frames own them.
export const createCombatReplay = (state: ClientState, observe: (event: KnownTypedEventEnvelope, state: ClientState) => void) => {
    const born = new Map<string, number>();
    let sequence = 0;
    const deliver = (event: KnownTypedEventEnvelope): void => { observe(event, state); applyServerEvent(state, event); };
    return (frame: number): void => {
        for (const [id, bullet] of state.bullets) {
            const next = advanceBullet(bullet, 1000 / 60, 512 * 48, 512 * 48);
            state.bullets.set(id, next);
            if (frame - born.get(id)! < 54) continue;
            deliver(makeKnownEnvelope("bullet.resolved", ++sequence, { id, reason: "hit_terrain", position: { x: next.x, y: next.y } }));
            born.delete(id);
        }
        if (frame % 12 !== 0) return;
        const type = Math.floor(frame / 12) % 3, id = `replay-shot-${frame}`;
        deliver(makeKnownEnvelope("bullet.fired", ++sequence, {
            id, ownerId: state.local.id ?? "replay-local", city: state.local.city,
            position: { x: state.local.x + 24, y: state.local.y + 24 }, direction: frame % 240 < 120 ? 0 : 16,
            type, speed: (type === 0 ? 60 : type === 1 ? 16 : 24) * 48
        }));
        born.set(id, frame);
    };
};
