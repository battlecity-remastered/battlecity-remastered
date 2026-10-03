import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { TILE_SIZE } from "../../gameplay/world-viewport.js";
import { resizeBattlefieldCamera } from "./camera.js";
import { createHeatOutputPass } from "./heat-pass.js";
import { createLightVariantWarmup } from "./light-variant-warmup.js";
import { MultisampleScenePass } from "./multisample-scene-pass.js";
import { configurePostprocessTargets } from "./postprocess-targets.js";
import { specialiseOrthographicAO } from "./orthographic-ao.js";
import type { createTerrain } from "./terrain.js";

export const createBattlefieldPostprocessing = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera, terrain: ReturnType<typeof createTerrain>, sun: THREE.DirectionalLight) => {
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, resolveDepthBuffer: false });
    const composer = new EffectComposer(renderer, renderTarget);
    // Scene -> MSAA read buffer -> AO writes plain buffer -> bloom -> screen.
    // AO and OutputPass swap twice, returning to the same scene buffer.
    composer.writeBuffer.samples = 0; composer.writeBuffer.depthBuffer = false;
    composer.addPass(new MultisampleScenePass(scene, camera));
    const ambientOcclusion = new GTAOPass(scene, camera, 1, 1);
    terrain.configureDepthMaterial(ambientOcclusion.normalMaterial);
    // Fire/smoke billboards contribute colour, never flat planes to AO depth.
    const renderOcclusion = ambientOcclusion.render.bind(ambientOcclusion);
    ambientOcclusion.render = (...args) => { const mask = camera.layers.mask; camera.layers.disable(1); try { renderOcclusion(...args); } finally { camera.layers.mask = mask; } };
    ambientOcclusion.updateGtaoMaterial({ radius: 0.48, thickness: 0.35, distanceExponent: 2, distanceFallOff: 1, scale: 1 });
    ambientOcclusion.blendIntensity = 0.72;
    ambientOcclusion.updatePdMaterial({ radius: 2 });
    specialiseOrthographicAO(ambientOcclusion);
    composer.addPass(ambientOcclusion);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.30, 0.18, 0.72);
    configurePostprocessTargets(ambientOcclusion, bloom);
    composer.addPass(bloom);
    const heatPass = createHeatOutputPass();
    composer.addPass(heatPass);
    const lightWarmup = createLightVariantWarmup(renderer, scene, camera, ambientOcclusion.normalMaterial);
    const resize = (): void => {
        const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
        renderer.setSize(width, height);
        composer.setSize(width, height);
        ambientOcclusion.setSize(Math.max(1, Math.floor(width * renderer.getPixelRatio() * 0.5)), Math.max(1, Math.floor(height * renderer.getPixelRatio() * 0.5)));
        heatPass.uniforms.heatResolution!.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
        resizeBattlefieldCamera(camera, width, height);
        const shadowRadius = Math.max(width, height) / TILE_SIZE / 2 + 6;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowRadius;
        sun.shadow.camera.right = sun.shadow.camera.top = shadowRadius;
        sun.shadow.camera.updateProjectionMatrix();
    };
    return { composer, heatPass, resize, ambientOcclusion, lightWarmup };
};
