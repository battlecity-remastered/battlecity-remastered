import type { KnownTypedEventEnvelope } from "@battlecity/protocol";
import type { ClientState } from "../../app/state.js";
import { TANK_MUZZLE_HEIGHT, type CannonShot, type DemoShell, type DemoWeapon, type ShellHit } from "./demo-combat.js";

export type NetworkCombatFrame = { shots: CannonShot[]; impacts: ShellHit[]; shells: DemoShell[] };
const muzzleHeight=(state:ClientState,ownerId:string):number=>state.defenses.has(ownerId)?1.025:TANK_MUZZLE_HEIGHT;
const weaponFor = (type: number): DemoWeapon => type === 1 ? "rocket" : type === 0 ? "laser" : "cannon";

// Server events decide projectile existence and impacts. These queues supply
// presentation only; the visual sweep never applies gameplay damage.
export const createNetworkCombat = () => {
    const bullets = new Map<string, { id: number; born: number }>();
    const shots: CannonShot[] = [], impacts: ShellHit[] = [];
    const explosions=new Set<string>();
    let sequence = 0;
    return {
        observe(event: KnownTypedEventEnvelope, state: ClientState): void {
            if (event.type === "bullet.fired") {
                const payload = event.payload, angle = payload.direction * Math.PI / 16;
                const id = ++sequence;
                bullets.set(payload.id, { id, born: performance.now() });
                shots.push({ id, owner: payload.ownerId === state.local.id ? "player" : "turret", weapon: weaponFor(payload.type), muzzle: { x: payload.position.x / 48 - 256, y: muzzleHeight(state,payload.ownerId), z: payload.position.y / 48 - 256 }, forward: { x: Math.cos(angle), y: 0, z: Math.sin(angle) } });
                if (shots.length > 32) shots.shift();
            } else if (event.type === "bullet.resolved") {
                const bullet = state.bullets.get(event.payload.id);
                if (bullet && event.payload.reason !== "out_of_bounds") {
                    const angle = bullet.direction * Math.PI / 16;
                    impacts.push({ point: { x: (event.payload.position?.x??bullet.x) / 48 - 256, y: TANK_MUZZLE_HEIGHT, z: (event.payload.position?.y??bullet.y) / 48 - 256 }, normal: { x: -Math.cos(angle), y: 0.15, z: -Math.sin(angle) }, surface: event.payload.reason === "hit_terrain" ? "rock" : event.payload.reason === "hit_player" ? "tank" : "metal", weapon: weaponFor(bullet.type) });
                    if (impacts.length > 32) impacts.shift();
                }
                bullets.delete(event.payload.id);
            }
        },
        frame(state: ClientState): NetworkCombatFrame {
            const shells: DemoShell[] = [];
            for (const [id, bullet] of state.bullets) {
                const dx=bullet.x-state.local.x,dy=bullet.y-state.local.y;
                if(dx*dx+dy*dy>(48*35)**2)continue;
                const visual = bullets.get(id);
                if (!visual) continue;
                const angle = bullet.direction * Math.PI / 16;
                const position = { x: bullet.x / 48 - 256, y: muzzleHeight(state,bullet.ownerId), z: bullet.y / 48 - 256 };
                shells.push({ id: visual.id, position, previous: position, velocity: { x: Math.cos(angle) * bullet.speed / 48, y: 0, z: Math.sin(angle) * bullet.speed / 48 }, age: (performance.now() - visual.born) / 1000, owner: bullet.ownerId === state.local.id ? "player" : "turret", weapon: weaponFor(bullet.type) });
            }
            for (const id of bullets.keys()) if (!state.bullets.has(id)) bullets.delete(id);
            for(const explosion of state.events.effects.explosions){if(explosions.has(explosion.id))continue;explosions.add(explosion.id);if(Date.now()-explosion.createdAt>5000)continue;impacts.push({blastScale:explosion.variant==="large"?3:1.2,point:{x:explosion.x/48-256,y:0.3,z:explosion.y/48-256},normal:{x:0,y:1,z:0},surface:explosion.variant==="large"?"metal":"tank",weapon:explosion.variant==="large"?"rocket":"cannon"});}
            const currentExplosions=new Set(state.events.effects.explosions.map(explosion=>explosion.id));for(const id of explosions)if(!currentExplosions.has(id))explosions.delete(id);
            const localX=(state.local.x+24)/48-256,localZ=(state.local.y+24)/48-256;
            const close=(point:{x:number;z:number}):boolean=>{const dx=point.x-localX,dz=point.z-localZ;return dx*dx+dz*dz<35*35;};
            shells.sort((a,b)=>Number(b.owner==="player")-Number(a.owner==="player"));
            return { shots: shots.splice(0).filter(shot=>close(shot.muzzle)), impacts: impacts.splice(0).filter(impact=>close(impact.point)), shells };
        }
    };
};
