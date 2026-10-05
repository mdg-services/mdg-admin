# Mobile hardening — the working rules and the primitive catalogue

This is the contract for every packet in the admin's mobile programme. Read it before
touching a screen. It has three parts:

1. **[The six facts](#the-six-facts)** — verified properties of this codebase. Getting one
   wrong invalidates the fix built on it.
2. **[The primitive catalogue](#the-primitive-catalogue)** — what exists, its exact exported
   API, and one line on when to reach for it.
3. **[The global rules](#the-global-rules)** — what a change has to satisfy to land.

Targets: **360×640, 390×844, 411×891** must all work. **≥768px must not change.**

Status: Phase 0 built the primitives; nine per-area packets wired every screen to them and a
reconcile pass folded the gaps they hit back into the primitives. The catalogue below is the
current API. What is still open is at the end, under [Known limits](#known-limits).

---

## The six facts

| # | Fact | Where | What it means for you |
|---|---|---|---|
| 1 | `<main>` is `overflow-y-auto overflow-x-hidden` | `AppShell.tsx` | Anything wider than the screen is **cut off, not scrollable**. Every "too wide" bug is an *unreachable control* bug. "It scrolls sideways" is never the fix — only an element that owns its own `overflow-x-auto` may scroll. |
| 2 | `cn` is plain `clsx`, **not** `tailwind-merge` | `src/lib/cn.ts` | `className="h-9"` on a `<Select>` that says `h-11 md:h-9` does **not** replace anything. Both land; stylesheet order decides. **Never fix a primitive from a call site — add a prop.** |
| 3 | `.animate-sheet-up` uses `animation-fill-mode: both` | `index.css` | A mobile sheet panel keeps its `transform` forever, and a transformed element is the containing block for any `position: fixed` descendant. This is why every overlay portals. Do not write a new one that does not. |
| 4 | `MobileTabBar` is an in-flow flex child, not `fixed` | `AppShell.tsx` | A `sticky bottom-0` inside `main` already rests **above** the tab bar — no z-index or 56px arithmetic. Only `position: fixed` elements collide with it. |
| 5 | On drill-ins the tab bar is hidden and `body { padding-bottom: 0 }` | `AppShell.tsx`, `index.css` | On `/dealers/:id` and an open Inbox thread, `main` carries the bottom inset and **nothing else does**. Any bottom-anchored control there must add its own or it lands in the gesture strip. |
| 6 | `maximum-scale=1.0` disables pinch-zoom app-wide | `index.html` | Every `truncate`, every `text-xs`, every scaled-down image has **no user recovery path**. This is why image zoom and the 16px field floor are blockers, not polish. The decision to keep it is recorded in `index.html`'s own comment. |

Two more, smaller but load-bearing:

- **`sm:` is 640px.** It fires on no phone in our target set. Reading `sm:` as "phone" is the
  single most common misreading in this codebase. **The only breakpoint is `md` (768px).**
- **`<main>` is `relative`.** It is the containing block for every absolutely positioned thing
  inside it that has no positioned ancestor of its own — the `sr-only` labels above all. Before,
  they resolved against the initial containing block, escaped `main`'s clip and made the
  DOCUMENT scroll (4,796px on a 740px phone on a Daily Sales Report), so a fling past the end of
  `main` scrolled the whole shell away.
- **The shell gives up chrome on demand.** In an open Inbox thread below md there is no app
  header (the thread's own header carries Back); while the on-screen keyboard is up there is no
  tab bar (`useSoftKeyboard`), and `--tab-bar-h` reads 0 for as long as it is gone.
- **A landscape phone is already `≥ md`** (852×393). Anything gated on `useMediaQuery('(min-width: 768px)')`
  flips when the device rotates. `Sheet` handles this; your screen may need to.

---

## The primitive catalogue

Everything below is exported from `@/components/ui` (or `@/components/charts`) unless a path
is given. Hooks live at `@/hooks/*`, the download helper at `@/lib/downloadFile`.

### Foundation

#### `Portal`
```ts
export interface PortalProps { children: React.ReactNode; container?: HTMLElement | null }
export function Portal(props: PortalProps): React.ReactPortal | null
```
**Use it when** you are writing anything `position: fixed` that can appear inside a sheet, a
drawer or a dialog. Defaults to `document.body`; renders nothing with no `document`.
Already applied inside `Dialog`, `Drawer`, `Sheet` and `Menu` — you should rarely need it
directly, because you should rarely be writing a fifth overlay.

#### `useBodyScrollLock` — `@/hooks/useBodyScrollLock`
```ts
export interface BodyScrollLockOptions { scrollerSelector?: string }
export function useBodyScrollLock(active: boolean, opts?: BodyScrollLockOptions): void
```
**Use it when** a surface of yours covers the page. The trap it exists to avoid: the app's
scroller is **not** `document.body`, it is `<main data-app-scroller>`, so the usual
`body { overflow: hidden }` recipe is a no-op here. Reference-counted, so a Dialog inside a
Drawer does not unlock the page when only the Dialog closes. While anything holds the lock it
sets `data-overlay-open` on `<html>`, which is how the toast viewport knows to drop from the top
of a phone instead of landing on a sheet's footer (see `Toast` under [Overlays](#overlays)).

#### `useSafeInsets` — `@/hooks/useSafeInsets`
```ts
export interface SafeInsets { top: number; bottom: number; tabBar: number; bottomObstruction: number }
export function useSafeInsets(): SafeInsets
```
**Use it when** a number has to enter JavaScript — a measurement, an inline style. **Prefer
CSS where it exists**: `var(--tab-bar-h)`, `var(--safe-top)`, `var(--safe-bottom)` and
`env(safe-area-inset-*)` in a `calc()` need no hook at all. `tabBar` is 56px on a list screen
and **zero** on a drill-in and at `≥ md` — never hard-code it.

#### `useStickToBottom` — `@/hooks/useStickToBottom`
```ts
export interface StickToBottomOptions { threshold?: number /* 200 */ }
export interface StickToBottom<T> { ref: React.RefObject<T>; isPinned: boolean; scrollToBottom: () => void }
export function useStickToBottom<T extends HTMLElement>(
  deps: React.DependencyList, opts?: StickToBottomOptions,
): StickToBottom<T>
```
**Use it when** new content arrives at the bottom of a scroller — the message list is the case
it was written for. Keying on item count alone misses every case where the scroller's *height*
changes, which on a phone is the common one: `interactive-widget=resizes-content` shrinks the
layout viewport when the keyboard opens and the newest messages slide below the fold.
Watches a `ResizeObserver`, `visualViewport`, **and** your `deps`. The `deps` branch is a
`useLayoutEffect` — it is the one that fires when a thread first loads, and after paint means
the reader sees the top of the page for a frame before it jumps. The two event branches stay
passive.

#### `useSafeBack` — `@/hooks/useSafeBack`
```ts
export function useSafeBack(fallback: string): () => void
```
**Use it instead of `navigate(-1)`, always.** A push notification deep-links straight into a
thread or a dealer, making it the *first* history entry — a blind back pops the user out of
the app. Pops when `history.state.idx > 0`, otherwise replaces with `fallback`.

#### `useOverlayEntry` / `useOverlayFocus` — `@/hooks/useOverlayStack`
```ts
export function useOverlayEntry(open: boolean, onClose: () => void, opts?: { dismissOnPop?: boolean }): void
export function useOverlayFocus(open: boolean, panelRef: React.RefObject<HTMLElement | null>): void
export function focusQuietly(el: HTMLElement | null | undefined): void
```
**Already inside `Dialog`, `Drawer`, `Sheet` and `Menu` — you call these only if a fifth
overlay is unavoidable** (rule 9 says it is not). `useOverlayEntry` puts an open overlay on one
module-level stack: one keydown listener sends Escape to the top entry only, so a confirm over a
drawer no longer takes the drawer down with it. Below md, or anywhere in the native shell, the
first overlay to open also pushes one history entry of its own (a *marker*), so Android's Back —
which the shell maps to `WebView.goBack()` — closes the top overlay instead of leaving the screen
and discarding what was typed in the sheet. At md in a browser nothing is pushed.

The part that is not obvious: a marker is a second history entry with the page's own URL, and on
this app the URL moves under it all the time — filter sheets rewrite the query string with
`replace`, and Documents (`?open=`), Run history (`?run=`) and the Assistant (`?session=`) are
URL-driven overlays that close themselves with a `replace`. So the module wraps
`history.replaceState` (keep the marker flag, remember what the router wrote) and
`history.pushState` (a navigation from inside an overlay takes the marker's place rather than
leaving a dead entry under the new page), and every popstate it causes or consumes is swallowed
before React Router hears it, with the landed entry rewritten to be the one it left. The router
never sees a navigation, because none happened: an overlay closed. `useSafeBack` is unaffected —
the marker spreads the router's own `idx`.

`useOverlayFocus` moves focus to the PANEL (give it `tabIndex={-1}`) on open — never to the
first field, which on a phone raises the keyboard over a sheet nobody has read — and returns it
to the opener on close. An `autoFocus` child is left where it is. The opener is read during
render, because a child's `autoFocus` runs before any effect could look.

#### `usePublishBottomBar` — `@/hooks/usePublishBottomBar`
```ts
export function usePublishBottomBar(ref: React.RefObject<HTMLElement | null>, active?: boolean): void
```
**Use it on anything pinned to the bottom of a phone screen** that a toast must not cover.
Publishes the element's height as `--bottom-bar-h` on `<html>` below md (tallest wins, removed
on unmount); the toast viewport adds it to its bottom offset. `StickyActionBar` already calls it.

#### `useSoftKeyboard` — `@/hooks/useSoftKeyboard`
```ts
export function useSoftKeyboard(): boolean
```
True while a text field has focus AND the visible viewport has shrunk to under 80% of the tallest
it has been at this width. Compared against the tallest seen, not `innerHeight`, because
`interactive-widget=resizes-content` and the native shell both shrink the layout viewport with
the keyboard. `AppShell` uses it to take the tab bar away while typing. Moving focus between two
fields does not flicker: `focusout` is read a task later.

#### `useNavBadges` — `@/hooks/useNavBadges`
```ts
export function useNavBadges(): Record<string, number> // keyed by route
```
The nav count badges — unread chats, unjudged AI answers, unconfirmed holidays — for the
sidebar AND the tab bar. There were two copies and the phone's had never learned about bank
holidays. Add a new badge here and both get it.

#### Dates — `@/lib/format`
```ts
export function formatTime(iso?: string | null): string   // the clock half of formatDateTime
```
The formatters still take the DEVICE's locale, so a phone set to English (US) prints
"Oct 05, 2026, 04:58 AM" where an en-GB one prints "05 Oct 2026, 04:58" and an en-IN one
"05 Oct 2026, 04:58 am". Pinning one shape everywhere was tried in this pass and backed out: it
would also have changed every desktop whose locale is not en-GB, which is an owner's decision,
not a layout fix. Use these formatters, not a fresh `toLocale*` call, so that decision stays a
one-file change.

#### `copyText` — `@/lib/clipboard`
```ts
export async function copyText(value: string): Promise<boolean>
```
**Use it for every copy.** Clipboard API, then a hidden read-only textarea and
`execCommand('copy')`; returns `false` when both refuse, and never throws. `false` means the
caller owes the admin a visible next step (select the value and say so, or put it in a message) —
a copy button that appears to do nothing is never acceptable. Focus is handed back afterwards.

#### `downloadFile` — `@/lib/downloadFile`
```ts
export interface DownloadFileRequest { url?: string; blob?: Blob; filename: string; contentType?: string; kind?: 'image'|'file'|'audio' }
export interface DownloadFileResult { ok: boolean; mode?: 'gallery'|'browser'; reason?: string }
export async function downloadFile(req: DownloadFileRequest): Promise<DownloadFileResult>
```
**Use `DownloadButton` unless you need the raw call.** Always returns a result — a tap that
does nothing and says nothing is the worst outcome available. The one honest limitation:
inside the native shell a locally-built blob (a CSV assembled on screen) returns
`{ ok: false, reason }`, because a `blob:` URL cannot reach Android's download manager. That
needs a backend export URL, not a front-end trick.

---

### Layout

#### `Table` — extended (this absorbed the proposed `WideTable`)
```ts
export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  freezeFirstColumn?: boolean; stickyHeader?: boolean; maxHeight?: string;
  minWidth?: string; scrollHint?: boolean; wrapperClassName?: string;
}
```
`THead / TBody / TRow / TH / TD` signatures are unchanged; a bare `<Table>` renders as before.
**Use the new props when** rows are *compared across* and the comparison is the point —
numeric grids, the IRAS dataset viewer. `scrollHint` is on by default and paints a right-edge
fade plus a "Scroll →" chip below md while the table overflows and has not been scrolled.
`stickyHeader` needs `maxHeight` to mean anything (that is what makes the wrapper a vertical
scroller — the old unconditional `sticky top-0` on `THead` never had anything to stick to).
`className` lands on the `<table>`, `wrapperClassName` on the outer positioning div.

#### `MobileCardList` — extended
```ts
export interface MobileCardKv { label: React.ReactNode; value: React.ReactNode; numeric?: boolean }
export interface MobileCard {
  key: string; onClick?: () => void; primary: React.ReactNode; primaryRight?: React.ReactNode;
  secondary?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode;
  kv?: MobileCardKv[]; primaryRightWidth?: 'auto'|'clamp'; tone?: 'default'|'muted';
}
export interface MobileCardListProps { cards: MobileCard[]; className?: string; visibility?: 'below-md'|'all' }
```
**Use `kv` when** a table has six to ten columns and the extras would otherwise be dropped
from the phone card. `primaryRightWidth="clamp"` when the right rail carries two or three
badges. `visibility="all"` only when the breakpoint has already been decided in JS.
Every text slot now carries `min-w-0 break-words`.

A card with `onClick` carries a 16px chevron on its right edge below md (`pr-8 md:pr-3` makes
room for it) and a pressed paint on a touch screen. Before it, a card that opens something and a
card that does not looked identical on a phone, and two screens had started drawing their own
cue.

`actions` is **dropped, not rendered**, on a card that also has `onClick`. A button inside a
button is invalid HTML and on Android the inner one never fires, so the rule is enforced in the
primitive rather than left to each caller. Give a card one or the other.

#### `DataList` — new (this absorbed the proposed `ResponsiveTable`)
```ts
export type DataColumnSlot = 'primary'|'primaryRight'|'secondary'|'meta'|'kv'|'hidden';
export interface DataColumn<T> {
  id: string; header: React.ReactNode; cell: (row: T) => React.ReactNode;
  mobile?: DataColumnSlot; mobileLabel?: React.ReactNode; align?: 'left'|'right';
  numeric?: boolean; width?: string; truncate?: boolean; thClassName?: string; tdClassName?: string;
}
export interface DataListProps<T> {
  rows: readonly T[]; columns: readonly DataColumn<T>[]; rowKey: (row: T) => string;
  onRowClick?: (row: T) => void; rowActions?: (row: T) => React.ReactNode;
  cardActions?: (row: T) => React.ReactNode; rowTone?: (row: T) => 'default' | 'muted';
  empty?: React.ReactNode; loading?: boolean;
  skeletonRows?: number; freezeFirstColumn?: boolean; stickyHeader?: boolean;
  maxHeight?: string; minWidth?: string; shape?: 'auto'|'table'|'cards'; className?: string;
}
export function DataList<T>(props: DataListProps<T>): JSX.Element
```
**Mandatory for any new table, and for any table you are already touching in this programme.
It is not a 27-file migration** — correct existing `Table` + `MobileCardList` pairs stay as
they are. One column definition produces both shapes, exactly one branch mounts, and the
desktop branch emits `Table`/`THead`/`TRow`/`TD` verbatim so a migrated table is unchanged at
`≥ md`. `mobile` defaults to `'kv'`, except that the first column becomes the card title when
no column claims `'primary'`.

Note: with both `onRowClick` and `rowActions`, the card's **title** is the tap target and the
menu sits beside it — buttons do not nest. Whole-card tap survives whenever there is no menu.

`desktop: false` on a column keeps it out of the md table — header, cells, skeleton — while the
card still renders it in its `mobile` slot. It is the other half of `mobile: 'hidden'`: one drops a
column from the card, the other from the table. Today's board needs both — five halo'd status
badges as table cells at md, and one tile grid in their place on the card, where the five stacked
badges overlapped so a tap on one opened the next.

`rowTone` dims one row — a retired catalog task, an already-handled queue row. Both tables that
needed it carried `opacity-60` on the `<tr>`, which `DataList` could not express, so neither
could adopt it. It maps onto the table row's own dim at md+ and onto `MobileCard.tone` below.

#### `KeyValueList` — new (this absorbed the proposed `KVRow` and `RecordCardForm`'s field list)
```ts
export interface KeyValueItem {
  key: string; label: React.ReactNode; value: React.ReactNode;
  numeric?: boolean; block?: boolean; mono?: boolean; copyable?: boolean; primary?: boolean;
}
export interface KeyValueListProps {
  items: readonly KeyValueItem[]; layout?: 'rows'|'stacked'; labelWidth?: string;
  columnsAtMd?: 1|2; collapseAfter?: number; className?: string;
}
```
**Use it for** one record's detail, or a wide table's per-row expansion. It is the shape that
reliably reads at 360px: one stacked column below md, `break-words` on every value and
`break-all` under `mono`. It replaces every `grid-cols-[140px_1fr]` in the app — those spend a
third of a 294px card on labels and leave ~142px for an email, which CSS will not break at `@`
or `.`. `collapseAfter` is for a 36-field dataset row.
Requires a `ToastProvider` ancestor when any item is `copyable` (the app root has one).
A `copyable` item's `<dd>` carries `select-text` itself — no caller has to pass it down.

`inlineBelowMd` puts each non-`block` pair on one line below md — label left, value right,
`numeric` values right-aligned so a column of figures ends on the same digit. For short labels and
short figures only (a tank's dip, water and stock: 48px a pair stacked, a three-figure box 172px).
When a label does run long, the LABEL wraps and a `numeric` figure stays whole (`whitespace-nowrap`
below md) — before, "6,06,12,345 L" broke as "6,06,12,345" over "L". A label long enough to crowd
the figure is still better as a `block` item. At md the list is exactly what `layout` draws
without it.

Known limit: `dt` typography is fixed (`text-sm text-text-muted`). Three existing field lists
render `text-xs uppercase tracking-wide text-text-subtle` labels, so they cannot adopt this
without a desktop diff, and they stay as local helpers. See [Known limits](#known-limits).

#### `ActionRow` — new
```ts
export interface ActionRowProps {
  children: React.ReactNode; below?: 'stack'|'wrap'|'row'; align?: 'start'|'end'|'between'; className?: string;
}
```
**Use it for every row of buttons.** `stack` (default) is `flex-col-reverse items-stretch`
below md and the row it is today at md — `flex-col-reverse` keeps the primary action last in
the DOM, where the tab order wants it, and first on screen, where the thumb is.
`Dialog`'s and `Drawer`'s footers already render through it.

#### `StickyActionBar` — new (this absorbed the proposed `MobileSaveBar`)
```ts
export interface StickyActionBarProps {
  summary?: React.ReactNode; children: React.ReactNode; hidden?: boolean;
  mode?: 'sticky'|'fixed'; below?: 'stack'|'wrap';
  surface?: 'bar'|'card'; visibility?: 'all'|'below-md';
  summaryOnMobile?: boolean; className?: string;
}
```
**Use it when** a long editing screen's Save would otherwise sit at the natural end of 1,200px
of form, or in a `PageHeader` above it. Default `mode="sticky"` — the tab bar is in-flow, so a
sticky bar inside `main` already rests above it (fact 4) and needs no arithmetic. Reach for
`'fixed'` only when the content is not inside the page scroller; it reads `useSafeInsets()`
and clears the live tab-bar height itself. **Both modes carry their own bottom inset**,
because on a drill-in nothing else does (fact 5).

- `below` is passed to the inner `ActionRow`. `'wrap'` for three short labels — stacked, Undo /
  Discard all / Review & apply cost 148px of a 640px screen.
- `surface="card"` draws the rounded `Card` chrome instead of the full-bleed `border-t` strip,
  with `pt-4` / `md:pb-4` so it reproduces a `Card` + `CardContent` (`p-4`) exactly. It is for a
  save bar that is a plain card at the top of a desktop page and only becomes a bar on a phone
  — pair it with `className="order-last md:static md:order-none"`. Both work-list tabs were
  hand-rolling this, each with its own spelling of the safe-area inset.
- `visibility="below-md"` instead of `className="md:hidden"`, which only worked because the
  root happens to have no display class of its own.
- It publishes its own height (`usePublishBottomBar`), so below md a toast lands above the bar
  instead of on its Save button.

#### `FilterBar` — new (this absorbed the proposed `FilterSheet`)
```ts
export interface FilterBarProps {
  children: React.ReactNode; activeCount?: number; onClear?: () => void;
  columnsAtMd?: 2|3|4|5; contentClassName?: string;
  chips?: React.ReactNode; className?: string;
}
```
**Use it for** any page whose filters cost more than about one screen-third on a phone. At
`≥ md` it is a `Card` + `grid gap-3 md:grid-cols-N`, byte-identical to today. Below md it is
one 44px "Filters (n)" button opening the shared `Sheet`. Exactly one branch mounts, so
**filter state must live in the caller** (it already does everywhere). `chips` is a slot, not
derived — `children` is opaque markup and the bar cannot know what your filters are.

`contentClassName` **replaces** the md+ grid classes outright, `columnsAtMd` included. Use it
where the desktop card has a ladder a single count cannot express — `sm:grid-cols-2
lg:grid-cols-5` is the shape both Activity and the Kavach work queue have, and neither 2 nor 5
reproduces it without regressing a real width. It replaces rather than merges because `cn` is
clsx: two `grid-cols-*` in one list is decided by stylesheet order, not by which you wrote last.

**Two traps.** (1) Below md the children live inside `Sheet`, and `Sheet` returns null when
closed — so the controls **unmount between openings** and anything debounced in there loses its
pending commit. A search typed and confirmed with "Show results" inside the debounce searched
for nothing. Flush on unmount. (2) A landscape phone is already ≥ md, so rotation swaps the
branch and remounts the controls; state in the caller survives, state inside a child does not.

#### `CardHeader action` — extended (this absorbed the proposed `SectionHeader`)
```ts
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  action?: React.ReactNode; align?: 'start'|'center'; padding?: 'default'|'comfortable';
}
```
**Use `action` instead of a second child** whenever the right-hand slot is a button. As a
child it is just another item in a `justify-between` row that cannot wrap, and a
`whitespace-nowrap` Button in a 296px card then squeezes the title to nothing. With `action`,
`align` and `padding` all left alone the emitted classes are byte-identical to today.

Below md the header with an `action` is a **wrapping row**, not a column: the title asks for
`12rem` and takes what is left, so a 44px glyph (the "How this works" play icon on ~14 cards)
sits on the title's line instead of costing a 52px row of its own, and a text button that does
not fit beside a 12rem title wraps under it as it always did. `actionWidth="full"` keeps the
column. Without an `action`, a trailing `<svg>` child no longer shrinks below md — long subtitles
had squashed the 18px icons to 4px slivers. Both are restored exactly at md.

`align="center"` and `padding="comfortable"` (`py-4`) exist because five call sites were passing
`className="py-4 md:items-center"` and getting the right answer only by accident of emission
order — `items-center` happens to be emitted after `items-start`, and `py-4` after `py-3`. They
are the shape a hand-rolled `p-4` section header had.

#### `PageHeader` — extended (`@/components/layout/PageHeader`)
```ts
tools?: React.ReactNode;   // icon-only utilities: a Refresh IconButton, <HowThisWorks variant="icon">
```
**Use `tools` for icon-only utilities, not `actions`.** Below md they sit at the right end of the
title's line (`-my-2` keeps a 28px title line from growing); in `actions` they wrapped onto a
44px row of their own under everything else — on the Kavach work queue that row was part of why
the first queue row started at 470px of a 676px screen. At md they are appended to the END of the
actions row, so moving a trailing Refresh + help pair out of `actions` and into `tools` is a no-op
on a desktop. Decided in JS (`useMediaQuery`), so the icons mount once. In `dense` mode they join
the actions on the title row at every width.

The `dense` subtitle wraps to two lines below md (`line-clamp-2`) and is the single truncated
line it was at md. On a dealer it carries the outlet's address, which is printed nowhere else.

#### `Tabs` — `pinnedActiveBelowMd`
```ts
pinnedActive?: TabItem;          // the active tab when it lives in the overflow menu
pinnedActiveBelowMd?: boolean;   // show that chip below md only
```
When the open tab is one the strip does not show (it is in the ⋮ menu), `pinnedActive` pins a
selected chip naming it beside the menu. `pinnedActiveBelowMd` keeps that a phone-only chip, so
a desktop strip is byte-identical.

---

#### `FieldCardList`

A list of rows that are **edited** rather than read — the shape §6's decision rule prescribes as
"Card + `KeyValueList` per row", which nothing could actually build because `KeyValueList` takes
values, not field slots.

```ts
<FieldCardList
  aria-label="Meter readings for HIGH SPEED DIESEL"
  rowHeader="Nozzle"
  columns={[{ key: 'TOT_READING', header: 'Reading this morning', numeric: true }]}
  cards={[{ key: 'n2', heading: 'Nozzle 2', headingRight: 'Sold 412 L',
            fields: [{ key: 'TOT_READING', label: 'Reading this morning',
                       control: <input value="4,52,180" … />,
                       note: <p>Carried from 30 Aug — change it to this morning’s meter
                                reading.</p> }],
            action: <Menu … /> }]}
/>
```

Below md one card per row, label over control, note under it. At md the same `FieldCardField[]`
feeds a `Table density="compact"`, one row per record; a field with no matching column is stacked
inside the identity cell, which is how a five-field delivery stays a four-column table. Give a
column the exported `HEADING_RIGHT_COLUMN` key and it prints the row's live figure.

The shift sheet's own boxes open holding the previous day's figure rather than empty, so the
note under one is usually the sentence asking for this morning's, and the reference figure is
the value in the control. The control shows it grouped (`4,52,180`) while nobody is in it and
as plain digits while it has focus — the swap is the CALLER'S, off the one `focusedId` it
already keeps for the sticky bar's accessory, which is what keeps the rule below true.

**One shape is mounted, decided in JS.** Both shapes carry live editors, so building both would
double every input in the document. The usual objection — a rotation past 768px remounts the row
and discards what the editor held — does not apply, because this primitive is only for callers
that keep no local state in their fields. Do not adopt it in one that does. Display state a field
needs — which box has focus, so its value can be shown grouped or plain — belongs to the caller
for the same reason: held in the field, a rotation would remount it into the wrong shape.

The card's heading row centres its items and pulls the action's vertical margin in (`-my-2`),
so a 44px menu trigger beside a 20px heading no longer sets a 44px row: about 18px back on every
card of the shift sheet, the 44px hit area unchanged.

Four or five columns is the ceiling: `main` is `overflow-x-hidden`, so a wider table is cut off,
not scrolled. `scrollHint` and `freezeFirstColumn` are deliberately off — a frozen identity column
would paint a cell on top of a live field.

### Controls

#### `Button` — extended
```ts
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'; loading?: boolean;
  leftIcon?: React.ReactNode; rightIcon?: React.ReactNode;
  padding?: 'default'|'none'; align?: 'center'|'start';
}
```
```ts
tone?: 'default' | 'brand';   // brand-coloured label on ghost/secondary; ignored on filled variants
```
`tone="brand"` exists because `className="text-brand"` on a ghost Button never applied — the
variant's own `text-text` is emitted later — and four link-like actions rendered black.

Every variant also carries a **touch** paint: on `(hover: none)` screens the hover tint is
cancelled and the same colour is painted while the finger is down (`:active`). Android leaves
`:hover` on whatever was tapped last, so a "Filters" button stayed tinted after its sheet closed
and read as "filters on". The desktop `hover:` classes are untouched — they were NOT moved into a
`(hover: hover)` query, because a media-wrapped variant is emitted after every plain one and would
start beating hover colours call sites pass in. `SheetItem`, `MenuItem` and tappable
`MobileCardList` cards do the same.

`padding="none"` and `align="start"` exist because neither can be reached from a call site: a
`className="px-0"` is emitted **before** `px-3` and silently loses, and `justify-start` happens
to win only because it is emitted after `justify-center`. Three call sites — `KeyValueList`'s
own "Show all N fields" among them — shipped a dead `px-0`. Reach for `align="start"` for a
disclosure or a left-aligned menu-ish row; the default is unchanged.

#### `IconButton` — new
```ts
export type IconButtonSize = 'xs' | 'sm' | 'md';
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  'aria-label': string; children: React.ReactNode;
  variant?: ButtonVariant; size?: IconButtonSize; loading?: boolean;
}
```
**Use it for every icon-only button.** `Button size="sm"` floors the *height* at 44px and says
nothing about width, so an icon-only Button is 40×44. This is a real square: `h-11 w-11` below
md, `md:h-6 md:w-6` (xs) / `md:h-8 md:w-8` (sm) / `md:h-9 md:w-9` (md). `aria-label` is required
by the type — without it the control is announced as "button".

Pick `xs` for an inline glyph whose desktop paint is deliberately tiny — a cancel-reply X in a
quote strip, a remove-file X on a chip, an upload glyph in a card header. Those were 16-23px
squares built out of `p-1`, and converting them at `sm` grows them by ~10px on desktop for no
mobile gain, since below md every size is the same 44px square.

#### `.tap-target` — CSS utility in `index.css`
**Use it instead of `IconButton` when** the *painted* size is load-bearing and cannot grow: a
reaction chip on a chat bubble, an inline "Retry" inside a sentence, a "+3 more" badge. It
adds a `-12px` halo via `::after` and paints nothing; the halo disappears at `≥ md`.
**Caveat:** adjacent halos overlap — keep ≥8px between two `.tap-target` siblings.

**`.tap-halo`** is the same halo without `position: relative`. `.tap-target` is emitted after
`.absolute`, so putting it on an absolutely positioned control (an overlay's remove/close X)
silently unpins it. Use `.tap-halo` there — the element already establishes its own containing
block.

#### `Checkbox` — new
```ts
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'|'size'> {
  label?: React.ReactNode; hint?: React.ReactNode;
  align?: 'center'|'start'; labelClassName?: string;
}
```
**Use it for every checkbox.** The whole `<label>` is the target (`min-h-11 md:min-h-0`); the
box is `h-5 w-5 md:h-4 md:w-4`. The ref is forwarded, so `{...register('active')}` works —
`className` lands on the input, `labelClassName` on the label.

`align="start"` puts the box beside the FIRST line of a label that runs to two — the identity
warning in the shift-data review, the festival enable box. It is a prop and not a class because
a call-site `items-start` loses to the base `items-center`; two packets hit that and gave up on
the alignment.

#### `SegmentedControl` — new
```ts
export interface SegmentedOption<V extends string> { value: V; label: React.ReactNode; icon?: React.ReactNode }
export interface SegmentedControlProps<V extends string> {
  value: V; onChange: (v: V) => void; options: SegmentedOption<V>[];
  fullWidthOnMobile?: boolean; 'aria-label'?: string; className?: string;
}
```
**Use it for** two to four mutually exclusive modes that change what the surrounding form
does. `aria-pressed`, not `role="tablist"` — a tablist promises panel switching.
`min-h-11 md:min-h-8`.

#### `Copyable` — new (this absorbed the proposed `CopyableValue`)
```ts
export interface CopyableProps {
  value: string; label?: React.ReactNode; mono?: boolean;
  mode?: 'field'|'inline'; toastLabel?: string; className?: string;
}
```
**Use `mode="field"` for any value the admin must read in full or transcribe** — a one-time
password, a login email, a dealer code. It renders a real `<input readOnly>` because
`index.css` sets `user-select: none` on `#root` and only inputs are exempted: a value in a
`<div>` **cannot be selected or long-press-copied on a phone at all**. `mode="inline"` is for
a value inside prose and marks the span **`select-text`** — Tailwind's own class, because the
native shell's `contextmenu` allow-list is `closest('input, textarea, [contenteditable="true"],
.select-text')`, matched by class NAME. `.selectable` restores `user-select` but NOT the
long-press callout, which made the component's own "long-press it and choose Copy" untrue in
the shell. `KeyValueList` applies `select-text` to a `copyable` value's `<dd>` for the same
reason. **Wherever text must be selectable, write `select-text`.**
The copy itself has three rungs and never fails silently: `copyText` (Clipboard API →
`execCommand`) → select the text and say so.

Below md `mode="field"` is a read-only **textarea** that grows to show the whole value
(`break-all`), not a one-line input: a revealed portal login is often a 52-character email, and
in a 232px field the admin reading it out saw 22 characters. A textarea is on the same selection
and long-press allow-lists as an input. At md it is the `<Input>` it always was.

#### `InfoBadge` — new
```ts
export interface InfoBadgeProps {
  intent?: Intent; label: React.ReactNode; detail: React.ReactNode;
  sheetTitle?: string; className?: string; badgeClassName?: string;
}
```
**Use it wherever a badge's real meaning currently lives in `title=`.** At `≥ md` it renders
today's `<Badge title={detail}>` unchanged; below md it is a tappable badge with an info glyph
that opens a `Sheet`. Pass `detail` as a plain string where you can — only a string can ride
in `title`, so a rich node loses the desktop tooltip.

**Not legal inside a tappable row.** Below md this is a real `<button>`, so putting one in a
`MobileCard` with an `onClick`, or a `DataList` row with `onRowClick`, nests a button in a
button — invalid, and on Android the inner one never fires. Lift the badge out of the tap
target, as the Credit & DOD history card does.

`className` lands on the `Badge` at md+ and on the wrapping `<button>` below md, so the same
string means two different things at two widths. Anything that sizes or tints the pill goes in
`badgeClassName`, which always reaches the `Badge`.

#### `ConfirmDialog` — new
```ts
export interface ConfirmDialogProps {
  open: boolean; onCancel: () => void; onConfirm: () => void; title: string;
  description?: React.ReactNode; confirmLabel?: string; cancelLabel?: string;
  confirmVariant?: 'primary'|'danger'; size?: 'sm'|'md'|'lg'; loading?: boolean;
}
```
**Use it instead of `window.confirm()`, always, and instead of hand-rolling the shape.** Inside
the WebView `confirm()` is an OS alert we do not own, and on Android it is answered only if the
host implements `onJsConfirm` — otherwise it returns false and the destructive action silently
does nothing. Backdrop and Escape go inert while `loading`. `size` defaults to `'sm'` — pass `'md'` when you
are replacing a hand-rolled confirm that was already `max-w-lg`, so the migration is a no-op at
≥ md (three dialogs narrowed by adopting this before the prop existed).

#### `ReadonlyField` — added to `Input.tsx`
```ts
export function ReadonlyField(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element
```
**Use it for** a computed value shown where a field would be (`h-11 md:h-9`, the same box the
fields draw), so a derived readout does not sit 8px short of the `Input`s beside it.

#### Small changes to existing controls

- **The More sheet** (`MobileTabBar`) is two headed sections, "Daily work" and "Setup" (the
  super-admin catalogs and settings), when both have items. The labels are the sidebar's and
  were not changed.
- **`HowThisWorks`** — the icon variant is named after its guide (`How this works: <label>`); two
  side by side used to read out identically. The dialog's sentence now says what the list is: a
  video of this screen, one on the subject (`fit: 'subject'` — a topic match is always restated as
  subject), or only the library. It used to promise "this exact screen" on ~94 screens that have
  no such video.
- **`DealerChip`** — the link is a 44px square floor below md (`min-h-11 min-w-11`), not a
  36×34 / 28×34 chip; `md:` resets give a desktop row its 34px chip back.
- **`StatusChip`** — sentence case below md ("Active", "On demand"), today's capitals at md.
- **`Badge` / `StatusChip` / toast glyphs (`INTENT_CLASSES`) and `Callout`** — the text is the
  `strong` shade below md, today's shade from md. Measured on a 12px label: amber 2.9:1, green
  3.0:1, red 3.95:1, blue 4.24:1, against 4.5:1 needed; the strong shades are 6.4 / 6.8 / 6.5 /
  7.2:1. A hand-rolled `bg-*-soft` box in a page should do the same:
  `text-warning-strong md:text-warning`.

---

### Media and downloads

#### `DownloadButton` — new
```ts
export interface DownloadButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  url?: string; blob?: () => Blob | Promise<Blob>; filename: string; contentType?: string;
  kind?: 'image'|'file'|'audio'; label?: string; variant?: 'primary'|'secondary'|'ghost';
  size?: ButtonSize; onDone?: (mode: 'gallery'|'browser') => void;
}
export function filenameFromUrl(url: string, fallback: string): string
```
**Use it for every download.** Spins while in flight, toasts `result.reason` on failure, and
toasts the destination on success unless you pass `onDone`.

#### `ZoomableImage` — new
```ts
export interface ZoomableImageProps {
  src: string; alt: string; maxScale?: number /* 4 */; doubleTapScale?: number /* 2.5 */;
  onZoomChange?: (scale: number) => void; className?: string;
}
```
**Use it via `ImageLightbox`** unless you have a bare photo somewhere else. Pinch, drag-to-pan
while zoomed, double-tap to toggle; `touch-action: none` **only while scale > 1**, so at 1× the
sheet it sits in can still be dragged away. At `≥ md` it is a plain `<img>` with no handlers.
`className` applies to the `<img>` in both branches — sizing belongs on the element it
constrains.

#### `ImageLightbox` — extended
```ts
// existing fields unchanged, plus:
zoomable?: boolean;              // default true
onOpenExternally?: () => void;
```
**Use it for every photograph.** The image is now
`mx-auto max-h-[60dvh] w-auto max-w-full rounded-sm object-contain md:max-h-[70vh]` — without
`max-w-full` a 4000×3000 landscape photo rendered ~597px wide inside a 360px sheet and opened
on its left third. The `downloadUrl` branch now goes through `DownloadButton`.

#### Uploading a photograph from a forecourt phone — the slip pattern

`src/lib/uploadSlipPhoto.ts` is the shape to copy for **any** photograph an operator sends from
a phone, and it exists because "reading the slip" is the first upload in this admin where the
connection is part of the design rather than an afterthought.

```ts
uploadSlipPhoto({ dealerId, file, onStage, onProgress, signal }): Promise<SlipPhotoUpload>
```

Four rules, each paid for by something that goes wrong without it:

1. **Shrink before you presign.** The presigned PUT carries the size and type the server was
   told about, so shrinking afterwards makes both describe a file that was never sent — and the
   server's cheap size refusal then refuses the wrong thing.
2. **PUT with `XMLHttpRequest`, never `fetch`.** `fetch` reports no upload progress at all, and
   a 4 MB photo on 2G is well over a minute. A spinner that long is indistinguishable from a
   hang, so the operator retakes the photo and the upload doubles. XHR is the only browser API
   that reports bytes sent.
3. **Offer `Stop` at every stage** — `xhr.abort()` for the PUT, an `AbortController` for the
   read — and abort on unmount. A slow photograph must never be able to hold up the work it was
   meant to save.
4. **Enumerate the mime types on the `<input>`; never `image/*`.** A browser canvas cannot
   decode HEIC, so a HEIC can neither be shrunk before it is sent nor shown back on the screen
   where it is supposed to be checked. And clear `input.value` after every pick, or choosing the
   same file twice fires no event — which is exactly what somebody does after a blurred first
   try.

`compressImage` now takes `{ maxEdge, quality, minBytes }`. **Its defaults do not move**:
1,600px at q0.70 was chosen so a person could eyeball a handwritten register over 2G, and every
existing caller is tuned to it. The slip passes 2,400px at q0.85 because its picture is read
character by character rather than for the gist — one lost pixel on the tail of `48615.550` is
hundreds of litres. That is a per-caller judgement, made at the call site.

#### `WideReportViewer` — new
```ts
export interface WideReportViewerProps {
  kind: 'html'|'image'; src: string; title: string; preview?: React.ReactNode;
  actions?: React.ReactNode; desktopHeightClass?: string; className?: string;
}
```
**Use it for** a wide artifact we did not author and cannot restyle — the DSR day book. Inline
at `≥ md` exactly as today; below md a tappable card that opens a full-screen `Drawer`. The
`figures` slot (the native figure list) renders BELOW the frame in that drawer: the button that
opens it promises the report, and with the figures first the day book started ~3,800px down a
360px screen, its zoom buttons with it.
**It is only half the answer.** Full screen does not make third-party HTML narrow. Pair it
with a native figure list built from the report's own digest — one stacked `KeyValueList`
block per product — so no figure is lost when the frame is useless.

---

### Overlays

`Dialog`, `Drawer`, `Sheet` and `Menu` all now portal to `<body>`, lock the page scroller,
dismiss on `pointerdown` (not `mousedown` — a touch fires `mousedown` only after the tap
resolves, which read as a backdrop ignoring the first tap), cap their height in `dvh`, scroll
internally with `overscroll-contain`, and share `z-[var(--z-overlay)]`. Because they are
siblings in the body, **the one opened last paints on top** — the old hand-picked 50/60 split
is gone.

All four share **one overlay stack** (`useOverlayEntry`, under Foundation): Escape closes only
the top overlay, and below md (or in the native shell) Android's Back does too, through a history
marker the stack manages. Dialog, Drawer and Sheet are named by their title (`aria-labelledby`)
and move focus onto their panel when they open, back to the opener when they close. Their
scrolling body carries `data-overlay-body`, which lets index.css's grid min-width rule reach a
portalled body below md — without it one long unbroken error line widened a run's detail dialog
to ~1,500px.

**Toasts** sit above anything published as `--bottom-bar-h` (the composer, a `StickyActionBar`)
and above the tab bar; while an overlay is open below md they drop from the TOP of the screen,
because the bottom belongs to the sheet's own footer.

- `Dialog` — centred modal at `≥ md`, full-height bottom sheet below. Footer is an
  `ActionRow below="stack"`.
- `Dialog` and `Drawer` share three props:
  - `help?: ReactNode` — the title line's control, in practice `<HowThisWorks variant="icon">`.
    Below md it stays beside the title's FIRST line (the title takes `flex-1` and wraps); at md it
    is the `flex flex-wrap items-center gap-2` row two dozen call sites hand-rolled inside
    `title`, so moving one onto `help` is a no-op on a desktop. Five used `inline-flex` instead
    (`RequestEvidenceDialog`, `VerifyTaskDrawer`, the Standing remarks drawer,
    `AskDocumentDialog`, `RemindAllDialog`); the one measured, Standing remarks at 1280, came out
    pixel-identical on `help` too — check the other four with a pixel diff of the open overlay.
    `Sheet` takes the same `help` prop for its title row (the thread's kebab sheet is the live
    case), kept outside the element the sheet's `aria-labelledby` points at, so the sheet is
    named "Actions" and not "Actions How this works: Conversation".
  - `footerBelow?: 'stack' | 'wrap' | 'row'` — the footer's layout below md (default `'stack'`).
    Pass `'wrap'` or `'row'` for short labels over a form the keyboard will be up for: three
    stacked buttons are 165px, and with the keyboard open the send-back reason box had 32px of
    body. Every value is the same right-aligned row at md.
  - `description` renders through `ClampedText`: two lines and a "more" below md (the header does
    not scroll), unclamped at md. It used to be a bare `line-clamp-2` that cut "This will message
    the dealer" before "the dealer". New prop `animateIn?: boolean` (default `true`) — pass `false`
  only from a Dialog that is replacing another Dialog already on screen. The bottom-sheet
  entrance is mount-driven, so a lazily-loaded dialog taking over from its Suspense fallback
  sheet would otherwise start at `translateY(100%)` again and the panel would drop off the
  bottom and climb back up. `DealerServicesTab` is the live case. No effect at `≥ md`, where
  the entrance is `md:animate-none` either way.
- `Drawer` — right-side panel at `≥ md`, bottom sheet below. Same footer.
- `Sheet` / `SheetItem` — mobile-only (`md:hidden`) bottom sheet for menu lists. Locks scroll
  only below md, because a landscape phone is already `≥ md` and would otherwise be frozen
  behind a sheet it can no longer see.
- `Menu` / `MenuItem` / `MenuSeparator` — anchored popover at `≥ md`, bottom sheet below, with
  Escape, roving arrow-key focus and focus return. Below md its title and rows are styled like
  `Sheet`'s (14px title, 48px rows, `px-4`), so the two bottom sheets in the app look like one
  thing; the popover's caption and 36px rows are restored at md. New prop
  `triggerShape?: 'icon' | 'auto'` — `'icon'` (default) is the square 44/36px hit area,
  `'auto'` sizes to a labelled trigger. Do not try to widen the trigger with
  `triggerClassName`; `cn` is clsx (fact 2).

---

### Charts

#### `ColumnChart` — extended
```ts
minColumnPx?: number;        // give every column this width and scroll the plot in its own strip
minColumnPxBelowMd?: number; // the same, below md only
maxColumns?: number;         // below md, plot only the newest N with a toggle
defaultTableOpen?: boolean;
tableOpenBelowMd?: boolean;  // open the value table below md only
```
**Use the `BelowMd` variants**, not a caller-side `isMd ? 14 : 0`. The chart already holds that
media query, and two call sites were each opening a second subscription to answer a question it
had already answered. They matter because the unqualified props are wrong on desktop: a
62-column window with a 14px floor is a 990px strip inside a 700px drawer, and
`defaultTableOpen` opens a `<details>` that a caller passing `tableCaption` also renders at md.

Three behaviour changes you inherit: columns now respond to `onPointerDown` (there was **no**
tap path — iOS does not focus a `<button>` on tap, so a day's value was unobtainable); the
`<details>` value table renders below md whether or not you passed `tableCaption`; and the
`<summary>` is a 44px target. **Below ~20px per mark, reduce the window rather than thinning
the mark** — that is what `maxColumns` is for.

#### `StatTileGrid` — new, and `StatTile` fixed
```ts
export interface StatTileGridProps {
  children: React.ReactNode; columnsAtMd?: 2|3|4; wideValues?: boolean; className?: string;
}
```
Below md it is always 2 columns, or **1 when `wideValues`** — currency and litre figures do not
fit 126px. Only the `md` count is yours to choose. `StatTile`'s value is now `break-words`, not
`truncate`: truncating the one number the tile exists to show is worse than any alternative.

`Meter`'s label (same file) is `break-words md:truncate`. A meter's label is often the only
place the PERIOD is named — "Points on Sat, 12 Jul 2026" wants ~200px of the ~190px it gets at
360px, and the half that got cut was the date, i.e. the whole content. A phone has the vertical
room and not the horizontal one; a desktop row keeps its single line.

#### `DateRangeFilter` — extended
```ts
mobilePresets?: 'menu' | 'chips';   // default 'menu'
mobileCustomInSheet?: boolean;      // default false
```
`'menu'` collapses five preset chips (three 44px rows ≈ 132px at 360px) into one trigger
showing the active window. Exactly one shape mounts, so `fieldsId` is never in the document
twice.

---

## The global rules

A change that breaks one of these is rejected regardless of what it fixes.

### 1. One breakpoint

`md` = 768px. **Never introduce a new `sm:` or `lg:` class.** Leave existing `sm:` where the
0-639px base layout is already correct; change it to `md:` only where it produces a
desktop-shaped layout in the 640-767px band.

### 2. Touch targets — 44×44 below md, desktop density restored

In order of preference:

1. **Grow the control**: `min-h-11 md:min-h-0`, `h-11 w-11 md:h-8 md:w-8`, `h-5 w-5 md:h-4 md:w-4`.
2. **Use `IconButton`** for anything icon-only.
3. **Use `.tap-target`** when the painted size is load-bearing.
4. **Wrap in a `min-h-11` row** — for a checkbox, use `Checkbox` and make the whole label the target.

Never rely on `hover:bg-…` as the only cue that something is tappable. Touch never renders it.

### 3. Safe areas — who owns which inset

| Inset | Owner |
|---|---|
| top | `body { padding-top: env(safe-area-inset-top) }`, global. **A `position: fixed` element does not inherit it** and must add its own. |
| bottom, tab-bar screens | `MobileTabBar` via `.safe-bottom`. It is in-flow, so a `sticky bottom-0` inside `main` sits above it. |
| bottom, drill-in screens | `main`'s own `pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6`. |
| bottom, any fixed/sticky element | **Itself, always**: `pb-[max(env(safe-area-inset-bottom),0.75rem)] md:pb-3`. |

Never hard-code 34px, 24px or 56px. Read `useSafeInsets()` or the CSS custom properties.

### 4. No desktop regression — the mechanical rule

**Every mobile change is additive with an `md:` restore.** If you change a base class, add its
`md:` counterpart in the same edit. At ≥768px the rendered output must be byte-identical.

*Reviewer check:* for every changed layout class in the diff there is a corresponding `md:`
class restoring the previous value — or the change is inside a `md:hidden` / `hidden md:block`
branch, or inside a branch that only mounts below md, or it is a genuinely new mobile-only
element.

This is the rule that decides arguments. Where §1's spec and this rule disagree, this rule
wins, and you say so in the PR.

### 5. Never fix a primitive from a call site

`cn` is `clsx`. Change the primitive, or add a prop or variant.

**`tailwind-merge` is deliberately not being added** — it would silently *shrink* the targets
listed below by making the override win, and several of them are 44px floors.

#### Dead overrides — measured against the built stylesheet

Equal specificity, so the class emitted LATER wins. These were checked by searching
`dist/assets/index-*.css` for each selector's byte offset; re-run that check rather than
guessing, and note that any `md:` class is inside a media query emitted after every unprefixed
utility, so a `md:`-prefixed override always wins.

| Written at a call site | Primitive's own class | Who wins | Effect |
|---|---|---|---|
| `p-0` on `CardContent` | `p-4` | **`p-4`** | ~15 call sites across the app ask for a flush card and get 16px of padding. Long-standing; the rendering you see today is `p-4`. Use the padding prop route, do not "fix" the class. |
| `px-0` on `Button` | `px-3` | **`px-3`** | Use `padding="none"`. |
| `h-5` / `h-7` / `text-[11px]` / `text-[10px]` on `Badge` | `h-[22px]`, `text-xs` | **`Badge`** | Nine call sites size a badge and none of them does anything. `md:h-5` DOES work. |
| `items-start` on `Checkbox` / `CardHeader` | `items-center` / `items-start` | **`items-center`** | Use `align`. |
| `justify-start` on `Button` | `justify-center` | **`justify-start`** | Works, but by accident. Use `align="start"`. |
| `h-9` on `Select` | `h-11 md:h-9` | **`h-9`** | The fact-2 example: it shrinks a 44px target at every width. |
| `w-auto` on a `w-full` control | `w-full` | **`w-full`** | |
| `text-sm` on `Input`/`Select`/`Textarea` | `text-base md:text-sm` | **`text-sm`** | 14px at every width, under the iOS focus-zoom floor. Never re-add it; that includes an arbitrary `[&_input]:text-sm`, which is a (0,1,1) selector and beats `index.css`'s 16px element rule. |
| `.tap-target` on an `.absolute` element | — | **`.tap-target`** | It sets `position: relative` and unpins the control. Use `.tap-halo`. |
| `text-brand` on a ghost/secondary `Button` | `text-text` | **`text-text`** | Four link-like actions rendered black. Use `tone="brand"`. |
| `bg-surface-2/60`, `bg-brand/60` (any `/NN` on a token colour) | — | **nothing** | The token colours are `var(--color-…)` strings, and Tailwind 3 cannot put an opacity on a colour it cannot parse, so the class is never generated. `MobileCardList`'s `hover:bg-surface-2/60` and `Button`'s `disabled:bg-brand/60` have never painted anything. Hex colours (`danger`, `success`…) do take a modifier. |

Leave a dead override in place where making it live would change desktop; delete it or route it
through a prop where the intent is clear. Do not add new ones.

### 6. Card stack vs frozen-column table — the decision rule

| Shape | Use when |
|---|---|
| `DataList` / `MobileCardList` cards | Rows are read **one at a time**. ≤6 meaningful columns. Each row has its own actions. |
| `Table freezeFirstColumn scrollHint` | Rows are **compared across** and the comparison is the point. Numeric grids, wide but shallow. |
| `KeyValueList` | One record's detail, or a wide table's per-row expansion. |
| `Card` + `KeyValueList` per row | The row is **editable**. |

**A horizontally scrolling table is never an acceptable phone answer for a row's actions.** If
Edit / Delete / Suspend lives in the last column, it is unreachable — that is the mechanism
behind three of the fifteen blockers.

### 7. Replacing a hover-only affordance

`title=` never fires on touch. `opacity-0 group-hover:opacity-100` leaves a live invisible
button. `focus-visible` fires only on keyboard focus, and iOS does not focus a `<button>` on
tap. Colour alone is not an encoding channel.

1. **Put the text on screen below md** — `<span className="md:hidden">Escalate</span>`.
2. **`InfoBadge`** — compact badge, tap opens a Sheet, desktop keeps its tooltip.
3. **Add a tap handler beside the hover handler** — `onPointerDown` next to `onMouseEnter`/`onFocus`.
4. **Add a second encoding channel** — a glyph beside a colour, a word beside a sign (`Cr`/`Dr`).

Anything revealed only on hover must be **always visible below md**:
`opacity-100 md:opacity-0 md:group-hover:opacity-100`.

### 8. Overflow

- Every flex/grid child that can hold text gets `min-w-0`.
- Long unbreakable strings get `break-words`; identifiers, emails, hex ids and S3 keys get `break-all`.
- **Never `truncate` an identity string the admin has to read out or transcribe** (email,
  password, dealer code, run id). Wrap it, or use `Copyable`.
- A fixed `w-[Npx]` on a control inside a card at 360px is a bug. Use `w-full md:w-[Npx]` or `max-w-[Npx]`.
- Only an element that owns `overflow-x-auto` may scroll sideways. Do **not** remove
  `overflow-x-hidden` from `main` — it is a guard.
- Do **not** put `overflow-y-auto` on something you only want to scroll horizontally: per CSS
  Overflow, when one axis is not `visible` the other computes from `visible` to `auto`.
  `Tabs.tsx` documents the exact bug this caused.

### 9. Overlays

Every overlay goes through `Dialog`, `Drawer`, `Sheet` or `Menu`. No bespoke `fixed inset-0`,
no `window.confirm`, no `window.alert`. Each must portal, lock the page scroller, cap its
height, scroll internally with `overscroll-contain`, keep its footer above the keyboard and
the safe area, and use the z tokens.

Nested scrollers inside an overlay body (`<pre>`, a picker list, a code block) need their own
`.scroll-pane` (`overscroll-behavior: contain`), or reaching their end drags the sheet.

The grid min-content rule (`[data-app-scroller] :where(.grid) > * { min-width: 0 }`) reaches an
overlay's body below md through `data-overlay-body`; a fifth overlay would have to carry it too.
It makes grid ITEMS shrinkable, not their text — an unbroken token still needs `break-words` /
`break-all` on its own element.

Never add an Escape listener of your own inside an overlay. If a control inside one needs Escape
for itself (an inline editor cancelling its edit), `preventDefault()` it: the overlay stack skips
an Escape something already used.

**Use `dvh`, never `vh`.** `70vh` is the *large* viewport on mobile and overshoots a `92dvh`
sheet. Four `vh` values survive on purpose: `Dialog`'s and `ImageLightbox`'s `md:max-h-[70vh]`,
`Menu`'s desktop popover, and `WideReportViewer`'s desktop `h-[72vh]` (which `DsrReportPanel`
passes through as `desktopHeightClass`). All four are inside a `md:` or an `isMd` branch, where
`vh` and `dvh` are the same number — leave them; do not add a fifth.

Two more exist and are neither sanctioned nor worth a change: the `h-[60vh]` loading
`Skeleton` in `DsrReportView` and `DealerDsrTab`. They are grey blocks, they predate this
programme, and a phone simply scrolls a slightly tall placeholder. Do not copy them.

Z ladder, published on `:root`: `--z-sticky:10  --z-page-bar:30  --z-scrim:40  --z-overlay:50
--z-nested-overlay:60  --z-toast:70`.

### 10. Downloads and external navigation

- **Never** a cross-origin `<a href download>` — the attribute is ignored cross-origin and the
  anchor navigates the WebView off the SPA.
- **Never** a synthetic `target="_blank"` click — the shell runs `setSupportMultipleWindows={false}`.
- **Never** a `blob:` URL in the native shell.
- Always `downloadFile()` / `DownloadButton`.
- **Always report failure.** A tap that does nothing and says nothing is indistinguishable from
  a broken app.

### 11. `maximum-scale=1.0` stays for now

It is kept deliberately; the reasoning and the exit criteria are in `index.html`'s own comment.
Do not drop it as a side effect of anything. It is re-evaluated on its own, in the emulator,
once every dense surface has its own zoom or expand affordance.

### 12. Forms

16px fields below md (`Input`/`Select`/`Textarea` now carry `text-base md:text-sm`; do not
re-add `text-sm` from a call site). `inputMode` / `autoComplete` / `type` on every field —
`tel` for phones, not `number`, so a leading `+` survives; `email` with `autoCapitalize="none"`.
Labels stack above inputs below md; multi-column grids collapse to one. A primary action on a
long form goes in a `StickyActionBar` or an overlay footer. **A disabled primary action's
reason is visible text, never a `title`.**

### 13. Charts

Every chart needs a touch path to its values: `onPointerDown` on the mark, and a table below md.

### 14. Per-PR verification, in the emulator

At 360×640, 390×844 and 411×891:

- [ ] No sideways page scroll and nothing clipped at the right edge.
- [ ] Every interactive element on screen is ≥44×44 below md.
- [ ] Every action available on desktop is reachable without a sideways swipe.
- [ ] Nothing meaningful lives only in a `title` attribute.
- [ ] Every overlay: internal scroll, footer above the keyboard, page behind it locked.
- [ ] Every bottom-anchored element clears the tab bar and the gesture strip.
- [ ] Every download either produces a file or a visible error.
- [ ] At 768px and 1280px, the screen is unchanged from `main`.

---

## Known limits

Real, current, and deliberately not closed. Do not assume otherwise.

### Not verified anywhere

- **Nothing has run on a device.** This repo has no test runner and this session had no
  emulator. `ZoomableImage`'s gestures, `Table`'s scroll hint and frozen column,
  `StickyActionBar`'s `fixed` mode, and the Assist call player's re-tap recovery are
  type-checked, linted and built — nothing more. The §14 checklist at 360 / 390 / 411 is still
  owed on every screen.
- **The dev-only overflow assertion** (`scrollWidth > clientWidth` in `main.tsx`) is still
  unwritten. It is the cheapest way to catch mechanically what this programme found by hand.
- **Back closing an overlay was verified in headless Chrome, not in the shell.** With
  `page.goBack()` standing in for the hardware key: Back closes only the top overlay and keeps
  the URL, a filter typed in a sheet survives it, closing a URL-driven drawer by its X leaves no
  entry for Back to reopen it from, and a navigation from the More sheet leaves no dead entry.
  The shell's `WebView.goBack()` on a real device is still owed. So is the press paint and the
  missing sticky hover, which headless Chrome only shows when the state is forced.

### Primitive gaps recorded rather than closed

These were hit by a packet, judged, and left. Each says why, so the next person does not
re-derive it.

| Gap | Why it is still open |
|---|---|
| `KeyValueList` has no `labelVariant` | Three field lists (`RunHistoryPage`, `ServiceCatalogPage`, `RunsListInline`) render `text-xs uppercase tracking-wide text-text-subtle` labels above their values. Migrating them to the primitive's fixed `text-sm text-text-muted` `dt` would visibly change three desktop dialogs, which §4 forbids. They stay as three near-identical local `Field` helpers. A `labelVariant?: 'default'\|'caption'` would let them adopt it with no diff. |
| `KeyValueList` has no grouping | Per-tank DSR readings and the Assist trace panel each wrap one list per sub-record in a hand-written heading + `<div>`. A `group` field on `KeyValueItem`, or sections, would remove that. |
| `MobileCardList` has no sections | The per-domain grouping in `DealerWorkListTab` and `WorkListDefaultsPage` is one list per group inside a hand-written `<details>`. `visibility="all"` makes the nesting clean, but `sections?: { key; header; cards }[]` would remove it. |
| `SegmentedControl` has no `subtle` variant | Adopting it on the DSR/Credit "Today / Past date" tabs was mandated and is a **real ≥768px visual change**: the old `ModeTab` drew a raised `bg-surface` chip on a `bg-surface-2` track, the primitive draws a brand-filled pill on a bordered track. A `variant="subtle"` reproducing the track-and-chip look would make that swap desktop-neutral. |
| `DownloadButton` has no `disabledReason` | A run artifact whose signed URL is still in flight renders a hand-rolled disabled `Button` plus a `md:hidden` sentence. The prop wants the same shape `DefRow hint` ended up with: visible text below md, `title` at md. |
| `StickyActionBar` has no content-width cap | In `sticky` mode the bar spans the page column. A `contentClassName` (or `maxWidth`) would let a caller keep a centred `max-w-6xl` content column, which the shift-data editor's old fixed bar had. |
| `Drawer` has no `mobileFooterExtra` | The Assist drawer gets a second footer child with `md:hidden`, which works only because `.md\:hidden` is emitted after `.inline-flex` — exactly the ordering dependence fact 2 says not to rely on. |
| No progress-bar primitive | `SlipPanel` draws its upload bar by hand: a `h-1.5 rounded-full bg-surface-2` track with a `bg-brand` fill, `role="progressbar"` and the percentage in a **non-live** sibling of the `aria-live` sentence (a live percentage talks over the operator for the whole upload). It is the first determinate progress in the admin. A second caller should extract `ProgressBar` rather than copy it. |
| The overlay stack's history marker has three blind spots | (1) A reload while an overlay is open leaves the page on its marker entry; the marker is cleared on load, but the entry stays, so one Back after that reload changes nothing on screen. (2) A Back that jumps more than one entry (a desktop browser's long-press history list) is left to the router as a navigation. (3) Nothing is pushed at md in a browser, so a desktop's Back still navigates with a dialog open, as it always did. All three are inherent to doing this with history entries; none is reachable from the shell's single-step Back. |
| `PageHeader dense` does not reorder its subtitle | Below md a long dense subtitle (a dealer's address) still takes the middle row, pushing the status and help onto a third. `order-last basis-full md:order-none md:basis-auto` would fix it — but it would also put a short phone-number subtitle on a row of its own on every dealer without an address. Needs a decision, or a `subtitlePlacement` prop. |
| `Tabs.tsx` has no edge fades | The strip scrolls and auto-centres correctly — **do not touch that logic**; the naive `scrollIntoView` fix was tried and reverted, and the comment at the top of the file records it. Only the visual cue that it scrolls is missing. Two packets worked around it by shortening a label below md instead. |

### Product decisions still open

- **CSV download in the native shell** returns `{ ok: false, reason }` by design: the file is
  assembled in the browser and a `blob:` URL cannot reach Android's download manager. Today the
  operator gets a toast naming the reason. The real fix is a backend export route returning a
  short-lived signed URL, which is outside this repo. Hiding the control in the shell is one
  line if that is preferred.
- **Two catalog searches, two shapes.** `DealerKavachWorkListTab`'s search box renders at every
  width; `DealerWorkListTab`'s is `md:hidden`. Both are defensible — a landscape phone is
  already ≥ md and silently loses a `md:hidden` filter, but a search visible at md is a control
  desktop did not have. They are sibling tabs of the same page and should agree. **Unsettled.**
- **The shift-data editor's pending bar** moved from viewport-fixed to `sticky`, so at ≥768px it
  now spans the content column with `main`'s padding and pushes content instead of overlaying
  it. That is what fact 4 exists to enable (no tab-bar arithmetic) and it deletes a `pb-28`
  spacer that was already too short, but it IS a desktop change. `mode="fixed"` is a one-word
  revert that then needs a measured content spacer.
- **Four chevrons narrowed by 8px at md** (the shift-data day arrows, the TT-density month
  arrows) by becoming real `IconButton` squares. They carried a `px-2` that never applied.
- **`IrasEditGrid` decides its shape in JS** (`useMediaQuery('(min-width: 768px)')`), so only one
  of the two trees is built. The note that used to sit here — that both shapes mount and CSS
  picks — has been wrong since that change. The cost of the JS branch is real and unfixed:
  rotating a phone past 768px remounts `Cell` and discards an open editor's local `draft`. The
  fix is to lift `Cell.draft` into the pending set, which is its own small packet; the shift
  sheet is immune because no field there holds local state.
- **The DSR native figure list is `md:hidden`.** It would be useful on desktop too; adding a new
  visible block at ≥768px is a product decision, not a mobile fix.
- **`maximum-scale=1.0` stays.** Re-evaluated on its own, in the emulator, once every dense
  surface has its own zoom or expand affordance. See `index.html`'s comment.
- **"Readings from a slip" renders even where the server cannot do it.** There is no flag on
  the day payload saying whether reading slips is switched on for this installation, so the
  panel cannot hide itself; the first press comes back with the server's own sentence,
  "Reading the slip is not switched on here. Type the figures in yourself." That is a correct
  sentence in the wrong place. A `slipRead: boolean` on `IrasDayEditorView` closes it and is
  the one change that would let the panel render nothing at all.
- **Nothing in the slip flow has been run on a device or against a real slip.** The camera
  input, the XHR progress, `Stop` mid-upload, the fullscreen review drawer at 360px and the
  tinted READ box in both themes are type-checked, linted and built — nothing more. §14's
  checklist at 360 / 390 / 411 is owed, and so is one morning holding a real slip against the
  saved figures.
