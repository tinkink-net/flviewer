# ADR-2: Dual integration surface on one Core

## Context

The library must integrate with any framework (React/Vue/Svelte/vanilla). Two natural mechanisms exist: a vanilla factory API and a web component. Shipping only one risks friction for a whole class of integrators; shipping both from day one costs design and test surface up front. Deferring the web component was the "safer" path but the contract to add it non-breakingly had to be designed for anyway.

## Decision

Ship **both surfaces in v1**, sharing a single internal renderer (**the Core**):

- `open(source, opts)` → fullscreen Overlay; `mount(el, source, opts)` → Embed in a provided container; both return a **Controller** (`update`, `destroy`, `on`, `close`)
- `<fl-viewer>` custom element wraps the same Core, renders in light DOM, and shares the Controller semantics (`src` attribute, complex values like `requestInit` via properties)
- Events are one bus with two views: `controller.on('error', …)` and `el.addEventListener('flv:error', …)` — CustomEvents bubbled from the Core's root element

## Consequences

- The Core must be designed mount/destroy-clean from day one (no module-level singleton state except the injected stylesheet and the single Overlay instance)
- More surface to test on day one (three entry points), but one code path — surfaces are thin adapters
- `open()` enforces **one Overlay at a time** (a new call replaces the current one); stacks/multi-instance policies can be added non-breakingly later
