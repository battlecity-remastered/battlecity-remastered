import type * as THREE from "three";
import { createMaterialBatches } from "./material-batches.js";

// Share lifecycle, visibility and matrix updates with the multi-draw path.
// Geometry grouping keeps the fallback usable without WEBGL_multi_draw.
export const createBuildingBatches = (scene: THREE.Scene, roots: ReadonlyArray<THREE.Object3D>) => createMaterialBatches(scene, roots, false);
