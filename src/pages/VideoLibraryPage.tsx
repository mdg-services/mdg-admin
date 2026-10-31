import { Search, X } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Callout,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { VideoCard } from '@/features/videos/VideoCard';
import { VideoDetailDialog } from '@/features/videos/VideoDetailDialog';
import { useGuideVideoLibrary } from '@/hooks/api/useGuideVideos';
import {
  LIBRARY_FILTER_LABELS,
  LIBRARY_FILTERS,
  filterLibrary,
  isLibraryFilter,
  libraryShelves,
  searchLibrary,
  type LibraryFilter,
} from '@/lib/videoLibrary';
import type { GuideVideoAdminItem } from '@dk/shared';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]';

/**
 * Every video MDG has, in one place (it replaced the guide website): the team's
 * walkthroughs of this portal, the Hindi guides a dealer gets in the app chat, the
 * WhatsApp-only one, and the public pump-knowledge explainers. Searchable in Hindi,
 * English or Hindi typed in English letters, down to the chapter.
 *
 * The search, the filter and an open video live in the address (`?q=`, `?show=`,
 * `?v=` and `?t=`), so "the water-dip explainer from 0:42" is a link one admin can
 * paste to another.
 */
export function VideoLibraryPage() {
  const [params, setParams] = useSearchParams();
  const library = useGuideVideoLibrary(true);
  const query = params.get('q') ?? '';
  const showParam = params.get('show');
  const filter: LibraryFilter = isLibraryFilter(showParam) ? showParam : 'all';
  const openId = params.get('v');
  const openAt = Number(params.get('t') ?? 0) || 0;

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const items = library.data ?? [];
  const searching = query.trim().length > 0;
  const hits = React.useMemo(
    () => (searching ? searchLibrary(items, query, filter) : []),
    [items, query, filter, searching],
  );
  const shelves = React.useMemo(
    () => libraryShelves(filterLibrary(items, filter)),
    [items, filter],
  );
  const openVideo = openId ? (items.find((v) => v.id === openId) ?? null) : null;

  const open = (video: GuideVideoAdminItem, startSec: number) =>
    update({ v: video.id, t: startSec > 0 ? String(startSec) : null });

  return (
    <div>
      <PageHeader
        title="Video library"
        subtitle="Every MDG video: the dealer guides, the public pump explainers and the team's walkthroughs. Search in Hindi or English."
      />

      <div className="mb-4 grid gap-2 md:flex md:items-center md:gap-3">
        <div className="relative md:max-w-md md:flex-1">
          <Search
            width={16}
            height={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            aria-hidden
          />
          <Input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="manager jodna, variation, पासवर्ड…"
            aria-label="Search the videos"
            className="pl-9 pr-9"
          />
          {query ? (
            <IconButton
              aria-label="Clear the search"
              onClick={() => update({ q: null })}
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
            >
              <X width={15} height={15} strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
        {/* Four chips do not fit a phone's width: the row scrolls sideways there. */}
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            fullWidthOnMobile={false}
            aria-label="Which videos"
            value={filter}
            onChange={(v) => update({ show: v === 'all' ? null : v })}
            options={LIBRARY_FILTERS.map((f) => ({ value: f, label: LIBRARY_FILTER_LABELS[f] }))}
          />
        </div>
      </div>

      {library.isError ? (
        <Callout onRetry={() => void library.refetch()}>The video library did not load.</Callout>
      ) : library.isPending ? (
        <div className={GRID} aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : searching ? (
        hits.length === 0 ? (
          <EmptyState
            title="No video matches"
            description="Try a shorter word, or the same thing in Hindi or English."
          />
        ) : (
          <section aria-label="Search results">
            <p className="mb-2 text-sm text-text-muted" aria-live="polite">
              {hits.length === 1 ? '1 video' : `${hits.length} videos`}, best match first
            </p>
            <div className={GRID}>
              {hits.map((h) => (
                <VideoCard key={h.item.id} video={h.item} chapter={h.chapter} onOpen={open} />
              ))}
            </div>
          </section>
        )
      ) : (
        <div className="grid gap-8">
          {shelves.map((shelf) => (
            <section key={shelf.key} aria-labelledby={`shelf-${shelf.key}`}>
              <h2 id={`shelf-${shelf.key}`} className="text-base font-semibold text-text">
                {shelf.title}{' '}
                <span className="font-normal text-text-subtle">· {shelf.items.length}</span>
              </h2>
              <p className="mb-3 text-sm text-text-muted">{shelf.blurb}</p>
              <div className={GRID}>
                {shelf.items.map((v) => (
                  <VideoCard key={v.id} video={v} onOpen={open} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <VideoDetailDialog
        video={openVideo}
        startSec={openAt}
        onClose={() => update({ v: null, t: null })}
      />
    </div>
  );
}
