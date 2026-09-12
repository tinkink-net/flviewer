import { createController } from "./controller";
import type { FlvController, Source, SourceOptions } from "./types";

const LOCK_CLASS = "flv-lock";

let currentOverlay: FlvController | null = null;

function lockScroll(): void {
  document.body.classList.add(LOCK_CLASS);
}

function unlockScroll(): void {
  document.body.classList.remove(LOCK_CLASS);
}

/**
 * Fullscreen modal preview. One Overlay at a time: a new `open()` replaces
 * the current one.
 */
export function open(source: Source, options?: SourceOptions): FlvController {
  currentOverlay?.destroy();

  const overlay = document.createElement("div");
  overlay.className = "flv-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", options?.title ?? "File preview");

  const restoreFocusTo =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let base: ReturnType<typeof createController>;
  let tornDown = false;
  const teardown = () => {
    if (tornDown) {
      return;
    }
    tornDown = true;
    base.destroy();
    overlay.remove();
    unlockScroll();
    if (currentOverlay === publicController) {
      currentOverlay = null;
    }
    restoreFocusTo?.focus();
  };

  base = createController(
    overlay,
    { isOverlay: true },
    {
      onCloseRequest: () => {
        if (tornDown) {
          return;
        }
        base.core.emit("close", { by: "user" });
        teardown();
      },
      onClose: () => {
        if (tornDown) {
          return;
        }
        base.core.emit("close", { by: "api" });
        teardown();
      },
    },
  );

  const publicController: FlvController = {
    update: (src, opts) => {
      if (!tornDown) {
        base.update(src, opts);
      }
    },
    destroy: teardown,
    on: (type, cb) => base.on(type, cb),
    close: () => {
      if (!tornDown) {
        base.close();
      }
    },
  };

  // Focus trap: keep Tab cycling within the overlay.
  overlay.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.key !== "Tab" || tornDown) {
      return;
    }
    const list = [...overlay.querySelectorAll<HTMLElement>("button:not([hidden]):not([disabled])")];
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  document.body.append(overlay);
  lockScroll();
  base.core.focusToolbar();
  base.update(source, options);
  currentOverlay = publicController;
  return publicController;
}
