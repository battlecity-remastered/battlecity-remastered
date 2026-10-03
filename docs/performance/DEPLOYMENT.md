# Performance release deployment — 2026-10-03

**v1.1.6 is deployed at https://playbattlecity.com/.** The application commit is `b2dd711cfb11defa89053ff52cc40a4a00de9220`, pushed to `master` and tagged `v1.1.6`. The subsequent documentation commit records the deployment; it does not change the released application.

- [GitHub verification](https://github.com/battlecity-remastered/battlecity-remastered/actions/runs/37126289375): passed lint, typecheck, full tests and strict checks on the release commit.
- [Image publication](https://github.com/battlecity-remastered/battlecity-remastered/actions/runs/37126355892): passed; image `ghcr.io/battlecity-remastered/battlecity-remastered:v1.1.6`.
- Image digest: `sha256:866d35e790e90db18634708a98dc5b05c3947043bd647bda45e84e6d50581b8c`. Its revision label matches the application commit.
- Production container `battlecity-server` is running and healthy. Public `/health` returns `{"ok":true,"service":"server-ts"}`. The public entry script's SHA-256 matches the image, and the public HTML matches its built index.

## Persistence and rollback

The deployment preserves Compose project `battlecity-js-remake`, the existing routing/port settings and volume `battlecity-js-remake_battlecity_data` mounted at `/app/server/data`. A consistent SQLite backup and original Compose configuration were saved on the production host under `/home/ubuntu/battlecity-backups/20261003-v1-1-6/` before recreation. Database integrity passes, and all pre-deployment rows remain: **42 users and 77 player scores**.

The previous `v1.1.5` image remains locally available. `/home/ubuntu/battlecity-backups/20261003-v1-1-6/rollback.sh` restores the saved configuration with pulling disabled and recreates only the application service. It keeps the current data volume; it does not rewind the database or remove newer records. Execute it on the production host with appropriate privileges if rollback is needed.

## Public browser verification

An isolated Chrome session using Intel UHD hardware rendering verified the actual deployed site:

- Lobby synchronized; joined a city, received 65 authoritative snapshots, moved the tank approximately 64 pixels, rendered the world, and returned to the lobby.
- The offline industrial demo loaded, accepted movement/fire input and rendered gunfire, impacts, turrets, lava, transparent effects, inventory and shadows. Demo movement distance was not separately asserted; the live movement assertion passed.
- No runtime, shader, console or HTTP asset errors occurred. Screenshots were inspected.

This is a functional deployment smoke test, not another performance benchmark. In particular, the captured live diagnostics include an initial 1.75-second render submission stall; that single loading/driver observation is retained and must not be interpreted as steady throughput or proof that all live shader variants are prewarmed. Use the moving replay and profiling procedure in [README.md](README.md) for performance comparisons.

## Durable evidence

[deployment/v1.1.6/](deployment/v1.1.6/) includes exact CI/build results, deployment script/log/result, public health and bundle verification, browser smoke script/result/screenshots, and passing script lint/syntax checks. The smoke script imports the repository's CDP helper; run it from an environment with Chrome and network access. The deployment script intentionally refuses an unexpected starting image, revision, volume or existing backup directory; review it before reusing it.

Two verification assumptions were corrected without changing the application: Python urllib received an edge-proxy 403, so public requests used curl; the entry JavaScript is a ~2.6 KB bootstrap loading separate chunks, so an initial >100 KB entry-size assertion was inappropriate. Verification now compares the public script hash to the actual image. The first guessed SSH address timed out; the host recorded by the preceding release was then verified before any production change.

Unrelated exploratory images/scripts were excluded from both commits and remain in the local workspace.
