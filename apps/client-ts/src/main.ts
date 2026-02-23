import { createClientState } from "./app/state.js";
import { createSocketRuntime } from "./network/socket.js";
import { createSceneRuntime } from "./render/scene.js";
import { startGameLoop } from "./app/loop.js";
import { registerInputHandlers } from "./app/input.js";
import { registerMouseInputHandlers } from "./input/mouse-input.js";

const state = createClientState();
const unregisterInput = registerInputHandlers(state);
const network = createSocketRuntime(state);
const scene = await createSceneRuntime(state);
const unregisterMouse = registerMouseInputHandlers(state, scene.app.canvas);
const loop = startGameLoop(state, network.send);

scene.app.ticker.add(() => {
    scene.render();
});

window.addEventListener("beforeunload", () => {
    loop.stop();
    unregisterInput();
    unregisterMouse();
    network.stop();
});
