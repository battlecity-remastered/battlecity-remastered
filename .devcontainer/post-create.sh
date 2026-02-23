#!/bin/bash

set -euo pipefail

ROOT="${BATTLECITY_ROOT:-$(pwd)}"

cd "$ROOT"
echo "Installing workspace dependencies..."
npm install

if command -v python3 >/dev/null 2>&1; then
    if ! command -v uv >/dev/null 2>&1; then
        curl -LsSf https://astral.sh/uv/install.sh | sh
        if [ -f "$HOME/.local/bin/env" ]; then
            # shellcheck source=/dev/null
            source "$HOME/.local/bin/env"
        fi
    fi
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    uv tool install pre-commit || true
    if [ -f ".pre-commit-config.yaml" ]; then
        pre-commit install --install-hooks || true
    fi
fi

echo "Ready. Run npm run dev to start client + server."
