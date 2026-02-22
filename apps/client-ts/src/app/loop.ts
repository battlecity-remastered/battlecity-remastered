import type { ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";

const TICK_MS = 100;

export const startGameLoop = (state: ClientState, send: EventSender): void => {
    setInterval(() => {
        if (!state.local.id) {
            return;
        }

        state.local.direction = (state.local.direction + 1) % 32;

        send("player.update", {
            id: state.local.id,
            city: state.local.city,
            direction: state.local.direction,
            isMoving: true,
            offset: {
                x: state.local.x,
                y: state.local.y
            }
        });

        const now = Date.now();
        if (now - state.local.lastShotAt > 1000) {
            state.local.lastShotAt = now;
            send("bullet.fire.request", {
                ownerId: state.local.id,
                position: {
                    x: state.local.x,
                    y: state.local.y
                },
                direction: state.local.direction,
                type: 0
            });
        }

        if (!state.local.placedInitialBuilding) {
            state.local.placedInitialBuilding = true;
            send("building.place.request", {
                ownerId: state.local.id,
                cityId: state.local.city,
                type: 109,
                tileX: 10,
                tileY: 10
            });
        }
    }, TICK_MS);
};
