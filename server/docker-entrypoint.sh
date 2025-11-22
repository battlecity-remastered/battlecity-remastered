#!/usr/bin/env sh
set -e

DATA_DIR="/app/server/data"
SEED_DIR="/app/server/data-seed"

# Seed data if the target directory is missing or empty
if [ ! -d "$DATA_DIR/cities" ] || [ -z "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
  echo "[entrypoint] Seeding data directory from $SEED_DIR"
  mkdir -p "$DATA_DIR"
  cp -a "$SEED_DIR/." "$DATA_DIR/"
fi

exec node app.js
