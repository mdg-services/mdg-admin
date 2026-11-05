import { Link } from 'react-router-dom';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  KeyValueList,
  type DataColumn,
  type KeyValueItem,
} from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatDateTime, formatDuration, formatYmd } from '@/lib/format';
import type { DuOtpAdminView, DuOtpEntryView, DuOtpRunSummary } from '@dk/shared';

import { RecentEvents } from './Events';
import {
  CERTIFICATE_SOURCE_LABEL,
  FETCH_VIEW,
  runActionLabel,
  runStatusView,
  triggerLabel,
} from './format';
import { OpenFileButton } from './OpenFileButton';

/**
 * The calibration certificate MDG holds for the outlet — what "use the one on
 * file" attaches — and where the eMaaptaul fetch stands. The fetch is started per
 * unit, from its certificate step; this card only reports it.
 */
export function CertificateCard({ view }: { view: DuOtpAdminView }) {
  const cert = view.certificateOnFile;
  const fetch = view.fetch;
  const fetchView = FETCH_VIEW[fetch.state];

  const items: KeyValueItem[] = cert
    ? [
        { key: 'vc', label: 'VC no.', value: cert.vcNumber ?? '-', mono: true, copyable: !!cert.vcNumber },
        {
          key: 'date',
          label: 'Calibration date',
          value: cert.calibrationDate ? formatYmd(cert.calibrationDate) : '-',
        },
        { key: 'source', label: 'Source', value: CERTIFICATE_SOURCE_LABEL[cert.source] },
        {
          key: 'file',
          label: 'File',
          value: (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 break-all">{cert.filename}</span>
              <OpenFileButton url={cert.url} filename={cert.filename} />
            </span>
          ),
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>Certificate on file</CardTitle>
          <CardSubtitle>The calibration certificate MDG already holds for this outlet.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {cert ? (
          <KeyValueList items={items} />
        ) : (
          <p className="text-sm text-text-muted">
            MDG holds no certificate for this outlet yet. Upload one in a unit’s certificate step, or fetch it
            from eMaaptaul.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          <span className="font-medium text-text">eMaaptaul fetch</span>
          <Badge intent={fetchView.intent}>{fetchView.label}</Badge>
          {fetch.at ? <span className="text-xs text-text-muted">{formatDateTime(fetch.at)}</span> : null}
          {fetch.message ? (
            <p className="basis-full break-words text-sm text-text-muted">{fetch.message}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Events closed in the last 14 days: filed by MDG, or finished at the outlet. */
export function RecentCard({ recent }: { recent: readonly DuOtpEntryView[] }) {
  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>Closed in the last 14 days</CardTitle>
          <CardSubtitle>Filed by MDG, or finished at the outlet and gone from the portal’s list.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none" className="md:p-4">
        {recent.length === 0 ? (
          <p className="p-3 text-sm text-text-muted md:p-0">Nothing was closed in the last 14 days.</p>
        ) : (
          <RecentEvents entries={recent} />
        )}
      </CardContent>
    </Card>
  );
}

const RUN_COLUMNS: DataColumn<DuOtpRunSummary>[] = [
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
export function RunsCard({ runs }: { runs: readonly DuOtpRunSummary[] }) {
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
        <CardTitle>Runs</CardTitle>
        <CardSubtitle>Each read of the portal list, test fill and filing. Dry runs file nothing.</CardSubtitle>
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
