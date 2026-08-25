# Mobile hardening — the working rules and the primitive catalogue

This is the contract for every packet in the admin's mobile programme. Read it before
touching a screen. It has three parts:

1. **[The six facts](#the-six-facts)** — verified properties of this codebase. Getting one
   wrong invalidates the fix built on it.
2. **[The primitive catalogue](#the-primitive-catalogue)** — what exists, its exact exported
   API, and one line on when to reach for it.
3. **[The global rules](#the-global-rules)** — what a change has to satisfy to land.

Targets: **360×640, 390×844, 411×891** must all work. **≥768px must not change.**

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
Drawer does not unlock the page when only the Dialog closes.

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
Watches a `ResizeObserver`, `visualViewport`, **and** your `deps`.

#### `useSafeBack` — `@/hooks/useSafeBack`
```ts
export function useSafeBack(fallback: string): () => void
```
**Use it instead of `navigate(-1)`, always.** A push notification deep-links straight into a
thread or a dealer, making it the *first* history entry — a blind back pops the user out of
the app. Pops when `history.state.idx > 0`, otherwise replaces with `fallback`.

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
  cardActions?: (row: T) => React.ReactNode; empty?: React.ReactNode; loading?: boolean;
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
  mode?: 'sticky'|'fixed'; summaryOnMobile?: boolean; className?: string;
}
```
**Use it when** a long editing screen's Save would otherwise sit at the natural end of 1,200px
of form, or in a `PageHeader` above it. Default `mode="sticky"` — the tab bar is in-flow, so a
sticky bar inside `main` already rests above it (fact 4) and needs no arithmetic. Reach for
`'fixed'` only when the content is not inside the page scroller; it reads `useSafeInsets()`
and clears the live tab-bar height itself. **Both modes carry their own bottom inset**,
because on a drill-in nothing else does (fact 5).

#### `FilterBar` — new (this absorbed the proposed `FilterSheet`)
```ts
export interface FilterBarProps {
  children: React.ReactNode; activeCount?: number; onClear?: () => void;
  columnsAtMd?: 2|3|4|5; chips?: React.ReactNode; className?: string;
}
```
**Use it for** any page whose filters cost more than about one screen-third on a phone. At
`≥ md` it is a `Card` + `grid gap-3 md:grid-cols-N`, byte-identical to today. Below md it is
one 44px "Filters (n)" button opening the shared `Sheet`. Exactly one branch mounts, so
**filter state must live in the caller** (it already does everywhere). `chips` is a slot, not
derived — `children` is opaque markup and the bar cannot know what your filters are.

#### `CardHeader action` — extended (this absorbed the proposed `SectionHeader`)
```ts
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> { action?: React.ReactNode }
```
**Use `action` instead of a second child** whenever the right-hand slot is a button. As a
child it is just another item in a `justify-between` row that cannot wrap, and a
`whitespace-nowrap` Button in a 296px card then squeezes the title to nothing. With `action`
undefined the emitted classes are byte-identical to today.

---

### Controls

#### `IconButton` — new
```ts
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  'aria-label': string; children: React.ReactNode;
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean;
}
```
**Use it for every icon-only button.** `Button size="sm"` floors the *height* at 44px and says
nothing about width, so an icon-only Button is 40×44. This is a real square: `h-11 w-11` below
md, `md:h-8 md:w-8` (sm) / `md:h-9 md:w-9` (md). `aria-label` is required by the type —
without it the control is announced as "button".

#### `.tap-target` — CSS utility in `index.css`
**Use it instead of `IconButton` when** the *painted* size is load-bearing and cannot grow: a
reaction chip on a chat bubble, an inline "Retry" inside a sentence, a "+3 more" badge. It
adds a `-12px` halo via `::after` and paints nothing; the halo disappears at `≥ md`.
**Caveat:** adjacent halos overlap — keep ≥8px between two `.tap-target` siblings.

#### `Checkbox` — new
```ts
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'|'size'> {
  label?: React.ReactNode; hint?: React.ReactNode; labelClassName?: string;
}
```
**Use it for every checkbox.** The whole `<label>` is the target (`min-h-11 md:min-h-0`); the
box is `h-5 w-5 md:h-4 md:w-4`. The ref is forwarded, so `{...register('active')}` works —
`className` lands on the input, `labelClassName` on the label.

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
a value inside prose and leans on `.selectable`.
The copy itself has three rungs and never fails silently: Clipboard API → `execCommand` →
select the text and say so.

#### `InfoBadge` — new
```ts
export interface InfoBadgeProps {
  intent?: Intent; label: React.ReactNode; detail: React.ReactNode;
  sheetTitle?: string; className?: string;
}
```
**Use it wherever a badge's real meaning currently lives in `title=`.** At `≥ md` it renders
today's `<Badge title={detail}>` unchanged; below md it is a tappable badge with an info glyph
that opens a `Sheet`. Pass `detail` as a plain string where you can — only a string can ride
in `title`, so a rich node loses the desktop tooltip.

#### `ConfirmDialog` — new
```ts
export interface ConfirmDialogProps {
  open: boolean; onCancel: () => void; onConfirm: () => void; title: string;
  description?: React.ReactNode; confirmLabel?: string; cancelLabel?: string;
  confirmVariant?: 'primary'|'danger'; loading?: boolean;
}
```
**Use it instead of `window.confirm()`, always, and instead of hand-rolling the shape.** Inside
the WebView `confirm()` is an OS alert we do not own, and on Android it is answered only if the
host implements `onJsConfirm` — otherwise it returns false and the destructive action silently
does nothing. Backdrop and Escape go inert while `loading`.

#### `ReadonlyField` — added to `Input.tsx`
```ts
export function ReadonlyField(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element
```
**Use it for** a computed value shown where a field would be (`h-11 md:h-9`, the same box the
fields draw), so a derived readout does not sit 8px short of the `Input`s beside it.

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

#### `WideReportViewer` — new
```ts
export interface WideReportViewerProps {
  kind: 'html'|'image'; src: string; title: string; preview?: React.ReactNode;
  actions?: React.ReactNode; desktopHeightClass?: string; className?: string;
}
```
**Use it for** a wide artifact we did not author and cannot restyle — the DSR day book. Inline
at `≥ md` exactly as today; below md a tappable card that opens a full-screen `Drawer`.
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

- `Dialog` — centred modal at `≥ md`, full-height bottom sheet below. Footer is an
  `ActionRow below="stack"`.
- `Drawer` — right-side panel at `≥ md`, bottom sheet below. Same footer.
- `Sheet` / `SheetItem` — mobile-only (`md:hidden`) bottom sheet for menu lists. Locks scroll
  only below md, because a landscape phone is already `≥ md` and would otherwise be frozen
  behind a sheet it can no longer see.
- `Menu` / `MenuItem` / `MenuSeparator` — anchored popover at `≥ md`, bottom sheet below, with
  Escape, roving arrow-key focus and focus return. New prop
  `triggerShape?: 'icon' | 'auto'` — `'icon'` (default) is the square 44/36px hit area,
  `'auto'` sizes to a labelled trigger. Do not try to widen the trigger with
  `triggerClassName`; `cn` is clsx (fact 2).

---

### Charts

#### `ColumnChart` — extended
```ts
minColumnPx?: number;      // give every column this width and scroll the plot in its own strip
maxColumns?: number;       // below md, plot only the newest N with a toggle
defaultTableOpen?: boolean;
```
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

`cn` is `clsx`. Change the primitive, or add a prop or variant. Four known offenders to clean
up by hand while you are in those files: `DealerKavachTab.tsx` (`h-9 w-auto` on a `Select`),
`IrasShiftDataPane.tsx` and `DayMarkCalendar.tsx` (`px-2` on Buttons).

**`tailwind-merge` is deliberately not being added in this pass** — it would silently *shrink*
those four targets by making the override win.

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

**Use `dvh`, never `vh`.** `70vh` is the *large* viewport on mobile and overshoots a `92dvh`
sheet. Four `vh` values survive on purpose: `Dialog`'s and `ImageLightbox`'s `md:max-h-[70vh]`,
`Menu`'s desktop popover, and `WideReportViewer`'s desktop `h-[72vh]`. All four are inside a
`md:` or an `isMd` branch, where `vh` and `dvh` are the same number — leave them; do not add a
fifth.

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

## Known gaps at the end of Phase 0

These are real and not yet done. Do not assume them.

- **`Tabs.tsx` has no edge fades.** The strip scrolls and auto-centres correctly — **do not
  touch that logic**, the naive `scrollIntoView` fix was tried and reverted; read the comment
  at the top of the file. What is missing is only the visual cue that it scrolls.
- **No primitive has run on a device.** `ZoomableImage`'s gestures, `Table`'s scroll hint and
  frozen column, and `StickyActionBar`'s `fixed` mode have only been type-checked, linted and
  built. This repo has no test runner.
- **No call site is wired to anything new.** That is each per-area packet's work.
- **The CSV download inside the native shell** returns `{ ok: false, reason }` by design. It
  needs a backend signed-URL export route or the control hidden in the shell with the reason
  stated.
- **The dev-only overflow assertion** (`scrollWidth > clientWidth` in `main.tsx`) is unwritten.
  It is the cheapest way to catch what this audit found by hand.
- **The pages added after the audit were never audited**: `KavachDashboardPage`,
  `KavachWorkQueuePage`, `KavachDefaultsPage`, `DealerKavachTab`, `DealerKavachWorkListTab`,
  `DealerPasswordVaultTab`, `DealerAppLoginCard`, `IrasCredentialsSection`,
  `PortalCredentialsCard`, `RevealCredentialsRow`. `KavachDefaultsPage.tsx` in particular is
  795 lines with a `<Table>`, zero `md:` classes and no card stack — the same shape as
  blockers 2 and 3. `PortalCredentialsSection.tsx` no longer exists; its `window.confirm` moved
  to `RevealCredentialsRow.tsx` and `PortalCredentialsCard.tsx`.
