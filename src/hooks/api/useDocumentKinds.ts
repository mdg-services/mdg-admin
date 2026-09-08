import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { DOCUMENT_KIND_SEED, type DocumentKind } from '@dk/shared';
import type { UpdateDocumentKindInput } from '@dk/shared/schemas';

/**
 * The document catalog, read live instead of compiled in.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT IN `useDocumentAsks.ts`
 * ---------------------------------------------------------------------
 * `pages/dataVault/documents/format.ts` used to read `DOCUMENT_KIND_SEED`
 * straight out of `@dk/shared`, with a comment saying that the day a catalog
 * editor and its route existed the constant would become a fallback and the
 * picker would read the live catalog instead. `GET /v1/document-kinds` now
 * exists, so this is that day.
 *
 * It gets its OWN key namespace — `['documentKinds']`, never under
 * `['documentAsks']` — and that separation is load-bearing rather than tidy.
 * Every documents write invalidates the whole `['documentAsks']` prefix on
 * purpose (see `useInvalidateAsks`), and the cadence editor saves one kind at a
 * time: filed under the coarse prefix, each save would refetch the entire estate
 * list behind a screen that is not showing it.
 *
 * THE REVERSE INVALIDATION IS DELIBERATELY ABSENT TOO. Editing a kind's wording
 * does NOT restate any ask already on screen, because the ask froze its own
 * words at creation: `toAdminRow` reads `labelSnapshot` first and only falls
 * back to the catalog. So a catalog write has nothing to say to the ask cache,
 * and wiring one would be a refetch of every row to change nothing.
 */

export const documentKindKeys = {
  all: ['documentKinds'] as const,
  list: (activeOnly: boolean) => ['documentKinds', 'list', activeOnly] as const,
};

/**
 * The catalog as the server holds it.
 *
 * `activeOnly` is for PICKERS — a retired kind must not be offerable — while the
 * cadence editor asks for everything, because a screen showing a retired row is
 * how it gets revived. The two are separate cache entries rather than one filter
 * over the other, so the editor's fuller answer never leaks into a picker.
 *
 * `staleTime` is a minute. This is a handful of rows that change when somebody
 * edits them, and every screen in the documents feature mounts one of these:
 * refetching the catalog on each drawer open would be a request per keystroke on
 * a screen where nothing about it can have changed.
 */
export function useDocumentKindsQuery(opts?: { activeOnly?: boolean; enabled?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: documentKindKeys.list(activeOnly),
    queryFn: () =>
      api.get<DocumentKind[]>('/document-kinds', activeOnly ? { activeOnly: 'true' } : {}),
    enabled: opts?.enabled ?? true,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

/**
 * The kinds a picker may offer, live where possible and shipped where not.
 *
 * THE FALLBACK IS NOT A CONVENIENCE, IT IS THE HONEST FAILURE MODE. The catalog
 * request can be in flight (first paint of the ask dialog) or can fail outright,
 * and a picker with no options is a screen that says MDG cannot ask for
 * anything. The seed is exactly the set of kinds the server was born with, so
 * offering it is never a lie about what the route will accept — it can only be
 * INCOMPLETE, missing a kind an admin added later, and a missing option is a
 * recoverable annoyance where an empty picker is a dead end.
 *
 * Retired kinds are dropped from the fallback for the same reason the query
 * passes `activeOnly`: an ask already filed under a retired kind still resolves
 * its name from its own snapshot, but MDG must not be able to raise a new one.
 */
export const DOCUMENT_KIND_FALLBACK: readonly DocumentKind[] = DOCUMENT_KIND_SEED.filter(
  (k) => k.active,
);

/** What every picker in the documents feature reads. Never empty, never stale-blocking. */
export function useDocumentKindCatalog(): {
  kinds: readonly DocumentKind[];
  /** True while the live catalog has not answered yet — the list below is the seed. */
  isFallback: boolean;
  isLoading: boolean;
} {
  const q = useDocumentKindsQuery({ activeOnly: true });
  const live = q.data;
  if (live && live.length > 0) {
    return { kinds: live, isFallback: false, isLoading: false };
  }
  return { kinds: DOCUMENT_KIND_FALLBACK, isFallback: true, isLoading: q.isLoading };
}

/* ─────────────────────────────── The writes ─────────────────────────────── */

/** Only the catalog's own cache. See the file header for why nothing else. */
function useInvalidateKinds() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: documentKindKeys.all });
}

export interface UpdateDocumentKindVars extends UpdateDocumentKindInput {
  code: string;
}

/**
 * Edit one catalog row — the words, the audience, and the reminder ladder.
 *
 * SUPER-ADMIN ONLY on the server, because the blast radius is every dealer: a
 * ladder changed here decides when every outlet with no per-paper override next
 * hears from MDG about that certificate. The route is
 * `/super-admin/document-kinds/:code`; the nav entry and the route wrapper in
 * `App.tsx` have to agree with it, and the flag in `navItems.ts` only hides the
 * link.
 *
 * `code` is a path segment and never a body field: the route refuses to rename a
 * code at all, because `kindCode` is an ask's only link to what it is.
 */
export function useUpdateDocumentKind() {
  const invalidate = useInvalidateKinds();
  return useMutation({
    mutationFn: ({ code, ...body }: UpdateDocumentKindVars) =>
      api.patch<DocumentKind>(`/super-admin/document-kinds/${code}`, body),
    onSuccess: invalidate,
  });
}
