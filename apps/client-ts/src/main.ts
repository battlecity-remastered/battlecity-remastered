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

const state = createClientState();
const unregisterInput = registerInputHandlers(state);
const network = createSocketRuntime(state);
const scene = await createSceneRuntime(state);
const lobbyUi = createLobbyManager(state);
const chatUi = createChatManager(state, network.send);
const helpModal = createHelpModal(state);
const mapModal = createMapModal(state);
const optionsModal = createOptionsModal(state);
const unregisterMouse = registerMouseInputHandlers(state, scene.app.canvas);
const unregisterWindowMode = registerWindowModeHandlers(scene.app);
const unregisterModalHotkeys = registerModalHotkeys(state);
const loop = startGameLoop(state, network.send);

scene.app.ticker.add(() => {
    scene.render();
    lobbyUi.render();
    chatUi.render();
    helpModal.render();
    mapModal.render();
    optionsModal.render();
});

window.addEventListener("beforeunload", () => {
    loop.stop();
    unregisterInput();
    unregisterMouse();
    unregisterWindowMode();
    unregisterModalHotkeys();
    lobbyUi.dispose();
    chatUi.dispose();
    helpModal.dispose();
    mapModal.dispose();
    optionsModal.dispose();
    network.stop();
});
