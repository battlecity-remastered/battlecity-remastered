import { buildDebugHudLines } from "../../app/debug-metrics.js";
import { isThreeDemoMode, type ClientState } from "../../app/state.js";

type DebugHud = {
    render: () => void;
    dispose: () => void;
};

const HUD_REFRESH_INTERVAL_MS = 250;

export const createDebugHud = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined"
        ? null
        : (document.getElementById("app") ?? document.body)
): DebugHud => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => { },
            dispose: () => { }
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "debug-hud");
    panel.style.position = "fixed";
    panel.style.right = "8px";
    panel.style.bottom = "8px";
    panel.style.padding = "6px 8px";
    panel.style.margin = "0";
    panel.style.font = "12px 'Courier New', monospace";
    panel.style.background = "rgba(0, 0, 0, 0.6)";
    panel.style.color = "#b0fffe";
    panel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    panel.style.borderRadius = "4px";
    panel.style.pointerEvents = "none";
    panel.style.whiteSpace = "pre";
    panel.style.zIndex = "150";
    panel.style.display = "none";
    const demoMode = isThreeDemoMode();
    const battlefieldCanvas = root.querySelector<HTMLCanvasElement>('canvas[data-renderer="three-battlefield"]');
    if (demoMode) { panel.style.left = "16px"; panel.style.right = "auto"; panel.style.bottom = "16px"; panel.style.maxWidth = "calc(100vw - 232px)"; panel.style.whiteSpace = "pre-wrap"; }
    root.appendChild(panel);

    let lastText = "";
    let lastVisible = false;
    let lastRefreshAt = 0;

    const appendRendererStats = (lines: string[]): void => {
        if (battlefieldCanvas) {
            const stats = battlefieldCanvas.dataset;
            lines.push(`Main thread: movement ${stats.movementCpuMs ?? "n/a"} ms / render ${stats.renderCpuMs ?? "n/a"} ms`);
            lines.push(`Draw calls: ${stats.drawCalls ?? "n/a"} / triangles: ${Number(stats.triangles ?? 0).toLocaleString()}`);
            lines.push(`Scene/update: ${stats.sceneCpuMs ?? "n/a"} ms / draw-driver: ${stats.drawSubmitMs ?? "n/a"} ms`);
            const stages: Record<string, number> = JSON.parse(stats.renderStages ?? "{}");
            const stage = (name: string) => stages[name]?.toFixed(1) ?? "n/a";
            lines.push(`Update ms: world ${stage("world")} / animation ${stage("animation")} / research ${stage("research")}`);
            lines.push(`Update ms: UI ${stage("interface")} / combat ${stage("combat")} / transforms ${stage("matrices")} / batches ${stage("batches")}`);
            lines.push(`Draw ms: scene ${stage("sceneDraw")} / inventory ${stage("previewDraw")}`);
            lines.push(`GPU: ${(stats.gpuRenderer ?? "unavailable").slice(0, 100)}`);
            lines.push("Local movement: frame clock · F3 to hide");
            if (!demoMode) lines.push(`Input ack: ${state.movement.lastAck} / pending: ${state.movement.pending.length} / correction: ${state.movement.correctionPx.toFixed(2)} px (max ${state.movement.maxCorrectionPx.toFixed(2)})`);
            if (!demoMode) lines.push(`Buffered input: ${Math.round(state.movement.pendingMs)} ms / server time clipped: ${state.movement.serverClippedMs.toFixed(1)} ms`);
        }
    };
    return {
        render: () => {
            const visible = state.ui.showBotDebug;
            if (visible !== lastVisible) {
                panel.style.display = visible ? "block" : "none";
                lastVisible = visible;
                lastRefreshAt = 0;
            }
            if (!visible) {
                return;
            }
            const now = Date.now();
            if (lastRefreshAt !== 0 && (now - lastRefreshAt) < HUD_REFRESH_INTERVAL_MS) {
                return;
            }
            const lines = buildDebugHudLines(state, now);
            appendRendererStats(lines);
            const text = lines.join("\n");
            if (text !== lastText) {
                panel.textContent = text;
                lastText = text;
            }
            lastRefreshAt = now;
        },
        dispose: () => {
            panel.remove();
        }
    };
};
