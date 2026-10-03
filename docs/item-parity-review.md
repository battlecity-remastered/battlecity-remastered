# Item parity review — 3 October 2026

Reference: the original JavaScript game at `v0.0.79`, primarily its authoritative server, cross-checked against the client controls and renderer. “Matches” below means the traced rule matches; it does not claim every item was exercised manually in production.

## Confirmed and corrected in this change

- Human hull: **40 HP**, previously 100. Inventory now displays health as a percentage of the actual maximum; bots retain their original 20 HP.
- Medkit: restores **full hull**, consumes one when damaged, preserves inventory at full health; previously +35 HP and consumed even when healthy. Demo and live use agree.
- Cloak: **5 seconds**, previously 10; enemy models, names and hull telemetry remain concealed, friendlies remain visible.
- Weapons: laser **5 damage / 260 px**, rocket **8 / 340 px**, flare **5 / 48 px**; previous simulator defaulted to 20 damage (35 for type 2) with unlimited range. Normal projectile speed **800 px/s**, flare **100 px/s**. Laser/rocket client cadence **650 ms**, previously 1 second.
- Automated defenses: original rocket-equivalent **8 damage / 340 px** retained for all three defense types, while keeping the port’s distinct visual projectile types. Their original 400 px acquisition radius is unchanged.
- DFG: firing is blocked during its existing **5-second freeze**, including flare bursts.
- Bombs: command centres are excluded from structure destruction even inside the blast. The previous test placed the command centre outside the blast and missed the bug.
- Player fire cannot spoof the internal plasma projectile type to bypass equipment checks.

These rules now have shared constants plus regression tests for capacity, damage/range, cloak duration, full-health medkit conservation, freeze and command-centre protection. Existing combat scenarios now use real equipped weapons; invalid inventory-free heavy shots no longer stand in for player weapons.

## Per-item matrix

| ID | Item | Player cap | Original rule and current assessment |
|---|---|---:|---|
| 0 | Cloak | 4 | Consume one, conceal for 5 s; **corrected**. Friendly visibility and enemy concealment are wired. |
| 1 | Rocket | 4 | Reusable equipped weapon, 8 damage, 340 px, 800 px/s, 650 ms; **corrected**. Drops remain under the tank. |
| 2 | Medkit | 5 | Consume one to restore full hull; do not waste at full health; **corrected**. Factory stock cap 20 is distinct from carried cap 5, as before. |
| 3 | Bomb | 20 | Arm/disarm before dropping, 5 s fuse, 25 authoritative damage, radius 1 tile for players/structures, owner/team immunity; **traced matching defaults**. Command-centre exclusion **corrected**. Renderer shows the armed fuse and destruction effects. |
| 4 | Mine | 10 | 19 damage on enemy padded-hitbox contact, hidden from enemies until triggered, visible to team; **traced matching**. Consumed on trigger. |
| 5 | Orb | 1 | Apron detection, consumption, city destruction and persistent score writes exist; **parity gaps remain**, below. |
| 6 | Flare | 4 | Reusable equipment, three rearward shots, ±4 heading steps, 500 ms burst cadence; **traced matching**. Damage, slow speed and short range **corrected**. |
| 7 | DFG | 5 | Hidden enemy trap, team visibility, freezes for 5 s without damage; **traced matching**. Frozen firing **corrected**. |
| 8 | Wall | 20 | One-tile deployed barricade, 40 HP, inventory consumption and emergence animation; **traced matching**. Bomb destruction and weapon damage now use corrected rules. |
| 9 | Turret | 10 | 32 HP, tracks enemy within 400 px, team immunity; **traced matching**. Projectile balance **corrected**, appearance preserved. |
| 10 | Sleeper | 5 | 16 HP, team-visible, enemy reveal within 400 px; **traced matching**. Projectile balance **corrected**, emergence preserved. |
| 11 | Plasma | 5 | 40 HP, tracks enemy within 400 px; **traced matching**. Projectile balance **corrected**, plasma appearance preserved. |
| 12 | Laser | 4 | Reusable equipment, 5 damage, 260 px, 800 px/s, 650 ms; **corrected**. |

All 13 carry capacities exactly match `shared/itemCaps.cjs` in the original. Production limits are separate and match the old factory table. Shared drop placement retains the padded tank footprint, greatest tile overlap and centre-tile tie break; blocked drops do not search neighbours. Pickup requests and inventory updates remain server-authoritative.

## Remaining discrepancies found by review

### Orb eligibility and bounty — high priority

The original `CityManager.updateOrbableState` makes a city orbable once it has ever built a bomb/orb factory or reached 21 buildings. It keeps the maximum-ever building count and factory history until the city resets. `getOrbValue` awards 10/20/30/40/50 points depending on that history, plus five points per target-city orb victory.

The port currently marks any surviving command centre as orbable and awards the configured fixed **250 points**. The SQLite write is connected, but the amount and eligibility differ. Correct restoration requires city history, reset behaviour, finance updates and matching server/UI eligibility tests; this is not covered by the consumable/combat corrections above. Do not describe orb scoring as equivalent to the original.

### Defense cadence

The original client checks targeting/firing every 200 ms and sets a 250 ms cooldown, producing approximately 400 ms firing intervals in steady play. The server port uses a 400 ms cooldown directly. Treat exact first-shot/poll timing as an approximation, not byte-for-byte parity.

### Authority and concealment limits

Hazard deployment still accepts optional fuse/damage/radius overrides from the protocol. Normal client drops use classic defaults; this is not equivalent to the original server ignoring such overrides. Range-limited weapons are now enforced by the server; laser/rocket cadence remains controlled by the client plus general inbound rate limits, as the old client-driven approach did.

Hidden hazards, sleepers and cloaked players are visually hidden but their world state is sent to clients. That matches the existing architecture; it does not constitute server-side information secrecy.

### City-import settings

The old settings pasted a builder JSON export and replaced the current city on the server. The remaining TS `OptionsModal` ignores pasted JSON and loads `demo.city` into local state; the Three.js live entry does not instantiate it. The actual settings import did **not** make it over.

## Validation evidence

- Unit/runtime coverage: all 13 caps, classic shot parameters, actual ranged projectile expiry, reusable weapons, cloak timing, frozen fire rejection, medkit healing/conservation, command-centre survival inside the blast.
- Existing drop placement, inventory, hidden mine/DFG/sleeper and production suites retained.
- Browser validation covers subtle unlabelled 76×3 px projected enemy health bars at 75%, 42% and critical 20%, healing, cloak/reveal, local medkit use, reconnect and resize. Final execution results are recorded in the release summary; this document is not a claim of production testing each individual item.
