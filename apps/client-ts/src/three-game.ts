import { createClientState } from "./app/state.js";
import { registerInputHandlers } from "./app/input.js";
import { createThreeGameRuntime } from "./app/three-game-runtime.js";
import { createThreeGameActions } from "./app/three-game-actions.js";
import { createSocketRuntime } from "./network/socket.js";
import { createThreeBattlefield, type ThreeBattlefield } from "./render/three/ThreeBattlefield.js";
import { loadMapData } from "./world/map-loader.js";
import { createLobbyManager } from "./ui/lobby/LobbyManager.js";
import { createChatManager } from "./ui/chat/ChatManager.js";
import { restoreIdentity } from "./ui/identity/IdentityManager.js";
import { createNotificationManager } from "./ui/notifications/NotificationManager.js";
import { createGameConsole } from "./ui/three-game-console.js";
import { createDebugHud } from "./ui/debug/DebugHud.js";
import { recordDebugRenderTick, toggleDebugMode } from "./app/debug-metrics.js";
import { isInteractiveKeyboardTarget } from "./input/interactive-target.js";
import { isGhostTileBlocked } from "./ui/build-menu/GhostPlacement.js";

export const startThreeGame=async():Promise<void>=>{
    const root=document.getElementById("app")!;root.classList.add("three-game-mode");
    const state=createClientState();restoreIdentity(state);
    const saveIdentity=(identity:unknown):void=>{try{localStorage.setItem("battlecity.identity.v2",JSON.stringify(identity));}catch{/* Private/storage-restricted browsers can still play. */}};
    const map=await loadMapData();state.world.blockingTiles=map.blockingTiles;state.world.buildBlockingTiles=map.buildBlockingTiles;state.world.mapSize=map.map.length;
    let battlefield:ThreeBattlefield|undefined;
    const network=createSocketRuntime(state,event=>{battlefield?.observeServerEvent(event,state);if(event.type==="score.profile" && event.payload.playerId===state.local.id)saveIdentity({...state.identity,userId:event.payload.userId});});
    const actions=createThreeGameActions(state,network.send);
    battlefield=await createThreeBattlefield(map,[],[],actions);root.prepend(battlefield.canvas);battlefield.canvas.dataset.runtime="three-live";battlefield.canvas.tabIndex=0;battlefield.canvas.style.outline="none";
    root.addEventListener("click",event=>{const target=event.target;if(target instanceof HTMLElement)target.closest<HTMLButtonElement>("button")?.blur();},true);
    const input=registerInputHandlers(state,true),runtime=createThreeGameRuntime(state,network.send),lobby=createLobbyManager(state,network.send,root),chat=createChatManager(state,network.send,root),notifications=createNotificationManager(state,root),gameConsole=createGameConsole(state,network.send,root),debug=createDebugHud(state,root);
    const identity=document.createElement("label");identity.className="bc-lobby-identity";identity.innerHTML='<span>CALLSIGN</span><input maxlength="20" aria-label="Callsign">';const name=identity.querySelector("input")!;name.value=state.identity.callsign;name.addEventListener("change",()=>{state.identity.callsign=name.value.trim().slice(0,20)||"Pilot";saveIdentity(state.identity);});root.append(identity);
    const pointer=(event:PointerEvent):void=>{state.pointer.x=event.clientX;state.pointer.y=event.clientY;state.pointer.inside=true;const tile=battlefield!.pickGround(event.clientX,event.clientY);state.ui.pendingBuildPlacement=state.ui.buildGhostMode&&tile?{tileX:tile.tileX-1,tileY:tile.tileY-1,type:state.ui.selectedBuildType}:null;};
    const down=(event:PointerEvent):void=>{
        if(event.button!==0 || !state.local.id)return;if(state.ui.showBuildMenu){gameConsole.close();return;}battlefield!.canvas.focus({preventScroll:true});pointer(event);event.preventDefault();
        if(state.ui.buildGhostMode){const placement=state.ui.pendingBuildPlacement;if(!placement)return;if(isGhostTileBlocked(state,placement.tileX,placement.tileY)){gameConsole.status("BUILD SITE BLOCKED");return;}network.send("building.place.request",{...placement,ownerId:state.local.id,cityId:state.local.city});return;}
        if(state.ui.buildDemolishMode){const tile=battlefield!.pickGround(event.clientX,event.clientY);const building=tile&&[...state.buildings.values()].find(building=>building.cityId===state.local.city&&tile.tileX>=building.tileX&&tile.tileX<building.tileX+3&&tile.tileY>=building.tileY&&tile.tileY<building.tileY+3);if(building)network.send("building.demolish.request",{id:building.id,cityId:state.local.city});return;}
const selected=battlefield!.pickBuilding(event.clientX,event.clientY,state);
        if(selected?.type===300&&selected.cityId===state.local.city){state.ui.selectedPopulationHouseId=selected.id;state.controls.shoot=false;const workplaces=[...state.buildings.values()].filter(building=>building.attachedHouseId===selected.id);gameConsole.status(`HOUSING · ${selected.population}/100 RESIDENTS · ${workplaces.length}/2 BUILDINGS CONNECTED`);return;}
        state.ui.selectedPopulationHouseId=null;state.controls.shoot=true;
    };
    const context=(event:MouseEvent):void=>{event.preventDefault();state.controls.shoot=false;gameConsole.toggleBuild({x:event.clientX,y:event.clientY});};
    const up=():void=>{state.controls.shoot=false;};
    const key=(event:KeyboardEvent):void=>{
        if(event.repeat||isInteractiveKeyboardTarget(event))return;
        if(event.key==="F3"){toggleDebugMode(state);event.preventDefault();return;}
        if(event.key==="Escape"){gameConsole.close();state.controls.shoot=false;return;}
        const value=event.key.toLowerCase();
        if(value==="f"&&!event.ctrlKey&&!event.metaKey){event.preventDefault();void(document.fullscreenElement?document.exitFullscreen():root.requestFullscreen()).catch(()=>{});}
        if(event.key==="Control")actions.flare();
    };
    const resize=():void=>{state.pointer.surfaceWidth=window.innerWidth;state.pointer.surfaceHeight=window.innerHeight;battlefield!.resize();};
    battlefield.canvas.addEventListener("pointermove",pointer);battlefield.canvas.addEventListener("contextmenu",context);battlefield.canvas.addEventListener("pointerdown",down);window.addEventListener("pointerup",up);window.addEventListener("keydown",key);window.addEventListener("resize",resize);resize();
    let frameId=0,disposed=false,errors=0;
    const frame=(now:number):void=>{if(disposed)return;try{const start=performance.now();runtime.advanceFrame(now);battlefield!.canvas.dataset.movementCpuMs=(performance.now()-start).toFixed(2);recordDebugRenderTick(state);battlefield!.render(state);lobby.render();chat.render();notifications.render();gameConsole.render();debug.render();identity.hidden=state.local.id!==null;}catch(error){if(errors++<3)console.error("[game.frame]",error);}frameId=requestAnimationFrame(frame);};
    frameId=requestAnimationFrame(frame);
    window.addEventListener("beforeunload",()=>{disposed=true;cancelAnimationFrame(frameId);runtime.stop();input();network.stop();lobby.dispose();chat.dispose();notifications.dispose();gameConsole.dispose();debug.dispose();identity.remove();battlefield!.dispose();window.removeEventListener("pointerup",up);window.removeEventListener("keydown",key);window.removeEventListener("resize",resize);},{once:true});
};
