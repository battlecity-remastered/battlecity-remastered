import type { ClientState } from "../../app/state.js";
import { resolveNearestOrbableCity, type OrbableCityNavigation } from "../orb-target.js";
import { projectRadarPoint, type RadarPoint } from "./radar-model.js";

const createTargetMarker = (svg: SVGSVGElement, radius: number): SVGGElement => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
    marker.setAttribute("class", "bc-orb-map-target"); marker.setAttribute("visibility", "hidden");
    marker.innerHTML = `<circle r="${radius}" fill="#362448" fill-opacity=".75" stroke="#cfadff" stroke-width="1"/><circle r="${radius * .4}" fill="#e4d2ff"/><path d="M0 ${-radius - 2}v3M0 ${radius + 2}v-3M${-radius - 2} 0h3M${radius + 2} 0h-3" stroke="#dcc3ff" stroke-width=".8"/>`;
    svg.append(marker); return marker;
};

// Uses the radar's existing 10 Hz update, with no meshes, shaders or extra timers.
export const createInventoryOrbTarget = (telemetry: HTMLElement, radar: SVGSVGElement, map: SVGSVGElement, openMap: () => void) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "bc-orb-target";
    button.dataset.ui = "orb-navigation";
    button.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-opacity=".35"/><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-dasharray="2 4" stroke-opacity=".45"/><g class="bc-orb-target-arrow"><path d="M16 5L20 12L16 10L12 12Z" fill="currentColor"/><circle cx="16" cy="18" r="4" fill="currentColor" fill-opacity=".25" stroke="currentColor"/></g></svg><span class="bc-orb-target-copy"><small>NEAREST ORBABLE</small><strong>No target</strong></span><span class="bc-orb-target-range"><b>—</b><small>—</small></span>`;
    button.addEventListener("click", openMap); telemetry.append(button);
    const name = button.querySelector("strong")!, range = button.querySelector(".bc-orb-target-range small")!, compass = button.querySelector("b")!, arrow = button.querySelector("g")!;
    const localMarker = createTargetMarker(radar, 4), fullMarker = createTargetMarker(map, 6);
    const route = document.createElementNS("http://www.w3.org/2000/svg", "path");
    route.setAttribute("class", "bc-orb-map-route"); route.setAttribute("stroke", "#c2a0ed"); route.setAttribute("stroke-width", "1");
    route.setAttribute("stroke-dasharray", "2 5"); route.setAttribute("fill", "none"); map.insertBefore(route, fullMarker);
    let signature = "initial";
    const showMarkers = (visible: boolean): void => {
        for (const marker of [localMarker, fullMarker, route]) marker.setAttribute("visibility", visible ? "visible" : "hidden");
    };
    const clearTarget = (): void => {
        if (signature === "none") return;
        signature = "none"; button.disabled = true; button.classList.remove("is-carrying-orb");
        name.textContent = "No target"; compass.textContent = "—"; range.textContent = "";
        button.title = "No orbable enemy cities detected."; button.setAttribute("aria-label", button.title);
        button.dataset.targetCity = ""; arrow.setAttribute("transform", "rotate(0 16 16)"); showMarkers(false);
    };
    const refreshLabel = (target: OrbableCityNavigation, carrying: boolean): void => {
        const heading = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(target.bearing / 45) % 8]!;
        const next = `${target.cityId}:${target.distanceTiles}:${heading}:${carrying}`;
        if (signature === next) return;
        signature = next; button.disabled = false; button.classList.toggle("is-carrying-orb", carrying);
        name.textContent = target.cityName; compass.textContent = target.distanceTiles < 2 ? "HERE" : heading;
        range.textContent = `${target.distanceTiles} ${target.distanceTiles === 1 ? "tile" : "tiles"}`;
        button.title = `${target.cityName} · ${target.distanceTiles} tiles ${target.direction}. Open tactical map.`;
        button.setAttribute("aria-label", `Nearest orbable city: ${button.title}`);
        button.dataset.targetCity = String(target.cityId); showMarkers(true);
    };
    return {
        update(state: ClientState, player: RadarPoint, mapOpen: boolean): void {
            const target = resolveNearestOrbableCity(state);
            if (!target) { clearTarget(); return; }
            refreshLabel(target, (state.inventory.get(5) ?? 0) > 0);
            arrow.setAttribute("transform", `rotate(${target.bearing.toFixed(1)} 16 16)`);
            const point = projectRadarPoint(target.position, player);
            localMarker.setAttribute("transform", `translate(${point.x} ${point.y})`);
            if (mapOpen) {
                fullMarker.setAttribute("transform", `translate(${target.position.x} ${target.position.y})`);
                route.setAttribute("d", `M${player.x} ${player.y}L${target.position.x} ${target.position.y}`);
            }
        }
    };
};
