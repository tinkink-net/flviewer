const I = (paths: string): string => `<svg viewBox="0 0 20 20" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  zoomIn: I(
    '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5"/><path d="M6.5 8.5h4M8.5 6.5v4"/>',
  ),
  zoomOut: I(
    '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5"/><path d="M6.5 8.5h4"/>',
  ),
  fit: I('<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>'),
  // Actual size: 1:1.
  hundred: I(
    '<text x="10" y="13.5" text-anchor="middle" font-size="9" font-weight="600" letter-spacing="-0.5" fill="currentColor" stroke="none">1:1</text>',
  ),
  rotate: I('<path d="M15.8 10a5.8 5.8 0 1 1-1.7-4.1"/><path d="M14.4 2.6v3.5h-3.5"/>'),
  prev: I('<path d="M12 4.5 6.5 10 12 15.5"/>'),
  next: I('<path d="M8 4.5 13.5 10 8 15.5"/>'),
  download: I('<path d="M10 3v9"/><path d="M6.2 8.8 10 12.6l3.8-3.8"/><path d="M4 16.5h12"/>'),
  // Fullscreen: arrows expanding outward to the corners.
  fullscreen: I(
    '<path d="M11.5 8.5 16 4M12.5 4H16v3.5M8.5 11.5 4 16M4 12.5V16h3.5M11.5 11.5 16 16M12.5 16H16v-3.5M8.5 8.5 4 4M4 7.5V4h3.5"/>',
  ),
  close: I('<path d="M5 5l10 10M15 5 5 15"/>'),
  error: I('<circle cx="10" cy="10" r="7.5"/><path d="M10 6v5"/><path d="M10 13.8v.2"/>'),
  // Media controls (filled glyphs; the toolbar CSS strokes outline icons).
  play: I('<path d="M7 4.5v11l9-5.5z" fill="currentColor" stroke="none"/>'),
  pause: I(
    '<path d="M6.5 4.5h2.7v11H6.5zM10.8 4.5h2.7v11h-2.7z" fill="currentColor" stroke="none"/>',
  ),
  volume: I(
    '<path d="M4 7.8v4.4h2.6L11 16V4L6.6 7.8z" fill="currentColor" stroke="none"/><path d="M13.2 7.6a3.4 3.4 0 0 1 0 4.8"/><path d="M15.3 5.5a6.4 6.4 0 0 1 0 9"/>',
  ),
  volumeMuted: I(
    '<path d="M4 7.8v4.4h2.6L11 16V4L6.6 7.8z" fill="currentColor" stroke="none"/><path d="M13.2 8.2l4 4M17.2 8.2l-4 4"/>',
  ),
  music: I(
    '<path d="M8.2 14.6V5.2l7.6-1.6v9.2"/><circle cx="6" cy="14.8" r="2.2"/><circle cx="13.6" cy="13" r="2.2"/>',
  ),
  // Interaction modes.
  select: I(
    '<path d="M6 3.2 16 12.4h-4.6l2.4 4.9-2 1-2.4-4.9-3.4 3.1z" fill="currentColor" stroke="none"/>',
  ),
  hand: I(
    '<g transform="scale(0.75) translate(1.5 1)"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></g>',
  ),
  // Markdown rendered ↔ source toggle.
  code: I('<path d="M7.5 6.5 4 10l3.5 3.5M12.5 6.5 16 10l-3.5 3.5"/>'),
  // Unavailable markdown asset placeholder.
  image: I(
    '<rect x="2.5" y="4" width="15" height="12" rx="2"/><circle cx="7" cy="8.5" r="1.6"/><path d="M17 13.5 12.5 9 6 15.5"/>',
  ),
};
