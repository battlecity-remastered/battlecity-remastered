import * as THREE from "three";
import { resolveWorldViewport, TILE_SIZE } from "../../gameplay/world-viewport.js";

// Keep the floor's screen-space scale identical to Pixi. Compensating for
// elevation in the vertical frustum prevents north/south tiles being squeezed.
export const CAMERA_ELEVATION = THREE.MathUtils.degToRad(65);
const CAMERA_HEIGHT = 40;
const CAMERA_SOUTH_OFFSET = CAMERA_HEIGHT / Math.tan(CAMERA_ELEVATION);

export const resizeBattlefieldCamera = (
    camera: THREE.OrthographicCamera,
    width: number,
    height: number
): void => {
    const viewport = resolveWorldViewport(width, height);
    // Pixi anchors the sprite's top-left at the viewport center. Our model's
    // origin is the sprite center, so account for the half-tile explicitly.
    const playerCenterX = viewport.centerX + TILE_SIZE / 2;
    const playerCenterY = viewport.centerY + TILE_SIZE / 2;
    const verticalScale = Math.sin(CAMERA_ELEVATION) / TILE_SIZE;
    camera.left = -playerCenterX / TILE_SIZE;
    camera.right = (viewport.surfaceWidth - playerCenterX) / TILE_SIZE;
    camera.top = playerCenterY * verticalScale;
    camera.bottom = -(viewport.surfaceHeight - playerCenterY) * verticalScale;
    camera.updateProjectionMatrix();
};

export const positionBattlefieldCamera = (
    camera: THREE.OrthographicCamera,
    playerX: number,
    playerZ: number
): void => {
    // Keep the camera footprint within the finite map at its edges. The tank
    // can reach the last tile without half the screen becoming scene background.
    const halfWorld = 256;
    playerX = THREE.MathUtils.clamp(playerX, -halfWorld - camera.left, halfWorld - camera.right);
    playerZ = THREE.MathUtils.clamp(playerZ,
        -halfWorld + camera.top / Math.sin(CAMERA_ELEVATION),
        halfWorld + camera.bottom / Math.sin(CAMERA_ELEVATION));
    camera.position.set(playerX, CAMERA_HEIGHT, playerZ + CAMERA_SOUTH_OFFSET);
    camera.lookAt(playerX, 0, playerZ);
    camera.updateMatrixWorld();
};

export const createBattlefieldCamera = (width: number, height: number): THREE.OrthographicCamera => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 150);
    resizeBattlefieldCamera(camera, width, height);
    positionBattlefieldCamera(camera, 0, 0);
    return camera;
};
