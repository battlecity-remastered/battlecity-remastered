import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { onInventoryUpdate } from "../gameplay/items/IconInventoryService.js";
import { recordDebugRejection } from "./debug-metrics.js";

type EventHandler<TType extends keyof KnownEventPayloadByType> =
    (state: ClientState, payload: KnownEventPayloadByType[TType]) => void;

export const auxHandlers: {
    [K in keyof KnownEventPayloadByType]?: EventHandler<K>;
} = {
    "chat.history": (state, payload) => {
        state.chat.history = [...payload];
    },
    "chat.message": (state, payload) => {
        state.chat.history.push(payload);
        if (state.chat.history.length > 100) {
            state.chat.history.shift();
        }
    },
    "chat.rate_limit": (state, payload) => {
        state.chat.rateLimitedUntil = payload.retryAt;
        state.chat.rateLimitedScope = payload.scope;
    },
    "city.finance": (state, payload) => {
        const canBuildStates = new Map<number, number>();
        for (const entry of payload.canBuildStates ?? []) {
            if (!Number.isFinite(entry.type) || !Number.isFinite(entry.state)) {
                continue;
            }
            canBuildStates.set(entry.type, entry.state);
        }
        const nextFinance = {
            cash: payload.cash,
            income: payload.income,
            score: payload.score,
            researchLevel: payload.researchLevel
        } as {
            cash: number;
            income: number;
            score: number;
            researchLevel: number;
            isOrbable?: boolean;
            canBuildStates?: Map<number, number>;
        };
        if (typeof payload.isOrbable === "boolean") {
            nextFinance.isOrbable = payload.isOrbable;
        }
        if (canBuildStates.size > 0) {
            nextFinance.canBuildStates = canBuildStates;
        }
        state.cityFinance.set(payload.cityId, nextFinance);
    },
    "research.update": (state, payload) => {
        if (payload.active) {
            state.research.set(payload.cityId, {
                active: payload.active,
                completed: [...payload.completed]
            });
            return;
        }
        state.research.set(payload.cityId, {
            completed: [...payload.completed]
        });
    },
    "factory.stock": (state, payload) => {
        const city = state.factoryStock.get(payload.cityId) ?? new Map<number, number>();
        city.set(payload.itemType, payload.stock);
        state.factoryStock.set(payload.cityId, city);
    },
    "inventory.update": (state, payload) => {
        if (payload.playerId !== state.local.id) {
            return;
        }
        state.inventory.clear();
        for (const item of payload.items) {
            state.inventory.set(item.itemType, item.count);
        }
        onInventoryUpdate(state);
    },
    "icon.pickup.confirmed": (state, payload) => {
        if (payload.playerId !== state.local.id) {
            return;
        }
        state.ui.selectedInventoryItemType = payload.itemType;
        state.ui.bombArmed = false;
        state.events.lastIconPickupConfirmed = {
            playerId: payload.playerId,
            cityId: payload.cityId,
            itemType: payload.itemType,
            amount: payload.amount
        };
    },
    "hazard.spawn": (state, payload) => {
        const nextHazard = {
            id: payload.id,
            cityId: payload.cityId,
            type: payload.type,
            x: payload.position.x,
            y: payload.position.y,
            radius: payload.radius
        };
        if (typeof payload.armed === "boolean") {
            Object.assign(nextHazard, { armed: payload.armed });
        }
        if (typeof payload.active === "boolean") {
            Object.assign(nextHazard, { active: payload.active });
        }
        if(payload.type===3 && payload.armed && payload.active!==false)Object.assign(nextHazard,{fuseEndsAt:Date.now()+(payload.remainingMs??5000)});
        state.hazards.set(payload.id, nextHazard);
    },
    "hazard.remove": (state, payload) => {
        const hazard=state.hazards.get(payload.id);
        if(hazard && payload.reason==="detonated"){
            state.events.effects.explosions.push({id:`hazard-${payload.id}`,x:hazard.x+24,y:hazard.y+24,variant:hazard.type===3?"large":"small",createdAt:Date.now()});
            if(state.events.effects.explosions.length>24)state.events.effects.explosions.shift();
        }
        state.hazards.delete(payload.id);
    },
    "score.promotion": (state, payload) => {
        state.events.promotions.push(payload);
    },
    "score.profile": (state, payload) => {
        if (payload.playerId !== state.local.id) {
            return;
        }
        state.scoreProfile.userId = payload.userId;
        state.scoreProfile.score = payload.score;
        state.scoreProfile.rank = payload.rank;
        state.identity.userId = payload.userId;
    },
    "defense.spawn": (state, payload) => {
        type DefenseState = ClientState["defenses"] extends Map<string, infer TDefense> ? TDefense : never;
        const nextDefense = {
            id: payload.id,
            cityId: payload.cityId,
            type: payload.type,
            tileX: payload.tileX,
            tileY: payload.tileY,
            health: payload.health,
            maxHealth: payload.maxHealth
        } as DefenseState;
        if (typeof payload.orientation === "number" && Number.isFinite(payload.orientation)) {
            nextDefense.orientation = payload.orientation;
        }
        state.defenses.set(payload.id, nextDefense);
    },
    "defense.update": (state, payload) => {
        const existing = state.defenses.get(payload.id);
        if (!existing) {
            return;
        }
        existing.health = payload.health;
        existing.maxHealth = payload.maxHealth;
        if (typeof payload.orientation === "number" && Number.isFinite(payload.orientation)) {
            existing.orientation = payload.orientation;
        }
    },
    "defense.remove": (state, payload) => {
        const defense=state.defenses.get(payload.id);
        if(defense&&payload.reason==="destroyed"){
            state.events.effects.explosions.push({id:`defense-${payload.id}`,x:defense.tileX*48+24,y:defense.tileY*48+24,variant:"large",createdAt:Date.now()});
            if(state.events.effects.explosions.length>24)state.events.effects.explosions.shift();
        }
        state.defenses.delete(payload.id);
    },
    "demolish.denied": (state, payload) => {
        state.events.lastDemolishDeniedReason = payload.reason;
    },
    "event.rejected": (state, payload) => {
        state.events.rejectionCount += 1;
        state.events.lastRejectedReason = payload.reason;
        recordDebugRejection(state, payload.reason ?? null);
    }
};
