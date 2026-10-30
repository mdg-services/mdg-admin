/**
 * How wide the inbox's three columns are: the conversation list, the chat, and
 * the side panel (helper, AI log, details).
 *
 * The admin drags the list's and the panel's edges; the chat takes what is left.
 * What the admin asked for is kept as it was asked (a "preference"), and every
 * render turns it into widths that fit the screen it is on now: the chat never
 * drops below its floor (`CHAT_MIN`, `CHAT_MIN_SOLO`), so a width dragged out on a wide monitor cannot crush
 * the chat when the same browser is later a 1280px laptop. The list gives way
 * first to the chat, then the panel to both.
 *
 * Pure, so the arithmetic is checked on its own (scripts/columnLayout.check.ts).
 */

// The list's header (title, help, More, New) and its three views, and the
// panel's three tab names, were laid out for a fixed 320px and are cut below it:
// so 320 is the floor for both. A list that has to go is folded away instead.
export const LIST_MIN = 320;
export const LIST_MAX = 480;
export const LIST_DEFAULT = 320;
export const PANEL_MIN = 320;
export const PANEL_MAX = 560;
/** The panel's width until the admin drags it: as it was before it could be dragged. */
export const panelDefault = (is2xl: boolean) => (is2xl ? 360 : 320);
/**
 * The chat's narrowest beside the panel column: enough for its header to show a
 * usual name in full beside its buttons (a group chat's "Ramesh Yadav  Manager",
 * measured). At most 432, the chat's share at a 1280px laptop with both columns
 * at their defaults, so those defaults never change.
 */
export const CHAT_MIN = 410;
/**
 * The chat's narrowest with no panel column (1024-1279px, or the panel shut):
 * its header then also carries the Reply helper button that opens the drawer.
 */
export const CHAT_MIN_SOLO = 464;
/**
 * A list dragged narrower than this folds away, as the Hide list button does:
 * 80px past its floor, so a short pull does nothing and a firm one folds it.
 */
export const LIST_FOLD_AT = 240;

export interface ColumnPrefs {
  /** The list width the admin asked for, or null for the default. */
  list: number | null;
  /** The panel width the admin asked for, or null for the default. */
  panel: number | null;
}

export interface ColumnWidths {
  list: number;
  panel: number;
  /** The widest each may be dragged to right now, for the handles. */
  listMax: number;
  panelMax: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * @param width the inbox's own width (the screen less the app's sidebar)
 * @param listShown the list is a column beside the chat (≥ lg, not folded away)
 * @param panelShown the side panel is a column beside the chat (≥ xl, open)
 */
export function columnWidths(
  width: number,
  prefs: ColumnPrefs,
  { listShown, panelShown, is2xl }: { listShown: boolean; panelShown: boolean; is2xl: boolean },
): ColumnWidths {
  const chatMin = panelShown ? CHAT_MIN : CHAT_MIN_SOLO;
  const listMax = Math.max(
    LIST_MIN,
    Math.min(LIST_MAX, width - chatMin - (panelShown ? PANEL_MIN : 0)),
  );
  const list = listShown ? clamp(prefs.list ?? LIST_DEFAULT, LIST_MIN, listMax) : 0;
  const panelMax = Math.max(PANEL_MIN, Math.min(PANEL_MAX, width - list - chatMin));
  const panel = panelShown ? clamp(prefs.panel ?? panelDefault(is2xl), PANEL_MIN, panelMax) : 0;
  return { list, panel, listMax, panelMax };
}

/* ── Remembered in this browser ─────────────────────────────────────────── */

const KEYS = {
  list: 'dk.inbox.listWidth',
  panel: 'dk.inbox.panelWidth',
  listHidden: 'dk.inbox.listHidden',
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage switched off: the width lasts this visit only.
  }
}

function readWidth(key: string): number | null {
  const n = Number(read(key));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function readColumnPrefs(): ColumnPrefs {
  return { list: readWidth(KEYS.list), panel: readWidth(KEYS.panel) };
}

/**
 * Keeps only the widths that changed: a second tab open on the inbox writes its
 * own column and leaves the one this tab set alone.
 */
export function writeColumnPrefs(patch: Partial<ColumnPrefs>): void {
  if (patch.list !== undefined) {
    write(KEYS.list, patch.list === null ? null : String(Math.round(patch.list)));
  }
  if (patch.panel !== undefined) {
    write(KEYS.panel, patch.panel === null ? null : String(Math.round(patch.panel)));
  }
}

export function readListHidden(): boolean {
  return read(KEYS.listHidden) === '1';
}

export function writeListHidden(hidden: boolean): void {
  write(KEYS.listHidden, hidden ? '1' : null);
}
