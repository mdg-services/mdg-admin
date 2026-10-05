import * as React from 'react';

import { isNativeShell } from '@/lib/nativeBridge';

/**
 * ONE STACK FOR EVERY OVERLAY — so Escape and Android's Back close only the
 * one on top.
 *
 * Each overlay used to bind its own Escape listener to `document`, so a
 * confirm stacked on a drawer took the drawer down with it on a single press,
 * along with whatever had been typed in it. And nothing pushed a history entry,
 * so the hardware Back key — which the native shell maps to `WebView.goBack()`
 * — walked straight past an open sheet and out of the screen under it.
 *
 * `useOverlayEntry` puts an open overlay on a module-level stack. One keydown
 * listener sends Escape to the top entry only. Below md, or anywhere inside the
 * native shell, the first overlay to open also pushes one history entry of our
 * own (the MARKER), so Back has something to pop that is not a page: the pop
 * closes the top overlay, and if another is still open underneath, a fresh
 * marker is pushed for it. At md in a browser no entry is pushed and Back is
 * the page navigation it has always been.
 *
 * ── WHY THIS WATCHES `history.pushState` AND `history.replaceState` ─────────
 *
 * A marker is a second history entry with the same URL as the page. That is
 * only harmless while the URL does not move underneath it, and here it moves
 * all the time: half the list screens keep their filters in the query string
 * and rewrite it with `replace` as the admin types into a filter sheet, and
 * three overlays are DRIVEN by the URL (`?open=` on Documents, `?run=` on Run
 * history, `?session=` on the Assistant), closing themselves with a `replace`.
 * Left alone, the router would overwrite the marker, the entry BELOW it would
 * still hold the URL from before the sheet opened, and Back would then revert
 * every filter typed in the sheet — or reopen the drawer that had just been
 * closed. So while the marker is the current entry:
 *
 *  - a `replaceState` keeps the marker flag on the entry and remembers what the
 *    router wrote, and
 *  - a `pushState` (a navigation from inside the overlay) takes the marker's
 *    place instead of stacking above it, so no dead entry is left behind for
 *    Back to land on.
 *
 * And when the marker is popped — by Back, or by our own `history.back()` after
 * the overlay closed from the UI — the popstate is SWALLOWED before the router
 * hears it, and the entry we land on is rewritten to be the entry we left. The
 * router never sees a navigation, because as far as the page is concerned none
 * happened: an overlay closed.
 *
 * The listener is installed when this module loads, which is before the router
 * mounts, and in the capture phase, so it runs first on both counts.
 */

interface Entry {
  close: () => void;
  /** Close on any history navigation, not just Back off our own marker — the
   *  desktop `Menu` popover, which is stale once the view changes. */
  dismissOnPop: boolean;
}

/** An entry as the router last wrote it, without our flag. */
interface Snapshot {
  state: unknown;
  url: string;
}

const MARKER_KEY = 'dkOverlay';
const BELOW_MD = '(max-width: 767.98px)';

const stack: Entry[] = [];
/** Non-null exactly while the CURRENT history entry is our marker. */
let marker: Snapshot | null = null;
/**
 * The stack emptied from the UI (X, scrim, Save). Stepping back over the marker
 * waits one task, because "Save and next" closes one overlay and opens the next
 * in the same commit — and the next one should simply inherit the marker.
 */
let pendingRelease: number | null = null;
/** Our own `history.back()` calls whose popstate has not arrived yet, each with
 *  the entry the page should end up on. */
const ownPops: Snapshot[] = [];

type HistoryWrite = History['pushState'];
let nativePush: HistoryWrite | null = null;
let nativeReplace: HistoryWrite | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function withMarker(state: unknown): Record<string, unknown> {
  return { ...(isRecord(state) ? state : {}), [MARKER_KEY]: true };
}

function isMarkerState(state: unknown): boolean {
  return isRecord(state) && state[MARKER_KEY] === true;
}

function withoutMarker(state: unknown): unknown {
  if (!isRecord(state)) return state;
  const { [MARKER_KEY]: _marker, ...rest } = state;
  return rest;
}

/** The router's own position stamp. Two entries with the same `idx` are a page
 *  and the marker above it. */
function routerIdx(state: unknown): unknown {
  return isRecord(state) ? state.idx : undefined;
}

function resolveUrl(url: string | URL | null | undefined): string {
  return url == null ? window.location.href : new URL(url, window.location.href).href;
}

function wantsHistory(): boolean {
  return isNativeShell() || window.matchMedia(BELOW_MD).matches;
}

function replaceWith(snapshot: Snapshot): void {
  nativeReplace?.call(window.history, snapshot.state, '', snapshot.url);
}

function pushMarker(): void {
  if (marker || !nativePush) return;
  const snapshot: Snapshot = { state: window.history.state, url: window.location.href };
  nativePush.call(window.history, withMarker(snapshot.state), '');
  marker = snapshot;
}

/** Give the open stack a marker of its own, if it should have one and has not. */
function armMarker(): void {
  if (stack.length > 0 && !marker && pendingRelease === null && wantsHistory()) {
    pushMarker();
  }
}

function release(): void {
  pendingRelease = null;
  if (stack.length > 0 || !marker) return;
  ownPops.push(marker);
  marker = null;
  window.history.back();
}

function add(entry: Entry): void {
  stack.push(entry);
  if (pendingRelease !== null) {
    // The overlay that just closed is being replaced by another: keep the
    // marker for it rather than stepping back and pushing a new one.
    window.clearTimeout(pendingRelease);
    pendingRelease = null;
    return;
  }
  if (stack.length === 1) armMarker();
}

function remove(entry: Entry): void {
  const i = stack.lastIndexOf(entry);
  if (i !== -1) stack.splice(i, 1);
  if (stack.length === 0 && marker && pendingRelease === null) {
    pendingRelease = window.setTimeout(release, 0);
  }
}

function onKeyDown(e: KeyboardEvent): void {
  // `defaultPrevented`: something inside the overlay already used this Escape
  // for itself — an inline editor cancelling its edit, a menu closing.
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  // Registered when this module loads, so it is the first document listener
  // and nothing registered after it hears an Escape that was spent here.
  e.stopImmediatePropagation();
  top.close();
}

function onPopState(e: PopStateEvent): void {
  const own = ownPops.shift();
  if (own) {
    e.stopImmediatePropagation();
    replaceWith(own);
    armMarker();
    return;
  }
  if (marker) {
    const left = marker;
    marker = null;
    // One step back off the marker lands on the page beneath it, which carries
    // the same router `idx`. Anything else is a longer jump — a real
    // navigation, left to the router.
    if (routerIdx(window.history.state) === routerIdx(left.state)) {
      e.stopImmediatePropagation();
      replaceWith(left);
      if (pendingRelease !== null) {
        // The overlay had already closed and its marker was about to be
        // stepped over; Back did it for us.
        window.clearTimeout(pendingRelease);
        pendingRelease = null;
        return;
      }
      stack[stack.length - 1]?.close();
      // Whatever is still open — the parent of the overlay that just closed,
      // or a top overlay that refused to (a confirm with its request in
      // flight) — gets a Back of its own. The close above commits before this
      // task runs: popstate is a discrete event, so React flushes it at once.
      window.setTimeout(armMarker, 0);
      return;
    }
  }
  if (isMarkerState(window.history.state)) {
    // A marker left over from earlier — Forward onto one, say. Nothing is open
    // for it to close, so make it an ordinary entry again.
    nativeReplace?.call(window.history, withoutMarker(window.history.state), '');
  }
  for (const entry of stack) if (entry.dismissOnPop) entry.close();
}

type HistoryOriginals = { push: HistoryWrite; replace: HistoryWrite };

function install(): () => void {
  const h = window.history;
  const w = window as Window & { __dkHistoryOriginals?: HistoryOriginals };
  // Kept on `window` so a hot reload of this module wraps the ORIGINAL methods
  // again instead of wrapping its own previous wrapper.
  w.__dkHistoryOriginals ??= { push: h.pushState, replace: h.replaceState };
  const originals = w.__dkHistoryOriginals;
  nativePush = originals.push;
  nativeReplace = originals.replace;

  h.pushState = function pushState(data, unused, url) {
    if (marker) {
      // A navigation while the marker is the current entry takes its place.
      // Stacked above it instead, the marker would be a dead entry that a later
      // Back lands on and shows the same page again.
      marker = null;
      originals.replace.call(h, data, unused, url);
      // If the overlay survives the navigation, it still needs a marker.
      window.setTimeout(armMarker, 0);
      return;
    }
    originals.push.call(h, data, unused, url);
  };
  h.replaceState = function replaceState(data, unused, url) {
    if (marker) {
      marker = { state: data, url: resolveUrl(url) };
      originals.replace.call(h, withMarker(data), unused, url);
      return;
    }
    originals.replace.call(h, data, unused, url);
  };

  // A reload while an overlay was open leaves the page sitting on its marker,
  // with nothing open. Make it an ordinary entry.
  if (isMarkerState(h.state)) originals.replace.call(h, withoutMarker(h.state), '');

  window.addEventListener('popstate', onPopState, true);
  document.addEventListener('keydown', onKeyDown);
  return () => {
    h.pushState = originals.push;
    h.replaceState = originals.replace;
    window.removeEventListener('popstate', onPopState, true);
    document.removeEventListener('keydown', onKeyDown);
  };
}

if (typeof window !== 'undefined') {
  const uninstall = install();
  import.meta.hot?.dispose(uninstall);
}

export interface OverlayEntryOptions {
  /** Also close on a history navigation that was not Back off this stack's
   *  own marker. For an anchored popover that is meaningless once the view
   *  changes; a dialog stays open, as it always has. */
  dismissOnPop?: boolean;
}

/**
 * Put an open overlay on the shared stack: Escape and Back reach it only while
 * it is on top. `onClose` may change identity every render — the latest one is
 * called — and that never moves the entry within the stack.
 *
 * Dialog, Drawer, Sheet and Menu already call this. A fifth overlay should not
 * exist (MOBILE.md, rule 9), but if one must, it calls this too.
 */
export function useOverlayEntry(
  open: boolean,
  onClose: () => void,
  opts?: OverlayEntryOptions,
): void {
  const closeRef = React.useRef(onClose);
  React.useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const dismissOnPop = opts?.dismissOnPop ?? false;
  // A layout effect, so the entry is in place in the same commit that opens
  // the overlay — before any child effect can open something on top of it.
  React.useLayoutEffect(() => {
    if (!open) return;
    const entry: Entry = { close: () => closeRef.current(), dismissOnPop };
    add(entry);
    return () => remove(entry);
  }, [open, dismissOnPop]);
}

/** Focus without scrolling — the overlay is already where it should be, and a
 *  scroll would move the page behind it. */
export function focusQuietly(el: HTMLElement | null | undefined): void {
  el?.focus({ preventScroll: true });
}

/**
 * Move focus into an overlay as it opens and give it back as it closes.
 *
 * Focus goes to the PANEL (give it `tabIndex={-1}`), never to the first field:
 * on a phone, focusing an input throws the keyboard up over a sheet the admin
 * has not read yet. A child that focused itself — an `autoFocus` field — is
 * left where it is. On close, focus returns to whatever had it when the overlay
 * opened, if that is still in the document; a route change usually takes it
 * away, and then there is nothing to return to.
 *
 * The element to return to is read DURING RENDER, not in an effect. A child's
 * `autoFocus` runs in the commit, before any effect of ours, so by the time an
 * effect could look, focus has already moved into the overlay.
 */
export function useOverlayFocus(
  open: boolean,
  panelRef: React.RefObject<HTMLElement | null>,
): void {
  const returnTo = React.useRef<HTMLElement | null>(null);
  if (!open) {
    returnTo.current = null;
  } else if (
    returnTo.current === null &&
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
  ) {
    returnTo.current = document.activeElement;
  }

  React.useEffect(() => {
    if (!open) return;
    const back = returnTo.current;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) focusQuietly(panel);
    return () => {
      // A panel still in the document has not closed: this is StrictMode's
      // rehearsal unmount in dev (Dialog, Drawer and Sheet all render nothing
      // once closed, so a real close has removed it by now). Handing focus back
      // here would pull it off an `autoFocus` field, and the re-run would then
      // park it on the panel.
      if (panel?.isConnected) return;
      if (back && back !== document.body && back.isConnected) focusQuietly(back);
    };
  }, [open, panelRef]);
}
