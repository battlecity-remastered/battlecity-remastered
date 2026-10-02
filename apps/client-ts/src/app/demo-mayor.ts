import type { ClientState } from "./state.js";
import { BUILD_TREE } from "../ui/build-menu/BuildMenu.js";
import { isGhostTileBlocked } from "../ui/build-menu/GhostPlacement.js";
import { resolveCitySpawn } from "../world/city-spawn.js";
import type { IndustrialBuilding } from "../render/three/industrial-demo.js";

export const initializeDemoMayor=(state:ClientState,buildings:ReadonlyArray<IndustrialBuilding>):void=>{
    state.local.id="local-three-demo";state.identity.callsign="Demo Mayor";state.local.callsign="Demo Mayor";state.local.rankTitle="Private";
    state.lobby.assignments=[{city:state.local.city,mayorId:state.local.id,recruitCount:0}];
    state.cityFinance.set(state.local.city,{cash:100000,income:500,score:0,researchLevel:99,canBuildStates:new Map(BUILD_TREE.map(entry=>[entry.type,1]))});
    state.research.set(state.local.city,{completed:BUILD_TREE.filter(entry=>entry.type>=400).map(entry=>entry.type)});
    const city=resolveCitySpawn(state.local.city)!;
    const place=(id:string,type:number,tileX:number,tileY:number)=>state.buildings.set(id,{id,type,tileX,tileY,ownerId:state.local.id!,cityId:state.local.city,health:120,maxHealth:120,population:0});
    place("demo-command",0,city.tileX,city.tileY);buildings.forEach((building,index)=>place(`demo-existing-${index}`,building.type,building.tileX,building.tileY));
};
export const placeDemoBuilding=(state:ClientState,type:number,tileX:number,tileY:number):boolean=>{
    if(!BUILD_TREE.some(entry=>entry.type===type)||isGhostTileBlocked(state,tileX,tileY,type))return false;
    const id=`demo-built-${type}-${tileX}-${tileY}`;
    state.buildings.set(id,{id,type,tileX,tileY,ownerId:state.local.id!,cityId:state.local.city,health:120,maxHealth:120,population:0});
    state.ui.buildGhostMode=false;state.ui.pendingBuildPlacement=null;return true;
};

// Offline visual sandbox mirrors the classic two-building household limit and
// five residents per 250ms tick; live population comes exclusively from events.
export const createDemoPopulation=(state:ClientState)=>{
    let previous:number|undefined,accumulator=0;
    return {update(now:number):void{
        accumulator+=previous===undefined?0:Math.max(0,Math.min(5000,now-previous));previous=now;
        const buildings=[...state.buildings.values()],houses=buildings.filter(building=>building.type===300);
        const attached=(id:string)=>buildings.filter(building=>building.attachedHouseId===id);
        for(const building of buildings){if(building.type===300)continue;const home=building.attachedHouseId?state.buildings.get(building.attachedHouseId):undefined;if(home?.type!==300||home.cityId!==building.cityId){delete building.attachedHouseId;building.population=0;const matching=houses.filter(house=>house.cityId===building.cityId),house=matching.find(house=>attached(house.id).length===1)??matching.find(house=>attached(house.id).length===0);if(house)building.attachedHouseId=house.id;}}
        const ticks=Math.floor(accumulator/250);accumulator%=250;
        if(ticks)for(const building of buildings)if(building.type!==300&&building.attachedHouseId)building.population=Math.min(50,building.population+ticks*5);
        for(const house of houses)house.population=Math.min(100,attached(house.id).reduce((sum,building)=>sum+building.population,0));
    }};
};
