/** Accessibility and debug flags. Read once at boot; the title screen can toggle reduceFlashes. */

const KEY = 'chroma-clash:reduceFlashes';
const params = new URLSearchParams(window.location.search);

function readStored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const settings = {
  /** OS-level "reduce motion": no screen shake, no grid pulse, no flashes. */
  reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  /** No full-screen color flashes (photosensitivity). Also forced on by reduceMotion. */
  reduceFlashes: params.get('reduceFlashes') === '1' || readStored(),
  /** Show an FPS counter: add ?debug=1 to the URL. */
  debug: params.get('debug') === '1',
};

export function flashesAllowed(): boolean {
  return !settings.reduceFlashes && !settings.reduceMotion;
}

export function setReduceFlashes(on: boolean): void {
  settings.reduceFlashes = on;
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage can be blocked (private mode); the setting just won't persist.
  }
}
