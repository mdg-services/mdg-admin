# Dealer Kavach Admin — Mobile Responsive Spec

Make the admin portal (`mdg-admin/`, React 18 + Vite + Tailwind + shadcn-style primitives)
fully usable on a phone (360–430px) inside the Expo WebView shell. The app is desktop-first
today: fixed 240px sidebar, wide data tables, dense tab strips, centered modals. This spec is
implementation-ready — component names, Tailwind classes, and breakpoints are exact. Build it
verbatim.

**Ground rules that shaped every decision below**
- The mobile cutoff is Tailwind `md` (768px). The codebase already treats `md` as the
  desktop/mobile line (`AppShell` sidebar is `md:flex`, Inbox rails are `md:*`). Do not
  introduce a new breakpoint — mobile == `< md`, desktop == `≥ md`.
- Extend the existing CSS-variable token system and primitives. Do not replace Tailwind config,
  colors, or the `@/components/ui` primitives — add responsive behavior inside them.
- The `mdg-client/` app already solved safe-area, WebView touch-hardening, chat touch targets,
  and keyboard handling. Mirror it. Exact source files are cited where relevant.

---

## 0. Two prerequisites the engineer must land first

These are missing in admin and block everything else. Do them before the feature work.

### 0.1 Fix the viewport meta (safe-area + keyboard)
`mdg-admin/index.html` line 5 is currently:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```
Without `viewport-fit=cover`, `env(safe-area-inset-*)` returns 0 and the app draws under the
notch/home-indicator. Replace it to match `mdg-client/index.html` line 11:
```html
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, interactive-widget=resizes-content" />
```
`interactive-widget=resizes-content` makes the layout viewport (so `100dvh` / `flex-1`) shrink
when the on-screen keyboard opens, which keeps every sticky footer/composer above the keyboard.

### 0.2 Port the WebView + safe-area CSS
`mdg-admin/src/index.css` today has only `scrollbar-thin` and the message-flash keyframes. Port
the base + utilities blocks from `mdg-client/src/index.css` (lines 57–159) into admin:
- `body { padding-top: env(safe-area-inset-top); }` (top inset; the bottom nav owns its own inset).
- The WebView touch-hardening block (`-webkit-tap-highlight-color`, `-webkit-touch-callout`,
  `-webkit-user-drag`, `#root` `user-select:none` with inputs/message-text re-enabled,
  `touch-action: manipulation` on controls).
- The **iOS focus-zoom backstop**: `input, textarea, select { font-size: 16px; }` — critical, the
  admin has none of this and every form field will zoom on focus without it.
- The `.safe-top` and `.safe-bottom` utilities (copy verbatim from client lines 147–152).
- Add the bottom-sheet keyframes (see §6.3).

Everything below assumes 0.1 and 0.2 are done.

---

## 1. Global rules

**Breakpoints.** One line only: `md` (768px). Everything mobile is `< md`; desktop keeps its
current layout unchanged at `≥ md`. Phones (360–430px) are the primary target; the design must
also survive 320px without horizontal scroll.

**Touch targets ≥ 44px.** Interactive elements on mobile must be ≥ 44×44 CSS px.
- `Button` (`src/components/ui/Button.tsx`) sizes today: `sm = h-8` (32px), `md = h-9` (36px).
  Add a mobile floor without touching desktop density: extend both size rows with
  `min-h-11 md:min-h-0` — e.g. `sm: 'h-8 min-h-11 md:min-h-8 px-3 ...'`, `md: 'h-9 min-h-11 md:min-h-9 px-4 ...'`.
  (Keep the `h-*` for desktop; `min-h-11` only wins below `md`.)
- Icon-only buttons currently `h-9 w-9` (Composer attach/mic/send-fallback, Inbox back/info,
  Dialog/Drawer close, AppShell hamburger): make them `h-11 w-11 md:h-9 md:w-9`.
- Form controls (`Input`, `Select`, `Textarea`, RJSF inputs) are `h-9` (36px). Bump to
  `h-11 md:h-9` inside the primitives so every form gets 44px fields on phones.
- Table/list **rows that are tappable** (Dealers rows, Inbox items, Run rows) must be ≥ 44px tall.
  `TD` is `h-11` already (44px) — fine; card-stack rows below must match.

**No horizontal body scroll, ever.** The body/`#root`/`main` must never scroll sideways.
- Keep `main` as `overflow-x-hidden` (already set in `AppShell`).
- The only allowed horizontal scrollers are explicit, contained ones: the `DealerDetail` tab strip
  and the `Tabs`/`Table` wrappers (`overflow-x-auto`). Every such scroller must also carry
  `overscroll-x-contain` so a sideways fling never bubbles to the page or the native shell.
- Any element that can hold long unbroken strings (emails, `entityId`, 24-char hex, JSON) must
  `truncate` or `break-all` — never widen the viewport. This is why the wide tables become
  card-stacks (§4).

**Safe-area handling.** Use CSS `env(safe-area-inset-*)` through the ported utilities, never
hard-coded padding.
- Top: `body` padding-top handles the status-bar inset globally (§0.2). The sticky app header sits
  under it; do not double-pad.
- Bottom: the mobile bottom nav (§2) and every sticky modal footer/composer use `.safe-bottom`
  (`padding-bottom: max(env(safe-area-inset-bottom), 0.5rem)`).
- The native Expo shell already provides the insets once `viewport-fit=cover` is set — the web side
  only consumes them; it does not compute or receive them via a bridge.

---

## 2. Mobile navigation — bottom tab bar + "More" sheet

**Decision: a fixed bottom tab bar (4 primary tabs + "More") replaces the sidebar below `md`.
Reject the hamburger drawer.**

**Why.** This is a WebView posing as a native app, and the admin's day is a constant ping-pong
between Inbox (support) and Dealers (the CRM). A bottom bar keeps those destinations one thumb-tap
away and — decisively — keeps the **Inbox unread badge permanently visible**, which a hamburger
buries behind two taps. Bottom tabs read as "an app"; a top-left hamburger reads as "a web page,"
exactly the impression we are killing. The existing hamburger drawer in `AppShell` (lines 131–162)
is removed.

Keep the desktop sidebar (`AppShell` `aside`, lines 121–129) exactly as-is at `≥ md`.

### 2.1 Tab model
Reuse the existing `NAV_ITEMS` array and its `superAdminOnly` flag (`AppShell.tsx` lines 29–47).
Split it into a fixed bottom set and a "More" set.

**Bottom tabs (always shown, this order):**
| Slot | Label | Route | Icon | Badge |
|---|---|---|---|---|
| 1 | Inbox | `/inbox` | `MessageSquare` | unread count |
| 2 | Overview | `/overview` | `LayoutDashboard` | — |
| 3 | Dealers | `/dealers` | `Building2` | — |
| 4 | Kavach | `/kavach` | `ShieldCheck` | — |
| 5 | More | (opens sheet) | `Menu` | — |

**"More" sheet (bottom-sheet list, §6):**
- Service Catalog → `/services` (`Plug`)
- Run History → `/runs` (`Activity`)
- **Super-admin only** (hidden entirely when `useIsSuperAdmin()` is false):
  - All Users → `/users` (`Users`)
  - Work list → `/work-list` (`ListChecks`)
  - Activity → `/activity` (`ScrollText`)
  - Team → `/settings/team` (`UserCog`)

Regular admins therefore see a "More" sheet with just Service Catalog + Run History. The four gated
rows are never rendered for them — filter with the existing
`NAV_ITEMS.filter(i => !i.superAdminOnly || isSuperAdmin)` logic (`AppShell.tsx` line 110), applied
to the More set only.

The "More" tab shows its active (accent) state when the current `location.pathname` matches any
More route.

### 2.2 Component + placement
Add `src/components/layout/MobileTabBar.tsx`. Render it inside `AppShell`'s right column as the last
child, `md:hidden`:
```
<div className="flex min-w-0 flex-1 flex-col">
  <header .../>            {/* existing sticky header */}
  <main className="flex-1 overflow-y-auto overflow-x-hidden ...">{Outlet}</main>
  {showTabBar && <MobileTabBar className="md:hidden" />}   {/* NEW */}
</div>
```
Make the right column a real fixed-height flex column so the bar is pinned and `main` scrolls
between header and bar (rather than the body scrolling under a `fixed` bar). Concretely: the outer
shell becomes `h-screen` (it is `h-full min-h-screen` today), `main` gets `overflow-y-auto`. This
removes all "add padding-bottom equal to the bar height" math and makes Inbox height trivial (§3).

`MobileTabBar` markup per tab: a `NavLink`, `flex-1`, `flex-col items-center justify-center gap-0.5`,
`min-h-14` (56px) + `.safe-bottom`, icon 22px, label `text-[11px]`. Active tab uses `text-brand`;
inactive `text-text-muted`. The Inbox badge reuses the count already computed in `AppShell`
(`useConversations('mine')` → `.filter(c => c.unreadByAdmin).length`, lines 107–108) — lift that
into `MobileTabBar` or pass it down. Render it as a small pill at top-right of the Inbox icon
(`absolute -top-1 -right-2 min-w-[16px] rounded-full bg-brand text-[10px] text-text-inverse`); show
a bare dot if the count is 0 but you want presence, otherwise hide when 0 (match sidebar behavior:
hide at 0).

### 2.3 When the bar is hidden (`showTabBar`)
The bar shows on top-level list screens and hides on full-screen drill-ins so chat/detail get the
whole viewport (standard native "push hides the tab bar"). Compute in `AppShell` from
`useLocation()` + `useSearchParams()`:

- **Hide** on `/dealers/:id` (a drill-in; the breadcrumb + hardware-back return to `/dealers`).
- **Hide** on `/inbox` **when a thread is open** — detected by `?c=<id>` in the URL (see §3.1).
- **Hide** on `/login` (no shell there anyway).
- **Show** everywhere else, including `/inbox` with no `?c` (the conversation list is a top-level
  screen and needs the bar to leave Inbox).

Match `/dealers/:id` with `matchPath('/dealers/:id', pathname)` and guard against matching the exact
`/dealers` list.

### 2.4 Top header on mobile
The mobile header loses the hamburger. Keep it 56px, sticky, `.safe-top` already handled by body.
Left: on a drill-in (`/dealers/:id`) show a back chevron button (`h-11 w-11`, `navigate(-1)`);
elsewhere show the `BrandMark`. Center/left: nothing else needed. Right: keep the existing
`AdminMenu` avatar (account + logout) — do not move logout into "More". Drop the disabled desktop
search input on mobile (already `hidden ... md:block`).

---

## 3. Inbox on mobile

The Inbox (`src/pages/InboxPage.tsx`) is a 3-pane desktop layout that **already collapses well**
below `md`: the filter rail is hidden and replaced by filter chips (lines 508–533); the conversation
list is full-width and hides once a chat opens (`selectedId ? 'hidden' : 'flex'`, lines 486–491);
the active chat is full-screen with a back chevron (lines 599–645); the context panel is a
right-side slide-over below `lg` (lines 778–957). Keep all of that. The work here is three fixes:
make **back** hardware-friendly, **declutter the thread header**, and enforce **44px touch targets**.

### 3.1 List ↔ thread navigation must be URL-driven (for hardware back)
Today selection is React state (`selectedId`), and the `?c=` deep-link param is stripped after use
(lines 239–247). That means Android hardware-back (and the browser back the Expo shell maps it to)
**exits the app** instead of returning to the conversation list — because opening a thread pushed no
history entry. Fix:

- On mobile (`!isLg`), opening a conversation does a history **push** of `?c=<id>`
  (`setSearchParams({ c: id })` without `replace`), and does **not** strip it while the thread is
  open. Selection derives from the param.
- "Back" (the header chevron, lines 620–630) becomes `navigate(-1)` — which pops `?c=` and lands on
  the list. Hardware-back now does the same thing for free.
- `AppShell` reads `?c=` to hide the bottom tab bar while a thread is open (§2.3).
- Keep the desktop behavior unchanged (auto-select first thread on `≥ lg`, lines 377–385; internal
  state is fine there because both panes are visible).

The existing deep-link seed (lines 217–221) already tolerates `?c=` on load, so `/inbox?c=<id>`
links from the Kavach tab and Members tab keep working; just stop the mobile strip.

### 3.2 Thread header declutter
On a 360px screen the thread header holds up to six actions (Pick up / Take over / Resolve / Reopen /
Upload report / details toggle), which wraps into an ugly two-row pile. On mobile:
- Keep **one** primary action inline, chosen by status: `OPEN → Pick up`, `ASSIGNED → Resolve`,
  `RESOLVED → Reopen`. Keep the back chevron (left) and the details `Info` button (right, already
  `lg:hidden`, line 716).
- Move the rest (Take over, Upload report, and any non-primary action) into a kebab
  (`MoreVertical`, `h-11 w-11`) that opens a bottom sheet (§6) of full-width action rows. This keeps
  the header to: `‹ back · title · [Primary] · Info · ⋮`.
- At `≥ md` keep the current inline button row.

### 3.3 Chat touch targets, long-press, reactions, image preview
These behaviors already exist from the client chat work and live in
`src/features/chat/*` (`MessageList`, `Composer`, `ReactionsDialog`, `MessageInfoDialog`,
`MediaGalleryCard`). Map them to the narrow screen, do not rebuild:
- **Composer** (`src/features/chat/Composer.tsx`): the attach (line 299), mic (line 332), and
  cancel-recording (line 265) buttons are `h-9 w-9` → `h-11 w-11 md:h-9 md:w-9`. The textarea and
  Send button already size fine. The reply-quote strip and staged-file thumbnails already wrap.
- **Long-press action menu**: the per-message menu (reply / react / info / copy / download) must
  present as a **bottom sheet** on mobile, not a floating popover — reuse the §6 sheet so it clears
  the thumb zone and never overflows the 360px width. Trigger stays long-press (already wired).
- **Reactions**: the emoji picker row and the who-reacted `ReactionsDialog` become bottom sheets
  (Dialog is responsive per §6). Each emoji tap target ≥ 44px.
- **Image preview**: full-screen viewer already opens from `MediaGalleryCard`/message images; ensure
  it renders above the tab bar (`z-50`) and its close button is `h-11 w-11`. The tab bar is hidden
  in-thread anyway, so no overlap.
- **Details slide-over** (Ticket / Dealer / Reports / Media, lines 778–957): keep as the right
  slide-over below `lg`. Its header close button (line 799) → `h-11 w-11`. The Ticket priority /
  category `Select`s inherit the `h-11` field bump.

### 3.4 Inbox height
With the shell flex-column fix (§2.2), replace the Inbox root height hack
`-m-4 flex h-[calc(100dvh-3.5rem)] md:-m-6` (line 438) with `-m-4 flex h-full md:-m-6` so it simply
fills `main`. The tab bar is a sibling of `main`, so it never overlaps the composer, and the
in-thread view (tab bar hidden) gets the full height for free.

---

## 4. Tables — per-page decisions

Rule of thumb: **a table whose rows are navigational or wider than ~4 tight columns becomes a
card-stack below `md`; a genuinely narrow list stays a list.** Never horizontal-scroll a data table
on a phone — it fights the no-horizontal-scroll rule and hides columns off-screen. Implement the
stack by rendering the existing `<Table>` inside `hidden md:block` and adding a parallel
`<ul className="md:hidden">` of cards (or build the small `MobileCardList` helper in §8). Each card
is one `rounded-lg border border-border bg-surface p-3` block; tappable cards are `min-h-11` and use
the whole card as the hit area.

### 4.1 DealersPage (`src/pages/DealersPage.tsx`) — CARD-STACK
Rows are navigational (`onClick → /dealers/:id`, lines 178–182). Columns today: Name, Code, Phone,
Status, Progress, Onboarded.
Card layout (whole card → `/dealers/:id`):
- **Primary row:** `Name` (bold, truncate) on the left; `StatusChip` (dealer) on the right.
- **Secondary row:** `Code` (mono, muted) `·` `Phone`.
- **Meta row:** `Progress n/8` `·` `Onboarded {date}` in `text-xs text-text-subtle`.
Filters card above (search + status `Select`, lines 107–137) already stacks (`flex-col md:flex-row`);
keep. Pagination stays below the stack.

### 4.2 AllUsersPage (`src/pages/AllUsersPage.tsx`) — KEEP GROUP CARDS, STACK THE INNER TABLE
Structure is dealer-grouped `GroupCard`s each wrapping a 5-col table (Name, Email, Role, Status,
Actions, lines 229–279). Keep the group card + its header (icon, dealer name, code, status, count,
lines 208–227). Convert the inner table to one card per user below `md`:
- **Primary row:** `Name` (bold) + inline `title` (muted); `Role` badge on the right.
- **Secondary row:** `Email` (mono, `truncate`).
- **Meta row:** `Status` badge (Active / Suspended / Archived).
- **Action:** a full-width `Manage` button at the card bottom (`w-full`, `min-h-11`) → opens
  `ManageUserDialog`, which is a bottom sheet on mobile (§6). Email is the reason a plain table
  overflows 360px; the card truncates it safely.
Search + "Show archived" controls (lines 129–155) already `flex-wrap`; keep.

### 4.3 RunHistoryPage (`src/pages/RunHistoryPage.tsx`) — KEEP LIST, REFLOW ROWS
This is already a day-grouped `<ul>` of `<li>` rows (lines 164–186), not a `<table>`, but the single
row line (`StatusChip · service · dealer · time · duration`) is too dense at 360px (dealer is
already `hidden md:inline`). Reflow each `<li>` to two lines below `md`:
- **Line 1:** `StatusChip` (run) + `serviceId` (truncate, medium weight).
- **Line 2:** `{startedAt}` `·` `{duration}` in `text-xs text-text-muted` (dealer stays hidden on
  mobile).
Keep the day group header (lines 154–163) and the whole `<li>` tappable → `RunDetail` (bottom sheet).
The filter card (Dealer ID / Service ID / Status / From / To) is `grid gap-3 md:grid-cols-5`, i.e.
single-column by default — keep; these are power-user filters and stacking is correct.

### 4.4 ActivityPage (`src/pages/ActivityPage.tsx`) — CARD-STACK (densest table)
Six columns (Time, Actor, Action, Entity, Target, IP, lines 216–258) with long IDs and IPs cannot
fit a phone. Card per audit row below `md`:
- **Primary row:** `Action` badge (colored via `actionIntent`) on the left; `{time}` (`formatDateTime`,
  small, muted) on the right.
- **Secondary row:** `Actor` name (medium) + role (`text-xs text-text-subtle`).
- **Meta row:** `{entity} · {entityId}` with `entityId` `truncate`.
- **Drop `IP` from the card** — it appears only in the detail sheet.
Whole card → `AuditDetailDialog` (bottom sheet) which already carries everything, incl. IP,
user-agent, and before/after JSON (lines 280–321). Filter card (5 selects/dates) is
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` — single-column on phone already; keep.

---

## 5. DealerDetail — tab strip + one-column content

`src/pages/DealerDetailPage.tsx` renders 10 tabs (Onboarding, Info, Team, Services, Kavach,
Staff & points, Work list, Services provided, Run history, Custom requests) via the shared `Tabs`
primitive (line 87), then the active tab's component.

### 5.1 Tab strip → horizontally-scrollable segmented control
`Tabs` (`src/components/ui/Tabs.tsx`) is already `flex overflow-x-auto ... scrollbar-thin` with
`whitespace-nowrap shrink-0` items — it scrolls. Make it phone-grade:
- **Sticky under the header** so tabs stay reachable while a long tab body scrolls: wrap the `Tabs`
  in a `sticky top-0 z-10 bg-bg` container inside the page (the page scrolls in `main`, so `top-0`
  is correct relative to the scroll container).
- **Snap + overflow:** add `snap-x snap-proximity overscroll-x-contain` to the `Tabs` container and
  `snap-start` to each tab button. `overscroll-x-contain` stops the sideways fling from reaching the
  body/native shell.
- **Scroll the active tab into view** on mount and on change so a deep-linked tab (e.g.
  `?tab=runs`, lines 42–48) is not off-screen: on the active button,
  `ref.scrollIntoView({ inline: 'center', block: 'nearest' })` in an effect keyed to `value`.
- **44px tap height on mobile:** tab buttons are `px-3 py-2` (~36px). Add `py-3 md:py-2`
  (or `min-h-11 md:min-h-0`).
- **Edge affordance:** add a subtle right-edge fade so users know more tabs exist —
  `after:` pseudo gradient on the sticky wrapper, or a 24px `bg-gradient-to-l from-bg` overlay
  pinned right, `pointer-events-none`, `md:hidden`.
- Optionally trim the `PageHeader` title to `text-xl md:text-2xl` on this page to save vertical
  space; the breadcrumb + status chip already stack (`flex-col md:flex-row`).

### 5.2 Every tab body reflows to one column
General rule: any `md:grid-cols-*` / `md:flex-row` becomes single-column/stacked by default (most
already are). Field grids collapse to one column; header action clusters `flex-wrap`. The
table-heavy tabs use the same card-stack pattern as §4:

- **Info** (`DealerInfoTab`): field grids → single column (`grid-cols-1 md:grid-cols-2`).
- **Team** (`DealerMembersTab`, `src/pages/dealers/DealerMembersTab.tsx`): the members table (Name,
  Role/title, Email, Status, Actions) → card-stack. Card: Name (bold) + role; Email (mono,
  truncate); Status badge; two full-width action buttons (`Message`, `Suspend/Reactivate`) as a
  `grid grid-cols-2 gap-2` footer, each `min-h-11`. `Add member` stays in the card header.
- **Services** (`DealerServicesTab`): the attached-services table (Service, Cadence, Status, Last
  run, Next run, Actions) → card-stack. Card: `serviceId` (+ `stale` badge) and `StatusChip`;
  `Cadence` badge `·` `Last run` `·` `Next run` (small); the Run now / pause / detach controls as an
  icon-button row (each `h-11 w-11`). `Attach service` stays in the header.
- **Kavach** (`DealerKavachTab`): score header is `flex-col md:flex-row` already — good; ensure the
  digest-time `Select` + Pause + Add-custom cluster `flex-wrap` (it does). `KavachItemRow` action
  clusters must wrap and hit 44px; the per-bucket sub-score badges already `flex-wrap`. The
  `InitiateKavachForm` (shown when no programme) follows §7.
- **Staff & points** (`DealerStaffTab`): four tables (Leaderboard, Roster, In-progress draft,
  Finalized submissions, Award history) → card-stacks. Priority per card: worker/label as primary,
  points (`tabular-nums`, bold) prominent on the right, secondary meta muted. Keep the Today/7d/Month
  segmented control + `Award points` in the top card (`flex-wrap`). Hardcopy-photo thumbnails
  (44×44) open the existing photo `Dialog` (bottom sheet).
- **Work list** (`DealerWorkListTab`): the Default-works and Custom-works tables → card-stacks
  (Work label primary, points right, `Shown/Hidden` or Edit/Remove as `min-h-11` buttons). Keep the
  sticky-feeling save bar; make it `flex-wrap` and consider `sticky bottom-0` above the tab bar on
  mobile so Save is always reachable during a long hide/show session.
- **Services provided / Custom requests / Onboarding**: reflow their field/summary grids to one
  column; card any inner lists.

---

## 6. Dialogs & drawers → full-height bottom sheets on mobile

Make the change **once, inside the two shared primitives**, so all ~15 call sites convert for free:
`AwardPointsDialog`, `WorkerFormDialog`, `AttachServiceDialog`, `CustomWorkItemDialog`,
`AddCustomItemDialog`, `ManageUserDialog`, `AddMemberDialog`, `RunDetail` dialog, `AuditDetailDialog`,
the Staff undo/photo dialogs, the chat dialogs (`ResolveConversationDialog`, `NewConversationDialog`,
`UploadRecordDialog`, `MessageInfoDialog`, `ReactionsDialog`), plus `DealerCreateDrawer` and the
`ServiceCatalog` detail `Drawer`. Do not edit the call sites.

### 6.1 `Dialog` (`src/components/ui/Dialog.tsx`) — responsive
Today it is a centered modal: overlay `flex items-center justify-center p-4`, panel
`max-w-* rounded-lg`, body `max-h-[70vh]`. Make it a bottom sheet below `md`, centered modal at/above
`md`:
- **Overlay:** `items-end md:items-center` (and drop `p-4` on mobile → `p-0 md:p-4`).
- **Panel:** `w-full rounded-t-2xl rounded-b-none md:rounded-lg`,
  `max-h-[92dvh] md:max-h-none`, and keep the `SIZE_CLASSES` max-widths (they only bite at `≥ md`
  because the panel is `w-full` on mobile). Make the panel a flex column:
  `flex max-h-[92dvh] flex-col md:max-h-none`.
- **Header:** `sticky top-0 bg-surface` (so the title/close stay while the body scrolls); close
  button `h-11 w-11 md:h-auto md:w-auto`. Add an optional 32px grabber handle
  (`h-1 w-9 rounded-full bg-border-strong mx-auto mt-2 md:hidden`) as a "this is a sheet" cue.
- **Body:** `flex-1 overflow-y-auto overscroll-contain p-4` (drop the fixed `max-h-[70vh]` on mobile;
  keep it at `md` via `md:max-h-[70vh] md:flex-none`).
- **Footer:** `sticky bottom-0 bg-surface border-t px-4 py-3 safe-bottom`. Because the panel is a
  flex column capped at `92dvh` and the body scrolls, the footer is pinned; with
  `interactive-widget=resizes-content` it rides above the keyboard.
- **Animation:** `animate-sheet-up md:animate-none` (see §6.3).

### 6.2 `Drawer` (`src/components/ui/Drawer.tsx`) — bottom sheet on mobile
Today: overlay `flex justify-end`, panel `w-full md:w-[...] h-full` sliding from the right. Below
`md`, make it a bottom sheet too (consistent with Dialog) instead of a right panel:
- **Overlay:** `items-end justify-center md:items-stretch md:justify-end`.
- **Panel:** `w-full rounded-t-2xl md:rounded-none max-h-[95dvh] md:max-h-none md:h-full`,
  keep `WIDTH_CLASSES` (bite only at `≥ md`). Flex column, header sticky, body
  `flex-1 overflow-y-auto overscroll-contain`, footer `sticky bottom-0 ... safe-bottom`.
- **Animation:** `animate-sheet-up md:animate-slide-in-right` (or reuse the fade; the from-right
  slide only matters at `≥ md`).

`DealerCreateDrawer` and the `ServiceCatalog` detail then present as bottom sheets on phones with no
call-site change.

### 6.3 Sheet animation (add to `src/index.css`)
```css
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.animate-sheet-up { animation: sheet-up 220ms cubic-bezier(0.32, 0.72, 0, 1) both; }
```
Respect `prefers-reduced-motion`: wrap in a media query that sets `animation: none`.

### 6.4 RJSF form reflow (`AttachServiceDialog`, `src/pages/dealers/AttachServiceDialog.tsx`)
The config form is `@rjsf/core` styled by the `RJSFContainer` `[&_input]` utilities (lines 229–235).
It already forces `w-full` inputs/selects/textareas, so it stacks correctly. On mobile:
- Bump RJSF control height to 44px: add `[&_input]:h-11 md:[&_input]:h-9`,
  `[&_select]:h-11 md:[&_select]:h-9` to the `RJSFContainer` class string (textarea already
  `py-2`).
- The Cadence / Custom-cron row is `grid gap-3 md:grid-cols-2` → single column on phone already.
- Rely on the global `input,textarea,select { font-size:16px }` (§0.2) so RJSF fields don't
  focus-zoom.
- The whole dialog is a bottom sheet (§6.1), so the "Attach / Cancel" footer sticks above the
  keyboard while the config fields scroll.

### 6.5 The "More" nav sheet and mobile action sheets
The §2 "More" menu, the §3.2 thread-actions kebab, and the §3.3 long-press message menu all use the
same bottom-sheet shell. Either reuse `Dialog` (title optional) with full-width list-row children, or
add the tiny `Sheet` primitive in §8. Rows are `flex w-full items-center gap-3 px-4 min-h-12
text-left` with a leading 20px icon + label, active row `text-brand`.

---

## 7. Forms — single column, full-width, sticky action bar

Applies to `DealerCreateDrawer`, `AddMemberDialog`, `AwardPointsDialog`, `WorkerFormDialog`,
`CustomWorkItemDialog`, `AddCustomItemDialog`, `ManageUserDialog`, `InitiateKavachForm`, and RJSF.

- **Single column.** All field grids are `grid-cols-1` by default and only widen at `≥ sm`/`md`
  (e.g. `AddMemberDialog` role/title is `sm:grid-cols-2`; keep — `sm` is 640px, still one column on
  phones). Audit each form's grid uses `grid-cols-1` as the base, not an unqualified `grid-cols-2`.
- **Full-width inputs.** `Input` / `Select` / `Textarea` are already `w-full`; keep. The one raw
  `<input>` in `AttachServiceDialog` (custom cron, line 154) is `w-full` — fine. Bump all to
  `h-11 md:h-9` via the primitives (§1).
- **Labels above fields** (already the pattern via `Label`), never inline, so nothing is clipped at
  360px.
- **Sticky action bar above the keyboard.** The form's submit/cancel buttons live in the
  Dialog/Drawer `footer`, which is now `sticky bottom-0 ... safe-bottom` (§6). The form body scrolls;
  the action bar is always visible and clears the on-screen keyboard (thanks to
  `interactive-widget=resizes-content`). On mobile, make the two footer buttons equal-width
  (`grid grid-cols-2 gap-2` or primary full-width with cancel above) so they are easy thumb targets;
  keep the right-aligned `flex` at `≥ md`.
- **Password rows** (`AddMemberDialog`, `ManageUserDialog`, `AllUsersPage`): the input +
  Generate/Copy buttons already `flex-wrap`; on phone let the input take the full first line and the
  two buttons sit on the next line (`flex-wrap` handles it). Buttons hit `min-h-11`.
- **`InitiateKavachForm`** (inline, not a dialog): reflow its field grid to one column and, if it has
  its own submit row, make it `sticky bottom-0` above the tab bar so "Initiate" is reachable.

---

## 8. New / updated primitives — build checklist

Add or extend these; everything else is call-site-free.

1. **`MobileTabBar`** — `src/components/layout/MobileTabBar.tsx` (new). Fixed bottom nav, §2. Reads
   `useIsSuperAdmin()` for the More set and the `useConversations('mine')` unread count for the
   Inbox badge.
2. **`AppShell`** — `src/components/layout/AppShell.tsx` (edit). Remove the mobile hamburger drawer
   (lines 131–162) and the header hamburger button (lines 167–177); make the right column a
   fixed-height flex column with a scrollable `main`; render `MobileTabBar` (`md:hidden`) computing
   `showTabBar` per §2.3; on `/dealers/:id` swap the header brand for a back chevron.
3. **`Dialog`** — responsive bottom sheet below `md` (§6.1).
4. **`Drawer`** — responsive bottom sheet below `md` (§6.2).
5. **`Button` / `Input` / `Select` / `Textarea`** — add the `min-h-11 md:*` / `h-11 md:h-9` mobile
   touch floors (§1).
6. **`Tabs`** — sticky wrapper support (or wrap at the `DealerDetailPage` call site), snap classes,
   `overscroll-x-contain`, active-into-view scroll, `py-3 md:py-2` (§5.1).
7. **`MobileCardList` (optional helper)** — `src/components/ui/MobileCardList.tsx`. A thin
   `<ul className="md:hidden grid gap-2">` + `RecordCard` wrapper so the four card-stacks (§4) and the
   DealerDetail tab tables (§5.2) don't duplicate markup. Signature: `items`, `getKey`, `onSelect?`,
   and a render function returning primary/secondary/meta/actions slots. Keep it dumb — no data
   fetching.
8. **`Sheet` (optional)** — a minimal bottom-sheet list shell for §6.5 if you'd rather not overload
   `Dialog` for the More/action menus.
9. **`index.html` + `index.css`** — the §0 prerequisites (viewport meta; ported safe-area + WebView
   CSS; `sheet-up` keyframes).

**Do-not-touch:** Tailwind config/tokens, the color system, and the desktop (`≥ md`) layout of every
page — all mobile rules are additive `md:` overrides.

---

## 9. Acceptance checklist (per screen, at 360px)

- No screen scrolls horizontally; no element pushes the viewport wider.
- Bottom tab bar visible on Inbox-list / Overview / Dealers / Kavach / Services / Runs / super-admin
  pages; hidden inside an open chat thread and on `/dealers/:id`.
- Inbox: tapping a conversation opens full-screen; hardware-back returns to the list (not out of the
  app); composer and all chat controls ≥ 44px; long-press menu, reactions, and image preview open as
  sheets.
- Dealers / All Users / Activity render as card-stacks; Run History as two-line rows; no wide table
  is visible on a phone.
- DealerDetail tab strip scrolls, snaps, keeps the active tab in view, and every tab body is one
  column.
- Every dialog/drawer opens as a bottom sheet with a sticky footer that stays above the keyboard;
  form fields don't focus-zoom.
- Safe areas respected top (status bar) and bottom (home indicator / tab bar).
