export class BinaryMinHeap<T extends object> {
    private readonly items: T[] = [];
    private readonly indexByItem = new Map<T, number>();
    private readonly compare: (left: T, right: T) => number;

    public constructor(compare: (left: T, right: T) => number) {
        this.compare = compare;
    }

    public get size(): number {
        return this.items.length;
    }

    public push(item: T): void {
        const index = this.items.length;
        this.items.push(item);
        this.indexByItem.set(item, index);
        this.bubbleUp(index);
    }

    public pop(): T | undefined {
        if (this.items.length === 0) {
            return undefined;
        }
        const min = this.items[0];
        if (!min) {
            return undefined;
        }
        const tail = this.items.pop();
        this.indexByItem.delete(min);

        if (tail && this.items.length > 0) {
            this.items[0] = tail;
            this.indexByItem.set(tail, 0);
            this.bubbleDown(0);
        }

        return min;
    }

    public update(item: T): void {
        const index = this.indexByItem.get(item);
        if (index === undefined) {
            return;
        }
        this.bubbleUp(index);
        this.bubbleDown(index);
    }

    private bubbleUp(startIndex: number): void {
        let index = startIndex;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.compare(this.items[index] as T, this.items[parent] as T) >= 0) {
                break;
            }
            this.swap(index, parent);
            index = parent;
        }
    }

    private bubbleDown(startIndex: number): void {
        let index = startIndex;
        const size = this.items.length;

        while (true) {
            const left = (index * 2) + 1;
            const right = left + 1;
            let smallest = index;

            if (left < size && this.compare(this.items[left] as T, this.items[smallest] as T) < 0) {
                smallest = left;
            }
            if (right < size && this.compare(this.items[right] as T, this.items[smallest] as T) < 0) {
                smallest = right;
            }
            if (smallest === index) {
                break;
            }
            this.swap(index, smallest);
            index = smallest;
        }
    }

    private swap(leftIndex: number, rightIndex: number): void {
        const left = this.items[leftIndex] as T;
        const right = this.items[rightIndex] as T;
        this.items[leftIndex] = right;
        this.items[rightIndex] = left;
        this.indexByItem.set(right, leftIndex);
        this.indexByItem.set(left, rightIndex);
    }
}
