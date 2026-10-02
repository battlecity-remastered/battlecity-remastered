import * as THREE from "three";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";

// Index the original triangles without changing their order or rendered buffers.
// Articulated rigid parts can share a tree; deforming meshes keep Three's raycast.
export const accelerateCollisionMesh = (mesh: THREE.Mesh): void => {
    const geometry=mesh.geometry;
    if(mesh instanceof THREE.SkinnedMesh || geometry.morphAttributes.position?.length) return;
    const triangles=(geometry.index?.count??geometry.attributes.position?.count??0)/3;
    if(triangles<128) return;
    if(!geometry.boundsTree) geometry.boundsTree=new MeshBVH(geometry,{indirect:true});
    if(!(mesh instanceof THREE.InstancedMesh)) {
        mesh.raycast=acceleratedRaycast;
        return;
    }
    // InstancedMesh uses a private temporary Mesh internally. Use a local proxy
    // so rock instances are accelerated without patching Three's global classes.
    const proxy=new THREE.Mesh(geometry,mesh.material);
    const transform=new THREE.Matrix4(),sphere=new THREE.Sphere();
    const hits:THREE.Intersection[]=[];
    mesh.raycast=(raycaster,intersections):void=>{
        if(mesh.boundingSphere===null) mesh.computeBoundingSphere();
        sphere.copy(mesh.boundingSphere!).applyMatrix4(mesh.matrixWorld);
        if(!raycaster.ray.intersectsSphere(sphere)) return;
        proxy.geometry=mesh.geometry;proxy.material=mesh.material;
        for(let instanceId=0;instanceId<mesh.count;instanceId++) {
            mesh.getMatrixAt(instanceId,transform);
            proxy.matrixWorld.multiplyMatrices(mesh.matrixWorld,transform);
            acceleratedRaycast.call(proxy,raycaster,hits);
            for(const hit of hits){hit.object=mesh;hit.instanceId=instanceId;intersections.push(hit);}
            hits.length=0;
        }
    };
};
