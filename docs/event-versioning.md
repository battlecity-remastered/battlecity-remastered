# Event Versioning and Compatibility

## Status
- Last updated: 2026-02-24
- Stage checkpoint: `S5` parity delivery; compatibility remains complete for all implemented gameplay/runtime events.
- 2026-02-24 remediation note: no protocol version/event-name changes were required for visual parity fixes.

## Canonical Contract
- Envelope field `type` uses dot-delimited canonical names.
- Envelope field `version` is currently `"1"`.
- Runtime emitters MUST emit canonical names only.

## Legacy Compatibility
- Legacy colon names are accepted on ingress through alias normalization.
- Alias normalization runs before payload schema decode.
- After decode, runtime sees canonical type only.
- Client and server adapters both call protocol-level `canonicalizeEventType` so alias tables are single-source.

## Migration Strategy
1. Keep ingress alias table for legacy clients.
2. Emit canonical events end-to-end.
3. Route inbound payloads through explicit decode boundaries on both ends (`normalizeInboundEnvelopeType` and client `decodeServerEnvelope`) before applying handlers.
4. Maintain explicit dispatch/apply coverage tests so any contract drift fails CI.
5. Add alias-hit telemetry before eventual alias removal.

## Compatibility Rule Examples
- Ingress: `player:health` -> canonical `player.health`.
- Ingress: `players:snapshot` -> canonical `players.snapshot`.
- Ingress: `build:denied` -> canonical `build.denied`.
- Ingress: `demolish:denied` -> canonical `demolish.denied`.
- Ingress: `item:use` -> canonical `item.use.request`.
- Ingress: `icon:pickup` -> canonical `icon.pickup.request`.
- Ingress: `score:profile` -> canonical `score.profile`.
- Ingress: `defense:deploy` -> canonical `defense.deploy.request`.
- Ingress: `defense:update` -> canonical `defense.update`.
- Ingress: `inventory:update` -> canonical `inventory.update`.
- Ingress: `defense:spawn` -> canonical `defense.spawn`.
- Ingress: `bullet:fired` -> canonical `bullet.fired`.
- Ingress: `bullet:resolved` -> canonical `bullet.resolved`.
- Ingress: `new_building` -> canonical `building.placed`.
- Ingress: `demolish_building` -> canonical `building.demolished`.
- Ingress: `population:update` -> canonical `population.update`.
- Ingress: `player:bot_damage` -> canonical `player.bot_damage`.
- Ingress: `event:rejected` -> canonical `event.rejected`.
- Egress payload: `bullet.resolved` supports reason `hit_hazard` with `hitHazardId` and `hit_terrain` for blocking tile collisions.
- Egress payload: `hazard.remove` supports reason `city_orbed` for orb-driven city cleanup.
- Egress: always canonical names (`players.snapshot`, etc.).
