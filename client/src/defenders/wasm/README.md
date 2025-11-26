# Defender wasm build

The defender pathfinding worker expects `astar.wasm` next to this README, but the binary is not committed.

Generate it locally with:

```bash
npm run build:wasm --prefix ../../..
```

The script will use `wabt` (if installed) to compile `astar.wat`. If `wabt` is unavailable, it falls back to writing the precompiled bytes that match the current WAT source so CI and local builds can still succeed without bundling binaries in git.
