# Event Parity Matrix

## Status
- Last updated: 2026-02-23
- Matrix remains current for the implemented gameplay/runtime contract surface.

## Policy
- Canonical runtime event names are dot-delimited (`.`).
- Legacy colon-delimited (`:`) aliases are accepted on ingress only.
- Egress always emits canonical dot names.
- Dispatch/apply coverage is now test-asserted in-code (`dispatch-coverage.test.ts`, `network-handler-coverage.test.ts`).

## Matrix
| Legacy event | Canonical event | Direction | Protocol schema | Server handling | Client handling | Status |
|---|---|---|---|---|---|---|
| `lobby:assignment` | `lobby.assignment` | server -> client | yes | emit | apply | done |
| `players:snapshot` | `players.snapshot` | server -> client | yes | emit | apply | done |
| `bullet:resolved` | `bullet.resolved` | server -> client | yes | emit (`out_of_bounds`,`hit_terrain`,`hit_player`,`hit_building`,`hit_hazard`) | apply | done |
| `bullet:fired` | `bullet.fired` | server -> client | yes | emit | apply | done |
| `player:health` | `player.health` | server -> client | yes | emit | apply | done |
| `player:dead` | `player.dead` | server -> client | yes | emit | apply | done |
| `player:removed` | `player.removed` | server -> client | yes | emit | apply | done |
| `player:bot_damage` | `player.bot_damage` | client -> server | yes | dispatch (authoritative clamp + health/death resolution) | send-ready | done |
| `chat:message` | `chat.message` | bidirectional | yes | dispatch + scoped emit (`team` city-only, `global` broadcast) | apply | done |
| `lobby:denied` | `lobby.denied` | server -> client | yes | emit | apply | done |
| `lobby:snapshot` | `lobby.snapshot` | server -> client | yes | emit | apply | done |
| `lobby:released` | `lobby.released` | server -> client | yes | emit | apply | done |
| `lobby:leave` | `lobby.leave.request` | client -> server | yes | dispatch | send-ready | done |
| `lobby:join:request` | `lobby.join.request` | client -> server | yes | dispatch | send-ready | done |
| `build:denied` | `build.denied` | server -> client | yes | emit | apply | done |
| `demolish:denied` | `demolish.denied` | server -> client | yes | emit | apply | done |
| `event:rejected` | `event.rejected` | server -> client | yes | emit (canonical `event.rejected`, legacy side-channel retained) | apply | done |
| `chat:history` | `chat.history` | server -> client | yes | emit | apply | done |
| `chat:rate_limit` | `chat.rate_limit` | server -> client | yes | emit | apply | done |
| `city:finance` | `city.finance` | server -> client | yes | emit | apply | done |
| `research:update` | `research.update` | server -> client | yes | emit | apply | done |
| `factory:collect` | `factory.collect.request` | client -> server | yes | dispatch | send-ready | done |
| `factory.stock` | `factory.stock` | server -> client | yes | emit | apply | done |
| `icon:pickup` | `icon.pickup.request` | client -> server | yes | dispatch | send-ready | done |
| `icon:pickup:confirmed` | `icon.pickup.confirmed` | server -> client | yes | emit | apply | done |
| `inventory:update` | `inventory.update` | server -> client | yes | emit | apply | done |
| `population:update` | `population.update` | server -> client | yes | emit | apply | done |
| `item:use` | `item.use.request` | client -> server | yes | dispatch | send-ready | done |
| `hazard:spawn` | `hazard.spawn` | server -> client | yes | emit | apply | done |
| `hazard:remove` | `hazard.remove` | server -> client | yes | emit | apply | done |
| `new_building` | `building.placed` | server -> client | yes | emit | apply + alias-normalized ingress | done |
| `demolish_building` | `building.demolished` | server -> client | yes | emit | apply + alias-normalized ingress | done |
| `orb:drop` | `orb.drop.request` | client -> server | yes | dispatch | send-ready | done |
| `city:orbed` | `city.orbed` | server -> client | yes | emit | apply | done |
| `score:promotion` | `score.promotion` | server -> client | yes | emit | apply | done |
| `score:profile` | `score.profile` | server -> client | yes | emit | apply | done |
| `defense:deploy` | `defense.deploy.request` | client -> server | yes | dispatch | send-ready | done |
| `defense:spawn` | `defense.spawn` | server -> client | yes | emit | apply | done |
| `defense:update` | `defense.update` | server -> client | yes | emit | apply | done |
| `defense:remove` | `defense.remove` | server -> client | yes | emit | apply | done |

## Known Gaps
- Many legacy events remain intentionally deferred (auth UX, full modal/tutorial/audio/map UI, and non-gameplay telemetry flows).
- Client UI parity is still a staged subset: HUD + lobby/chat overlays + build-menu/ghost placement + primitive world rendering are active, while full legacy panel/radar/tutorial/options parity remains tracked in S2 deferred items.
