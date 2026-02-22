import { createClientState } from "./app/state.js";
import { createSocketRuntime } from "./network/socket.js";
import { createSceneRuntime } from "./render/scene.js";
import { startGameLoop } from "./app/loop.js";
import { registerInputHandlers } from "./app/input.js";

const state = createClientState();
registerInputHandlers(state);
const network = createSocketRuntime(state);
const scene = await createSceneRuntime(state);

startGameLoop(state, network.send);
scene.app.ticker.add(() => {
    scene.render();
});
