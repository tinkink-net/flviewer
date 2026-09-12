const I = (paths: string): string => `<svg viewBox="0 0 20 20" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  zoomIn: I(
    '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5"/><path d="M6.5 8.5h4M8.5 6.5v4"/>',
  ),
  zoomOut: I(
    '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5"/><path d="M6.5 8.5h4"/>',
  ),
  fit: I('<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>'),
  hundred: I(
    '<path d="M5 8.5V5h2.5M15 8.5V5h-2.5M5 11.5V15h2.5M15 11.5V15h-2.5"/><path d="M10 6.5v7"/>',
  ),
  rotate: I('<path d="M15.8 10a5.8 5.8 0 1 1-1.7-4.1"/><path d="M14.4 2.6v3.5h-3.5"/>'),
  prev: I('<path d="M12 4.5 6.5 10 12 15.5"/>'),
  next: I('<path d="M8 4.5 13.5 10 8 15.5"/>'),
  download: I('<path d="M10 3v9"/><path d="M6.2 8.8 10 12.6l3.8-3.8"/><path d="M4 16.5h12"/>'),
  fullscreen: I('<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/>'),
  close: I('<path d="M5 5l10 10M15 5 5 15"/>'),
  error: I('<circle cx="10" cy="10" r="7.5"/><path d="M10 6v5"/><path d="M10 13.8v.2"/>'),
};
