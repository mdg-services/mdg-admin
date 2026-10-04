import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  type DataColumn,
} from '@/components/ui';
import { useFilmSessionsQuery } from '@/hooks/api/useFilms';
import {
  formatPercent,
  formatStartup,
  formatWatchTime,
  sessionDevice,
  sessionPlace,
  sessionSource,
} from '@/lib/films';
import { formatDateTime } from '@/lib/format';
import type { FilmId, FilmSessionRow } from '@dk/shared';

/**
 * Every page load, newest first — the drill-down behind the totals. Not limited
 * to the date range above (the endpoint pages by time, not by range), which the
 * subtitle says. An open that never reached 3 seconds is shown dimmed: it was
 * counted as an open, not as a view.
 */
export function RecentViewsCard({ film, tag }: { film: FilmId; tag: string | undefined }) {
  const q = useFilmSessionsQuery(film, tag, true);
  const rows = React.useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  const columns: DataColumn<FilmSessionRow>[] = [
    {
      id: 'when',
      header: 'Opened',
      cell: (r) => formatDateTime(r.startedAt),
      mobile: 'primary',
      width: '10rem',
    },
    {
      id: 'watched',
      header: 'Watched',
      cell: (r) =>
        r.isView ? (
          <span className="whitespace-nowrap">
            {formatWatchTime(r.watchedSeconds)}{' '}
            <span className="text-text-subtle">({formatPercent(r.percent)})</span>
          </span>
        ) : (
          <span className="text-text-subtle">Opened only</span>
        ),
      mobile: 'primaryRight',
      align: 'right',
      width: '8.5rem',
    },
    { id: 'source', header: 'Link', cell: (r) => sessionSource(r), mobile: 'secondary', truncate: true, width: '10rem' },
    { id: 'place', header: 'Place', cell: (r) => sessionPlace(r), truncate: true, width: '9rem' },
    { id: 'device', header: 'Device', cell: (r) => sessionDevice(r), truncate: true, width: '13rem' },
    {
      id: 'network',
      header: 'Network',
      cell: (r) => (r.network ? r.network.toUpperCase() : '—'),
      width: '5rem',
    },
    {
      id: 'flags',
      header: 'Sound · end',
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          {r.soundOn ? <Badge intent="info">Sound on</Badge> : <Badge>Muted</Badge>}
          {r.completed ? <Badge intent="success">Completed</Badge> : null}
        </span>
      ),
      mobileLabel: 'Watched as',
      width: '11rem',
    },
    {
      id: 'startup',
      header: 'Start',
      cell: (r) => formatStartup(r.startupMs),
      numeric: true,
      width: '4.5rem',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent views</CardTitle>
          <CardSubtitle>
            Every page open, newest first, across all dates{tag ? ' — this link only' : ''}
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none">
        {q.isError ? (
          <p className="px-3 py-6 text-center text-sm text-text-muted md:px-4">
            Could not load recent views.{' '}
            <button
              type="button"
              className="font-semibold text-brand underline"
              onClick={() => void q.refetch()}
            >
              Retry
            </button>
          </p>
        ) : (
          <DataList
            rows={rows}
            columns={columns}
            rowKey={(r) => r.sid}
            loading={q.isLoading}
            rowTone={(r) => (r.isView ? 'default' : 'muted')}
            cardVariant="rows"
            minWidth="64rem"
            empty={
              <p className="px-3 py-6 text-center text-sm text-text-muted md:px-4">
                Nobody has opened the film yet.
              </p>
            }
          />
        )}
        {q.hasNextPage ? (
          <div className="border-t border-border p-3 md:px-4">
            <Button
              variant="secondary"
              loading={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              Show older views
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
