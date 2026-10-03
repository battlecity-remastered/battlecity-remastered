import { CLASSIC_CLOAK_MS } from "@battlecity/sim-core";
import { initializeDemoMayor, placeDemoBuilding, createDemoPopulation } from "./app/demo-mayor.js";
import { createThreeGameActions } from "./app/three-game-actions.js";
import { createGameConsole } from "./ui/three-game-console.js";
import type { EventSender } from "./network/events.js";
import { createClientState } from "./app/state.js";
import { createDemoMovement } from "./app/demo-movement.js";
import { recordDebugRenderTick, toggleDebugMode } from "./app/debug-metrics.js";
import { registerInputHandlers } from "./app/input.js";
import { isInteractiveKeyboardTarget } from "./input/interactive-target.js";
import { createDebugHud } from "./ui/debug/DebugHud.js";
import { loadMapData } from "./world/map-loader.js";
import { createThreeBattlefield } from "./render/three/ThreeBattlefield.js";
import { createIndustrialDemoLayout,createDefenseDemoLayout } from "./render/three/industrial-demo.js";

export const startThreeDemo = async (): Promise<void> => {
    const root=document.getElementById("app")!;
    root.classList.add("three-demo-mode");
    const state=createClientState(),map=await loadMapData();
    const buildings=createIndustrialDemoLayout(map),defenses=createDefenseDemoLayout(map);
    state.world.blockingTiles=map.blockingTiles;state.world.buildBlockingTiles=map.buildBlockingTiles;state.world.mapSize=map.map.length;
    initializeDemoMayor(state,buildings);
    for(const defense of defenses){const id=`demo-defense-${defense.tileX}-${defense.tileY}`;state.defenses.set(id,{id,cityId:state.local.city,type:9,tileX:defense.tileX,tileY:defense.tileY,health:100,maxHealth:100});}
    let battlefield:Awaited<ReturnType<typeof createThreeBattlefield>>;
    const actions={...createThreeGameActions(state,()=>{}),deploy:(type:number,use=false)=>{
        if(type===5)return battlefield.previewOrb(state);
        if(use&&(type===0||type===2)&&(state.inventory.get(type)??0)>0){if(type===2&&state.local.health>=state.local.maxHealth)return true;state.inventory.set(type,(state.inventory.get(type)??0)-1);if(type===0)state.local.cloakedUntil=Date.now()+CLASSIC_CLOAK_MS;else state.local.health=state.local.maxHealth;return true;}
        return false;
    }};
    battlefield=await createThreeBattlefield(map,buildings,defenses,actions);
    const send:EventSender=(type)=>{if(type==="lobby.leave.request"||type==="building.place.request")window.location.reload();};
    const population=createDemoPopulation(state);
    const gameConsole=createGameConsole(state,send,root,true);
    const sandbox=document.createElement("div");sandbox.className="bc-demo-sandbox";sandbox.innerHTML='<span>MAYOR SANDBOX · ALL RESEARCH UNLOCKED</span><button data-action="orb">ORB MY CITY · O</button><button data-action="reset">RESET DEMO</button>';root.append(sandbox);
    const orb=():void=>{if(battlefield.previewOrb(state))gameConsole.status("DEMO CITY ORBED · RESET TO RESTORE");else gameConsole.status("CARRY AN ORB ONTO YOUR NO PARKING APRON");};
    sandbox.querySelector('[data-action="orb"]')!.addEventListener("click",orb);sandbox.querySelector('[data-action="reset"]')!.addEventListener("click",()=>window.location.reload());
    root.addEventListener("click",event=>{if(event.target instanceof HTMLElement)event.target.closest<HTMLButtonElement>("button")?.blur();},true);
    root.prepend(battlefield.canvas);battlefield.canvas.dataset.runtime="three-only";
    const unregisterInput=registerInputHandlers(state),movement=createDemoMovement(state),debug=createDebugHud(state,root);
    const pointer=(event:PointerEvent):void=>{state.pointer.x=event.clientX;state.pointer.y=event.clientY;state.pointer.inside=true;const tile=battlefield.pickGround(event.clientX,event.clientY);state.ui.pendingBuildPlacement=state.ui.buildGhostMode&&tile?{type:state.ui.selectedBuildType,tileX:tile.tileX-1,tileY:tile.tileY-1}:null;};
    const down=(event: PointerEvent): void=>{if(event.button!==0)return;if(state.ui.showBuildMenu){gameConsole.close();return;}pointer(event);event.preventDefault();if(state.ui.buildDemolishMode){const tile=battlefield.pickGround(event.clientX,event.clientY);const building=tile&&[...state.buildings.values()].find(building=>tile.tileX>=building.tileX&&tile.tileX<building.tileX+3&&tile.tileY>=building.tileY&&tile.tileY<building.tileY+3);if(building){battlefield.previewRemove(building.tileX,building.tileY);state.buildings.delete(building.id);for(let dx=0;dx<3;dx++)for(let dy=0;dy<3;dy++){map.blockingTiles.delete(`${building.tileX+dx},${building.tileY+dy}`);map.buildBlockingTiles.delete(`${building.tileX+dx},${building.tileY+dy}`);}gameConsole.status("DEMO BUILDING DEMOLISHED");}return;}if(state.ui.buildGhostMode){const target=state.ui.pendingBuildPlacement;if(target&&placeDemoBuilding(state,target.type,target.tileX,target.tileY)){battlefield.previewBuild(target.type,target.tileX,target.tileY);gameConsole.status("DEMO BUILDING CONSTRUCTED");}else gameConsole.status("BUILD SITE BLOCKED");return;}const selected=battlefield.pickBuilding(event.clientX,event.clientY,state);
        if(selected?.type===300&&selected.cityId===state.local.city){state.ui.selectedPopulationHouseId=selected.id;state.controls.shoot=false;const workplaces=[...state.buildings.values()].filter(building=>building.attachedHouseId===selected.id);gameConsole.status(`HOUSING · ${selected.population}/100 RESIDENTS · ${workplaces.length}/2 BUILDINGS CONNECTED`);return;}
        state.ui.selectedPopulationHouseId=null;state.controls.shoot=true;};
    const context=(event:MouseEvent):void=>{event.preventDefault();state.controls.shoot=false;gameConsole.toggleBuild({x:event.clientX,y:event.clientY});};
    const up=(event: PointerEvent): void=>{if(event.button===0)state.controls.shoot=false;};
    const key=(event: KeyboardEvent): void=>{
        if(event.repeat || isInteractiveKeyboardTarget(event))return;
        if(event.key==="Escape")gameConsole.close();
        if(event.key==="F3"){toggleDebugMode(state);event.preventDefault();}
        if(event.key.toLowerCase()==="f" && !event.ctrlKey && !event.metaKey && !event.altKey){event.preventDefault();void(document.fullscreenElement?document.exitFullscreen():root.requestFullscreen()).catch(()=>{});}
    };
    const resize=(): void=>{state.pointer.surfaceWidth=window.innerWidth;state.pointer.surfaceHeight=window.innerHeight;battlefield.resize();};
    const reset=(): void=>movement.resetClock();
    battlefield.canvas.addEventListener("pointermove",pointer);battlefield.canvas.addEventListener("contextmenu",context);battlefield.canvas.addEventListener("pointerdown",down);window.addEventListener("pointerup",up);
    window.addEventListener("keydown",key);window.addEventListener("resize",resize);document.addEventListener("visibilitychange",reset);resize();
    let frameId=0,errors=0,disposed=false;
    const frame=(now: number): void=>{
        if(disposed)return;
        try {
            const start=performance.now();movement.advanceFrame(now);
            battlefield.canvas.dataset.movementCpuMs=(performance.now()-start).toFixed(2);
            population.update(now);recordDebugRenderTick(state);battlefield.render(state);debug.render();gameConsole.render();
        }catch(error){if(errors++<3)console.error("[demo.frame]",error);}
        frameId=requestAnimationFrame(frame);
    };
    frameId=requestAnimationFrame(frame);
    window.addEventListener("beforeunload",()=>{
        disposed=true;cancelAnimationFrame(frameId);movement.stop();unregisterInput();debug.dispose();gameConsole.dispose();sandbox.remove();
        battlefield.canvas.removeEventListener("pointermove",pointer);battlefield.canvas.removeEventListener("contextmenu",context);battlefield.canvas.removeEventListener("pointerdown",down);window.removeEventListener("pointerup",up);window.removeEventListener("keydown",key);window.removeEventListener("resize",resize);document.removeEventListener("visibilitychange",reset);battlefield.dispose();
    },{once:true});
};
