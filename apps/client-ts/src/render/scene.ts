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

const buildHudLines = (state: ClientState): string[] => {
    const finance = state.cityFinance.get(state.local.city);
    const research = state.research.get(state.local.city);
    const cityStock = state.factoryStock.get(state.local.city);
    let factoryItem0 = 0;
    if (cityStock) {
        const value = cityStock.get(0);
        if (typeof value === "number") {
            factoryItem0 = value;
        }
    }

    let localId = "(joining...)";
    if (state.local.id) {
        localId = state.local.id;
    }

    let cash = "-";
    let income = "-";
    if (finance) {
        cash = String(finance.cash);
        income = String(finance.income);
    }

    let researchLine = "0";
    if (research) {
        researchLine = String(research.completed.length);
        if (research.active) {
            researchLine = `${researchLine} (active)`;
        }
    }

    return [
        `id: ${localId}`,
        `city: ${state.local.city}`,
        `health: ${state.local.health}/${state.local.maxHealth}`,
        `remote: ${state.remotePlayers.size}`,
        `cash: ${cash}`,
        `income: ${income}`,
        `research: ${researchLine}`,
        `factory item0: ${factoryItem0}`,
        `hazards: ${state.hazards.size}`,
        `chat: ${state.chat.history.length}`,
        `build denied: ${state.events.lastBuildDeniedReason ?? "-"}`,
        `demolish denied: ${state.events.lastDemolishDeniedReason ?? "-"}`,
        "controls: W/Up move, A/D turn, Space fire, R research, C collect, U deploy"
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
