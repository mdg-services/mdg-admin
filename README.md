# Dealer Kavach - Frontend

Admin portal for Dealer Kavach. Vite + React 18 + TypeScript, Tailwind CSS, TanStack Query, React Router, Zustand, React Hook Form + Zod, and `@rjsf/core` (with Ajv8) for plugin config forms.

## Prerequisites

- Node 20 (`.nvmrc` at repo root)
- npm 10+
- Backend running locally (see repo root `README.md`)

## Install

From the repo root:

```bash
npm install
```

This installs all workspaces, including this one and `@dk/shared`.

## Environment

Copy `.env.example` to `.env`:

```bash
cp frontend/.env.example frontend/.env
```

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api/v1` | Base URL the fetch client points at. |

## Run

```bash
npm --workspace frontend run dev
```

The Vite dev server boots on http://localhost:5173.

## Build / typecheck

```bash
npm --workspace frontend run typecheck
npm --workspace frontend run build
```

`npm run build` runs `tsc -b` then `vite build`; the production bundle lands in `frontend/dist`.

## Project structure

```
frontend/
├── index.html
├── src/
│   ├── App.tsx                 # router + error boundary
│   ├── main.tsx                # providers (Query, Router, Toast)
│   ├── index.css               # Tailwind directives + style-guide CSS variables
│   ├── lib/
│   │   ├── api.ts              # typed fetch client (Bearer token, ApiError)
│   │   ├── queryClient.ts      # TanStack Query client
│   │   ├── statusIntent.ts     # single source of truth for status -> intent
│   │   ├── cn.ts               # className helper
│   │   └── format.ts           # date / duration helpers
│   ├── store/auth.ts           # Zustand persisted auth store
│   ├── components/
│   │   ├── ui/                 # shadcn-style primitives (no external CLI)
│   │   └── layout/             # AppShell, Breadcrumbs, ProtectedRoute, ErrorBoundary, PageHeader
│   ├── hooks/api/              # TanStack Query hooks (one file per resource)
│   ├── pages/                  # route components + per-page sub-components
│   └── types/overview.ts       # local mirror of OverviewSnapshot until @dk/shared ships it
```

## Routing

| Path | Page | Notes |
|---|---|---|
| `/login` | LoginPage | Public; redirects to `/` on success. |
| `/` | OverviewPage | Protected; KPI cards + recent failures + upcoming runs. |
| `/dealers` | DealersPage | Search, status filter, pagination, "Add dealer" drawer. |
| `/dealers/:id` | DealerDetailPage | Tabs: Info / Services / Run history / Custom requests. |
| `/services` | ServiceCatalogPage | Plugin catalog cards + JSON Schema preview drawer. |
| `/runs` | RunHistoryPage | Timeline grouped by day + filters + run detail dialog. |
| `*` | NotFoundPage | Fallback. |

## UX conventions

- Every list page exposes a loading skeleton, an empty state, and an error state.
- Every mutation surfaces a toast (success or `ApiError.message`).
- All status displays go through `statusIntent()` + `<StatusChip>` (success / warning / danger / info / neutral).
- Dark mode is wired via the `class` strategy on `<html>` (toggle via `document.documentElement.classList.add('dark')`). No in-app toggle ships in this milestone.
- Responsive down to the `md` breakpoint.

## Deviations

- `OverviewSnapshot` type is mirrored locally at `src/types/overview.ts`. The API contract notes that this type will live in `@dk/shared/types/overview.ts` once the backend agent picks it up; we will switch the import to `@dk/shared` then.
- A dark-mode toggle UI is intentionally omitted from this milestone; the tokens + `darkMode: 'class'` plumbing are in place. Toggle by adding/removing `dark` on `<html>`.
- The `custom-request` plugin tab assumes a plugin with id `custom-request` is attached to the dealer. If not attached, the tab shows guidance to attach it from the Services tab.
- Run-now uses `configOverride` as the payload-merging mechanism for custom requests, matching `runNowSchema` in `@dk/shared/schemas`.
- The topbar search input is a placeholder (disabled); a global search lands when the backend exposes a multi-entity search endpoint.
- `@dk/shared` is aliased in `vite.config.ts` to point at the package's TypeScript source (rather than the prebuilt CJS `dist`). This removes a build-order dependency on `npm --workspace shared run build` and lets Vite tree-shake. TypeScript still resolves the same source via the package's `"types"` exports.
- The frontend uses a single `tsconfig.json` (no project references / `tsconfig.node.json`). The Vite config is small, ESM, and validated by the build itself, so a separate Node-targeted TS project is not worth the indirection.
- The optimistic-update aspiration in the agent brief is implemented as a "toast + cache invalidation" pattern rather than RHF-style optimistic state. Mutations call `queryClient.invalidateQueries` on success; this is simpler, race-free, and visually indistinguishable on a fast LAN.

## Verification

- `npm install` - succeeds.
- `npm --workspace frontend run typecheck` - succeeds (no errors).
- `npm --workspace frontend run build` - succeeds; output in `frontend/dist`. Vite emits a single ~680 kB (~211 kB gzipped) JS bundle and ~18 kB CSS. The bundle warning about >500 kB is acknowledged; code-splitting per route is a follow-up.
