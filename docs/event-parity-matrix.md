# Event Parity Matrix (Visual-Relevant)

Last updated: 2026-02-24

## Legend
- `Parity source`: behavior expected from legacy `master`
- `TS handler`: where TypeScript currently applies event
- `Gap`: known mismatch affecting visual parity
- `Status`: `pending`, `in_progress`, `done`

| Event type | Parity source | TS handler | Visual impact | Gap | Status |
|---|---|---|---|---|---|
| `players.snapshot` | legacy player/tank positions and rows | `apps/client-ts/src/app/network-events.ts` | tank placement/heading | anchor drift risk in renderer | pending |
| `player.health` | health panel/tank state | `network-events.ts` | panel health bar, labels | health bar coordinate/mask parity missing | pending |
| `player.dead` | explosion + dead state | `network-events.ts` | explosion markers | large/small explosion texture parity incomplete | pending |
| `bullet.fired` | bullet row/type animation | `network-events.ts` | bullets | TS uses non-legacy bullet frame logic | pending |
| `bullet.resolved` | cleanup + hit effects | `network-events.ts` | explosion placement | depends on bullet parity | pending |
| `building.placed` | building appearance + overlays | `network-events.ts` | base + icons + labels | base/overlay animation not fully parity | pending |
| `building.demolished` | remove building visuals | `network-events.ts` | map/building layer | depends on layer ordering parity | pending |
| `population.update` | population overlays + offsets | `network-events.ts` | population sprites | row/offset parity incomplete | pending |
| `research.update` | research strip and state | `network-events.ts` | research bars/icons | strip crop/scale/position parity incomplete | pending |
| `factory.stock` | factory count digits | `network-events.ts` | black number digits | digits not implemented in TS parity path | pending |
| `hazard.spawn` | bombs/mines/orbs visual placement | `network-events.ts` | item sprites | item ID and frame parity gaps | pending |
| `hazard.remove` | hazard cleanup | `network-events.ts` | item layer | depends on hazard cache ordering parity | pending |
| `defense.spawn` | turret base/head and HP bar | `network-events.ts` | defenses | turret head parity missing | pending |
| `defense.update` | defense damage visuals | `network-events.ts` | defense states | damage column/head orientation parity pending | pending |
| `defense.remove` | remove defense visuals | `network-events.ts` | defense layer | depends on render order parity | pending |
| `city.finance` | panel finance block | `network-events.ts` | money box/up/down/cash | finance block not fully parity in TS panel | pending |
| `icon.pickup.confirmed` | inventory panel updates | `network-events.ts` | panel inventory | panel inventory sprite grid missing | pending |
| `inventory.update` | item counts and selection | `network-events.ts` | panel inventory + intents | item ID mismatch + no sprite grid | pending |
| `city.orbed` | large world effects + city state | `network-events.ts` | explosion overlays | large explosion source parity incomplete | pending |

## Non-event but parity-critical inputs
| Source | File | Why it matters | Status |
|---|---|---|---|
| map bytes (`map.dat`) | `apps/client-ts/src/world/map-loader.ts`, `apps/server-ts/src/domain/map/MapService.ts` | terrain/building layout parity | pending |
| city spawn data | `apps/server-ts/data/citySpawns.json` + client resolver | spawn and city marker parity | pending |
| imported `.city` files | `city-import.ts`, `CityLayoutService.ts` | building layout parity | pending |
