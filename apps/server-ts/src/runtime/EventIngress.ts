import { Effect, Fiber, Queue } from "effect";
import type { GameRuntime } from "./GameRuntime.js";

type IngressItem = {
    socketId: string;
    raw: unknown;
};

export class EventIngress {
    private readonly queue: Queue.Queue<IngressItem>;
    private readonly fiber: Fiber.RuntimeFiber<void, never>;

    private constructor(queue: Queue.Queue<IngressItem>, fiber: Fiber.RuntimeFiber<void, never>) {
        this.queue = queue;
        this.fiber = fiber;
    }

    public enqueue(socketId: string, raw: unknown): void {
        Effect.runFork(Queue.offer(this.queue, { socketId, raw }));
    }

    public stop(): Promise<void> {
        return Effect.runPromise(
            Fiber.interrupt(this.fiber).pipe(
                Effect.zipRight(Queue.shutdown(this.queue))
            )
        );
    }

    public static start(runtime: GameRuntime): EventIngress {
        const queue = Effect.runSync(Queue.unbounded<IngressItem>());
        const worker = Queue.take(queue).pipe(
            Effect.flatMap(({ socketId, raw }) => {
                return runtime.handleRawEventEffect(socketId, raw);
            }),
            Effect.forever
        );

        const fiber = Effect.runFork(worker);
        return new EventIngress(queue, fiber);
    }
}
