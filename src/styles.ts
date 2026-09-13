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
}
/* Interaction modes: hand drags (clamped), select never pans. */
.flv-stage.flv-mode-hand {
  cursor: grab;
}
.flv-stage.flv-mode-hand.flv-panning {
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
video.flv-media {
  box-shadow: var(--flv-shadow);
  background: #000;
}
/* Native controls follow the dark viewer chrome. */
.flv-media {
  color-scheme: dark;
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
.flv-media-group {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.flv-time {
  flex: none;
  font-size: 12px;
  color: rgba(242, 242, 242, 0.8);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  user-select: none;
}
.flv-media-slider {
  flex: 1 1 120px;
  min-width: 72px;
  height: 24px;
  margin: 0;
  accent-color: var(--flv-accent);
  cursor: pointer;
  padding: 0;
  border: 0;
  background: transparent;
}
.flv-media-slider:disabled {
  opacity: 0.4;
  cursor: default;
}
.flv-volume {
  flex: 0 1 64px;
  min-width: 48px;
}
.flv-audio-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: min(420px, calc(100% - 48px));
  padding: 28px 36px;
  border-radius: var(--flv-radius);
  background: var(--flv-bg);
  box-shadow: var(--flv-shadow);
  text-align: center;
}
.flv-audio-card svg {
  width: 44px;
  height: 44px;
  stroke: var(--flv-accent);
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.flv-audio-name {
  font-weight: 600;
  word-break: break-word;
}
.flv-audio-duration {
  font-size: 12px;
  color: rgba(242, 242, 242, 0.6);
  font-variant-numeric: tabular-nums;
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
/* Text views (ADR-6): native scroll, native selection, no mode machinery. */
.flv-text {
  position: absolute;
  inset: 0;
  overflow: auto;
  touch-action: pan-x pan-y;
  color-scheme: dark;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.55;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
}
.flv-text-content {
  min-height: 100%;
}
.flv-plain,
.flv-code {
  margin: 0;
  padding: 20px 24px;
  white-space: pre;
  tab-size: 4;
  color: var(--flv-fg);
}
.flv-truncated {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 24px;
  background: rgba(110, 168, 254, 0.14);
  border-bottom: 1px solid rgba(110, 168, 254, 0.4);
  font-size: 12px;
}
.flv-truncated-text {
  color: var(--flv-fg);
}
.flv-truncated-download {
  flex: none;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--flv-fg);
  cursor: pointer;
}
.flv-truncated-download:hover {
  background: rgba(255, 255, 255, 0.2);
}
.flv-truncated-download svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* CSV table (RFC-4180) with a sticky header. */
.flv-table {
  margin: 0;
  border-collapse: collapse;
}
.flv-table th,
.flv-table td {
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 5px 12px;
  text-align: left;
  white-space: pre;
}
.flv-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #26262c;
  font-weight: 600;
}
.flv-table tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}
/* Rendered Markdown prose (ADR-6). */
.flv-prose {
  max-width: 46rem;
  margin: 0 auto;
  padding: 28px 32px 48px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.65;
  color: var(--flv-fg);
  overflow-wrap: break-word;
}
.flv-prose h1,
.flv-prose h2,
.flv-prose h3,
.flv-prose h4,
.flv-prose h5,
.flv-prose h6 {
  margin: 1.4em 0 0.5em;
  font-weight: 650;
  line-height: 1.25;
  scroll-margin-top: 48px;
}
.flv-prose h1 {
  font-size: 1.75em;
  margin-top: 0.4em;
}
.flv-prose h2 {
  font-size: 1.4em;
}
.flv-prose h3 {
  font-size: 1.18em;
}
.flv-prose h4,
.flv-prose h5,
.flv-prose h6 {
  font-size: 1em;
}
.flv-prose p {
  margin: 0.85em 0;
}
.flv-prose ul,
.flv-prose ol {
  margin: 0.85em 0;
  padding-left: 1.6em;
}
.flv-prose li {
  margin: 0.25em 0;
}
.flv-prose blockquote {
  margin: 1em 0;
  padding: 0.15em 1em;
  border-left: 3px solid var(--flv-accent);
  color: rgba(242, 242, 242, 0.75);
}
.flv-prose a {
  color: var(--flv-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.flv-prose a.flv-link-missing {
  color: rgba(242, 242, 242, 0.55);
  text-decoration: none;
  cursor: default;
}
.flv-prose code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.875em;
  background: rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  padding: 0.15em 0.4em;
}
.flv-prose pre {
  margin: 1em 0;
  padding: 12px 16px;
  background: #17171b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow-x: auto;
  line-height: 1.55;
  font-size: 13px;
}
.flv-prose pre code {
  background: transparent;
  padding: 0;
  font-size: inherit;
}
.flv-prose img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}
.flv-prose hr {
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  margin: 1.8em 0;
}
.flv-prose table,
.flv-table {
  border-collapse: collapse;
}
.flv-prose table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  margin: 1em 0;
  border-collapse: collapse;
  font-size: 14px;
}
.flv-prose table th,
.flv-prose table td {
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 5px 12px;
  text-align: left;
}
.flv-prose table th {
  background: #26262c;
  font-weight: 600;
}
.flv-asset-missing {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  margin: 4px 0;
  border: 1px dashed rgba(255, 255, 255, 0.32);
  border-radius: 6px;
  color: rgba(242, 242, 242, 0.6);
  font-size: 12px;
  vertical-align: middle;
}
.flv-asset-missing svg {
  width: 16px;
  height: 16px;
  flex: none;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.flv-asset-missing-label {
  word-break: break-all;
}
/* Syntax palette (dark) for highlight.js output. */
.hljs-comment,
.hljs-quote {
  color: #8b949e;
  font-style: italic;
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-doctag {
  color: #ff7b72;
}
.hljs-string,
.hljs-regexp {
  color: #a5d6ff;
}
.hljs-number,
.hljs-literal,
.hljs-type,
.hljs-class .hljs-title,
.hljs-built_in {
  color: #79c0ff;
}
.hljs-title,
.hljs-function .hljs-title,
.hljs-title.function_ {
  color: #d2a8ff;
}
.hljs-attr,
.hljs-attribute,
.hljs-variable,
.hljs-template-variable,
.hljs-meta {
  color: #ffa657;
}
.hljs-name,
.hljs-section,
.hljs-selector-id,
.hljs-selector-class {
  color: #7ee787;
}
.hljs-symbol,
.hljs-bullet,
.hljs-link {
  color: #7ee787;
}
.hljs-deletion {
  color: #ffdcd7;
}
.hljs-addition {
  color: #aff5b4;
}
.hljs-emphasis {
  font-style: italic;
}
.hljs-strong {
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .flv-root * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
