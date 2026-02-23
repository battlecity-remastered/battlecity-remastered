# Event Versioning and Compatibility

## Canonical Contract
- Envelope field `type` uses dot-delimited canonical names.
- Envelope field `version` is currently `"1"`.
- Runtime emitters MUST emit canonical names only.

## Legacy Compatibility
- Legacy colon names are accepted on ingress through alias normalization.
- Alias normalization runs before payload schema decode.
- After decode, runtime sees canonical type only.
- Client and server adapters now both call protocol-level `canonicalizeEventType` so alias tables are single-source.

## Migration Strategy
1. Keep ingress alias table for legacy clients.
2. Emit canonical events end-to-end.
3. Add metrics for alias-hit volume before eventual alias removal.

## Compatibility Rule Examples
- Ingress: `player:health` -> canonical `player.health`.
- Ingress: `players:snapshot` -> canonical `players.snapshot`.
- Ingress: `build:denied` -> canonical `build.denied`.
- Ingress: `demolish:denied` -> canonical `demolish.denied`.
- Ingress: `item:use` -> canonical `item.use.request`.
- Ingress: `icon:pickup` -> canonical `icon.pickup.request`.
- Egress: always `players.snapshot`.
