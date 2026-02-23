import { createClientState } from "./app/state.js";
import { createSocketRuntime } from "./network/socket.js";
import { createSceneRuntime } from "./render/scene.js";
import { startGameLoop } from "./app/loop.js";
import { registerInputHandlers } from "./app/input.js";
import { registerMouseInputHandlers } from "./input/mouse-input.js";
import { registerWindowModeHandlers } from "./ui/window/WindowModeService.js";
import { createLobbyManager } from "./ui/lobby/LobbyManager.js";
import { createChatManager } from "./ui/chat/ChatManager.js";

const state = createClientState();
const unregisterInput = registerInputHandlers(state);
const network = createSocketRuntime(state);
const scene = await createSceneRuntime(state);
const lobbyUi = createLobbyManager(state);
const chatUi = createChatManager(state, network.send);
const unregisterMouse = registerMouseInputHandlers(state, scene.app.canvas);
const unregisterWindowMode = registerWindowModeHandlers(scene.app);
const loop = startGameLoop(state, network.send);

scene.app.ticker.add(() => {
    scene.render();
    lobbyUi.render();
    chatUi.render();
});

window.addEventListener("beforeunload", () => {
    loop.stop();
    unregisterInput();
    unregisterMouse();
    unregisterWindowMode();
    lobbyUi.dispose();
    chatUi.dispose();
    network.stop();
});
