# ADR-5: Media playback controls are toolbar-integrated, not native

## Context

Phase 1 shipped video/audio on native `<video controls>`/`<audio controls>`. Three problems surfaced immediately:

1. **Blown-up native controls.** The viewer fits small media by transform-upscaling the element (`PanZoom.fitFactor()` may upscale). Native controls are rendered _inside_ the element, so the whole browser control bar (3-dot overflow included) scaled with it — on a small video the controls covered a third of the frame. Any browser UI living inside a transform-scaled element will have this bug class.
2. **Wrong controls per kind.** The shared toolbar exposed rotate/zoom for an mp3 — meaningless for invisible media — while the media's own transport (play/pause, seek, volume) lived in a second, visually inconsistent control skin owned by the browser.
3. **No consistent control language.** The issue's original scope said "no custom play/pause skin in v1". That position is reversed here.

## Decision

Media elements mount with `controls = false`. The Core toolbar owns playback:

- **Media group** (video/audio only): play/pause toggle, seek slider (`<input type="range">`, 0–1000 per-mille) with `m:ss / m:ss` time readout, mute toggle, volume slider. Volume/mute persist across sources per session.
- **Zoom for video is two-level only** — fit and 100% (1:1 native pixels) — applied programmatically via a non-interactive `PanZoom` (`interactive: false`: no wheel/pinch/drag on the media element). No rotate for media kinds. Pan for oversized 100% media is deferred to the interaction-modes pass.
- **Keyboard per kind**: `space` play/pause, `←`/`→` seek ±5s, `↑`/`↓` volume, `m` mute; `+`/`-`/`0` are inert for media. Focused buttons/sliders keep native activation (no double-toggle).
- **Audio presentation**: the element is invisible; the stage shows a placeholder card (icon + filename + duration) while the toolbar acts as the player.
- Video double-click toggles fullscreen (media convention), replacing the 1×↔2× zoom toggle.
- Toolbar composition is kind-aware: transform group for images/PDF, fit/100% for video, nothing for audio; common actions (download, fullscreen, close) always present.

## Consequences

- The native-controls scale bug is structurally impossible: no browser-rendered UI lives inside the transformed element.
- The Core owns real playback UI: maintenance cost (state sync, scrubbing edge cases, stream durations that are `Infinity`) and an accessibility debt free with native inputs (`<input type="range">` keeps keyboard/screen-reader support).
- Kind-aware toolbars are now a Core concept (`#updateToolbarForKind`) — every future format phase plugs its controls into this model.
- Buffered-range visualization, playback speed, PiP remain deferred.
