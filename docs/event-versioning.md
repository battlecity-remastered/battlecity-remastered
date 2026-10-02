# Event Versioning Strategy (Parity Rewrite)

Last updated: 2026-02-24

## Objective
Avoid breaking client/server compatibility while visual parity fields are introduced or normalized.

## Rules
1. Do not change existing event names or required fields during parity rewrite.
2. Prefer additive fields only.
3. Treat all new fields as optional in decoders first.
4. Promote to required only after both server and client are updated and tested together.
5. Keep protocol schema and adapters in sync in the same commit.

## Compatibility modes
- `classic-compatible`: existing payload only.
- `parity-extended`: existing payload + optional parity fields.

## Recommended rollout pattern
1. Add optional fields in `packages/protocol/src/events.ts`.
2. Update server emitters to include new fields.
3. Update client handlers to consume new fields when present and fallback when absent.
4. Add tests for both payload variants.
5. Only then tighten schema requirements if needed.

## Visual parity fields likely to need extension
- Building render hints (if server-sourced): overlay icon, smoke active/frame, itemsLeft.
- Defense visual hints: angle/orientation, damage state.
- Radar hints: role/classification override.

## Test requirements for any schema change
1. Protocol decode/encode tests pass.
2. Server tests for emitter payload shape pass.
3. Client event-router and network-event handling tests pass.
4. Full root check passes: `npm run rewrite:check:strict`.

## Three.js live port (October 2026)

`players.snapshot` entries optionally include `cloakedUntil` and `frozenUntil`;
clients fall back to zero. `bullet.fired` optionally includes authoritative
`speed`; clients retain the legacy speed fallback. `bullet.resolved` optionally
includes the impact `position`; older events use the predicted bullet position.
All existing event names and required fields remain intact. The live presentation
observes events before the state reducer removes resolved entities.

### Hazard fuse presentation (2026-10-02)

`hazard.spawn` accepts optional `remainingMs` for finite fuses. Deployment and
join hydration send the current server value; older payloads remain valid. The
client uses it only for the warning animation and waits for authoritative removal
for live detonation. Damage, radius, fuse length and event envelope version are
unchanged.

### Sequenced driving inputs (2026-10-02)

`player.update` optionally carries `inputFrames`, ordered simulation frames with
`seq`, `dtMs`, `turn` and `throttle`. `players.snapshot` entries optionally carry
`movementAck` with the last applied input sequence and fractional heading.
Prediction and authority use the same collision and turning steps. The client
replays unacknowledged frames from the acknowledged pose instead of chasing an
older snapshot using wall-clock extrapolation. The server validates contiguous
sequences, ignores duplicates and bounds simulation time against its own clock;
client offsets never become authoritative. Existing clients/events retain the
legacy movement path. New clients require a page refresh after deployment.

Roundtrip tests cover 6–144 FPS, turning, reversing, tile collisions, delayed
ordered packet bursts and different client/server clocks.

The burst-recovery follow-up adds optional `movementAck.clippedMs`, the cumulative
input time discarded by authority time-credit validation. Old snapshots remain
valid. Prediction is bounded to two seconds; unacknowledged prefixes are retried
after one second without acknowledgement progress. Authority retains three
seconds of server-clock credit and permits a 70-message burst with a sustained
35/s token refill. Sequence continuity, duplicate suppression, time validation
and authoritative collision remain enforced; no envelope version bump is needed.


### Pilot identity and golden leaderboard leader (2026-10-02)

`players.snapshot` entries add optional `callsign`, `rankTitle` and
`isScoreLeader` fields. The server derives them from the verified score account
and cached leaderboard, never a client cosmetic request. Omitted leader flags
clear the client's gold appearance; older snapshots remain valid. Nameplates
follow the existing enemy-cloak visibility rules. Envelope version stays at 1.
The existing optional `lobby.join.request.authToken` now carries the signed
session returned by `/api/auth/google`; a raw user ID grants no account access.
