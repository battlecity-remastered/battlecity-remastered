import type { ClientState } from "../../app/state.js";
import { FACTORY_PRODUCTS } from "./industrial-demo.js";
import type { DemoWeapon } from "./demo-combat.js";

export const INVENTORY_ORDER = [12,1,2,3,4,5,6,7,8,9,10,11,0] as const;
const details = [
    ["Cloak", "STEALTH", "Concealment field generator."],
    ["Rocket", "ORDNANCE", "Heavy rocket casing. Hot exhaust and a smoke wake."],
    ["Medkit", "SUPPORT", "Armoured field repair supplies."],
    ["Bomb", "EXPLOSIVE", "High-yield demolition charge."],
    ["Mine", "EXPLOSIVE", "Compact proximity charge."],
    ["Orb", "CITY BREAKER", "A captive singularity. The heart of BattleCity."],
    ["Flare", "COUNTERMEASURE", "Rear-launched defensive flare."],
    ["DFG", "FIELD SYSTEM", "Directional force generator."],
    ["Wall", "DEFENSE", "Deployable armoured barricade."],
    ["Turret", "DEFENSE", "Automated tracking cannon."],
    ["Sleeper", "DEFENSE", "Concealed perimeter weapon."],
    ["Plasma", "DEFENSE", "High-energy perimeter emitter."],
    ["Laser", "ENERGY WEAPON", "Coherent cyan pulses. Fast, straight and precise."]
] as const;

export const INVENTORY_ITEMS = FACTORY_PRODUCTS.map((product,type) => ({
    type, product, name: details[type]![0], category: details[type]![1], description: details[type]![2],
    accent: type===5 ? "#bc9bff" : type===1 || type===3 || type===4 ? "#efa879" : "#8de2d9"
}));

export const seedDemoInventory = (state: ClientState): void => {
    if (state.inventory.size) return;
    for (const item of INVENTORY_ITEMS) state.inventory.set(item.type,item.type===5?1:item.type===1?8:item.type===12?1:3);
    state.ui.selectedInventoryItemType=5;
};

export const selectInventoryItem = (state: ClientState,type: number): boolean => {
    if (!INVENTORY_ITEMS[type] || (state.inventory.get(type)??0)<=0) return false;
    state.ui.selectedInventoryItemType=type;
    state.ui.bombArmed=false;
    return true;
};

export const selectedWeapon = (type: number | null): DemoWeapon | undefined => type===1 ? "rocket" : type===12 ? "laser" : undefined;

export const transferInventoryItem = (inventory: Map<number,number>,type: number,delta: 1 | -1): boolean => {
    if (!INVENTORY_ITEMS[type]) return false;
    const count=inventory.get(type)??0;
    if(delta<0 && count<=0) return false;
    inventory.set(type,count+delta);
    return true;
};

// Re-clicking the selected bomb is the classic inventory arming gesture.
export const clickInventoryItem = (state: ClientState,type:number): boolean => {
    if(type===3 && state.ui.selectedInventoryItemType===3 && (state.inventory.get(3)??0)>0){state.ui.bombArmed=!state.ui.bombArmed;return true;}
    return selectInventoryItem(state,type);
};
