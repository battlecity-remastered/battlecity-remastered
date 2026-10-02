import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDestructionEffects } from "../src/render/three/destruction-effects.js";

const building=()=>{
    const root=new THREE.Group();root.position.set(4,0,8);root.userData.commandCenter=true;
    const geometry=new THREE.BoxGeometry(.6,.2,.6),material=new THREE.MeshStandardMaterial({color:0x65787c,metalness:.7});
    for(let i=0;i<8;i++){const panel=new THREE.Mesh(geometry,material);panel.position.set((i%3-1)*.5,.7+Math.floor(i/3)*.3,0);root.add(panel);}
    return {root,geometry,material};
};
test("destroyed structures retain an animated remnant and actual roof parts, then release bounded visual resources",()=>{
    const scene=new THREE.Scene(),effects=createDestructionEffects(scene,()=>0),source=building();scene.add(source.root);
    let disposed=0;source.geometry.addEventListener("dispose",()=>disposed++);
    assert.ok(effects.destroy(source.root));assert.equal(source.root.visible,false);assert.equal(effects.stats.collapsing,1);assert.equal(effects.stats.fragments,8);
    assert.equal(effects.destroy(source.root),false,"a server removal cannot start the same destruction twice");
    assert.ok(source.root.children.every(child=>child.visible),"original reusable geometry remains intact");
    const remnant=scene.children.find(root=>root.userData.destructiveRemnant)!;
    effects.update(.3);assert.ok(remnant.visible);const height=remnant.scale.y;
    effects.update(.5);assert.ok(remnant.scale.y<height);assert.equal(source.root.scale.y,1);
    effects.update(.6);assert.equal(effects.stats.collapsing,0);assert.equal(remnant.visible,false);assert.ok(effects.stats.fragments>0,"rubble outlasts the collapse");
    for(let i=0;i<80;i++)effects.update(.1);
    assert.equal(effects.stats.fragments,0);assert.equal(effects.stats.clouds,0);assert.equal(remnant.parent,null);assert.equal(disposed,0,"debris never disposes shared asset geometry");
    effects.dispose();source.geometry.dispose();source.material.dispose();
});
test("simultaneous detonations cap collapse rigs and fire/smoke rather than accumulating a whole city",()=>{
    const scene=new THREE.Scene(),effects=createDestructionEffects(scene,()=>0),sources=[];
    for(let i=0;i<20;i++){const source=building();source.root.userData.commandCenter=false;scene.add(source.root);sources.push(source);effects.destroy(source.root);}
    assert.ok(effects.stats.collapsing<=6);assert.ok(effects.stats.fragments<=6*18);assert.ok(effects.stats.clouds<=256);
    effects.update(.1);assert.ok(scene.children.filter(child=>child.userData.destructiveRemnant).length<=6);
    effects.dispose();assert.equal(scene.children.length,0);
    for(const source of sources){source.geometry.dispose();source.material.dispose();}
});

test("debris never retains live building/defense IDs that could be destroyed or selected again",()=>{
    const scene=new THREE.Scene(),effects=createDestructionEffects(scene,()=>0),source=building();source.root.userData.previewDefenseId="turret";source.root.userData.renderTileX=4;source.root.userData.renderTileY=8;scene.add(source.root);
    effects.destroy(source.root);const remnant=scene.children.find(child=>child.userData.destructiveRemnant)!;
    assert.equal(remnant.userData.previewDefenseId,undefined);assert.equal(remnant.userData.renderTileX,undefined);assert.equal(remnant.userData.renderTileY,undefined);
    effects.dispose();source.geometry.dispose();source.material.dispose();
});
