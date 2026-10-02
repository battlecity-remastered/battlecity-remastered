import type { ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";
import { direction32ToBulletHeading, resolveTankMuzzlePosition } from "../gameplay/combat/shot-geometry.js";
import { resolveNearbyPickupItemType } from "./intents-factory.js";
import { resolveTankDropTarget } from "../render/three/tank-drop-target.js";
import { listCitySpawns } from "../world/city-spawn.js";
import type { DemoWeapon } from "../render/three/demo-combat.js";

export const createThreeGameActions = (state: ClientState, send: EventSender, flushMovement: () => void = () => {}) => {
    let lastShot = -Infinity, lastAction = -Infinity;
    const ready = (): boolean => Boolean(state.local.id && state.debug.socketConnected && state.local.health > 0);
    const actionReady = (): boolean => {
        if (!ready() || performance.now() - lastAction < 300) return false;
        lastAction = performance.now(); return true;
    };
    return {
        fire(weapon: DemoWeapon): void {
            if (!ready() || performance.now() - lastShot < 1_000) return;
            const type = weapon === "rocket" ? 1 : 0;
            if ((state.inventory.get(type === 1 ? 1 : 12) ?? 0) <= 0) return;
            lastShot = performance.now(); flushMovement();
            send("bullet.fire.request", { ownerId: state.local.id!, position: resolveTankMuzzlePosition(state.local.x, state.local.y, state.local.direction), direction: direction32ToBulletHeading(state.local.direction), type });
        },
        collect(): number | null {
            if (!actionReady()) return null;
            const type = resolveNearbyPickupItemType(state);
            if (type !== null) { flushMovement(); send("icon.pickup.request", { cityId: state.local.city, itemType: type, amount: 1 }); }
            return type;
        },
        deploy(type: number, use = false): boolean {
            if (!actionReady() || (state.inventory.get(type) ?? 0) <= 0) return false;
            flushMovement();
            if (use && (type === 0 || type === 2)) {
                send("item.use.request", { itemType: type }); return true;
            }
            if (type === 5) {
                const x = state.local.x + 24, y = state.local.y + 24;
                const target = listCitySpawns().find(city => city.cityId !== state.local.city && x >= city.tileX * 48 && x <= (city.tileX + 3) * 48 && y >= (city.tileY + 2) * 48 && y <= (city.tileY + 3) * 48);
                if (!target) return false;
                send("orb.drop.request", { sourceCityId: state.local.city, targetCityId: target.cityId, position: { x: state.local.x, y: state.local.y } }); return true;
            }
            const placement = resolveTankDropTarget(state);
            if (!placement) return false;
            if (type >= 8 && type <= 11) {
                send("defense.deploy.request", { cityId: state.local.city, type, tileX: Math.floor(placement.x / 48), tileY: Math.floor(placement.y / 48), fromInventory: true });
            } else {
                send("hazard.deploy.request", { cityId: state.local.city, type, position: placement, armed: use || state.ui.bombArmed });
            }
            return true;
        },
        flare(): void {
            if (!actionReady() || (state.inventory.get(6) ?? 0) <= 0) return;
            flushMovement();
            for (const spread of [-4, 0, 4]) {
                const heading = state.local.direction + 16 + spread;
                send("bullet.fire.request", { ownerId: state.local.id!, position: resolveTankMuzzlePosition(state.local.x, state.local.y, heading), direction: direction32ToBulletHeading(heading), type: 3 });
            }
        }
    };
};
