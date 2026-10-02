The superseded Pixi renderer, its entry point and its dedicated rendering/window
tests are retained here as reference for the Three.js game port. This directory
is outside the application workspaces and is not a runnable client.

The active TypeScript client uses Three.js and connects to the authoritative game
server by default. Open `?demo=1` for the independent offline mayor sandbox.
Shared gameplay, collision, protocol and network code remain in the active
workspaces. Pixi is no longer an npm dependency.
