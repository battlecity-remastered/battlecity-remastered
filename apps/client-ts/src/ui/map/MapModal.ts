import type { ClientState } from "../../app/state.js";
import { MAP_SIZE, loadMapData, type LoadedMap } from "../../world/map-loader.js";
import { resolveCitySpawn } from "../../world/city-spawn.js";

export const MAP_MODAL_TILE_SIZE = 2;
export const MAP_MODAL_SIZE = MAP_SIZE * MAP_MODAL_TILE_SIZE;
const CITY_MARKER_LIMIT = 64;

export type MapModalMarker = {
    x: number;
    y: number;
    radius: number;
    color: string;
};

export type MapModalLabel = {
    x: number;
    y: number;
    text: string;
    color: string;
};

export const resolveMapTerrainColor = (tileValue: number): string => {
    if (tileValue === 0) {
        return "#16231d";
    }
    if (tileValue === 1) {
        return "#6b5a45";
    }
    if (tileValue === 2) {
        return "#7e6746";
    }
    if (tileValue === 3) {
        return "#8f7757";
    }
    return "#111827";
};

export const projectTileToMapPixel = (tile: number): number => {
    return Math.floor(tile * MAP_MODAL_TILE_SIZE);
};

export const projectWorldToMapPixel = (worldPx: number): number => {
    return Math.floor((worldPx / 48) * MAP_MODAL_TILE_SIZE);
};

export const resolveFootprintCenterPixel = (
    tileX: number,
    tileY: number,
    widthTiles: number,
    heightTiles: number
): { x: number; y: number; } => {
    return {
        x: projectTileToMapPixel(tileX + (widthTiles / 2)),
        y: projectTileToMapPixel(tileY + (heightTiles / 2))
    };
};

export const collectMapModalMarkers = (state: ClientState): {
    buildings: MapModalMarker[];
    defenses: MapModalMarker[];
    cities: MapModalMarker[];
    cityLabels: MapModalLabel[];
    players: MapModalMarker[];
} => {
    const buildings: MapModalMarker[] = [];
    const defenses: MapModalMarker[] = [];
    const cities: MapModalMarker[] = [];
    const cityLabels: MapModalLabel[] = [];
    const players: MapModalMarker[] = [];

    for (const building of state.buildings.values()) {
        const center = resolveFootprintCenterPixel(building.tileX, building.tileY, 3, 3);
        buildings.push({
            x: center.x,
            y: center.y,
            radius: 2,
            color: "#7dd3fc"
        });
    }

    for (const defense of state.defenses.values()) {
        const center = resolveFootprintCenterPixel(defense.tileX, defense.tileY, 1, 1);
        defenses.push({
            x: center.x,
            y: center.y,
            radius: 2,
            color: "#fb923c"
        });
    }

    for (let cityId = 0; cityId < CITY_MARKER_LIMIT; cityId += 1) {
        const spawn = resolveCitySpawn(cityId);
        if (!spawn) {
            continue;
        }
        const markerX = projectWorldToMapPixel(spawn.x + 24);
        const markerY = projectWorldToMapPixel(spawn.y + 24);
        cities.push({
            x: markerX,
            y: markerY,
            radius: 3,
            color: "#fcd34d"
        });
        cityLabels.push({
            x: markerX + 4,
            y: markerY - 3,
            text: `C${cityId}`,
            color: "#fde68a"
        });
    }

    players.push({
        x: projectWorldToMapPixel(state.local.x + 24),
        y: projectWorldToMapPixel(state.local.y + 24),
        radius: 3,
        color: "#22d3ee"
    });

    for (const remote of state.remotePlayers.values()) {
        players.push({
            x: projectWorldToMapPixel(remote.x + 24),
            y: projectWorldToMapPixel(remote.y + 24),
            radius: 2,
            color: "#fca5a5"
        });
    }

    return {
        buildings,
        defenses,
        cities,
        cityLabels,
        players
    };
};

export const renderMapModalCanvas = (
    context: Pick<
        CanvasRenderingContext2D,
        "clearRect"
        | "fillRect"
        | "fillText"
        | "beginPath"
        | "arc"
        | "fill"
        | "stroke"
        | "strokeRect"
        | "fillStyle"
        | "strokeStyle"
        | "font"
        | "textAlign"
        | "textBaseline"
        | "lineWidth"
    >,
    mapData: LoadedMap,
    state: ClientState
): void => {
    context.clearRect(0, 0, MAP_MODAL_SIZE, MAP_MODAL_SIZE);

    for (let x = 0; x < mapData.map.length; x += 1) {
        const column = mapData.map[x];
        if (!column) {
            continue;
        }
        for (let y = 0; y < column.length; y += 1) {
            const value = column[y] ?? 0;
            context.fillStyle = resolveMapTerrainColor(value);
            context.fillRect(projectTileToMapPixel(x), projectTileToMapPixel(y), MAP_MODAL_TILE_SIZE, MAP_MODAL_TILE_SIZE);
        }
    }

    const markers = collectMapModalMarkers(state);

    context.fillStyle = "#0b1020";
    for (const marker of markers.cities) {
        context.beginPath();
        context.arc(marker.x, marker.y, marker.radius + 1, 0, Math.PI * 2);
        context.fill();
    }
    for (const marker of markers.cities) {
        context.fillStyle = marker.color;
        context.beginPath();
        context.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
        context.fill();
    }

    context.fillStyle = "#67e8f9";
    for (const marker of markers.buildings) {
        context.beginPath();
        context.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
        context.fill();
    }

    context.fillStyle = "#fb923c";
    for (const marker of markers.defenses) {
        context.beginPath();
        context.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
        context.fill();
    }

    for (const marker of markers.players) {
        context.fillStyle = marker.color;
        context.beginPath();
        context.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
        context.fill();
    }

    context.font = "10px monospace";
    context.textAlign = "left";
    context.textBaseline = "top";
    for (const label of markers.cityLabels) {
        context.fillStyle = label.color;
        context.fillText(label.text, label.x, label.y);
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.4)";
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, MAP_MODAL_SIZE - 1, MAP_MODAL_SIZE - 1);
};

type MapModal = {
    render: () => void;
    dispose: () => void;
};

const resolveModalRoot = (root: HTMLElement, doc: Document): HTMLElement => {
    const fullscreenRoot = doc.fullscreenElement;
    if (fullscreenRoot instanceof HTMLElement) {
        return fullscreenRoot;
    }
    return root;
};

export const createMapModal = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body,
    mapLoader: () => Promise<LoadedMap> = () => loadMapData()
): MapModal => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const overlay = document.createElement("div");
    overlay.setAttribute("data-ui", "map-modal");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(4, 8, 12, 0.72)";
    overlay.style.backdropFilter = "blur(1px)";
    overlay.style.zIndex = "113";

    const frame = document.createElement("div");
    frame.style.display = "flex";
    frame.style.flexDirection = "column";
    frame.style.gap = "8px";
    frame.style.padding = "12px";
    frame.style.background = "rgba(8, 14, 10, 0.96)";
    frame.style.border = "1px solid rgba(170, 210, 160, 0.9)";
    frame.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.4), 0 12px 30px rgba(0, 0, 0, 0.4)";

    const title = document.createElement("div");
    title.textContent = "World Map (F2/Esc to close)";
    title.style.font = "600 13px monospace";
    title.style.color = "#d9f99d";

    const canvas = document.createElement("canvas");
    canvas.width = MAP_MODAL_SIZE;
    canvas.height = MAP_MODAL_SIZE;
    canvas.style.width = "min(90vw, 720px)";
    canvas.style.height = "min(90vw, 720px)";
    canvas.style.maxHeight = "80vh";
    canvas.style.imageRendering = "pixelated";
    canvas.style.border = "1px solid rgba(220, 252, 231, 0.6)";

    frame.appendChild(title);
    frame.appendChild(canvas);
    overlay.appendChild(frame);

    let attachedRoot: HTMLElement | null = null;
    const attachOverlay = (): void => {
        const nextRoot = resolveModalRoot(root, document);
        if (attachedRoot === nextRoot) {
            return;
        }
        overlay.remove();
        nextRoot.appendChild(overlay);
        attachedRoot = nextRoot;
    };

    attachOverlay();

    const context = canvas.getContext("2d");
    let mapData: LoadedMap | null = null;
    let loading = false;

    const requestMapData = (): void => {
        if (loading || mapData) {
            return;
        }
        loading = true;
        void mapLoader()
            .then((resolved) => {
                mapData = resolved;
            })
            .finally(() => {
                loading = false;
            });
    };

    const onOverlayClick = (event: MouseEvent): void => {
        if (event.target === overlay) {
            state.ui.showMapModal = false;
        }
    };

    const onEscape = (event: KeyboardEvent): void => {
        if (event.key === "Escape" && state.ui.showMapModal) {
            state.ui.showMapModal = false;
            event.preventDefault();
        }
    };

    const onFullscreenChange = (): void => {
        attachOverlay();
    };

    overlay.addEventListener("mousedown", onOverlayClick);
    window.addEventListener("keydown", onEscape);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return {
        render: () => {
            attachOverlay();
            overlay.style.display = state.ui.showMapModal ? "flex" : "none";
            if (!state.ui.showMapModal || !context) {
                return;
            }
            if (!mapData) {
                requestMapData();
                context.clearRect(0, 0, MAP_MODAL_SIZE, MAP_MODAL_SIZE);
                context.fillStyle = "#0b1020";
                context.fillRect(0, 0, MAP_MODAL_SIZE, MAP_MODAL_SIZE);
                context.fillStyle = "#d9f99d";
                context.font = "14px monospace";
                context.textAlign = "center";
                context.textBaseline = "middle";
                context.fillText("Loading map...", MAP_MODAL_SIZE / 2, MAP_MODAL_SIZE / 2);
                return;
            }
            renderMapModalCanvas(context, mapData, state);
        },
        dispose: () => {
            overlay.removeEventListener("mousedown", onOverlayClick);
            window.removeEventListener("keydown", onEscape);
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            overlay.remove();
        }
    };
};
