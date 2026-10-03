import * as THREE from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";

// Resolve straight into the composer's scene buffer. The AO pass consumes its
// resolved HDR texture and writes the other, non-multisampled composer buffer.
// This retains 4x scene antialiasing without copying another full-size HDR image.
export class MultisampleScenePass extends RenderPass {
    override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
        if (!this.renderToScreen && readBuffer.samples !== 4) throw new Error("The scene composer buffer must use 4x MSAA");
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }
}
