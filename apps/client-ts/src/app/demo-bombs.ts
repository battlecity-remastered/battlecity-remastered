import { isBombStructureInRange } from "@battlecity/sim-core";
import type { ClientState } from "./state.js";

export const detonateDemoBombs=(state:ClientState,now:number)=>{
    const buildings:Array<ClientState["buildings"] extends Map<string,infer B>?B:never>=[],defenses:string[]=[],hazards:string[]=[],blasts:Array<{x:number;y:number}>=[];
    for(const [id,bomb] of [...state.hazards]){
        if(!state.hazards.has(id)||bomb.type!==3||!bomb.armed||!bomb.active||bomb.fuseEndsAt===undefined||now<bomb.fuseEndsAt)continue;
        const cx=Math.floor((bomb.x+24)/48),cy=Math.floor((bomb.y+24)/48);
        blasts.push({x:bomb.x+24,y:bomb.y+24});
        state.events.effects.explosions.push({id:`demo-blast-${id}`,x:bomb.x+24,y:bomb.y+24,variant:"large",createdAt:now});
        for(const [buildingId,building] of [...state.buildings])if(isBombStructureInRange(building.tileX,building.tileY,cx,cy,3)){
            buildings.push(building);state.buildings.delete(buildingId);
            for(let dx=0;dx<3;dx++)for(let dy=0;dy<3;dy++){state.world.blockingTiles.delete(`${building.tileX+dx},${building.tileY+dy}`);state.world.buildBlockingTiles.delete(`${building.tileX+dx},${building.tileY+dy}`);}
            if(building.type>=100&&building.type<=112){
                const type=building.type-100;state.factoryStock.get(building.cityId)?.delete(type);state.inventory.delete(type);
                if(type>=8&&type<=11)for(const [defenseId,defense] of [...state.defenses])if(defense.cityId===building.cityId&&defense.type===type){defenses.push(defenseId);state.defenses.delete(defenseId);state.world.blockingTiles.delete(`${defense.tileX},${defense.tileY}`);state.world.buildBlockingTiles.delete(`${defense.tileX},${defense.tileY}`);}
                for(const [hazardId,hazard] of [...state.hazards])if([3,4,7].includes(type)&&hazard.cityId===building.cityId&&hazard.type===type){hazards.push(hazardId);state.hazards.delete(hazardId);}
            }
        }
        for(const [defenseId,defense] of [...state.defenses])if(isBombStructureInRange(defense.tileX,defense.tileY,cx,cy)){
            defenses.push(defenseId);state.defenses.delete(defenseId);state.world.blockingTiles.delete(`${defense.tileX},${defense.tileY}`);state.world.buildBlockingTiles.delete(`${defense.tileX},${defense.tileY}`);
        }
        for(const [hazardId,hazard] of [...state.hazards])if(isBombStructureInRange(Math.floor((hazard.x+24)/48),Math.floor((hazard.y+24)/48),cx,cy)){
            hazards.push(hazardId);state.hazards.delete(hazardId);
        }
    }
    if(state.events.effects.explosions.length>24)state.events.effects.explosions.splice(0,state.events.effects.explosions.length-24);
    return {buildings,defenses,hazards,blasts};
};
