export const FLV_STYLES = `
.flv-root {
  --flv-accent: #6ea8fe;
  --flv-bg: rgba(28, 28, 32, 0.92);
  --flv-fg: #f2f2f2;
  --flv-overlay-bg: rgba(12, 12, 14, 0.9);
  --flv-radius: 10px;
  --flv-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  box-sizing: border-box;
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--flv-overlay-bg);
  color: var(--flv-fg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  text-align: start;
  -webkit-font-smoothing: antialiased;
}
.flv-root *,
.flv-root *::before,
.flv-root *::after {
  box-sizing: border-box;
  min-width: 0;
}
.flv-root[hidden] {
  display: none;
}
/* Author CSS must not resurrect elements the Core hid via [hidden]. */
.flv-root [hidden] {
  display: none !important;
}
.flv-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: var(--flv-overlay-bg);
}
body.flv-lock {
  overflow: hidden !important;
}
.flv-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}
.flv-stage.flv-panning {
  cursor: grabbing;
}
.flv-media {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  will-change: transform;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}
img.flv-media {
  max-width: none !important;
  max-height: none !important;
  box-shadow: var(--flv-shadow);
}
canvas.flv-media {
  box-shadow: var(--flv-shadow);
}
.flv-toolbar {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px;
  border-radius: var(--flv-radius);
  background: var(--flv-bg);
  box-shadow: var(--flv-shadow);
  z-index: 3;
  max-width: calc(100% - 24px);
  overflow-x: auto;
  scrollbar-width: none;
}
.flv-toolbar::-webkit-scrollbar {
  display: none;
}
.flv-btn {
  flex: none;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--flv-fg);
  cursor: pointer;
}
.flv-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.flv-btn:focus-visible {
  outline: 2px solid var(--flv-accent);
  outline-offset: 1px;
}
.flv-btn[disabled] {
  opacity: 0.4;
  cursor: default;
}
.flv-btn[disabled]:hover {
  background: transparent;
}
.flv-btn svg {
  width: 18px;
  height: 18px;
  display: block;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.flv-sep {
  flex: none;
  width: 1px;
  height: 22px;
  margin: 0 3px;
  background: rgba(255, 255, 255, 0.18);
}
.flv-page-indicator {
  flex: none;
  min-width: 66px;
  padding: 0 4px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  user-select: none;
  white-space: nowrap;
}
.flv-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 4;
  pointer-events: none;
}
.flv-progress-bar {
  height: 100%;
  width: 0%;
  background: var(--flv-accent);
  transition: width 0.15s ease-out;
}
.flv-progress.flv-indeterminate .flv-progress-bar {
  width: 30%;
  animation: flv-slide 1.1s ease-in-out infinite;
}
@keyframes flv-slide {
  0% { margin-left: -30%; }
  100% { margin-left: 100%; }
}
.flv-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30px;
  height: 30px;
  margin: -15px 0 0 -15px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: var(--flv-accent);
  border-radius: 50%;
  animation: flv-spin 0.8s linear infinite;
  z-index: 4;
  pointer-events: none;
}
@keyframes flv-spin {
  to { transform: rotate(360deg); }
}
.flv-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 2;
}
.flv-error-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 420px;
  padding: 20px 24px;
  border-radius: var(--flv-radius);
  background: var(--flv-bg);
  box-shadow: var(--flv-shadow);
  text-align: center;
}
.flv-error-box svg {
  width: 30px;
  height: 30px;
  stroke: var(--flv-accent);
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.flv-error-title {
  font-weight: 600;
}
.flv-error-detail {
  color: rgba(242, 242, 242, 0.66);
  font-size: 13px;
  word-break: break-word;
}
.flv-retry {
  height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--flv-accent);
  color: #10131a;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.flv-retry:focus-visible {
  outline: 2px solid var(--flv-fg);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .flv-root * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
