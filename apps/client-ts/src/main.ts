import { createClientState } from "./app/state.js";
import { createSocketRuntime } from "./network/socket.js";
import { createSceneRuntime } from "./render/scene.js";
import { startGameLoop } from "./app/loop.js";
import { registerInputHandlers } from "./app/input.js";
import { registerMouseInputHandlers } from "./input/mouse-input.js";
import { registerWindowModeHandlers } from "./ui/window/WindowModeService.js";
import { createLobbyManager } from "./ui/lobby/LobbyManager.js";
import { createChatManager } from "./ui/chat/ChatManager.js";
import { createHelpModal } from "./ui/help/HelpModal.js";
import { createMapModal } from "./ui/map/MapModal.js";
import { createOptionsModal } from "./ui/options/OptionsModal.js";
import { registerModalHotkeys } from "./ui/modals/ModalHotkeys.js";
import { createBuildMenu, registerBuildMenuHotkeys } from "./ui/build-menu/BuildMenu.js";
import { createIntroModal } from "./ui/intro/IntroModal.js";
import { createTutorialManager } from "./ui/tutorial/TutorialManager.js";
import { createAudioManager } from "./audio/AudioManager.js";
import { createMusicManager } from "./audio/MusicManager.js";
import { createIdentityManager, registerIdentityHotkeys } from "./ui/identity/IdentityManager.js";
import { registerInventoryHotkeys } from "./gameplay/items/IconInventoryService.js";
import { createOrbHintBanner } from "./ui/orb/OrbHintBanner.js";
import { createDebugHud } from "./ui/debug/DebugHud.js";
import { createNotificationManager } from "./ui/notifications/NotificationManager.js";

const showBootError = (error: unknown): void => {
    const root = document.getElementById("app");
    if (!root) {
        return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const panel = document.createElement("pre");
    panel.style.position = "absolute";
    panel.style.left = "12px";
    panel.style.top = "12px";
    panel.style.maxWidth = "min(920px, calc(100vw - 24px))";
    panel.style.padding = "10px 12px";
    panel.style.background = "rgba(24, 8, 8, 0.85)";
    panel.style.border = "1px solid rgba(255, 112, 112, 0.55)";
    panel.style.color = "#ffdede";
    panel.style.font = "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace";
    panel.style.whiteSpace = "pre-wrap";
    panel.style.zIndex = "9999";
    panel.textContent = `[boot.fail] ${message}`;
    root.appendChild(panel);
};

const bootstrap = async (): Promise<void> => {
    const state = createClientState();
    const unregisterInput = registerInputHandlers(state);
    const network = createSocketRuntime(state);
    const scene = await createSceneRuntime(state);
    const lobbyUi = createLobbyManager(state, network.send);
    const chatUi = createChatManager(state, network.send);
    const helpModal = createHelpModal(state);
    const mapModal = createMapModal(state);
    const optionsModal = createOptionsModal(state);
    const buildMenu = createBuildMenu(state);
    const introModal = createIntroModal(state);
    const tutorialUi = createTutorialManager(state);
    const audio = createAudioManager(state);
    const music = createMusicManager(state);
    const identityUi = createIdentityManager(state);
    const orbHintUi = createOrbHintBanner(state);
    const debugHud = createDebugHud(state);
    const notificationsUi = createNotificationManager(state);
    const unregisterMouse = registerMouseInputHandlers(state, scene.app.canvas);
    const unregisterWindowMode = registerWindowModeHandlers(scene.app);
    const unregisterModalHotkeys = registerModalHotkeys(state);
    const unregisterBuildMenuHotkeys = registerBuildMenuHotkeys(state);
    const unregisterIdentityHotkeys = registerIdentityHotkeys(state);
    const unregisterInventoryHotkeys = registerInventoryHotkeys(state, network.send);
    const loop = startGameLoop(state, network.send);
    const tickErrorCounts = new Map<string, number>();
    let lastTickHeartbeatAt = 0;
    let tickFrames = 0;

    const runTickSegment = (label: string, fn: () => void): void => {
        try {
            fn();
        } catch (error) {
            const count = (tickErrorCounts.get(label) ?? 0) + 1;
            tickErrorCounts.set(label, count);
            if (count <= 3) {
                console.error(`[tick.segment.error] ${label}`, error);
            }
        }
    };

    scene.app.ticker.add(() => {
        tickFrames += 1;
        runTickSegment("scene.render", scene.render);
        runTickSegment("lobby.render", lobbyUi.render);
        runTickSegment("chat.render", chatUi.render);
        runTickSegment("help.render", helpModal.render);
        runTickSegment("map.render", mapModal.render);
        runTickSegment("options.render", optionsModal.render);
        runTickSegment("buildMenu.render", buildMenu.render);
        runTickSegment("intro.render", introModal.render);
        runTickSegment("tutorial.render", tutorialUi.render);
        runTickSegment("identity.render", identityUi.render);
        runTickSegment("orbHint.render", orbHintUi.render);
        runTickSegment("debugHud.render", debugHud.render);
        runTickSegment("notifications.render", notificationsUi.render);
        runTickSegment("audio.tick", audio.tick);
        runTickSegment("music.tick", music.tick);
        const nowMs = Date.now();
        if ((nowMs - lastTickHeartbeatAt) >= 5000) {
            lastTickHeartbeatAt = nowMs;
            console.info("[tick.heartbeat]", {
                frames: tickFrames,
                socketConnected: state.debug.socketConnected,
                localPlayerId: state.local.id,
                localCity: state.local.city,
                mapSize: state.world.mapSize
            });
        }
    });

    window.addEventListener("beforeunload", () => {
        loop.stop();
        unregisterInput();
        unregisterMouse();
        unregisterWindowMode();
        unregisterModalHotkeys();
        unregisterBuildMenuHotkeys();
        unregisterIdentityHotkeys();
        unregisterInventoryHotkeys();
        lobbyUi.dispose();
        chatUi.dispose();
        helpModal.dispose();
        mapModal.dispose();
        optionsModal.dispose();
        buildMenu.dispose();
        introModal.dispose();
        tutorialUi.dispose();
        identityUi.dispose();
        orbHintUi.dispose();
        debugHud.dispose();
        notificationsUi.dispose();
        audio.dispose();
        music.dispose();
        network.stop();
    });
};

void bootstrap().catch((error) => {
    console.error("[boot.fail] client bootstrap failed", error);
    showBootError(error);
});
