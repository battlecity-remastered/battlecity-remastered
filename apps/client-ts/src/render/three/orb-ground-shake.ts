import type { OrthographicCamera } from "three";
import type { ClientState } from "../../app/state.js";

// Broadcast city.orbed events reach every player: no distance attenuation.
// Translate the freshly positioned camera; never alter tank or movement state.
export const createOrbGroundShake = (reducedMotion = false) => {
    let startedAt = -Infinity, previous: ClientState["events"]["lastOrbEvent"];
    return (state: ClientState, camera: OrthographicCamera, now = Date.now()): void => {
        const event = state.events.lastOrbEvent;
        if (event && event !== previous) { previous = event; startedAt = event.at; }
        const elapsed = (now - startedAt) / 1000;
        if (reducedMotion || elapsed < 0 || elapsed >= .95) return;
        const envelope = Math.min(1, elapsed * 35) * (1 - elapsed / .95) ** 2;
        const amplitude = .14 * envelope;
        camera.position.x += amplitude * (Math.sin(elapsed * 71) + .35 * Math.sin(elapsed * 113));
        camera.position.z += amplitude * (Math.cos(elapsed * 83) + .25 * Math.sin(elapsed * 47));
    };
};
