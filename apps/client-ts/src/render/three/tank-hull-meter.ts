import type { Pilot } from "./pilot-presentation.js";

export const tankHullRatio = (pilot: Pilot): number | null => {
    const maximum = pilot.maxHealth ?? 100;
    if (typeof pilot.health !== "number" || !Number.isFinite(pilot.health) || !Number.isFinite(maximum) || maximum <= 0) return null;
    return Math.max(0, Math.min(1, pilot.health / maximum));
};

export const createTankHullMeter = (body: HTMLElement) => {
    const root = document.createElement("div");
    const track = document.createElement("div"), echo = document.createElement("i"), fill = document.createElement("i");
    root.className = "bc-tank-hull"; root.hidden = true;
    track.className = "bc-tank-hull-track";
    echo.className = "bc-tank-hull-echo"; fill.className = "bc-tank-hull-fill";
    track.append(echo, fill); root.append(track); body.append(root);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let previous: number | null = null, damageFlash: Animation | undefined;
    return {
        update(pilot: Pilot, enemy: boolean): void {
            const ratio = enemy ? tankHullRatio(pilot) : null;
            root.hidden = ratio === null;
            if (ratio === null) { previous = null; damageFlash?.cancel(); return; }
            if (ratio === previous) return;
            const damaged = previous !== null && ratio < previous;
            // A brief trailing layer shows the amount just lost; stable hull values
            // need no DOM writes, layout reads or per-frame animation bookkeeping.
            echo.style.transition = damaged ? "transform .75s ease-out .18s" : "none";
            fill.style.transition = previous === null ? "none" : "transform .12s ease-out";
            echo.style.transform = fill.style.transform = `scaleX(${ratio})`;
            root.dataset.condition = ratio <= .25 ? "critical" : ratio <= .5 ? "damaged" : "intact";
            if (damaged && !reducedMotion) {
                damageFlash?.cancel();
                damageFlash = track.animate([{ filter: "brightness(2.3)" }, { filter: "brightness(1)" }], { duration: 380, easing: "ease-out" });
            }
            previous = ratio;
        }
    };
};
