import { Effect } from "effect";
import { EventIngress } from "./EventIngress.js";
import { TickScheduler } from "./TickScheduler.js";
import type { GameRuntime } from "./GameRuntime.js";
import type { RuntimeConfig } from "./types.js";

export class RuntimeScope {
    private readonly ingress: EventIngress;
    private readonly scheduler: TickScheduler;

    private constructor(ingress: EventIngress, scheduler: TickScheduler) {
        this.ingress = ingress;
        this.scheduler = scheduler;
    }

    public onSocketEvent(socketId: string, raw: unknown): void {
        this.ingress.enqueue(socketId, raw);
    }

    public onSocketDisconnect(runtime: GameRuntime, socketId: string): void {
        runtime.handleDisconnect(socketId);
    }

    public close(): Promise<void> {
        return Effect.runPromise(
            Effect.promise(() => this.ingress.stop()).pipe(
                Effect.zipRight(Effect.promise(() => this.scheduler.stop()))
            )
        );
    }

    public static open(runtime: GameRuntime, config: RuntimeConfig): RuntimeScope {
        const ingress = EventIngress.start(runtime);
        const scheduler = TickScheduler.start(runtime, config.bulletTickMs);
        return new RuntimeScope(ingress, scheduler);
    }
}
