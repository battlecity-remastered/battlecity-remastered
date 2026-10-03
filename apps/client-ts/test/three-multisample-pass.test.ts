import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { MultisampleScenePass } from "../src/render/three/multisample-scene-pass.js";

test("scene resolves directly into the 4x HDR composer buffer across frames and resize", context => {
    const renderer = {
        getPixelRatio: () => 1, getSize: (size: THREE.Vector2) => size.set(521, 377),
        getRenderTarget: () => null, setRenderTarget: () => {}
    } as unknown as THREE.WebGLRenderer;
    const target = new THREE.WebGLRenderTarget(521, 377, { type: THREE.HalfFloatType, samples: 4, resolveDepthBuffer: false });
    const composer = new EffectComposer(renderer, target);
    composer.writeBuffer.samples = 0; composer.writeBuffer.depthBuffer = false;
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const pass = new MultisampleScenePass(scene, camera), ao = new GTAOPass(scene, camera), output = new OutputPass();
    const sources: THREE.WebGLRenderTarget[] = [];
    context.mock.method(RenderPass.prototype, "render", (_renderer, _write, read) => { sources.push(read); });
    context.mock.method(ao, "render", (_renderer, write, read) => {
        assert.equal(read.samples, 4); assert.equal(write.samples, 0); assert.equal(write.depthBuffer, false);
        assert.equal(read.texture.type, THREE.HalfFloatType); assert.equal(write.texture.type, THREE.HalfFloatType);
    });
    context.mock.method(output, "render", (_renderer, _write, read) => { assert.equal(read.samples, 0); });
    composer.addPass(pass); composer.addPass(ao); composer.addPass(output);
    try {
        const original = composer.readBuffer;
        for (const [width, height] of [[521, 377], [1440, 900]]) {
            composer.setSize(width!, height!);
            composer.render(1 / 60); composer.render(1 / 60);
            assert.equal(composer.readBuffer, original, "two post-processing swaps preserve next frame's MSAA scene buffer");
            assert.equal(sources.at(-1), original, "no intermediary scene target or HDR copy");
            assert.equal(original.width, width); assert.equal(original.height, height);
            assert.equal(original.samples, 4); assert.equal(original.resolveDepthBuffer, false);
        }
        assert.equal(sources.length, 4);
        assert.throws(() => pass.render(renderer, composer.writeBuffer, composer.writeBuffer, 0, false), /4x MSAA/);
        pass.renderToScreen = true; pass.render(renderer, composer.writeBuffer, composer.writeBuffer, 0, false);
        assert.equal(sources.length, 5, "native screen rendering remains supported");
    } finally { ao.dispose(); output.dispose(); composer.dispose(); }
});
