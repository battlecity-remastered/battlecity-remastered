import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { MultisampleScenePass } from "../src/render/three/multisample-scene-pass.js";

test("resolved HDR copies preserve multisampling and resize; screen, masks and conversions retain the draw path", context => {
    let source: THREE.WebGLRenderTarget | undefined, draws = 0;
    const copies: Array<[THREE.Texture, THREE.Texture]> = [], initialized: THREE.WebGLRenderTarget[] = [];
    context.mock.method(RenderPass.prototype, "render", function (_renderer, _write, read) { source = read; });
    context.mock.method(TexturePass.prototype, "render", () => { draws++; });
    const renderer = {
        initRenderTarget: (target: THREE.WebGLRenderTarget) => { initialized.push(target); },
        copyTextureToTexture: (from: THREE.Texture, to: THREE.Texture) => { copies.push([from, to]); },
        setRenderTarget: () => {}
    } as unknown as THREE.WebGLRenderer;
    const pass = new MultisampleScenePass(new THREE.Scene(), new THREE.Camera());
    const target = new THREE.WebGLRenderTarget(521, 377, { type: THREE.HalfFloatType, depthBuffer: false });
    try {
        for (const [width, height] of [[521, 377], [1440, 900]]) {
            pass.setSize(width!, height!); target.setSize(width!, height!);
            pass.render(renderer, target, target, 0, false);
            assert.equal(source!.samples, 4); assert.equal(source!.resolveDepthBuffer, false);
            assert.equal(source!.width, width); assert.equal(source!.height, height);
            assert.deepEqual(copies.at(-1), [source!.texture, target.texture]);
            assert.equal(initialized.at(-1), target, "initialize the destination after resize before copying");
        }
        assert.equal(draws, 0); assert.equal(copies.length, 2);
        pass.renderToScreen = true; pass.render(renderer, target, target, 0, false);
        assert.equal(pass.renderToScreen, true); assert.equal(draws, 1);
        pass.renderToScreen = false; pass.render(renderer, target, target, 0, true); assert.equal(draws, 2);
        target.texture.type = THREE.UnsignedByteType; pass.render(renderer, target, target, 0, false); assert.equal(draws, 3);
        assert.equal(copies.length, 2, "GPU copies never bypass masks or perform format conversions");
    } finally { pass.dispose(); target.dispose(); }
});
