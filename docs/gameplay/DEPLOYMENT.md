# Gameplay follow-up deployment — v1.1.7

**v1.1.7 is live at https://playbattlecity.com/.** Application commit: `9c5be7b098584d95c3576e8089f62aea9af41eac` (`master`, annotated tag `v1.1.7`). The later deployment-evidence commit does not change the released application.

- [GitHub verification](https://github.com/battlecity-remastered/battlecity-remastered/actions/runs/37153833918): passed lint, typecheck, tests and strict checks for the exact application commit.
- [Image publication](https://github.com/battlecity-remastered/battlecity-remastered/actions/runs/37153835762): passed.
- Image: `ghcr.io/battlecity-remastered/battlecity-remastered:v1.1.7`.
- Digest: `sha256:b3c7e6d341abfee4320a2ea000d43b1b557b038b7b3575c58c8fc79a91431529`.
- Production `battlecity-server` starts and passes `/health`; public HTML and entry-script SHA-256 match the release image. Revision label matches the application commit.

## Data and rollback

The Compose project, port 8021 and volume `battlecity-js-remake_battlecity_data` remain unchanged. A consistent SQLite backup and original Compose configuration are saved under `/home/ubuntu/battlecity-backups/20261003-v1-1-7/` on host `ubuntu@3.10.140.175`. Database integrity passes and every pre-deployment row remains: **42 users and 80 player scores**. The preceding release documented 77 scores; additional records created since then were also preserved.

`/home/ubuntu/battlecity-backups/20261003-v1-1-7/rollback.sh` restores v1.1.6 with pulling disabled and recreates only the application service. It retains current data rather than rewinding the database. The deployment script automatically rolls back on failed health/data validation. All previous Docker images, including older rollback images, were retained.

The first image download failed because the 6.8-GB root filesystem had only 92 MB free. Docker had no disposable build cache or dangling images. Cleared only the 315-MB **downloaded APT package cache** (`apt-get clean`), then retried successfully. Installed packages, logs, account data, database volume, backups and Docker rollback images were preserved. Exact disk inspection, failure and retry logs are retained. Disk capacity remains an infrastructure concern for future releases; inspect before pulling rather than deleting historical data or rollback assets blindly.

## Public browser verification

An isolated hardware Chrome session checked the actual public deployment:

- Lobby synchronized; joined, received 81 authoritative snapshots, moved approximately 64 pixels, rendered, then returned to the lobby.
- Offline industrial demo accepted movement/fire and rendered gunfire, effects, buildings, lava, inventory and shadows.
- No runtime/shader/console exceptions or HTTP asset failures. Screenshots were inspected.

This is a functional smoke test, not a matched performance benchmark. Its live diagnostics include a single approximately **709-ms scene/render-update spike** (about 695 ms in scene/update), so do not claim universal elimination of loading hitches. The deterministic AI-arrival replay is substantially better (102–110-ms worst versus 1.15–1.28 seconds warm original and 17 seconds cold original), but real synchronization/model initialization still warrants profiling. The original v1.1.6 smoke also documented a 1.75-second spike; these different single smoke observations are not a controlled performance comparison.

The player's missing defender bars/invulnerability and precise moving-target aiming incident remain unreplicated. Server role damage/death and renderer bars are tested; rogue aim spread/timing is restored; human hitboxes and defender accuracy were not speculatively changed. See [REPORT.md](REPORT.md) for evidence and the smoothing diagnostic.

## Durable evidence

[deployment/v1.1.7/](deployment/v1.1.7/) contains the reviewed deployment script/result/log, CI and image-build results, storage inspection and image pull logs, public bundle/health verification, isolated-browser smoke script/result/screenshots and passing script lint logs. Scripts refuse unexpected starting images/revisions/volumes or backup-directory reuse. Inspect before reusing them. The smoke uses an isolated browser and test identity and sends no chat messages.
