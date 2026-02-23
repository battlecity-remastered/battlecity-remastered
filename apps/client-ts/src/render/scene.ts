import { Application, Container, Graphics, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { reconcileEntityCache } from "./entity-cache.js";

const TANK_SIZE = 18;
const TILE_SIZE = 48;

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

const syncTileEntities = (
    cache: Map<string, Graphics>,
    layer: Container,
    desiredIds: Iterable<string>,
    color: number
): void => {
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const entity = new Graphics();
            entity.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(color);
            layer.addChild(entity);
            return entity;
        },
        (_id, entity) => {
            layer.removeChild(entity);
            entity.destroy();
        }
    );
};

const syncCircleEntities = (
    cache: Map<string, Graphics>,
    layer: Container,
    desiredIds: Iterable<string>,
    color: number
): void => {
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const entity = new Graphics();
            entity.circle(0, 0, TILE_SIZE / 3).fill(color);
            layer.addChild(entity);
            return entity;
        },
        (_id, entity) => {
            layer.removeChild(entity);
            entity.destroy();
        }
    );
};

const syncBulletEntities = (
    cache: Map<string, Graphics>,
    layer: Container,
    desiredIds: Iterable<string>
): void => {
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const bullet = new Graphics();
            bullet.circle(0, 0, 4).fill(0xf8e45c);
            layer.addChild(bullet);
            return bullet;
        },
        (_id, bullet) => {
            layer.removeChild(bullet);
            bullet.destroy();
        }
    );
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
    const lastIconPickup = state.events.lastIconPickupConfirmed;
    const lastPickupLine = lastIconPickup
        ? `${lastIconPickup.itemType} x${lastIconPickup.amount}`
        : "-";

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
        `bullets: ${state.bullets.size}`,
        `defenses: ${state.defenses.size}`,
        `chat: ${state.chat.history.length}`,
        `last pickup: ${lastPickupLine}`,
        `build denied: ${state.events.lastBuildDeniedReason ?? "-"}`,
        `demolish denied: ${state.events.lastDemolishDeniedReason ?? "-"}`,
        "controls: W/Up move, A/D turn, Space fire, R research, C pickup, U medkit, X hazard, B orb, Shift+B defense"
    ];
};

export type SceneRuntime = {
    app: Application;
    render: () => void;
};

const attachCanvasToRoot = (app: Application): void => {
    const root = document.getElementById("app");
    if (root) {
        root.appendChild(app.canvas);
    }
};

const createHud = (app: Application): Text => {
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
    return hud;
};

export const createSceneRuntime = async (state: ClientState): Promise<SceneRuntime> => {
    const app = new Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        background: "#09151f",
        antialias: false
    });

    attachCanvasToRoot(app);

    const world = new Container();
    app.stage.addChild(world);

    const localTank = makeTank(0x7fe66f);
    world.addChild(localTank);

    const remoteLayer = new Container();
    world.addChild(remoteLayer);
    const remoteTanks = new Map<string, Graphics>();

    const objectLayer = new Container();
    world.addChild(objectLayer);
    const buildingSprites = new Map<string, Graphics>();
    const defenseSprites = new Map<string, Graphics>();
    const hazardSprites = new Map<string, Graphics>();
    const bulletSprites = new Map<string, Graphics>();

    const hud = createHud(app);

    const render = (): void => {
        applyLocalTank(state, localTank);
        syncRemoteTanks(state, remoteLayer, remoteTanks);
        applyRemoteTankTransforms(state, remoteTanks);

        syncTileEntities(buildingSprites, objectLayer, state.buildings.keys(), 0x3f85ff);
        for (const building of state.buildings.values()) {
            const sprite = buildingSprites.get(building.id);
            if (!sprite) {
                continue;
            }
            sprite.position.set(building.tileX * TILE_SIZE, building.tileY * TILE_SIZE);
        }

        syncTileEntities(defenseSprites, objectLayer, state.defenses.keys(), 0xffb347);
        for (const defense of state.defenses.values()) {
            const sprite = defenseSprites.get(defense.id);
            if (!sprite) {
                continue;
            }
            sprite.position.set(defense.tileX * TILE_SIZE, defense.tileY * TILE_SIZE);
        }

        syncCircleEntities(hazardSprites, objectLayer, state.hazards.keys(), 0xff5e73);
        for (const hazard of state.hazards.values()) {
            const sprite = hazardSprites.get(hazard.id);
            if (!sprite) {
                continue;
            }
            sprite.position.set(hazard.x, hazard.y);
        }

        syncBulletEntities(bulletSprites, objectLayer, state.bullets.keys());
        for (const bullet of state.bullets.values()) {
            const sprite = bulletSprites.get(bullet.id);
            if (!sprite) {
                continue;
            }
            sprite.position.set(bullet.x, bullet.y);
        }

        hud.text = buildHudLines(state).join("\n");
    };

    return {
        app,
        render
    };
};
