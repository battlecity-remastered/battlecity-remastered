# Event Parity Matrix

## Policy
- Canonical runtime event names are dot-delimited (`.`).
- Legacy colon-delimited (`:`) aliases are accepted on ingress only.
- Egress always emits canonical dot names.

## Matrix
| Legacy event | Canonical event | Direction | Protocol schema | Server handling | Client handling | Status |
|---|---|---|---|---|---|---|
| `lobby:assignment` | `lobby.assignment` | server -> client | yes | emit | apply | done |
| `players:snapshot` | `players.snapshot` | server -> client | yes | emit | apply | done |
| `n/a` | `bullet.resolved` | server -> client | yes | emit (`out_of_bounds`,`hit_terrain`,`hit_player`,`hit_building`,`hit_hazard`) | receive-ready | in_progress |
| `player:health` | `player.health` | server -> client | yes | emit | apply | done |
| `player:dead` | `player.dead` | server -> client | yes | emit | apply | done |
| `player:removed` | `player.removed` | server -> client | yes | emit | apply | done |
| `chat:message` | `chat.message` | bidirectional | yes | partial | partial | in_progress |
| `lobby:denied` | `lobby.denied` | server -> client | yes | emit | apply | done |
| `lobby:snapshot` | `lobby.snapshot` | server -> client | yes | emit | apply | done |
| `lobby:released` | `lobby.released` | server -> client | yes | emit | apply | done |
| `lobby:leave` | `lobby.leave.request` | client -> server | yes | dispatch | send-ready | done |
| `build:denied` | `build.denied` | server -> client | yes | emit | apply | done |
| `demolish:denied` | `demolish.denied` | server -> client | yes | emit | apply | done |
| `chat:history` | `chat.history` | server -> client | yes | emit | apply | done |
| `chat:rate_limit` | `chat.rate_limit` | server -> client | yes | emit | apply | done |
| `city:finance` | `city.finance` | server -> client | yes | emit | apply | done |
| `research:update` | `research.update` | server -> client | yes | emit | apply | done |
| `factory:collect` | `factory.collect.request` | client -> server | yes | dispatch | send-ready | done |
| `factory.stock` | `factory.stock` | server -> client | yes | emit | apply | done |
| `icon:pickup` | `icon.pickup.request` | client -> server | yes | dispatch | send-ready | done |
| `icon:pickup:confirmed` | `icon.pickup.confirmed` | server -> client | yes | emit | receive-ready | done |
| `inventory:update` | `inventory.update` | server -> client | yes | emit | apply | done |
| `item:use` | `item.use.request` | client -> server | yes | dispatch | send-ready | done |
| `hazard:spawn` | `hazard.spawn` | server -> client | yes | emit | apply | done |
| `hazard:remove` | `hazard.remove` | server -> client | yes | emit | apply | done |
| `new_building` | `building.placed` | server -> client | yes | emit | apply | in_progress |
| `demolish_building` | `building.demolished` | server -> client | yes | emit | apply | in_progress |
| `orb:drop` | `orb.drop.request` | client -> server | yes | dispatch | send-ready | done |
| `city:orbed` | `city.orbed` | server -> client | yes | emit | apply | done |
| `score:promotion` | `score.promotion` | server -> client | yes | emit | apply | done |
| `score:profile` | `score.profile` | server -> client | yes | emit | apply | done |
| `defense:deploy` | `defense.deploy.request` | client -> server | yes | dispatch | send-ready | done |
| `defense:spawn` | `defense.spawn` | server -> client | yes | emit | apply | done |
| `defense:update` | `defense.update` | server -> client | yes | emit | apply | done |
| `defense:remove` | `defense.remove` | server -> client | yes | emit | apply | done |

## Known Gaps
- Many legacy events remain unimplemented (full auth flows, bots, map/tutorial/audio flows).
- Hazard events are now state-applied and include orb city cleanup reasons; dedicated hazard art/animation parity remains partial.
- Inventory/item/icon/defense/building events are authoritative but UI parity is still HUD/world-primitive level, not full legacy panel/icon UX.
