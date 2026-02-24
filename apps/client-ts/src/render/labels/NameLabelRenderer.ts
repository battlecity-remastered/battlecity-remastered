import { Graphics, Sprite, Text, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { reconcileEntityCache } from "../entity-cache.js";

type RenderEntity = Graphics | Sprite;

const resolveRank = (state: ClientState): string => {
    return state.scoreProfile.rank ?? "Private";
};

const buildLabel = (rank: string, name: string, city: number): string => {
    return `${rank} ${name}\nCity ${city}`;
};

const resolveCallsign = (state: ClientState, id: string | null): string => {
    if (id === state.local.id) {
        return state.identity.callsign;
    }
    return id ?? "Unit";
};

const createLabel = (): Text => {
    return new Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 11,
            fill: 0xffffff,
            align: "center"
        }
    });
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
        localLabel.position.set(localTank.x, localTank.y - 14);
    }

    for (const remote of state.remotePlayers.values()) {
        const label = cache.get(remote.id);
        const tank = remoteTanks.get(remote.id);
        if (!label || !tank) {
            continue;
        }
        const text = buildLabel(remote.health !== undefined && remote.health <= 0 ? "KIA" : "Unit", resolveCallsign(state, remote.id), remote.city);
        label.text = text;
        label.position.set(tank.x, tank.y - 14);
    }
};
