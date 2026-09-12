import type { FlvEventMap, FlvEventType } from "./types";

export class EventBus {
  #listeners = new Map<FlvEventType, Set<(detail: unknown) => void>>();

  on<K extends FlvEventType>(type: K, cb: (detail: FlvEventMap[K]) => void): () => void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(cb as (detail: unknown) => void);
    return () => {
      set.delete(cb as (detail: unknown) => void);
    };
  }

  emit<K extends FlvEventType>(type: K, detail: FlvEventMap[K]): void {
    const set = this.#listeners.get(type);
    if (!set) {
      return;
    }
    for (const cb of set) {
      cb(detail);
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
