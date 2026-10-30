# Dealer Kavach — Admin

The staff portal at **https://admin.mdgservices.in**. MDG's admins answer dealer chats and
tickets, run each dealer's services and Kavach programme, and read the data the services
collect. It also runs on staff phones, inside the Admin Dealer Kavach app (`mdg-admin-app`).

Vite + React 18 + TypeScript, Tailwind, TanStack Query, React Router, Zustand, React Hook Form
with Zod, and a socket.io connection to the API for live updates.

## Run it

Needs Node 20 or newer.

```bash
npm install                  # at the monorepo root, once: installs this app as a workspace
cd mdg-admin
cp .env.example .env         # VITE_API_BASE_URL, default http://localhost:4000/api/v1
npm run dev                  # http://localhost:5173
```

The root install also supplies `eslint` and `tsx`, which this package uses but does not list.
In a standalone clone of this repo, `npm install` here is enough to run and build (Vercel does
exactly that), but not to lint.
Port 5173 matters: it is the one origin the local API accepts by default (`CORS_ORIGINS` in
`mdg-backend/.env.example`). Never point a laptop at the production database to try a page; see
"Local stack for UI checks" below.

## Check it

```bash
npm run typecheck
npm run lint
npm run build            # tsc, then vite build
npm run check:intake     # plain-logic checks, run with node's test runner through tsx
npm run check:onboarding # the Onboarding page's rules and request bodies, the same way
npx tsx --test scripts/chatAsk.check.ts
```

**There is no UI test runner.** Keep every decision that can be tested in a plain module
(a `format.ts` beside the page) so a runner, when one arrives, has something to run.

## Deploy

**A push to `main` is a production deploy** of admin.mdgservices.in, through Vercel. To stage
a change, push a branch: it builds a preview, but a preview address cannot reach the API,
which answers only the origins on its allow-list.

Deploy by hand with `vercel --prod --yes --force` from this folder. Then open the live page and
check that the `/assets/index-*.js` name changed. Vite names files by content, so an unchanged
name means unchanged code, whatever the dashboard says. A string added to a shared module lands
in that module's own chunk, not in `index-*.js`.

## Shared types

`shared/` is one of four byte-identical copies of `@dk/shared`: the canonical `shared/` at the
monorepo root, plus the copies in `mdg-backend`, `mdg-admin` and `mdg-client`. Vite points
`@dk/shared` at `./shared/src`. Change the canonical copy, copy the change into all three, and
check that `md5` agrees across the four. The root commit hook reformats `shared/`, so run the
copy after that commit, not before.

## Who sees what

Staff sign in at `/login`. `/` goes to the Inbox.

- **Admin.** The everyday pages below, and every tab on a dealer's page except Custom requests.
- **Super-admin** (`isSuperAdmin` on the account). Everything: the 16 pages in the second
  table, and the Custom requests tab. A super-admin creates other admins on the Team page. A
  promotion shows without signing in again, because the app reads `/auth/me`.

A nav entry flagged `superAdminOnly` in `src/components/layout/navItems.ts` only hides the
link. Its route in `App.tsx` must also be wrapped in `RequireSuperAdmin`, and the API checks as
well.

## Pages

Everyday pages (`navItems.ts`, in sidebar order):

| Page | Path | What it is |
| --- | --- | --- |
| Inbox | `/inbox` | Two tabs. **Tickets** (the first): the dealer questions the AI could not settle, and the ones you open by hand, worked from late to replied; each has one Close. **All chats**: every conversation, newest first. Reply, ask for a paper or photo, mark it received or send it back, or say you answered outside the app. |
| Tickets | `/tickets` | Moved: it is the Inbox's Tickets tab, and this address redirects there. |
| Alerts | `/alerts` | Everything that needs a person, across every outlet. Each clears itself once fixed. |
| AI answers | `/ai-answers` | Every answer the AI first line gave a dealer, with a verdict button on each. |
| Overview | `/overview` | Titled "Today": what needs a person now, and a board of every dealer's day. |
| Dealers | `/dealers`, `/dealers/:id` | The list, and one dealer's page (tabs below). |
| Kavach | `/kavach` | The work queue: tasks to verify now, across dealers. Only an MDG admin certifies a task. |
| Kavach standing | `/kavach/dashboard` | Where each dealer stands, and how long since MDG last verified them. |
| Ledger watch | `/ledger-watch` | Every PAD ledger movement that is not the routine buy-and-pay pair. |
| Data Vault | `/data-vault` | Each dealer's collected IRAS shift data, with a day editor at `/data-vault/dealers/:dealerId/days/:businessDate`. |
| Documents | `/documents` | Every paper MDG holds for every outlet, and when it expires. |
| Daily Sales Report | `/dsr` | The day-book each dealer receives. A dealer's reports at `/dsr/dealers/:dealerId`, their fuel P&L at `.../pnl`. |
| Withheld reports | `/assurance` | Every report the correctness gate refused to send. |

Super-admin pages:

| Page | Path | What it is |
| --- | --- | --- |
| Assistant | `/assist` | The website assistant's console: visitors' transcripts and call-back requests. |
| Films | `/films` | Views, drop-off and share links for the two films on mdgservices.in. |
| WhatsApp | `/whatsapp` | The inbox for the WhatsApp numbers we run: a chat for every lead we message and everyone who writes to us, with replies, unread and needs-reply lists, quick replies and live alerts. `?chat=` opens one. |
| Grievances | `/grievances` | Sent from the website or taken down by the assistant. Each stays open until resolved. |
| Onboarding | `/onboarding` | From a "Register your pump" sign-up to a live outlet: approve, bill sent, payment received, start services, watch, with whose move it is on each row, a 90-day funnel and the "forgot password" requests. `?view=live` and `?view=lost` are the other tabs. `/registrations` redirects here. |
| Service Catalog | `/services` | The services (plugins) that can be attached to a dealer. |
| Run History | `/runs` | Timeline of every service run. |
| All Users | `/users` | Every dealer's users, and the platform admins. |
| Work list | `/work-list` | The default staff work catalogue every dealer starts from. |
| Kavach defaults | `/kavach/defaults` | The global Kavach task catalogue. |
| Document catalog | `/document-kinds` | What MDG can ask a dealer for, and how far ahead each expiring paper is chased. |
| Bank holidays | `/bank-holidays` | The holidays the Credit & DOD service treats as non-working days. |
| Depot holidays | `/depot-holidays` | The depot closure calendar the Load Planner reads. |
| Festival greeting | `/festival` | The seasonal band on the report images shared with dealers. |
| Activity | `/activity` | The audit trail of every action in the portal. |
| Team | `/settings/team` | Create and manage admin accounts. |

A dealer's page (`/dealers/:id`) has 14 tabs: Info, Onboarding, Services, Kavach, Kavach tasks,
Warriors & points, Team, Work list, Data Vault, Documents, Password vault, Services provided,
Run history and Custom requests. Only Custom requests is super-admin only.

## On a phone

It works down to a 360 px phone. The bottom bar holds Inbox, Overview, Dealers and Kavach; a
More sheet holds the rest. The rules every screen follows, and the catalogue of shared pieces
(sheets, sticky bars, card lists), are in `docs/MOBILE.md`.

## Layout

```
src/
├── App.tsx            routes, each page loaded only when opened (retries if a piece fails)
├── pages/             one screen per route; bigger ones have a folder of their own
├── features/          assist, chat, films, grievances, intake, onboarding, tickets, users
├── components/ui/     shared primitives; components/layout/ holds the shell, nav and guards
├── hooks/api/         TanStack Query hooks, one file per resource
├── hooks/             phone layout (overlay stack, safe insets, soft keyboard), live updates
├── lib/               API client, socket, formatters, and nativeBridge.ts for the phone app
├── store/auth.ts      the signed-in admin, persisted
└── types/             the one local type file (Credit & DOD)
```

## Local stack for UI checks

To look at a page with real data, without production credentials or the production database:

1. Start an in-memory Mongo (`mongodb-memory-server`) on port 27099.
2. Start the backend against it, with the risky switches off, from `mdg-backend`:
   `MONGODB_URI='mongodb://127.0.0.1:27099/dk_local' SCHEDULER_ENABLED=false PUSH_ENABLED=false ASSIST_ENABLED=false PORT=4100 CORS_ORIGINS='http://localhost:5199' npx tsx src/index.ts`.
   The shell beats `.env`, but check with `ps eww -p <pid>` that it really is on the in-memory
   database before you do anything else.
3. Insert an admin user straight into that database (role `admin`, status `ACTIVE`, a
   `bcryptjs` hash at cost 12, `isSuperAdmin` as you need).
4. Run the admin against it: `VITE_API_BASE_URL='http://localhost:4100/api/v1' npx vite --port 5199 --strictPort`.
5. Drive it with Playwright (`chromium.launch({ channel: 'chrome', headless: true })`), run with
   plain `node`. Under `tsx` the page scripts fail in ways that look like a broken portal.

This catches what `tsc` cannot: a Tailwind class that does not exist, a prop that is ignored,
a phone-width layout that breaks.

## Not built

- **No dark-mode switch.** The colour tokens and Tailwind's `class` strategy are ready; adding
  `dark` to `<html>` turns it on.
- **The top-bar search box is a disabled placeholder** ("Search (coming soon)"), on desktop only.
- **The Custom requests tab** needs the `custom-request` service attached to the dealer first;
  without it the tab says to attach it from the Services tab.
