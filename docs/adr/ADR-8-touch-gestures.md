# ADR-8: Touch gestures replace the redundant toolbar controls

## Context

The toolbar was designed for a mouse. On a phone it is a cramped, horizontally
scrollable strip, and two natural touch gestures were missing or broken:

1. **Pinch zoom was dead in the default mode.** Select mode (the default)
   returned early from `pointerdown` so that drag never panned and native text
   selection kept working. That early return also swallowed the two-pointer
   sequence, so pinch only ever zoomed in hand mode — the mode most users never
   switch to. Meanwhile the toolbar still carried `+`/`−` buttons that pinch
   makes redundant.
2. **Pages had no swipe.** Paging was button-only, even though left/right
   swipe is the expected gesture for a page view, and the two pager arrows
   crowd the already-tight mobile toolbar.

## Decision

Pinch and swipe are first-class on touch, and the buttons they replace are
removed on touch-primary devices.

- **Pinch is mode-independent.** `PanZoom` tracks touch pointers in every mode.
  Only the single-pointer drag branch stays gated to hand mode, so select mode
  still never pans. Mouse pointers still short-circuit in select mode so
  native text selection (office kinds) is untouched.
- **Coarse-pointer detection.** `isCoarsePointer()` reads
  `matchMedia("(pointer: coarse)")` — the _primary_ pointer. A hybrid laptop
  reports a fine primary pointer, so its buttons stay put; only phones/tablets
  are treated as touch.
- **Zoom buttons hide on touch.** For PanZoom kinds, `Zoom in` / `Zoom out`
  are hidden on coarse pointers (pinch replaces continuous zoom). `Fit`,
  `Actual size` and `Rotate` stay: they are discrete actions pinch cannot
  reproduce exactly. Video keeps `Fit` / `Actual size` even on touch — pinch
  is deliberately disabled for video (two-level zoom only, ADR-5).
- **Swipe navigation on page views.** A view opts in with `swipeNav` (PDF
  and PPTX do; XLSX does not — horizontal swipe is native table scroll there).
  In select mode, a clearly-horizontal single-finger drag past a threshold
  pages forward/back. On coarse pointers the pager arrows are hidden for those
  views; the `n / total` indicator stays. A second finger abandons the pending
  swipe so pinch takes over; a `pointercancel` navigates nothing.
- **Hand mode keeps drag-to-pan.** Swipe is select-only, so the two gestures
  never fight over a drag.

## Consequences

- The default mobile mode now behaves the way touch users expect, and the
  toolbar loses the controls that gesture makes redundant.
- `FlvView` grows one optional flag (`swipeNav`); the Core owns the gesture and
  the button-visibility rules, consistent with `#updateToolbarForKind` /
  `#updatePageIndicator`.
- Device capability is read at render/page-change time, so a source swap or a
  page change re-evaluates it; a mid-session primary-pointer change (e.g.
  detaching a keyboard) is not observed until the next such event.

## Deferred

- Swipe transition animation / rubber-banding (paging stays instant).
- Swipe for XLSX sheets (native horizontal scroll wins).
- Trackpad two-finger swipe on desktop.
- Tap-to-toggle chrome visibility.
