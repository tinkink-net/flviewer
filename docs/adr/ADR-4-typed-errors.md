# ADR-4: Typed errors, no exceptions across the API boundary

## Context

A viewer fails in ways integrators must handle distinctly: fetch failure, unsupported type, encrypted PDF, pdf.js render failure, aborted loads. The JS default — throwing — makes every call site need try/catch and loses the ability to also show a graceful in-viewer error state. Errors thrown from deep in pdf.js or fetch handlers would otherwise surface as unhandled rejections.

## Decision

Failures resolve to a **typed error object** `{ code, message, cause? }`, surfaced through the event bus (`controller.on('error')` and `flv:error` CustomEvent) and rendered as the viewer's error state (with Retry). No exception ever crosses the API boundary. Codes: `fetch-error`, `unsupported-type`, `encrypted-pdf`, `render-error`, `aborted`.

## Consequences

- Internal implementation may still use exceptions (caught internally and translated)
- Integrators branch on `error.code`, not on error classes — stable, serializable contract
- New codes may be added; existing ones are semantically frozen once published
