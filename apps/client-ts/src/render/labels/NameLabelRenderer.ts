import { Graphics, Sprite, Text, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getCityDisplayName } from "../../world/city-spawn.js";
import { reconcileEntityCache } from "../entity-cache.js";

type RenderEntity = Graphics | Sprite;
const DEFAULT_ENTITY_SIZE = 48;
const LABEL_CLEARANCE = 8;
const MIN_ENEMY_NAME_ALPHA = 0.35;

const resolveRank = (state: ClientState): string => {
    return state.scoreProfile.rank ?? "Private";
};

const buildLabel = (rank: string, name: string, city: number): string => {
    return `${rank} ${name}\n${getCityDisplayName(city)}`;
};

const resolveCallsign = (state: ClientState, id: string | null): string => {
    if (id === state.local.id) {
        return state.identity.callsign;
    }
    return id ?? "Unit";
};

const resolveHealthAlpha = (
    state: ClientState,
    city: number,
    health: number | undefined,
    maxHealth: number | undefined
): number => {
    if (city === state.local.city) {
        return 1;
    }
    if (!Number.isFinite(health)) {
        return 1;
    }
    const safeMaxHealth = Number.isFinite(maxHealth) && (maxHealth ?? 0) > 0 ? (maxHealth ?? 100) : 100;
    const safeHealth = Math.max(0, health ?? 0);
    const ratio = Math.max(0, Math.min(1, safeHealth / safeMaxHealth));
    return MIN_ENEMY_NAME_ALPHA + (ratio * (1 - MIN_ENEMY_NAME_ALPHA));
};

const createLabel = (): Text => {
    return new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 12,
            fontWeight: "700",
            fill: 0xffffff,
            align: "center",
            stroke: {
                color: 0x101010,
                width: 3,
                join: "round"
            }
        }
    });
};

const resolveLabelPosition = (tank: RenderEntity): { x: number; y: number } => {
    const width = Number.isFinite(tank.width) && tank.width > 0 ? tank.width : DEFAULT_ENTITY_SIZE;
    const height = Number.isFinite(tank.height) && tank.height > 0 ? tank.height : DEFAULT_ENTITY_SIZE;
    if (tank instanceof Sprite) {
        return {
            x: tank.x + (width * (0.5 - tank.anchor.x)),
            y: tank.y - (height * tank.anchor.y) - LABEL_CLEARANCE
        };
    }
    return {
        x: tank.x + (width / 2),
        y: tank.y - LABEL_CLEARANCE
    };
};

export const renderNameLabels = (
    state: ClientState,
    layer: Container,
    localTank: RenderEntity,
    remoteTanks: Map<string, RenderEntity>,
    cache: Map<string, Text>
): void => {
    const desiredIds = ["local", ...state.remotePlayers.keys()];
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const label = createLabel();
            label.anchor.set(0.5, 1);
            layer.addChild(label);
            return label;
        },
        (_id, label) => {
            layer.removeChild(label);
            label.destroy();
        }
    );

    const localLabel = cache.get("local");
    if (localLabel) {
        const text = buildLabel(resolveRank(state), resolveCallsign(state, state.local.id), state.local.city);
        localLabel.text = text;
        localLabel.alpha = 1;
        const localPos = resolveLabelPosition(localTank);
        localLabel.position.set(localPos.x, localPos.y);
    }

    for (const remote of state.remotePlayers.values()) {
        const label = cache.get(remote.id);
        const tank = remoteTanks.get(remote.id);
        if (!label || !tank) {
            continue;
        }
        const text = buildLabel(remote.health !== undefined && remote.health <= 0 ? "KIA" : "Unit", resolveCallsign(state, remote.id), remote.city);
        label.text = text;
        label.alpha = resolveHealthAlpha(state, remote.city, remote.health, remote.maxHealth);
        const remotePos = resolveLabelPosition(tank);
        label.position.set(remotePos.x, remotePos.y);
    }
};
