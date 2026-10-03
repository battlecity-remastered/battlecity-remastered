import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG, type RuntimePlayer, type RuntimeBotController } from "../src/runtime/types.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { buildPlayersSnapshot } from "../src/runtime/snapshot.js";
import { tickDefenderBots } from "../src/domain/bots/DefenderBotService.js";
import { maybeLayMinerTrap } from "../src/domain/bots/DefenderBotActivities.js";
import { pickDefenderTarget } from "../src/domain/bots/DefenderBotTargetingService.js";
import { stepBotAlongPath, isBotTopLeftPositionValid, resolveCityCenter, hasBotTerrainSight } from "../src/domain/bots/BotShared.js";
import { createBotPathContext } from "../src/domain/bots/BotPathingService.js";
import { tickFakeCityLifecycle, markFakeCityCooldown } from "../src/domain/fake-cities/FakeCityService.js";
import { buildBlockingTileSet, loadMapData } from "../src/domain/map/MapService.js";
import { joinLobby, buildLobbySnapshot } from "../src/domain/lobby/LobbyService.js";
import { purgeFactoryOutputsForDestroyedBuilding } from "../src/runtime/factory-destruction.js";

const config = {...DEFAULT_RUNTIME_CONFIG, cityCount:64, rogueMaxBots: 0};
const human = (id = "human", city = 0): RuntimePlayer => ({id,city,x:4600,y:7600,direction:16,speed:600,health:100,maxHealth:100});
const controller = (): RuntimeBotController => ({id:"miner",botType:"defender",botRole:"miner",homeCityId:17,targetCityId:17,nextShotAt:0,nextRetargetAt:0});
const harness = () => {
    const state = createRuntimeState({fakeCityIds:[17]});
    const events: Array<{type:string;payload:unknown}> = [];
    const emitter = createRuntimeEmitter(state,{emitAll:event=>events.push(event),emitTo:()=>{},reject:()=>{}});
    return {state,events,emitter};
};
const minerFactories = (state: ReturnType<typeof createRuntimeState>): void => {
    for (const type of [104, 107]) state.buildings.set(`factory_${type}`, { id: `factory_${type}`, ownerId: "fake_city_17", cityId: 17, type, tileX: 70, tileY: 150, health: 100, maxHealth: 100, population: 0 });
};

test("AI cities wait for players and never replace a human city", () => {
    const {state,emitter}=harness();
    tickFakeCityLifecycle(state,config,emitter,1000);
    assert.equal(state.fakeCities.get(17)?.active,false);
    state.players.set("human",human("human",17));state.socketCities.set("human",17);state.fakeCityEvaluationAt=0;
    tickFakeCityLifecycle(state,config,emitter,2000);
    assert.equal(state.fakeCities.get(17)?.active,false);
    assert.equal(state.buildings.size,0);
});

test("generated cities reject human ownership, spawn four roles and advertise AI occupancy", () => {
    const {state,emitter}=harness();state.players.set("human",human());
    tickFakeCityLifecycle(state,config,emitter,1000);
    assert.ok(state.buildings.size>=35);
    tickDefenderBots(state,config,emitter,1000,100);
    assert.deepEqual(new Set([...state.botControllers.values()].map(bot=>bot.botRole)),new Set(["mayor","shooter","bomb_defuser","miner"]));
    assert.equal(buildPlayersSnapshot(state).players.filter(player=>player.botRole==="mayor").length,1);
    assert.equal(joinLobby(state,"visitor",17,config).ok,false);
    assert.equal(buildLobbySnapshot(state,config).find(city=>city.city===17)?.mayorId,"fake_city_17");
});

test("clearing defenders gives twenty seconds before replacement and preserves the missing role", () => {
    const {state,emitter}=harness();state.players.set("human",human());
    tickFakeCityLifecycle(state,config,emitter,1000);tickDefenderBots(state,config,emitter,1000,100);
    const victim=[...state.botControllers.values()].find(bot=>bot.botRole==="miner")!;
    state.players.delete(victim.id);state.botControllers.delete(victim.id);
    tickDefenderBots(state,config,emitter,4000,100);
    assert.equal([...state.botControllers.values()].some(bot=>bot.botRole==="miner"),false);
    tickDefenderBots(state,config,emitter,23000,100);
    assert.equal([...state.botControllers.values()].some(bot=>bot.botRole==="miner"),false);
    tickDefenderBots(state,config,emitter,26000,100);
    assert.equal([...state.botControllers.values()].filter(bot=>bot.botRole==="miner").length,1);
});

test("defenders ignore allies, dead players and cloak but acquire exposed enemies", () => {
    const {state}=harness();const bot=human("miner",17), ctl=controller();
    state.players.set("ally",human("ally",17));
    state.players.set("dead",{...human("dead"),health:0});
    state.players.set("cloaked",{...human("cloaked"),cloakedUntil:2000});
    assert.equal(pickDefenderTarget(state,config,bot,ctl,900,1000),null);
    assert.equal(pickDefenderTarget(state,config,bot,ctl,900,3000)?.id,"cloaked");
});

test("miners lay armed hidden hazards ahead of enemies, respect cooldown and cap growth", () => {
    const {state,emitter,events}=harness();const ctl=controller(),bot={...human("miner",17),x:4300};
    minerFactories(state);
    state.players.set("human",human());state.players.set(bot.id,bot);
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",1000);
    assert.equal(state.hazards.size,1);
    const trap=[...state.hazards.values()][0]!;
    assert.ok(trap.type===4||trap.type===7);assert.equal(trap.armed,true);assert.equal(trap.active,true);
    assert.ok(Math.hypot(trap.x-4600,trap.y-7600)>=96);
    assert.ok(events.some(event=>event.type==="hazard.spawn"));
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",2000);assert.equal(state.hazards.size,1);
    for(let i=1;i<6;i++)state.hazards.set(`cap_${i}`,{...trap,id:`cap_${i}`,x:3000+i*144});
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",20000);assert.equal(state.hazards.size,6);
});

test("miners cannot place traps on terrain or underneath players", () => {
    const {state,emitter}=harness();const ctl=controller(),bot={...human("miner",17),x:4300};
    minerFactories(state);
    state.players.set("human",human());
    for(let x=90;x<105;x++)for(let y=150;y<170;y++)state.blockingTiles.add(`${x},${y}`);
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",1000);assert.equal(state.hazards.size,0);
});

test("destroying the DFG factory clears its city traps and miners cannot recreate them", context => {
    const {state,emitter}=harness(), ctl=controller(), bot={...human("miner",17),x:4300};
    minerFactories(state); state.players.set("human",human()); state.players.set(bot.id,bot);
    context.mock.method(Math,"random",()=>0.9);
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",1000);
    assert.equal([...state.hazards.values()][0]?.type,7);
    const factory=state.buildings.get("factory_107")!;
    state.buildings.delete(factory.id); purgeFactoryOutputsForDestroyedBuilding(state,emitter,factory);
    assert.equal(state.hazards.size,0);
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",11000);
    assert.deepEqual([...state.hazards.values()].map(hazard=>hazard.type),[4]);
    state.buildings.delete("factory_104"); state.hazards.clear();
    maybeLayMinerTrap(state,config,emitter,bot,ctl,"human",21000);
    assert.equal(state.hazards.size,0);
});

const moveOptions = {fallbackPathTarget:undefined,searchRadiusTiles:12,maxNodes:3000,pathfindIntervalMs:1000,pathContext:createBotPathContext(),waypointReachedDistancePx:8,moveSpeed:220};
test("bots settle at their destination and respect DFG freeze", () => {
    const {state}=harness();let bot={...human("miner",17),x:480,y:480,isBot:true};const ctl=controller();
    state.players.set(bot.id,bot);
    for(let i=0;i<40;i++)bot=stepBotAlongPath(state,config,1000+i*100,100,ctl,bot,{x:720,y:480},moveOptions) as typeof bot;
    assert.ok(Math.hypot(bot.x-720,bot.y-480)<2,`${bot.x},${bot.y}`);
    const frozen={...bot,frozenUntil:10000};
    assert.deepEqual(stepBotAlongPath(state,config,7000,100,ctl,frozen,{x:960,y:480},moveOptions),frozen);
});

test("orbed AI cities remain empty through cooldown and rebuild after it", () => {
    const {state,emitter}=harness();state.players.set("human",human());
    tickFakeCityLifecycle(state,config,emitter,1000);tickDefenderBots(state,config,emitter,1000,100);
    state.buildings.clear();state.defenses.clear();state.hazards.clear();
    markFakeCityCooldown(state,17,2000,config);
    assert.equal(state.botControllers.size,0);
    tickFakeCityLifecycle(state,config,emitter,3000);assert.equal(state.buildings.size,0);
    state.fakeCityEvaluationAt=0;
    tickFakeCityLifecycle(state,config,emitter,302001);assert.ok(state.buildings.size>=35);
});

test("real-map generated city defenders patrol safely over a minute of simulation", () => {
    const {state,emitter}=harness();state.blockingTiles=buildBlockingTileSet(loadMapData());
    // Friendly visitor activates patrols without providing a combat target.
    state.players.set("human",human("human",17));
    // Spawn before assigning the visitor to the AI city (ownership is intentionally blocked).
    state.players.get("human")!.city=0;
    tickFakeCityLifecycle(state,config,emitter,1000);state.players.get("human")!.city=17;
    tickDefenderBots(state,config,emitter,1000,100);
    const positions=new Map([...state.players.values()].filter(bot=>bot.isBot).map(bot=>[bot.id,{x:bot.x,y:bot.y}]));
    const travel=new Map<string,number>();
    for(let i=1;i<=600;i++){
        tickDefenderBots(state,config,emitter,1000+i*100,100);
        for(const bot of state.players.values())if(bot.isBot){
            const previous=positions.get(bot.id)!;
            travel.set(bot.id,(travel.get(bot.id)??0)+Math.hypot(bot.x-previous.x,bot.y-previous.y));
            positions.set(bot.id,{x:bot.x,y:bot.y});
        }
    }
    for(const bot of state.players.values())if(bot.isBot){
        assert.ok((travel.get(bot.id)??0)>144,`idle ${bot.id}`);
        assert.ok(Number.isFinite(bot.x)&&Number.isFinite(bot.y));
    }
    assert.equal(state.bullets.size,0,"patrols must not shoot friendly visitors");
});

test("tile waypoints route around an L-shaped wall without cutting corners", () => {
    const {state}=harness();const ctl=controller();let bot={...human("miner",17),x:10*48,y:10*48,isBot:true};
    for(let y=8;y<=14;y++)state.blockingTiles.add(`13,${y}`);
    for(let x=13;x<=18;x++)state.blockingTiles.add(`${x},14`);
    const options={...moveOptions,waypointReachedDistancePx:2,pathContext:createBotPathContext()};
    const goal={x:17*48,y:11*48};let turns=0,lastDirection=bot.direction;
    for(let i=0;i<200;i++){
        bot=stepBotAlongPath(state,config,1000+i*100,100,ctl,bot,goal,options) as typeof bot;
        assert.equal(isBotTopLeftPositionValid(state,config,bot.x,bot.y),true,`clipped ${bot.x},${bot.y}`);
        if(bot.direction!==lastDirection){turns++;lastDirection=bot.direction;}
    }
    assert.ok(turns>=2);assert.ok(Math.hypot(bot.x-goal.x,bot.y-goal.y)<2);
});

test("periodic replanning preserves forward progress on a clear tile corridor",()=>{
    const {state}=harness();const ctl=controller();let bot={...human("miner",17),x:480,y:480,isBot:true};
    const options={...moveOptions,waypointReachedDistancePx:2,pathfindIntervalMs:300,pathContext:createBotPathContext()};
    for(let i=0;i<80;i++){
        const previousX=bot.x;bot=stepBotAlongPath(state,config,1000+i*100,100,ctl,bot,{x:1440,y:480},options) as typeof bot;
        assert.ok(bot.x>=previousX-0.001,`replan moved backwards from ${previousX} to ${bot.x}`);
        assert.ok(Math.abs(bot.y-480)<0.001);
    }
    assert.equal(bot.x,1440);
});

test("an unreachable route stops rather than pressing against the blocking tile",()=>{
    const {state}=harness();const ctl=controller();const bot={...human("miner",17),x:480,y:480,isBot:true};
    for(let x=9;x<=11;x++)for(let y=9;y<=11;y++)if(x!==10||y!==10)state.blockingTiles.add(`${x},${y}`);
    const result=stepBotAlongPath(state,config,1000,100,ctl,bot,{x:960,y:480},{...moveOptions,pathContext:createBotPathContext()});
    assert.equal(result.x,480);assert.equal(result.y,480);
});

test("all configured AI cities spawn tile-aligned defenders with usable real-map patrols",()=>{
    const blocking=buildBlockingTileSet(loadMapData());
    for(const cityId of [17,33,34,42,26,45]){
        const state=createRuntimeState({fakeCityIds:[cityId],blockingTiles:blocking});
        const emitter=createRuntimeEmitter(state,{emitAll:()=>{},emitTo:()=>{},reject:()=>{}});
        // Use the canonical spawn coordinates for a visiting enemy.
        const spawn=resolveCityCenter(cityId,config);
        state.players.set("human",{...human(),x:spawn.x,y:spawn.y+48});
        tickFakeCityLifecycle(state,config,emitter,1000);
        state.players.get("human")!.city=cityId;
        tickDefenderBots(state,config,emitter,1000,100);
        assert.equal(state.botControllers.size,4,`city ${cityId} defenders`);
        const travelled=new Map<string,number>();
        for(let tick=0;tick<100;tick++){
            const before=new Map([...state.players.values()].filter(bot=>bot.isBot).map(bot=>[bot.id,{x:bot.x,y:bot.y}]));
            tickDefenderBots(state,config,emitter,1100+tick*100,100);
            for(const bot of state.players.values())if(bot.isBot){
                assert.equal(isBotTopLeftPositionValid(state,config,bot.x,bot.y),true,`city ${cityId} clipped`);
                const previous=before.get(bot.id)!;
                travelled.set(bot.id,(travelled.get(bot.id)??0)+Math.hypot(bot.x-previous.x,bot.y-previous.y));
            }
        }
        for(const [id,distance] of travelled)assert.ok(distance>48,`city ${cityId} ${id} stuck`);
    }
});

test("defenders use reachable city entrances when a generated layout isolates the centre", context => {
    // Seed 55 reproduced a city 42 layout with no defenders at all.
    let seed = 55;
    context.mock.method(Math, "random", () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    });
    const state = createRuntimeState({ fakeCityIds: [42], blockingTiles: buildBlockingTileSet(loadMapData()) });
    const emitter = createRuntimeEmitter(state, { emitAll: () => {}, emitTo: () => {}, reject: () => {} });
    const spawn = resolveCityCenter(42, config);
    state.players.set("human", { ...human(), x: spawn.x, y: spawn.y + 48 });
    tickFakeCityLifecycle(state, config, emitter, 1000);
    state.players.get("human")!.city = 42;
    tickDefenderBots(state, config, emitter, 1000, 0);
    assert.equal(state.botControllers.size, 4);
    const starts = new Map([...state.players.values()].filter(player => player.isBot).map(bot => [bot.id, { x: bot.x, y: bot.y }]));
    for (const start of starts.values()) {
        assert.equal(start.x % config.tileSize, 0);
        assert.equal(start.y % config.tileSize, 0);
    }
    const travel = new Map<string, number>();
    for (let tick = 0; tick < 100; tick++) {
        const before = new Map([...state.players.values()].filter(bot => bot.isBot).map(bot => [bot.id, { x: bot.x, y: bot.y }]));
        tickDefenderBots(state, config, emitter, 1100 + tick * 100, 100);
        for (const bot of state.players.values()) if (bot.isBot) {
            assert.equal(isBotTopLeftPositionValid(state, config, bot.x, bot.y), true);
            const previous = before.get(bot.id)!;
            travel.set(bot.id, (travel.get(bot.id) ?? 0) + Math.hypot(bot.x - previous.x, bot.y - previous.y));
        }
    }
    for (const [id, distance] of travel) assert.ok(distance > 48, `${id} did not patrol: ${distance}`);
});

test("defenders flank a rock wall instead of stopping at firing range and firing into it",()=>{
    const {state,emitter}=harness();const now=Date.now();
    state.fakeCities.set(17,{cityId:17,active:true,cooldownUntil:0,buildingIds:[],defenseIds:[],hazardIds:[]});
    state.defenderSpawnCheckAt=now+60000;
    const bot={...human("miner",17),x:480,y:480,isBot:true,botType:"defender" as const};
    const ctl={...controller(),botRole:"shooter" as const,nextShotAt:now};
    state.players.set(bot.id,bot);state.botControllers.set(bot.id,ctl);
    state.players.set("human",{...human(),x:816,y:480});
    for(let y=8;y<=12;y++)state.blockingTiles.add(`13,${y}`);
    let fired=false;
    for(let tick=0;tick<120;tick++){
        tickDefenderBots(state,config,emitter,now+tick*100,100);
        const current=state.players.get(bot.id)!;
        assert.equal(isBotTopLeftPositionValid(state,config,current.x,current.y),true);
        if(state.bullets.size){assert.equal(hasBotTerrainSight(state,config,current,state.players.get("human")!),true);fired=true;break;}
    }
    assert.equal(fired,true,"defender should find a firing lane around the wall");
});

test("AI city progress survives the last player dying or returning to the lobby",()=>{
    const {state,emitter}=harness();state.players.set("human",human());
    tickFakeCityLifecycle(state,config,emitter,1000);
    const building=[...state.buildings.values()].find(building=>building.type!==0)!;
    building.health=17;state.players.delete("human");state.fakeCityEvaluationAt=0;
    tickFakeCityLifecycle(state,config,emitter,15000);
    assert.equal(state.fakeCities.get(17)?.active,true);
    assert.equal(state.buildings.get(building.id)?.health,17);
});
