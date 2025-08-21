export interface QueuedItem { id: string }

export class PriorityQueue<T extends QueuedItem> {
  private heap: T[] = [];
  private compareFn: (a: T, b: T) => number;
  private seen: Set<string> = new Set();

  constructor(compareFn: (a: T, b: T) => number) {
    this.compareFn = compareFn;
  }

  push(item: T): void {
    if (this.seen.has(item.id)) return; // dedup
    this.seen.add(item.id);
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (!this.heap.length) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    if (top) this.seen.delete(top.id);
    return top;
  }

  peek(): T | undefined { return this.heap[0]; }
  size(): number { return this.heap.length; }
  clear(): void { this.heap = []; this.seen.clear(); }

  private bubbleUp(idx: number) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      const current = this.heap[idx]!;
      const parentVal = this.heap[parent]!;
      if (this.compareFn(current, parentVal) < 0) {
        this.heap[idx] = parentVal;
        this.heap[parent] = current;
        idx = parent;
      } else break;
    }
  }
  private bubbleDown(idx: number) {
    const len = this.heap.length;
    while (true) {
      const l = idx * 2 + 1;
      const r = l + 1;
      let smallest = idx;
      if (l < len && this.compareFn(this.heap[l]!, this.heap[smallest]!) < 0) smallest = l;
      if (r < len && this.compareFn(this.heap[r]!, this.heap[smallest]!) < 0) smallest = r;
      if (smallest !== idx) {
        const tmp = this.heap[idx]!;
        this.heap[idx] = this.heap[smallest]!;
        this.heap[smallest] = tmp;
        idx = smallest;
      } else break;
    }
  }
}
