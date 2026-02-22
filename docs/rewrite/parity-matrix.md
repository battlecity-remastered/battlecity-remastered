# Rewrite Parity Matrix

This matrix defines strict like-for-like behavior goals for the TypeScript + Effect rewrite.

## Scope

- Included in v1:
  - Client gameplay loop and rendering pipeline
  - Server authoritative simulation
  - Lobby, city assignment, chat, identity, scoring
  - Buildings, bullets, hazards, defenses, orb flow
  - Bot integration
- Excluded in v1:
  - `city-builder.html` tooling

## Acceptance Rules

- Node target: `23.x`.
- Browser target: latest Google Chrome.
- Network transport: Socket.IO.
- Payload encoding: typed JSON envelopes.
- Parity tolerance: none (no intentional behavior drift).

## Domains

| Domain | Current Sources | Rewrite Package | Parity Gate |
|---|---|---|---|
| Protocol/events | `client/src/SocketListener.js`, `server/app.js`, `server/src/*Factory.js` | `packages/protocol` | All known events schema-validated and round-trip tested |
| Movement/collision | `client/src/play.js`, `client/src/collision/*`, `server/src/PlayerFactory.js` | `packages/sim-core` | Shared deterministic fixtures pass identically |
| Bullet lifecycle | `client/src/factories/BulletFactory.js`, `server/src/BulletFactory.js` | `packages/sim-core` + `apps/server-ts` | Server authoritative hit outcomes match legacy |
| Buildings/factories | `client/src/factories/BuildingFactory.js`, `server/src/BuildingFactory.js` | `packages/sim-core` + `apps/server-ts` | Build/deny/research flows match |
| Items/hazards/defense | `client/src/factories/ItemFactory.js`, `server/src/hazards/HazardManager.js`, `server/src/DefenseManager.js` | `packages/sim-core` + `apps/server-ts` | Inventory caps and destruction/replenish rules match |
| Lobby/identity/score | `client/src/lobby/LobbyManager.js`, `client/src/identity/IdentityManager.js`, `server/src/users/*` | `apps/server-ts` + `apps/client-ts` | Join/assignment/rank updates match |
| Bots | `bot/index.js`, `server/src/bots/*`, `server/src/FakeCityManager.js` | `apps/server-ts` | Bot spawn/movement/combat behavior match |

## Verification Strategy

1. Keep legacy tests green while migration is in progress.
2. Add protocol contract tests for every event pair.
3. Add simulation replay tests that compare rewrite vs legacy outputs.
4. Promote domains one-by-one to rewrite runtime only when parity tests pass.
