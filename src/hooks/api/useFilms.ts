import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type {
  FilmId,
  FilmSessionPage,
  FilmShareLink,
  FilmShareLinkRow,
  FilmStats,
  FilmSummary,
} from '@dk/shared';
import type { CreateFilmShareLinkInput } from '@dk/shared/schemas';

/**
 * The two films on mdgservices.in, as the super-admin "Films" page reads them
 * (docs/films/FILM_PAGES_SPEC.md §3.3). Every query is gated on
 * `useIsSuperAdmin()` as well as by the endpoint's own `requireSuperAdmin`, the
 * same as the assistant console: a plain admin who lands on the URL never sends
 * the request.
 */

export const filmsKey = ['films'] as const;
export const filmListKey = ['films', 'list'] as const;
export const filmStatsKey = (film: FilmId, from: string | undefined, to: string, tag: string | undefined) =>
  ['films', 'stats', film, from ?? 'all', to, tag ?? ''] as const;
export const filmSessionsKey = (film: FilmId, tag: string | undefined) =>
  ['films', 'sessions', film, tag ?? ''] as const;
export const filmLinksKey = (film: FilmId) => ['films', 'links', film] as const;

export function useFilmsQuery() {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: filmListKey,
    queryFn: () => api.get<{ items: FilmSummary[] }>('/admin/films'),
    enabled: isSuperAdmin,
    select: (d) => d.items,
  });
}

/**
 * One film's numbers over an IST date range. The server caches each
 * (film, range, tag) for 60 s, so asking more often than that only re-reads the
 * cache. `placeholderData` keeps the previous answer on screen while a new
 * range loads, so switching "7 days" to "30 days" does not blink to a skeleton.
 */
export function useFilmStatsQuery(
  film: FilmId,
  range: { from?: string; to: string },
  tag: string | undefined,
  enabled: boolean,
) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: filmStatsKey(film, range.from, range.to, tag),
    queryFn: () =>
      api.get<FilmStats>(`/admin/films/${film}/stats`, {
        from: range.from,
        to: range.to,
        tag,
      }),
    enabled: isSuperAdmin && enabled,
    staleTime: 60_000,
    placeholderData: (prev, prevQuery) =>
      // Only across a range or tag change on the SAME film — the other film's
      // curve under this film's title would be a wrong answer, not a stale one.
      prevQuery?.queryKey[2] === film ? prev : undefined,
  });
}

const SESSIONS_PAGE = 25;

/** Recent page loads, newest first, paged by `before`. */
export function useFilmSessionsQuery(film: FilmId, tag: string | undefined, enabled: boolean) {
  const isSuperAdmin = useIsSuperAdmin();
  return useInfiniteQuery({
    queryKey: filmSessionsKey(film, tag),
    queryFn: ({ pageParam }) =>
      api.get<FilmSessionPage>(`/admin/films/${film}/sessions`, {
        limit: SESSIONS_PAGE,
        before: pageParam,
        tag,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: isSuperAdmin && enabled,
  });
}

/** This film's live share links, each with how it has done (all time). */
export function useFilmLinksQuery(film: FilmId) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: filmLinksKey(film),
    queryFn: () => api.get<{ items: FilmShareLinkRow[] }>('/admin/films/links', { film }),
    enabled: isSuperAdmin,
    select: (d) => d.items,
  });
}

export function useCreateFilmLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFilmShareLinkInput) =>
      api.post<FilmShareLink>('/admin/films/links', input),
    onSuccess: (link) => {
      void qc.invalidateQueries({ queryKey: filmLinksKey(link.film) });
    },
  });
}

/** Archive, never delete: views already counted under the code keep their label. */
export function useArchiveFilmLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.del<FilmShareLink>(`/admin/films/links/${encodeURIComponent(code)}`),
    onSuccess: (link) => {
      void qc.invalidateQueries({ queryKey: filmLinksKey(link.film) });
    },
  });
}
