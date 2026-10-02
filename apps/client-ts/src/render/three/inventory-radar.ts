import { isDefenseVisibleToLocalPlayer } from "../parity/defense-visibility.js";
import type { ClientState } from "../../app/state.js";
import { isInteractiveKeyboardTarget } from "../../input/interactive-target.js";
import { projectRadarPoint, resolveRadarNavigation, type RadarMap } from "./radar-model.js";

const NS = "http://www.w3.org/2000/svg";
const marker = (shape: string, attributes: Record<string, string>): SVGElement => {
    const node = document.createElementNS(NS, shape);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
};

export const createInventoryRadar = (inventory: HTMLElement, data: RadarMap) => {
    // Cache the actual decoded terrain once. Updating SVG markers adds no
    // battlefield geometry, render targets or additional WebGL context.
    const size = data.map.length;
    const bitmap = document.createElement("canvas");
    bitmap.width = bitmap.height = size;
    const context = bitmap.getContext("2d")!;
    const pixels = context.createImageData(size, size);
    const colors = [[20, 39, 42], [203, 71, 29], [99, 109, 96], [101, 150, 148]];
    const centers: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const type = data.map[x]?.[y] ?? 0;
        const color = colors[type] ?? colors[0]!;
        const offset = (y * size + x) * 4;
        pixels.data.set([...color, 255], offset);
        if (type === 3) centers.push({ x: x + 1.5, y: y + 1 });
    }
    context.putImageData(pixels, 0, 0);
    const terrain = bitmap.toDataURL();
    const telemetry = inventory.querySelector<HTMLElement>(".bc-telemetry")!;
    const existing = Array.from(telemetry.children);
    existing[0]!.classList.add("bc-hull-readout");
    const readout = document.createElement("div");
    readout.className = "bc-nav-readout";
    const button = document.createElement("button");
    button.type = "button"; button.className = "bc-radar";
    button.setAttribute("aria-label", "Open tactical map (M)");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><clipPath id="bc-radar-clip"><circle cx="50" cy="50" r="42"/></clipPath></defs>
        <circle cx="50" cy="50" r="46" fill="#07181b" stroke="#6b9792" stroke-width=".7"/>
        <g clip-path="url(#bc-radar-clip)"><image class="bc-radar-terrain" href="${terrain}"/>
        <g class="bc-radar-sites"></g></g>
        <g fill="none" stroke="#88c2b2" stroke-width=".5" opacity=".35"><circle cx="50" cy="50" r="21"/><circle cx="50" cy="50" r="42"/><path d="M8 50h84M50 8v84"/></g>
        <path class="bc-radar-home" d="M0 -4L4 0L0 4L-4 0Z" fill="#e9c77a" stroke="#fff1c5" stroke-width=".8"/>
        <path class="bc-radar-player" d="M50 44L54 54L50 52L46 54Z" fill="#b8ffe2" stroke="#102e2a" stroke-width="1"/>
        <text x="50" y="6" text-anchor="middle" fill="#cce5dd" font-size="5">N</text>
        </svg><span>MAP <kbd>M</kbd></span>`;
    const homeReadout = document.createElement("div"); homeReadout.className = "bc-home-bearing";
    homeReadout.innerHTML = `<div><span class="bc-home-arrow">↑</span><b>HOME</b><span class="bc-home-compass"></span></div><small></small>`;
    readout.append(existing[0]!, existing[1]!, homeReadout, existing[2]!);
    telemetry.replaceChildren(button, readout);
    telemetry.classList.add("bc-navigation");

    const overlay = document.createElement("section");
    overlay.className = "bc-tactical-map"; overlay.hidden = true;
    overlay.setAttribute("aria-label", "Tactical map");
    overlay.innerHTML = `<header><div><small>COMMAND LINK / NAVIGATION</small><strong>TACTICAL MAP</strong></div><button type="button" aria-label="Close tactical map">×</button></header>
        <div class="bc-map-surface"><svg viewBox="0 0 ${size} ${size}" aria-label="North-up battlefield map">
        <image href="${terrain}" width="${size}" height="${size}"/>
        <g class="bc-map-grid" stroke="#8fb9b0" stroke-width=".5" opacity=".15"></g>
        <g class="bc-map-sites"></g><path class="bc-map-bearing" stroke="#edd59a" stroke-width="1" stroke-dasharray="4 5" fill="none"/>
        <path class="bc-map-home" d="M0 -5L5 0L0 5L-5 0Z" fill="#edcc84" stroke="#fff0c1"/>
        <path class="bc-map-player" d="M0 -6L4 5L0 3L-4 5Z" fill="#b8ffe2" stroke="#123c30"/>
        </svg><span class="bc-map-north">N ↑</span></div>
        <div class="bc-map-legend"><span>◆ HOME</span><span>▲ YOU</span><span>● CITIES</span><span class="bc-map-lava-key">■ LAVA</span></div>
        <footer><strong></strong><span>M / ESC TO CLOSE</span></footer>`;
    inventory.append(overlay);
    const localSites = button.querySelector(".bc-radar-sites")!;
    const fullSites = overlay.querySelector(".bc-map-sites")!;
    const sites = [
        ...centers.map(point => ({ ...point, color: "#9bbfba", radius: 1.4 })),
        ...data.buildings.map(site => ({ x: site.tileX + 1.5, y: site.tileY + 1, color: site.kind === "research" ? "#b8a0dc" : "#c6a86e", radius: 1.2 })),
        ...data.defenses.map(site => ({ x: site.tileX + 0.5, y: site.tileY + 0.5, color: "#e79c70", radius: 0.8 }))
    ].map(site => {
        const local = marker("circle", { r: String(site.radius), fill: site.color });
        localSites.append(local);
        fullSites.append(marker("circle", { cx: String(site.x), cy: String(site.y), r: "2", fill: site.color }));
        return { ...site, local };
    });
    for (let line = 64; line < size; line += 64) {
        overlay.querySelector(".bc-map-grid")!.append(marker("path", { d: `M${line} 0V${size}M0 ${line}H${size}` }));
    }
    const toggle = (open = overlay.hidden): void => {
        overlay.hidden = !open; button.setAttribute("aria-expanded", String(open));
    };
    button.addEventListener("click", () => toggle());
    overlay.querySelector("button")!.addEventListener("click", () => toggle(false));
    const onKey = (event: KeyboardEvent): void => {
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "Escape" && !overlay.hidden) toggle(false);
        else if ((event.key.toLowerCase() === "m" || event.key === "F2") && !overlay.hidden) toggle(false);
        else if (isInteractiveKeyboardTarget(event)) return;
        else if ((event.key.toLowerCase() === "m" || event.key === "F2")) toggle();
        else return;
        event.preventDefault(); event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    const dynamic=new Map<string,{local:SVGElement;full:SVGElement}>();
    let lastUpdate = -Infinity;
    return {
        update(state: ClientState): void {
            const now = performance.now();
            if (now - lastUpdate < 100) return;
            lastUpdate = now;
            const nav = resolveRadarNavigation(state.local.x, state.local.y, state.local.direction, state.local.city);
            const home = projectRadarPoint(nav.home, nav.player);
            const scale = 42 / 24;
            const image = button.querySelector("image")!;
            image.setAttribute("width", String(size * scale)); image.setAttribute("height", String(size * scale));
            image.setAttribute("x", String(50 - nav.player.x * scale)); image.setAttribute("y", String(50 - nav.player.y * scale));
            for (const site of sites) {
                const projected = projectRadarPoint(site, nav.player);
                site.local.setAttribute("visibility", projected.outside ? "hidden" : "visible");
                if (!projected.outside) { site.local.setAttribute("cx", String(projected.x)); site.local.setAttribute("cy", String(projected.y)); }
            }
            const liveSites=[
                ...[...state.buildings.values()].map(building=>({id:`building:${building.id}`,x:building.tileX+1.5,y:building.tileY+1,color:building.cityId===state.local.city?"#77cbb6":"#e3a26d",radius:1.3})),
                ...[...state.defenses.values()].filter(defense=>isDefenseVisibleToLocalPlayer(state,defense)).map(defense=>({id:`defense:${defense.id}`,x:defense.tileX+.5,y:defense.tileY+.5,color:defense.cityId===state.local.city?"#6bc1d1":"#ec885e",radius:.9})),
                ...[...state.remotePlayers.values()].filter(player=>(player.cloakedUntil??0)<=Date.now() || player.city===state.local.city).map(player=>({id:`player:${player.id}`,x:(player.x+24)/48,y:(player.y+24)/48,color:player.city===state.local.city?"#79f0da":"#ff635c",radius:1.8}))
            ];
            const ids=new Set(liveSites.map(site=>site.id));for(const [id,pair] of dynamic)if(!ids.has(id)){pair.local.remove();pair.full.remove();dynamic.delete(id);}
            for(const site of liveSites){let pair=dynamic.get(site.id);if(!pair){pair={local:marker("circle",{}),full:marker("circle",{})};localSites.append(pair.local);fullSites.append(pair.full);dynamic.set(site.id,pair);}const point=projectRadarPoint(site,nav.player);for(const node of [pair.local,pair.full]){node.setAttribute("fill",site.color);node.setAttribute("r",String(site.radius));}pair.local.setAttribute("visibility",point.outside?"hidden":"visible");pair.local.setAttribute("cx",String(point.x));pair.local.setAttribute("cy",String(point.y));pair.full.setAttribute("cx",String(site.x));pair.full.setAttribute("cy",String(site.y));}
            button.querySelector(".bc-radar-home")!.setAttribute("transform", `translate(${home.x} ${home.y})`);
            button.querySelector(".bc-radar-player")!.setAttribute("transform", `rotate(${nav.heading} 50 50)`);
            homeReadout.querySelector<HTMLElement>(".bc-home-arrow")!.style.transform = `rotate(${nav.bearing}deg)`;
            homeReadout.querySelector(".bc-home-compass")!.textContent = nav.distance < 3 ? "HERE" : nav.compass;
            const distanceLabel = `${Math.round(nav.distance)} ${Math.round(nav.distance) === 1 ? "TILE" : "TILES"}`;
            homeReadout.querySelector("small")!.textContent = `${nav.homeName.toUpperCase()} · ${distanceLabel}`;
            telemetry.dataset.homeDistance = nav.distance.toFixed(2); telemetry.dataset.homeBearing = nav.compass;
            overlay.querySelector(".bc-map-home")!.setAttribute("transform", `translate(${nav.home.x} ${nav.home.y})`);
            overlay.querySelector(".bc-map-player")!.setAttribute("transform", `translate(${nav.player.x} ${nav.player.y}) rotate(${nav.heading})`);
            overlay.querySelector(".bc-map-bearing")!.setAttribute("d", `M${nav.player.x} ${nav.player.y}L${nav.home.x} ${nav.home.y}`);
            overlay.querySelector("footer strong")!.textContent = `${nav.homeName.toUpperCase()} · ${distanceLabel} ${nav.compass}`;
        },
        dispose(): void { window.removeEventListener("keydown", onKey, true); overlay.remove(); }
    };
};
