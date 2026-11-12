import { Link } from 'react-router-dom';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  type DataColumn,
} from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatDateTime, formatDuration, formatTime, formatYmd } from '@/lib/format';
import type { DeclarationFilingView, DeclarationRunSummary } from '@dk/shared';

import {
  kindTitle,
  outcomeView,
  reusedPhotosLabel,
  runActionLabel,
  runStatusView,
  triggerLabel,
} from './format';
import { WashroomPhotos } from './Photos';

const FILING_COLUMNS: DataColumn<DeclarationFilingView>[] = [
  {
    id: 'day',
    header: 'Date',
    cell: (f) => (
      <span className="whitespace-nowrap">
        {formatYmd(f.day)}
        <span className="block text-xs text-text-subtle">{formatTime(f.at)}</span>
      </span>
    ),
    mobile: 'meta',
    width: '7.5rem',
  },
  {
    id: 'which',
    header: 'Which one',
    cell: (f) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{kindTitle(f.kind)}</span>
        {/* A test fill's result already says "Test fill"; the tag is for the other results of a dry run. */}
        {f.dryRun && f.outcome !== 'filled' ? <Badge intent="info">Test fill</Badge> : null}
      </span>
    ),
    mobile: 'primary',
  },
  {
    id: 'result',
    header: 'Result',
    cell: (f) => {
      const v = outcomeView(f.outcome);
      return <Badge intent={v.intent}>{v.label}</Badge>;
    },
    mobile: 'primaryRight',
  },
  {
    id: 'summary',
    header: 'What happened',
    cell: (f) => (
      <div className="grid gap-1">
        <span className="break-words">{f.summary || outcomeView(f.outcome).sentence}</span>
        {f.month ? (
          <span className="text-xs text-text-subtle">Filed under {f.month} on the portal</span>
        ) : null}
        {reusedPhotosLabel(f.photos) ? (
          <span data-reused-photos className="text-xs text-text-subtle">
            {reusedPhotosLabel(f.photos)}
          </span>
        ) : null}
        {f.photos.length > 0 ? (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-brand md:min-h-0">
              Photos filed ({f.photos.length})
            </summary>
            <div className="mt-2">
              <WashroomPhotos photos={f.photos} showMissing={false} />
            </div>
          </details>
        ) : null}
      </div>
    ),
    mobile: 'secondary',
  },
  {
    id: 'reply',
    header: 'Portal’s reply',
    cell: (f) => (f.portalReply ? <span className="break-words">{f.portalReply}</span> : '-'),
  },
];

/** The last 20 attempts, newest first as the server sends them: the facts are inline, nothing hides behind a tap. */
export function FilingsCard({ history }: { history: readonly DeclarationFilingView[] }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>Recent filings</CardTitle>
          <CardSubtitle>
            The last 20 tries, newest first. A test fill files nothing.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none" className="md:p-4">
        {history.length === 0 ? (
          <p className="p-3 text-sm text-text-muted md:p-0">
            Nothing has been filed for this outlet yet.
          </p>
        ) : (
          <DataList
            rows={history}
            rowKey={(f) => f.id}
            columns={FILING_COLUMNS}
            shape={wide ? 'table' : 'cards'}
            minWidth="52rem"
            cardVariant="rows"
          />
        )}
      </CardContent>
    </Card>
  );
}

const RUN_COLUMNS: DataColumn<DeclarationRunSummary>[] = [
  {
    id: 'action',
    header: 'What it did',
    cell: (r) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{runActionLabel(r)}</span>
        {r.dryRun ? <Badge intent="info">Dry run</Badge> : null}
      </span>
    ),
    mobile: 'primary',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (r) => {
      const view = runStatusView(r.status);
      return <Badge intent={view.intent}>{view.label}</Badge>;
    },
    mobile: 'primaryRight',
  },
  { id: 'trigger', header: 'Started by', cell: (r) => triggerLabel(r.trigger) },
  {
    id: 'started',
    header: 'Started',
    cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.startedAt)}</span>,
  },
  {
    id: 'took',
    header: 'Took',
    cell: (r) =>
      r.finishedAt
        ? formatDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime())
        : '-',
  },
  {
    id: 'summary',
    header: 'What happened',
    cell: (r) => (r.summary ? <span className="break-words">{r.summary}</span> : '-'),
  },
];

/** The service's recent runs, newest first as the server sends them. */
export function RunsCard({ runs }: { runs: readonly DeclarationRunSummary[] }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  return (
    <Card>
      <CardHeader
        padding="comfortable"
        align="center"
        action={
          <Link
            to="?tab=runs"
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            Run history
          </Link>
        }
      >
        <CardTitle>Recent runs</CardTitle>
        <CardSubtitle>
          Each round, read of the pages, test fill and filing. A test fill files nothing.
        </CardSubtitle>
      </CardHeader>
      <CardContent padding="none" className="md:p-4">
        {runs.length === 0 ? (
          <p className="p-3 text-sm text-text-muted md:p-0">No run yet.</p>
        ) : (
          <DataList
            rows={runs}
            rowKey={(r) => r.id}
            columns={RUN_COLUMNS}
            shape={wide ? 'table' : 'cards'}
            minWidth="46rem"
            cardVariant="rows"
          />
        )}
      </CardContent>
    </Card>
  );
}
