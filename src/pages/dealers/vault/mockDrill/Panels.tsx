import { Link } from 'react-router-dom';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Checkbox,
  DataList,
  KeyValueList,
  type DataColumn,
  type KeyValueItem,
} from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatDateTime, formatDuration, formatYmd } from '@/lib/format';
import type { MockDrillAdminView, MockDrillRunSummary, MockDrillSubmissionView } from '@dk/shared';

import {
  PORTAL_VIEW,
  modeLabel,
  runActionLabel,
  runStatusView,
  stateView,
  triggerLabel,
} from './format';
import { GeneratedDraft } from './GeneratedDraft';
import { PhotoStrip } from './Photos';

/** What IndianOil's own page says about this outlet, and the Field Officer's remark when it was sent back. */
export function PortalCard({ portal }: { portal: MockDrillAdminView['portal'] }) {
  const v = PORTAL_VIEW[portal.state] ?? PORTAL_VIEW.unknown;
  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>On IndianOil’s portal</CardTitle>
          <CardSubtitle>
            Last read {portal.checkedAt ? formatDateTime(portal.checkedAt) : 'never'}
          </CardSubtitle>
        </div>
        <Badge intent={v.intent}>{v.label}</Badge>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm text-text-muted">{v.line}</p>
        {portal.returnRemark ? (
          <blockquote className="rounded-md border border-danger/40 bg-danger-soft/40 px-3 py-2 text-sm text-text">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Field Officer’s remark
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words">{portal.returnRemark}</p>
          </blockquote>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The outlet's approved, reusable setup: what "same as last time" files. */
export function SetupCard({ setup }: { setup: MockDrillAdminView['setup'] }) {
  const items: KeyValueItem[] = setup
    ? [
        { key: 'scenario', label: 'Emergency', value: setup.scenarioLabel },
        {
          key: 'present',
          label: 'Persons present',
          value: String(setup.personsPresent),
          numeric: true,
        },
        {
          key: 'short',
          label: 'Head-count shortfall',
          value: String(setup.headCountShort),
          numeric: true,
        },
        {
          key: 'observers',
          label: 'Observers',
          value:
            setup.observers.length === 0
              ? '-'
              : setup.observers.map((o) => `${o.name} (${o.area})`).join(', '),
          block: true,
        },
        { key: 'obs', label: 'Observations', value: setup.observations, block: true },
        { key: 'rec', label: 'Recommendations', value: setup.recommendations, block: true },
        {
          key: 'approved',
          label: 'Approved',
          value: `${formatDateTime(setup.approvedAt)}${setup.approvedBy ? ` by ${setup.approvedBy}` : ''}`,
        },
      ]
    : [];
  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>Approved setup</CardTitle>
          <CardSubtitle>
            What the owner’s “Same as last time” files again: the emergency, photos and details an
            admin approved.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {setup ? (
          <>
            <KeyValueList items={items} />
            <PhotoStrip photos={setup.photos} />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            No setup is approved yet. The first drill an admin approves becomes the outlet’s setup.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** One line per past drill; a tap-to-open row would hide the thing the admin came for, so the facts are inline. */
export function HistoryCard({ history }: { history: readonly MockDrillSubmissionView[] }) {
  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>History</CardTitle>
          <CardSubtitle>The last 12 drills, newest first.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none" className="md:p-4">
        {history.length === 0 ? (
          <p className="p-3 text-sm text-text-muted md:p-0">
            No drill has been started for this outlet yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((s) => (
              <HistoryRow key={s.id} submission={s} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ submission: s }: { submission: MockDrillSubmissionView }) {
  const v = stateView(s.state);
  const day = s.confirmedDay ?? s.generated?.date ?? null;
  return (
    <li className="px-3 py-2.5 md:px-0">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 md:min-h-0">
          <Badge intent={v.intent}>{v.label}</Badge>
          <span className="min-w-0 flex-1 break-words text-sm font-medium text-text">
            {s.dependent?.scenarioLabel ?? 'No emergency chosen'}
          </span>
          <span className="text-xs text-text-muted">
            {day ? `Drill on ${formatYmd(day)}` : `Started ${formatDateTime(s.createdAt)}`}
          </span>
        </summary>
        <div className="mt-2 grid gap-2 text-sm text-text-muted">
          <p>
            {modeLabel(s)} · Started {formatDateTime(s.createdAt)}
            {s.reviewedAt
              ? ` · Checked ${formatDateTime(s.reviewedAt)}${s.reviewedBy ? ` by ${s.reviewedBy}` : ''}`
              : ''}
            {s.submittedAt ? ` · Submitted ${formatDateTime(s.submittedAt)}` : ''}
          </p>
          {s.sentBackReason ? <p className="break-words">Sent back: {s.sentBackReason}</p> : null}
          {s.failure ? <p className="break-words text-danger">Failed: {s.failure}</p> : null}
          {s.portalReply ? <p className="break-words">Portal replied: {s.portalReply}</p> : null}
          {s.dependent ? <PhotoStrip photos={s.dependent.photos} /> : null}
          {s.generated && s.dependent ? (
            <GeneratedDraft
              generated={s.generated}
              personsPresent={s.dependent.personsPresent}
              headCountShort={s.dependent.headCountShort}
            />
          ) : null}
        </div>
      </details>
    </li>
  );
}

const RUN_COLUMNS: DataColumn<MockDrillRunSummary>[] = [
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
export function RunsCard({ runs }: { runs: readonly MockDrillRunSummary[] }) {
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
          Each read of the portal, test fill and filing. A test fill files nothing.
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

/** The two switches on the service's attachment, each with one line on what it does. */
export function SwitchesCard({
  autoSubmit,
  reviewReused,
  disabled,
  onChange,
}: {
  autoSubmit: boolean;
  reviewReused: boolean;
  disabled: boolean;
  onChange: (patch: { autoSubmit?: boolean; reviewReused?: boolean }) => void;
}) {
  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>Settings</CardTitle>
          <CardSubtitle>These apply to this outlet only.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Checkbox
          align="start"
          checked={autoSubmit}
          disabled={disabled}
          onChange={(e) => onChange({ autoSubmit: e.target.checked })}
          label="File approved drills by itself"
          hint={
            autoSubmit
              ? 'An approved drill is filed on IndianOil’s site right away. Switch off to file each one by hand with File now.'
              : 'Nothing is filed until someone presses File now here.'
          }
        />
        <Checkbox
          align="start"
          checked={reviewReused}
          disabled={disabled}
          onChange={(e) => onChange({ reviewReused: e.target.checked })}
          label="Check “Same as last time” drills too"
          hint={
            reviewReused
              ? 'A reused setup also waits for an admin before it is filed.'
              : 'A reused setup was already checked once, so it is filed without another check.'
          }
        />
      </CardContent>
    </Card>
  );
}
