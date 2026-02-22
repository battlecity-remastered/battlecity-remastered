import { Application, Container, Graphics, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";

const TANK_SIZE = 18;

const makeTank = (color: number): Graphics => {
    const tank = new Graphics();
    tank.rect(-TANK_SIZE / 2, -TANK_SIZE / 2, TANK_SIZE, TANK_SIZE).fill(color);
    tank.rect(0, -2, TANK_SIZE / 2 + 8, 4).fill(0xdde7ef);
    return tank;
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
        localTank.position.set(state.local.x, state.local.y);
        localTank.rotation = (state.local.direction / 32) * (Math.PI * 2);

        remoteLayer.removeChildren();
        for (const remote of state.remotePlayers.values()) {
            const tank = makeTank(0xf3655a);
            tank.position.set(remote.x, remote.y);
            tank.rotation = (remote.direction / 32) * (Math.PI * 2);
            remoteLayer.addChild(tank);
        }

        hud.text = [
            `id: ${state.local.id ?? "(joining...)"}`,
            `city: ${state.local.city}`,
            `health: ${state.local.health}/${state.local.maxHealth}`,
            `remote: ${state.remotePlayers.size}`
        ].join("\n");
    };

    return {
        app,
        render
    };
};
