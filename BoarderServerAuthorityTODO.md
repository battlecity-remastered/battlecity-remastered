# Boarder Server Authority TODO

Use this list to guide future server hardening work. Each checkbox captures a conceptual chunk to implement (audit logs excluded per discussion).

- [x] **Authoritative player movement.** Mirror the client’s collision and clamping logic on the server so position updates are validated before rebroadcasting; reject any move that exceeds the allowed speed or jumps through blocking tiles.
- [ ] **Server-side bullet physics.** Move the projectile integration loop into the server so bullets only exist when the authoritative simulation spawns them, preventing clients from faking trajectories or teleporting shots.
- [ ] **Damage confirmation flow.** Require servers to be the sole source of hit resolution by ignoring client-reported damage events; buildings, players, and hazards should only lose life when the server’s physics detects a collision.
- [ ] **State reconciliation / rollback.** Track recent authoritative states per player and send corrections when a client drifts; consider a simple snapshot/sequence system before moving to full rollback.
- [ ] **Inventory & cooldown validation.** Cross-check every item use (bomb drop, orb, cloak, medkit) against server-maintained inventory counts and timers to stop scripted exploits.
- [ ] **Orb and hazard ownership checks.** Validate that the emitting player owns the correct factory and has the required resources before spawning hazards or orb attempts.
- [ ] **City economics authority.** Keep the canonical money, population, and factory queues on the server, emitting deltas rather than trusting client UI state.
- [ ] **Anti-spam rate limits.** Apply per-socket rate caps on chat, placements, and UI-triggered events with clear rejection messages to avoid flooding and lag-switch abuse.
- [ ] **Cheat-resistant networking.** Transition to signed packets or shared secrets for sensitive actions, making it harder for automated proxies to impersonate legitimate clients.
