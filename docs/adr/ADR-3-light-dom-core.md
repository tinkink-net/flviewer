# ADR-3: Light-DOM Core with namespaced CSS

## Context

The Core needs a styling strategy that works identically for the factory API and the web component. Shadow DOM offers strong isolation but forks the story: two styling paths (shadow for `<fl-viewer>`, light for `mount()`), pdf.js layer styles must be adopted per shadow root, theming degrades to CSS-variables-only, and focus/fullscreen/a11y edge cases multiply. Precedent: standalone viewers (viewerjs, pdf.js's own chrome) style light DOM with namespaced classes.

## Decision

The Core renders into **light DOM** — the web component does **not** use Shadow DOM. One stylesheet is injected exactly once (idempotent, tracked by a sentinel), every class under the strict `flv-` namespace (`flv-toolbar`, `flv-page`, …), theming via `--flv-*` custom properties.

- Both surfaces mount literally the same DOM: one code path, one styling path
- Integrators keep full cascade access (plain-CSS tweaks stay possible) and theme via CSS variables that inherit normally
- A scoped reset on `.flv-root` neutralizes integrator globals (`* { box-sizing }`, `img { … }` selectors)

## Consequences

- Namespace discipline is the isolation mechanism: every selector, event name (`flv:`), and variable (`--flv-`) lives under reserved prefixes integrators must not use
- Sloppy integrator CSS can leak in; accepted, mitigated by the scoped reset, and debuggable because everything is plain DOM
