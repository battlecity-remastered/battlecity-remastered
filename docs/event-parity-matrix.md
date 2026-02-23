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
| `player:health` | `player.health` | server -> client | yes | emit | apply | done |
| `player:dead` | `player.dead` | server -> client | yes | emit | apply | done |
| `player:removed` | `player.removed` | server -> client | yes | emit | apply | done |
| `chat:message` | `chat.message` | bidirectional | yes | partial | partial | in_progress |
| `lobby:denied` | `lobby.denied` | server -> client | yes | emit | apply | done |
| `lobby:snapshot` | `lobby.snapshot` | server -> client | yes | emit | apply | done |
| `lobby:released` | `lobby.released` | server -> client | yes | emit | apply | done |
| `lobby:leave` | `lobby.leave.request` | client -> server | yes | dispatch | send-ready | done |
| `chat:history` | `chat.history` | server -> client | yes | emit | apply | done |
| `chat:rate_limit` | `chat.rate_limit` | server -> client | yes | emit | apply | done |
| `city:finance` | `city.finance` | server -> client | yes | emit | apply | done |
| `research:update` | `research.update` | server -> client | yes | emit | apply | done |
| `factory:collect` | `factory.collect.request` | client -> server | yes | dispatch | send-ready | done |
| `factory.stock` | `factory.stock` | server -> client | yes | emit | apply | done |
| `hazard:spawn` | `hazard.spawn` | server -> client | yes | emit | pending | in_progress |
| `hazard:remove` | `hazard.remove` | server -> client | yes | emit | pending | in_progress |
| `orb:drop` | `orb.drop.request` | client -> server | yes | dispatch | send-ready | done |
| `city:orbed` | `city.orbed` | server -> client | yes | emit | apply | done |
| `score:promotion` | `score.promotion` | server -> client | yes | emit | apply | done |

## Known Gaps
- Many legacy events remain unimplemented (identity, inventory icons, defenses, bots, map/tutorial/audio flows).
- Hazard client visual/application parity remains partial (`hazard.spawn`/`hazard.remove` not yet rendered).
