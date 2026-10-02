export type CombatPoint = { x: number; y: number; z: number };
export type ShellOwner = "player" | "turret";
export type DemoWeapon = "cannon" | "rocket" | "laser";
export const WEAPON_PROFILES = { cannon: {speed:24,gravity:0.30,cooldown:0.68}, rocket: {speed:16,gravity:0.05,cooldown:0.85}, laser: {speed:60,gravity:0,cooldown:0.30} } as const;
export type ShellHit = { blastScale?: number; point: CombatPoint; normal: CombatPoint; surface: "metal" | "rock" | "ground" | "tank"; weapon?: DemoWeapon };
export type ShellSweep = (from: CombatPoint, to: CombatPoint, owner?: ShellOwner) => ShellHit | undefined;
export type CannonShot = { id: number; muzzle: CombatPoint; forward: CombatPoint; owner: ShellOwner; weapon?: DemoWeapon };
export type DemoShell = { id: number; position: CombatPoint; previous: CombatPoint; velocity: CombatPoint; age: number; owner: ShellOwner; weapon: DemoWeapon };

export const CANNON_COOLDOWN = 0.68;
export const SHELL_SPEED = 24;
export const SHELL_GRAVITY = 0.30;
export const SHELL_LIFETIME = 2.6;
// Blender cannon tip, after the original 0.70 model scale.
export const TANK_MUZZLE_DISTANCE = 0.385;
export const TANK_MUZZLE_HEIGHT = 0.427;

export const cannonForward = (heading32: number): CombatPoint => {
    const angle = (heading32 % 32) * Math.PI / 16;
    return { x: Math.sin(angle), y: 0, z: -Math.cos(angle) };
};

export const createDemoCombat = (sweep: ShellSweep) => {
    const shells: DemoShell[] = [];
    let time = 0, lastShot = -Infinity, sequence = 0;
    const spawn = (shot: CannonShot): void => {
        const weapon=shot.weapon??"cannon",speed=WEAPON_PROFILES[weapon].speed;
        shells.push({id:shot.id,owner:shot.owner,weapon,position:{...shot.muzzle},previous:{...shot.muzzle},
            velocity:{x:shot.forward.x*speed,y:shot.forward.y*speed,z:shot.forward.z*speed},age:0});
    };
    return {
        shells,
        launch: (muzzle: CombatPoint,forward: CombatPoint): CannonShot => {
            const length=Math.hypot(forward.x,forward.y,forward.z)||1;
            const shot: CannonShot={id:++sequence,owner:"turret",muzzle:{...muzzle},forward:{x:forward.x/length,y:forward.y/length,z:forward.z/length}};
            spawn(shot);return shot;
        },
        step: (dt: number, firing: boolean, muzzle: CombatPoint, heading32: number, nowSeconds?: number,weapon: DemoWeapon="cannon") => {
            const elapsed = Math.max(0,Math.min(dt,0.25));
            time = nowSeconds === undefined ? time+elapsed : Math.max(time,nowSeconds);
            const shots: CannonShot[] = [], impacts: ShellHit[] = [];
            for (let i=shells.length-1;i>=0;i--) {
                const shell=shells[i]!;
                const gravity=WEAPON_PROFILES[shell.weapon].gravity;
                shell.previous={...shell.position};
                let hit: ShellHit | undefined;
                // Swept segments follow the shallow ballistic arc even on a slow frame.
                const steps=Math.max(1,Math.ceil(elapsed/0.025)), step=elapsed/steps;
                for(let n=0;n<steps && !hit;n++) {
                    const next={x:shell.position.x+shell.velocity.x*step,
                        y:shell.position.y+shell.velocity.y*step-0.5*gravity*step*step,
                        z:shell.position.z+shell.velocity.z*step};
                    hit=sweep(shell.position,next,shell.owner);
                    shell.position=hit?{...hit.point}:next;
                    shell.velocity.y-=gravity*step;
                }
                shell.age+=elapsed;
                if(hit) impacts.push({...hit,weapon:shell.weapon});
                if(hit || shell.age>=SHELL_LIFETIME || Math.abs(shell.position.x)>256 || Math.abs(shell.position.z)>256) shells.splice(i,1);
            }
            if(firing && time-lastShot>=WEAPON_PROFILES[weapon].cooldown-1e-8) {
                lastShot=time;
                const forward=cannonForward(heading32), id=++sequence;
                const shot: CannonShot={id,muzzle:{...muzzle},forward,owner:"player",weapon};
                shots.push(shot);
                // A barrel can protrude past the tank's collider. Check that short
                // segment too, preventing a muzzle inside a wall firing through it.
                const breech={x:muzzle.x-forward.x*TANK_MUZZLE_DISTANCE,y:muzzle.y,z:muzzle.z-forward.z*TANK_MUZZLE_DISTANCE};
                const obstruction=sweep(breech,muzzle);
                if(obstruction) impacts.push({...obstruction,weapon});
                else spawn(shot);
            }
            return { shots, impacts };
        }
    };
};
