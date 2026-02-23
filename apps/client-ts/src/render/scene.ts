import { Application, Container, Graphics, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { reconcileEntityCache } from "./entity-cache.js";

const TANK_SIZE = 18;

const makeTank = (color: number): Graphics => {
    const tank = new Graphics();
    tank.rect(-TANK_SIZE / 2, -TANK_SIZE / 2, TANK_SIZE, TANK_SIZE).fill(color);
    tank.rect(0, -2, TANK_SIZE / 2 + 8, 4).fill(0xdde7ef);
    return tank;
};

const applyLocalTank = (state: ClientState, tank: Graphics): void => {
    tank.position.set(state.local.x, state.local.y);
    tank.rotation = (state.local.direction / 32) * (Math.PI * 2);
};

const syncRemoteTanks = (
    state: ClientState,
    remoteLayer: Container,
    remoteTanks: Map<string, Graphics>
): void => {
    reconcileEntityCache(
        remoteTanks,
        state.remotePlayers.keys(),
        () => {
            const tank = makeTank(0xf3655a);
            remoteLayer.addChild(tank);
            return tank;
        },
        (_remoteId, tank) => {
            remoteLayer.removeChild(tank);
            tank.destroy();
        }
    );
};

const applyRemoteTankTransforms = (state: ClientState, remoteTanks: Map<string, Graphics>): void => {
    for (const remote of state.remotePlayers.values()) {
        const tank = remoteTanks.get(remote.id);
        if (!tank) {
            continue;
        }
        tank.position.set(remote.x, remote.y);
        tank.rotation = (remote.direction / 32) * (Math.PI * 2);
    }
};

const readFinance = (state: ClientState): { cash: string; income: string } => {
    const finance = state.cityFinance.get(state.local.city);
    if (!finance) {
        return { cash: "-", income: "-" };
    }
    return {
        cash: String(finance.cash),
        income: String(finance.income)
    };
};

const readResearch = (state: ClientState): string => {
    const research = state.research.get(state.local.city);
    if (!research) {
        return "0";
    }
    const completed = String(research.completed.length);
    if (!research.active) {
        return completed;
    }
    return `${completed} (active)`;
};

const readFactoryStock = (state: ClientState): number => {
    return state.factoryStock.get(state.local.city)?.get(0) ?? 0;
};

const buildHudLines = (state: ClientState): string[] => {
    const localId = state.local.id ?? "(joining...)";
    const finance = readFinance(state);
    const researchLine = readResearch(state);
    const factoryItem0 = readFactoryStock(state);
    const medkits = state.inventory.get(0) ?? 0;
    const rank = state.scoreProfile.rank ?? "-";

    return [
        `id: ${localId}`,
        `user: ${state.scoreProfile.userId ?? "-"}`,
        `city: ${state.local.city}`,
        `rank: ${rank} (${state.scoreProfile.score})`,
        `health: ${state.local.health}/${state.local.maxHealth}`,
        `remote: ${state.remotePlayers.size}`,
        `cash: ${finance.cash}`,
        `income: ${finance.income}`,
        `research: ${researchLine}`,
        `factory item0: ${factoryItem0}`,
        `medkits: ${medkits}`,
        `hazards: ${state.hazards.size}`,
        `defenses: ${state.defenses.size}`,
        `chat: ${state.chat.history.length}`,
        `build denied: ${state.events.lastBuildDeniedReason ?? "-"}`,
        `demolish denied: ${state.events.lastDemolishDeniedReason ?? "-"}`,
        "controls: W/Up move, A/D turn, Space fire, R research, C pickup, U medkit, X hazard, B orb, Shift+B defense"
    ];
};

export type SceneRuntime = {
    app: Application;
    render: () => void;
};

export const createSceneRuntime = async (state: ClientState): Promise<SceneRuntime> => {
    const app = new Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        background: "#09151f",
        antialias: false
    });

    const root = document.getElementById("app");
    if (root) {
        root.appendChild(app.canvas);
    }

    const world = new Container();
    app.stage.addChild(world);

    const localTank = makeTank(0x7fe66f);
    world.addChild(localTank);

    const remoteLayer = new Container();
    world.addChild(remoteLayer);
    const remoteTanks = new Map<string, Graphics>();

    const hud = new Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 16,
            fill: 0xffffff
        }
    });
    hud.position.set(16, 16);
    app.stage.addChild(hud);

    const render = (): void => {
        applyLocalTank(state, localTank);
        syncRemoteTanks(state, remoteLayer, remoteTanks);
        applyRemoteTankTransforms(state, remoteTanks);
        hud.text = buildHudLines(state).join("\n");
    };

    return {
        app,
        render
    };
};
