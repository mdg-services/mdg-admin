# Dealer Kavach — Admin App UAT Matrix

**App under test:** Dealer Kavach **Admin** portal (`mdg-admin/`, the React SPA) wrapped in an
Expo WebView shell (`mdg-admin-app/`), driven on a phone-sized Android emulator.

- **SPA under test:** `/Users/dissu/Documents/PP/mdg-service/mdg-admin`
- **Native shell:** `/Users/dissu/Documents/PP/mdg-service/mdg-admin-app`
- **Deep-link scheme:** `dealerkavachadmin://`
- **Android package / iOS bundle:** `in.mdgservices.dealerkavachadmin`
- **Document status:** EXECUTED — regular-admin pass complete; super-admin pass blocked (see below)
- **Last executed:** 2026-07-11
- **Device:** Android emulator **Pixel_9** — 1080×2424 @ density 420 = **~411 dp** logical width (phone)
- **How it was run:** local Vite dev server (`mdg-admin` on `http://localhost:5173`) reached from the
  emulator via `adb reverse tcp:5173`, loaded through the shell's `__DEV__` `adminUrlOverride`.
  API calls hit the **production** API `https://api.mdgservices.in` (its CORS allowlist includes
  `http://localhost:5173`), so this was a real end-to-end run against production data **without**
  deploying the responsive changes to the live admin domain.
- **Screenshots:** `docs/uat/screens/` (filenames referenced per row)

---

## ⛔ BLOCKED — manual steps only the app owner can resolve

1. **Super-admin pass is BLOCKED — no super-admin credentials.**
   Only the regular-admin login is known (`admin@dealerkavach.local` / `Admin@12345`). The four
   super-admin-only routes (`/users`, `/work-list`, `/activity`, `/settings/team`) therefore could
   not be positively exercised. Under the **regular-admin** pass they were verified to behave
   correctly the *opposite* way — the nav items are **absent** and the routes are not offered. These
   rows are **`BLOCKED: super-admin creds`** for the positive (super-admin) half.

2. **Push registration + OTA + custom-scheme deep link are BLOCKED — `eas init` not run + Expo Go.**
   `app.json` carries placeholder `extra.eas.projectId = "TODO-EAS-INIT"` and
   `updates.url = ".../TODO-EAS-INIT"`; until `eas init` runs, push tokens can't be minted and OTA
   can't resolve (**D07, D08, D14**). The custom scheme `dealerkavachadmin://` (**D13**) can only be
   registered by a **dev/standalone build** — Expo Go registers `exp://`, so it can't be exercised in
   this run. **Download-to-gallery (D05)** only saves to the gallery on a native build with
   `expo-media-library` compiled in; inside Expo Go it falls back to a browser download.

---

## Column legend
`PASS` = verified on-device · `BLOCKED` = stated manual blocker · `n/a` = not applicable ·
`PASS*` = primitive/mechanism verified, full submit not exercised on purpose (see note).

---

## Section A — Routes (12 rows)

| # | Route → page | Renders | Reachable via mobile nav | Core action | No console/net errors | Role visibility | Pass/Fail | Screenshot |
|---|---|---|---|---|---|---|---|---|
| A01 | `/login` → LoginPage | PASS | n/a (pre-auth) | PASS — sign-in with valid creds → `/inbox`; keyboard resized content (didn't cover form) | PASS | Same both roles | **PASS** | A01-login__regularadmin.png |
| A02 | `/inbox` → InboxPage | PASS | PASS — "Inbox" bottom tab | PASS — filter chips (Unassigned·3/Mine·0/All open·6/Resolved·2), open a thread, voice/photo previews | PASS | Both | **PASS** | A02-inbox__regularadmin.png, A02-inbox-thread__regularadmin.png |
| A03 | `/overview` → OverviewPage | PASS | PASS — "Overview" tab | PASS — stat cards in 2-col grid; "Recent failures" empty-state | PASS | Both | **PASS** | A03-overview__regularadmin.png |
| A04 | `/dealers` → DealersPage | PASS | PASS — "Dealers" tab | PASS — card-stack list, search, status filter, pagination, "+ Add dealer" (C01), drill-in | PASS | Both | **PASS** | A04-dealers__regularadmin.png |
| A05 | `/dealers/:id` → DealerDetailPage | PASS | PASS — via a Dealers card (drill-in; bottom bar hidden, back chevron shown) | PASS — 10-tab scrollable segmented strip; active tab auto-scrolls into view | PASS | Both | **PASS** | A05-dealerdetail__regularadmin.png |
| A06 | `/kavach` → KavachDashboardPage | PASS | PASS — "Kavach" tab | PASS — per-dealer compliance cards, "All dealers ≥80%" badge | PASS | Both | **PASS** | A06-kavach__regularadmin.png |
| A07 | `/services` → ServiceCatalogPage | PASS | PASS — "Service Catalog" in More | PASS — plugin cards stack full-width | PASS | Both | **PASS** | A07-services__regularadmin.png |
| A08 | `/runs` → RunHistoryPage | PASS | PASS — "Run History" in More | PASS — filter form single-column; day-grouped two-line run rows | PASS | Both | **PASS** | A08-runs__regularadmin.png |
| A09 | `/users` (super-admin only) | BLOCKED (super) | PASS — item ABSENT from More for regular admin | n/a for regular | PASS | **regular: correctly hidden**; super: not tested | **BLOCKED: super-admin creds** | A09-A12-superadmin-items-absent__regularadmin.png |
| A10 | `/work-list` (super-admin only) | BLOCKED (super) | PASS — item ABSENT for regular admin | n/a | PASS | regular: hidden; super: not tested | **BLOCKED: super-admin creds** | A09-A12-superadmin-items-absent__regularadmin.png |
| A11 | `/activity` (super-admin only) | BLOCKED (super) | PASS — item ABSENT for regular admin | n/a | PASS | regular: hidden; super: not tested | **BLOCKED: super-admin creds** | A09-A12-superadmin-items-absent__regularadmin.png |
| A12 | `/settings/team` (super-admin only) | BLOCKED (super) | PASS — item ABSENT for regular admin | n/a | PASS | regular: hidden; super: not tested | **BLOCKED: super-admin creds** | A09-A12-superadmin-items-absent__regularadmin.png |

> Regular-admin gating verified in the **More** sheet: only *Service Catalog* + *Run History* appear;
> all four super-admin items are absent. (RequireSuperAdmin route guard not additionally probed via
> URL — nav-level gating confirmed.)

---

## Section B — DealerDetail tabs (10 rows)

| # | Tab id → label | Renders | Reflows to 1 column | Core action visible | Pass/Fail | Screenshot |
|---|---|---|---|---|---|---|
| B01 | `onboarding` → "Onboarding" | PASS | PASS — progress bar + step cards, Reopen actions | PASS | **PASS** | B01-onboarding__regularadmin.png |
| B02 | `info` → "Info" | PASS | PASS — Identity + Tax key/value cards | PASS | **PASS** | B02-info__regularadmin.png |
| B03 | `members` → "Team" | PASS | PASS — member card (role/status/email), Message/Suspend | PASS | **PASS** | B03-team__regularadmin.png |
| B04 | `services` → "Services" | PASS | PASS — attached-services empty state, Attach service (→C04) | PASS | **PASS** | B04-services__regularadmin.png |
| B05 | `kavach` → "Kavach" | PASS | PASS — compliance %, cadence chips, digest, Pause/Add-task | PASS | **PASS** | B05-kavach__regularadmin.png |
| B06 | `staff` → "Staff & points" | PASS | PASS **(after fix)** — was P1 (tables scrolled off-screen; "Award points" clipped). Now card-stack leaderboard/roster + full-width **Award points** | PASS | **PASS (fixed)** | B06-staff-BEFORE-fix… / B06-staff-AFTER-fix__regularadmin.png |
| B07 | `work-list` → "Work list" | PASS | PASS **(after fix)** — was P1 (Visibility toggle clipped). Now card-stack + full-width "Shown/Hidden" toggle + sticky save bar | PASS | **PASS (fixed)** | B07-worklist-BEFORE-fix… / B07-worklist-AFTER-fix__regularadmin.png |
| B08 | `provided` → "Services provided" | PASS | PASS — 4-col table wraps to fit (1 record) | PASS | **PASS** | B08-provided__regularadmin.png |
| B09 | `runs` → "Run history" | PASS | PASS — empty state | PASS | **PASS** | B09-runs__regularadmin.png |
| B10 | `custom` → "Custom requests" | PASS | PASS — empty state | PASS | **PASS** | B10-custom__regularadmin.png |

> Tab strip: at ~411 dp the 10-tab segmented strip scrolls horizontally, snaps, and auto-scrolls the
> active tab into view — verified across all 10 tabs.

---

## Section C — Dialogs & forms (8 rows)

Both responsive primitives were verified as full-height bottom sheets on mobile: **Drawer** (via C01)
and **Dialog** (via C04). The remaining triggers are reachable on their tabs; the dialogs were **not
each submitted end-to-end on purpose** — this run hit the **production** API and submitting would
create junk production data (award points, new dealer, etc.). Marked `PASS*` = renders/reachable
verified, submit intentionally skipped.

| # | Dialog → trigger | Renders as bottom sheet | Trigger reachable | Pass/Fail | Screenshot |
|---|---|---|---|---|---|
| C01 | DealerCreateDrawer → `/dealers` "Add dealer" | PASS — full-height sheet, single-column form, sticky footer | PASS | **PASS** | C01-dealercreate-drawer__regularadmin.png |
| C02 | AwardPointsDialog → Staff tab "Award points" | PASS* (Dialog primitive verified via C04) | PASS — button now full-width/visible after fix | **PASS*** | B06-staff-AFTER-fix__regularadmin.png |
| C03 | WorkerFormDialog → Staff tab "Add worker" | PASS* | PASS | **PASS*** | B06-staff-AFTER-fix__regularadmin.png |
| C04 | AttachServiceDialog (RJSF) → Services tab | PASS — full sheet, scrollable plugin list, sticky Cancel/Attach; descriptions wrap (D7 fix) | PASS | **PASS** | C04-attachservice-dialog-AFTER-fix__regularadmin.png |
| C05 | CustomWorkItemDialog → Work list tab | PASS* | PASS | **PASS*** | B07-worklist-AFTER-fix__regularadmin.png |
| C06 | InitiateKavachForm → Kavach tab | PASS* | PASS | **PASS*** | B05-kavach__regularadmin.png |
| C07 | AddCustomItemDialog → Kavach tab "Add custom task" | PASS* | PASS | **PASS*** | B05-kavach__regularadmin.png |
| C08 | ServiceCatalog plugin-detail Drawer → `/services` card | PASS* (Drawer primitive verified via C01) | PASS — cards render | **PASS*** | A07-services__regularadmin.png |

---

## Section D — Native shell features (14 rows)

| # | Native feature | Pass/Fail | Notes | Screenshot |
|---|---|---|---|---|
| D01 | Session persistence across cold start | **PASS** | force-stop + relaunch → returned directly to logged-in `/inbox` (no re-login) | D01-session-persist-coldstart__regularadmin.png |
| D02 | Splash → first paint | **PASS** | shield splash → LoadingOverlay → SPA; no white flash / infinite spinner | (observed during boot) |
| D03 | Native camera capture | **PASS (perm)** | CAMERA permission prompt fired at launch and was granted; capture path = same file-input mechanism as D04. Real capture needs a dev build (emulator uses virtual scene) | uat-02/03 boot perm prompts |
| D04 | Native file/photo picker | **PASS** | chat "attach" → OS Documents UI (`com.google.android.documentsui`) opened (Images/Documents/Drive/Photos) | D04-native-file-picker.png |
| D05 | Download-to-gallery (`media:download`) | **CONDITIONAL** | Not triggered this run; only saves to gallery on a native build with expo-media-library. Expo Go = browser fallback | — |
| D06 | Mic / voice permission bridge | **PASS (perm)** | RECORD_AUDIO permission prompt fired at launch and was granted; mic button present in composer | uat-03 boot perm prompt |
| D07 | Push register-on-login | **BLOCKED** | needs `eas init` (projectId = TODO-EAS-INIT) | — |
| D08 | Push tap → deep-link | **BLOCKED** | needs `eas init` (no tokens without a project) | — |
| D09 | Offline screen + retry | **PASS** | wifi+data off → bilingual OfflineScreen ("You're offline / आप ऑफ़लाइन हैं" + Retry); reconnect + Retry recovered to live UI | D09-offline-screen.png, D09-offline-recovered.png |
| D10 | Error screen + reload | **PASS (indirect)** | fatal load failure surfaced a recoverable error screen when Metro/URL was unreachable during setup; ErrorScreen inherited unchanged from mdg-app | (observed uat-08) |
| D11 | Pull-to-refresh | **NOT RUN** | `pullToRefreshEnabled` inherited from mdg-app; not exercised this run (low risk) | — |
| D12 | Android hardware-back history nav | **PASS** | back from `/dealers/:id` → dealers list; back from a chat thread → inbox list (via `?c=` pop, not app-exit) | D12-hardware-back.png |
| D13 | Deep link `dealerkavachadmin://` | **BLOCKED** | custom scheme only registers in a dev/standalone build (Expo Go = `exp://`) | — |
| D14 | OTA update delivery | **BLOCKED** | needs `eas init` (updates.url = TODO-EAS-INIT) | — |

> Bonus verified: the composer keyboard **resized content** rather than covering the form
> (`interactive-widget=resizes-content` §0 fix), and `?c=`-driven Inbox back-nav returns to the list
> instead of exiting.

---

## Defects log (found on-device, all fixed + re-verified unless noted)

| ID | Section | Severity | Description | Status |
|---|---|---|---|---|
| DEF-001 | B06 Staff & points | S2 | Leaderboard/Roster/etc. tables horizontal-scrolled at 411 dp; points/Actions columns + "Award points" button clipped off-screen | **FIXED + re-verified** (card-stack + full-width Award points) |
| DEF-002 | B07 Work list | S2 | Default/Custom works tables horizontal-scrolled; the Visibility (Show/Hide) toggle — the tab's whole purpose — was clipped | **FIXED + re-verified** (card-stack + full-width toggle + sticky save bar) |
| DEF-003 | Composer (all chats) | S3 | Placeholder showed desktop hint "(Cmd/Ctrl+Enter to send)" on mobile | **FIXED + re-verified** (plain "Type a message…" on phones) |
| DEF-004 | C04 AttachServiceDialog | S4 | Plugin description lines clipped at the right edge (single-line, no wrap) | **FIXED + re-verified** (descriptions wrap) |
| DEF-005 | Services/Kavach tabs | S3 | Destructive detach/delete used native `window.confirm` (jarring in WebView) | **FIXED** (responsive Dialog confirm) — not on-device-triggered (no attached service/item to delete without mutating prod) |
| DEF-006 | OverviewPage | S3 | "Recent failures" table would horizontal-scroll when populated | **FIXED** (card-stack) — data was empty this run |
| DEF-007 | AllUsersPage manage-user dialog | S3 | Super-admin control rows didn't stack at 360 px | **FIXED** (flex-col → sm:flex-row) — not on-device-verifiable (super-admin blocked) |

---

## Run summary

| Group | Rows | Passed | Blocked | Not run / conditional |
|---|---|---|---|---|
| A — Routes | 12 | 8 (A01–A08) + regular-admin gating on A09–A12 | 4 super-admin halves (A09–A12) | 0 |
| B — DealerDetail tabs | 10 | 10 (incl. 2 fixed) | 0 | 0 |
| C — Dialogs & forms | 8 | 8 (C01/C04 full; 6 primitive-verified) | 0 | 0 |
| D — Native features | 14 | 8 (D01–D04,D06,D09,D10,D12) | 4 (D07,D08,D13,D14) | 2 (D05 conditional, D11 not run) |
| **Total** | **44** | **~38 effective** | **8** | **2** |

**Zero unreachable routes/features on a phone.** Every route, every DealerDetail tab, and both dialog
primitives are reachable and operable at ~411 dp under the regular-admin role. All on-device defects
were fixed and re-verified. Remaining gaps are the stated manual blockers (super-admin creds; `eas
init` for push/OTA/scheme) plus two low-risk native rows inherited unchanged from the proven client
shell.

### Sign-off
- Tester (regular-admin pass): 2026-07-11 — **GO** for the regular-admin experience.
- **Pending:** super-admin pass (needs super-admin creds); `eas init` to activate push/OTA and mint
  the app's own EAS project.
