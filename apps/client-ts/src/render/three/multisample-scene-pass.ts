import * as THREE from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";

// Resolve geometry edges once. Fullscreen effects consume the antialiased image
// and do not need their own multisampled color/depth attachments.
export class MultisampleScenePass extends RenderPass {
    private readonly target=new THREE.WebGLRenderTarget(1,1,{
        type:THREE.HalfFloatType,samples:4,resolveDepthBuffer:false
    });
    private readonly copy=new TexturePass(this.target.texture);

    override setSize(width:number,height:number):void {
        this.target.setSize(width,height);
    }

    override render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer:THREE.WebGLRenderTarget,deltaTime:number,maskActive:boolean):void {
        const screen=this.renderToScreen;
        this.renderToScreen=false;
        super.render(renderer,writeBuffer,this.target,deltaTime,maskActive);
        this.renderToScreen=screen;
        if (!screen && !maskActive && readBuffer.samples === 0 && readBuffer.width === this.target.width && readBuffer.height === this.target.height
            && readBuffer.texture.type === this.target.texture.type && readBuffer.texture.format === this.target.texture.format
            && readBuffer.texture.colorSpace === this.target.texture.colorSpace) {
            // The resolved HDR image needs an exact copy, not a full-screen
            // shader draw. Three initializes/reinitializes storage after resize.
            renderer.initRenderTarget(readBuffer);
            renderer.copyTextureToTexture(this.target.texture, readBuffer.texture);
            renderer.setRenderTarget(readBuffer);
            return;
        }
        this.copy.renderToScreen=screen;
        this.copy.render(renderer,writeBuffer,readBuffer,deltaTime,maskActive);
    }

    override dispose():void {
        this.copy.dispose();
        this.target.dispose();
    }
}
