import { Effect, Fiber } from "effect";
import type { GameRuntime } from "./GameRuntime.js";

export class TickScheduler {
    private readonly fiber: Fiber.RuntimeFiber<void, never>;

    private constructor(fiber: Fiber.RuntimeFiber<void, never>) {
        this.fiber = fiber;
    }

    public stop(): Promise<void> {
        return Effect.runPromise(
            Fiber.interrupt(this.fiber).pipe(
                Effect.map(() => undefined)
            )
        );
    }

    public static start(runtime: GameRuntime, intervalMs: number): TickScheduler {
        const loop = runtime.tickBulletsEffect().pipe(
            Effect.zipRight(Effect.sleep(intervalMs)),
            Effect.forever
        );

        return new TickScheduler(Effect.runFork(loop));
    }
}
