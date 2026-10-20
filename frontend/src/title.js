// Document titles: "<page> · PXL Playlist Parser", so browser tabs, history and
// screen readers can tell pages apart. Routes set a fixed title in `meta`;
// pages about one thing (a playlist, an artist) call setTitle with its name.
const APP = 'PXL Playlist Parser';

export function setTitle(page) {
  document.title = page ? `${page} · ${APP}` : APP;
}
