# Rewrite Feature Cuts (v1)

## Included

- Full multiplayer tank gameplay parity.
- Server-authoritative movement/combat/building outcomes.
- Bots and fake-city flows.
- Google identity integration.
- Discord event notifications.

## Excluded

- `city-builder.html` and related authoring endpoints.

## Migration Phases

1. Protocol schemas and typed event envelope.
2. Shared deterministic simulation primitives.
3. Server-ts runtime with authoritative handlers.
4. Client-ts runtime and rendering integration.
5. Cutover and remove legacy JS runtime.

## Exit Criteria

- `npm run lint`, `cd server && npm test`, `cd client && npm test`, and `npm run cucumber` pass.
- Replay/contract checks show strict like-for-like behavior.
- Legacy JS runtime can be removed without gameplay regression.
