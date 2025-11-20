import PIXI from "../pixi.js";
import { setupMouseInputsWithPixi } from "./input-mouse-core.js";

export { setupMouseInputsWithPixi };

export const setupMouseInputs = (game, pixiInstance = PIXI) => {
    return setupMouseInputsWithPixi(game, pixiInstance);
};
