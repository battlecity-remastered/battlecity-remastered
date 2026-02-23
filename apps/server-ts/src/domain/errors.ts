import type { RuntimeRejectReason } from "../runtime/types.js";

export type RuntimeDomainError =
    | { _tag: "InvalidEnvelope" }
    | { _tag: "LobbyFull" }
    | {
        _tag: "ValidationFailed";
        reason:
            | "invalid_player_update"
            | "city_mismatch"
            | "owner_mismatch"
            | "not_mayor"
            | "building_collision"
            | "build_too_far"
            | "research_required";
    }
    | { _tag: "ResourceNotFound"; reason: "player_not_joined" | "building_not_found" | "factory_empty" | "inventory_empty" }
    | { _tag: "InsufficientFunds" }
    | { _tag: "ResearchConflict" }
    | { _tag: "HazardInvalid" }
    | { _tag: "OrbInvalid" }
    | { _tag: "ChatRateLimited" };

const staticErrorByReason: Partial<Record<RuntimeRejectReason, RuntimeDomainError>> = {
    invalid_envelope: { _tag: "InvalidEnvelope" },
    lobby_full: { _tag: "LobbyFull" },
    insufficient_funds: { _tag: "InsufficientFunds" },
    research_active: { _tag: "ResearchConflict" },
    research_unavailable: { _tag: "ResearchConflict" },
    hazard_invalid: { _tag: "HazardInvalid" },
    orb_invalid: { _tag: "OrbInvalid" },
    chat_rate_limited: { _tag: "ChatRateLimited" }
};

const isValidationReason = (
    reason: RuntimeRejectReason
): reason is "invalid_player_update" | "city_mismatch" | "owner_mismatch" | "not_mayor" | "building_collision" | "build_too_far" | "research_required" => {
    return reason === "invalid_player_update"
        || reason === "city_mismatch"
        || reason === "owner_mismatch"
        || reason === "not_mayor"
        || reason === "building_collision"
        || reason === "build_too_far"
        || reason === "research_required";
};

const isResourceReason = (
    reason: RuntimeRejectReason
): reason is "player_not_joined" | "building_not_found" | "factory_empty" | "inventory_empty" => {
    return reason === "player_not_joined"
        || reason === "building_not_found"
        || reason === "factory_empty"
        || reason === "inventory_empty";
};

export const toDomainError = (reason: RuntimeRejectReason): RuntimeDomainError => {
    if (isValidationReason(reason)) {
        return { _tag: "ValidationFailed", reason };
    }
    if (isResourceReason(reason)) {
        return { _tag: "ResourceNotFound", reason };
    }
    const mapped = staticErrorByReason[reason];
    if (mapped) {
        return mapped;
    }
    return { _tag: "InvalidEnvelope" };
};
