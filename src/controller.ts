import { Core } from "./core";
import type { FlvController, FlvEventMap, FlvEventType, Source, SourceOptions } from "./types";

export interface ControllerHooks {
  /** User requested close (Esc / Close button) — Overlay only. */
  onCloseRequest?: () => void;
  /** `controller.close()` was called programmatically — Overlay only. */
  onClose?: () => void;
}

export function createController(
  host: HTMLElement,
  options: { isOverlay: boolean },
  hooks: ControllerHooks = {},
): FlvController & { core: Core } {
  const core = new Core({
    isOverlay: options.isOverlay,
    requestClose: () => hooks.onCloseRequest?.(),
  });
  host.append(core.root);

  let destroyed = false;
  const controller: FlvController & { core: Core } = {
    core,
    update(source: Source, opts?: SourceOptions) {
      if (destroyed) {
        return;
      }
      core.load(source, opts);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      core.destroy();
      core.root.remove();
    },
    on<K extends FlvEventType>(type: K, cb: (detail: FlvEventMap[K]) => void) {
      return core.on(type, cb);
    },
    close() {
      if (destroyed || !options.isOverlay) {
        return;
      }
      hooks.onClose?.();
    },
  };
  return controller;
}
