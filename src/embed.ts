import { createController } from "./controller";
import type { FlvController, Source, SourceOptions } from "./types";

const instances = new WeakMap<HTMLElement, FlvController>();

/**
 * Render a preview inside a caller-provided container (Embed surface).
 * Mounting again on the same container replaces the previous instance.
 */
export function mount(el: HTMLElement, source: Source, options?: SourceOptions): FlvController {
  instances.get(el)?.destroy();

  const base = createController(el, { isOverlay: false });
  instances.set(el, base);
  const origDestroy = base.destroy.bind(base);
  base.destroy = () => {
    origDestroy();
    if (instances.get(el) === base) {
      instances.delete(el);
    }
  };
  base.update(source, options);
  return base;
}
