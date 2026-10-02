import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createDemoPopulation,initializeDemoMayor,placeDemoBuilding } from "../src/app/demo-mayor.js";
import { resolvePopulationDisplay } from "../src/render/three/population-display.js";

test("population readout preserves six crew symbols and authoritative household links",()=>{
    const state=createClientState();const factory={id:"factory",type:112,tileX:40,tileY:40,cityId:0,ownerId:"pilot",population:0,health:100,maxHealth:100};state.buildings.set(factory.id,factory);
    assert.equal(resolvePopulationDisplay(state,factory).label,"NO HOME");assert.equal(resolvePopulationDisplay(state,factory).lit,0);
    const home={...factory,id:"home",type:300,population:35};state.buildings.set(home.id,home);const staffed={...factory,population:35,attachedHouseId:home.id};
    const view=resolvePopulationDisplay(state,staffed);assert.equal(view.home,home);assert.equal(view.label,"35/50");assert.equal(view.lit,5);assert.equal(view.ready,false);assert.equal(resolvePopulationDisplay(state,{...staffed,population:50}).ready,true);
    assert.equal(resolvePopulationDisplay(state,home).label,"35/100");state.buildings.delete(home.id);assert.equal(resolvePopulationDisplay(state,staffed).home,undefined);
});

test("demo households support two buildings, fill in classic ticks, and reattach after demolition",()=>{
    const state=createClientState();initializeDemoMayor(state,[{kind:"factory",type:112,tileX:20,tileY:20},{kind:"research",type:412,tileX:25,tileY:20}]);
    assert.equal(placeDemoBuilding(state,300,40,40),true);const house=[...state.buildings.values()].find(building=>building.type===300)!;const population=createDemoPopulation(state);population.update(0);
    const attached=[...state.buildings.values()].filter(building=>building.attachedHouseId===house.id);assert.equal(attached.length,2);assert.equal(house.population,0);population.update(250);assert.equal(house.population,10);assert.equal(attached[0]!.population,5);population.update(2500);assert.equal(house.population,100);
    const unsupported=[...state.buildings.values()].find(building=>building.type!==300&&!building.attachedHouseId)!;assert.equal(unsupported.population,0);
    state.buildings.delete(house.id);population.update(2750);assert.ok(attached.every(building=>building.population===0&&!building.attachedHouseId));
    assert.equal(placeDemoBuilding(state,300,45,40),true);population.update(3000);assert.equal([...state.buildings.values()].filter(building=>building.attachedHouseId).length,2);
});
