import * as PIXI from 'pixi.js';
import * as tilemap from '@pixi/tilemap';

// Create a mutable object that includes all PIXI exports
const MutablePIXI = { ...PIXI };

// Attach tilemap to our mutable PIXI object
MutablePIXI.tilemap = tilemap;

// PixiJS v8: Settings moved to AbstractRenderer.defaultOptions
if (MutablePIXI.AbstractRenderer) {
    // Use string 'nearest' instead of PIXI.SCALE_MODES.NEAREST
    MutablePIXI.AbstractRenderer.defaultOptions.scaleMode = 'nearest';
}
if (MutablePIXI.TextureStyle?.defaultOptions) {
    MutablePIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';
}
if (MutablePIXI.ImageSource?.defaultOptions) {
    MutablePIXI.ImageSource.defaultOptions.scaleMode = 'nearest';
}

if (typeof window !== 'undefined') {
    window.PIXI = MutablePIXI;
}

export default MutablePIXI;
