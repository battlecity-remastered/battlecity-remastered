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

## Known Gaps
- Many legacy events remain unimplemented (economy/research/factory/hazard/orb/UI flows).
- Event schema coverage is still partial relative to the full legacy runtime set.
