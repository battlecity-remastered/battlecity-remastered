# Rewrite Progress

## Current Stage
- `S5` checkpoint (validation and parity-status reconciliation for implemented slices)

## S-ID Status Ledger
| S-ID | Status | Notes |
|---|---|---|
| S0-01 | done | Gap docs copied into worktree and indexed |
| S0-02 | done | Event parity matrix added |
| S0-03 | done | Acceptance criteria doc added |
| S1-01 | done | Lobby assignment constraints ported |
| S1-02 | done | Lobby leave/release lifecycle ported |
| S1-03..S1-26 | deferred | Larger gameplay systems pending |
| S3-01 | in_progress | Event schemas expanded for lobby lifecycle and compatibility |
| S3-02 | done | Canonical dot emit + colon ingress compatibility |
| S3-03 | in_progress | Dispatch expanded for lobby leave path |
| S3-04 | in_progress | Client handler coverage expanded for lobby events |
| S3-05 | done | Event versioning strategy documented |
| S2-* | deferred | Gameplay/UI parity not yet restored |
| S4-01 | in_progress | Service extraction started (lobby service) |
| S4-02 | in_progress | Typed rejection path introduced (`lobby_full`) |
| S4-03 | done | Queue ingress integrated |
| S4-04 | done | Tick scheduler migrated to Effect scheduler |
| S4-05 | done | Runtime state managed via Ref |
| S4-06 | deferred | Full observability stack pending |
| S4-07 | done | Runtime lifecycle scope introduced |
| S4-08 | deferred | Full integration adapters pending |
| S5-* | in_progress | Test coverage expanded for implemented slices and strict gates passing |

## Files Changed (rolling)
- `AGENTS.md`
- `docs/typescript-gap-analysis.md`
- `docs/typescript-gap-mapping.md`
- `docs/parity-checklist.md`
- `docs/event-parity-matrix.md`
- `docs/parity-acceptance-criteria.md`
- `docs/event-versioning.md`
- `docs/rewrite-progress.md`
- `packages/protocol/src/*`
- `packages/protocol/test/*`
- `apps/server-ts/src/*`
- `apps/server-ts/test/*`
- `apps/client-ts/src/*`

## Validation Results (rolling)
- Baseline `npm run test`: pass
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run test`: pass
- `npm run rewrite:check:strict`: pass
