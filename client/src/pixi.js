import * as PIXICore from 'pixi.js';
import { installTilemap } from '../pixi-tilemap.js';

const PIXI = { ...PIXICore };

installTilemap(PIXI);

if (PIXI.settings) {
    PIXI.settings.CREATE_IMAGE_BITMAP = false;
    if (PIXI.SCALE_MODES) {
        PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    }
    if (typeof PIXI.settings.SPRITE_MAX_TEXTURES === 'number') {
        PIXI.settings.SPRITE_MAX_TEXTURES = Math.min(PIXI.settings.SPRITE_MAX_TEXTURES, 16);
    }
}

if (PIXI.Text) {
    PIXI.Text.defaultResolution = 1;
}

if (typeof window !== 'undefined') {
    window.PIXI = PIXI;
}

export default PIXI;
