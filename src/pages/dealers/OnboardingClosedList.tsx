import { ClipboardPen, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, DataList, EmptyState } from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { OutletFollowUpLines } from '@/features/onboarding/SetupFollowUp';
import { StageActions } from '@/features/onboarding/StageActions';
import { useOnboardingBoardQuery } from '@/hooks/api/useOnboarding';
import {
  boardRowKey,
  companyChipText,
  daysInStage,
  daysLabel,
  formatPaise,
  paymentLine,
  portalsLine,
  sortBoardRows,
  stageIntent,
  stageLabel,
  waitingLabel,
  ymdLabel,
} from '@/lib/onboarding';
import { rosterMatches } from '@/lib/onboardingNext';
import { deviceUseLabel, originLabel } from '@/lib/signupOrigin';
import { dealerCodeLabel, type OnboardingBoardRow } from '@dk/shared';

type OutletBoardRow = Extract<OnboardingBoardRow, { kind: 'outlet' }>;
type RegistrationBoardRow = Extract<OnboardingBoardRow, { kind: 'registration' }>;

const EMPTY = {
  live: {
    title: 'No live outlets from onboarding yet',
    description:
      'An outlet moves here once its watch is over. Outlets from before onboarding v2 are in the Services list.',
  },
  lost: {
    title: 'Nothing closed',
    description:
      'An outlet or registration that was closed with a reason appears here, with the reason.',
  },
} as const;

/**
 * The Dealers page's Onboarding view, Live and Lost: outlets that came through
 * onboarding and are now running ("Live"), and ones whose setup was closed with a
 * reason ("Lost"). The open ones are the roster's. Same rows, same buttons as the
 * roster (`StageActions`), narrowed by the page's search box.
 */
export function OnboardingClosedList({
  view,
  search,
  now,
}: {
  view: 'live' | 'lost';
  search: string;
  now: number;
}) {
  const q = useOnboardingBoardQuery(view);
  const rows = React.useMemo(
    () => sortBoardRows(q.data?.rows ?? []).filter((r) => rosterMatches(r, search)),
    [q.data?.rows, search],
  );
  // "Nothing closed" under a failed request is the one thing this list cannot say wrongly.
  const failed = q.isError && !q.data;

  return (
    <DataList<OnboardingBoardRow>
      rows={rows}
      rowKey={boardRowKey}
      loading={q.isPending}
      cardVariant="rows"
      minWidth="46rem"
      empty={
        failed ? (
          <EmptyState
            icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
            title="Could not load this list"
            description="This does not mean it is empty. Check the connection and try again."
            cta={
              <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ClipboardPen width={24} height={24} strokeWidth={1.75} />}
            title={search.trim() ? 'No outlet matches' : EMPTY[view].title}
            description={
              search.trim()
                ? 'Search looks at the code, the owner, the phone and the SAP code.'
                : EMPTY[view].description
            }
          />
        )
      }
      columns={[
        {
          id: 'who',
          header: 'Who',
          mobile: 'primary',
          cell: (r) =>
            r.kind === 'registration' ? <ClosedRegistrationWho row={r} /> : <WhoCell row={r} />,
        },
        {
          id: 'state',
          header: 'Where it stands',
          width: '15rem',
          mobile: 'secondary',
          cell: (r) =>
            r.kind === 'registration' ? (
              <span className="flex flex-col items-start gap-1">
                <Badge>Registration closed</Badge>
                {r.lostReason ? <span className="text-xs text-text-subtle">{r.lostReason}</span> : null}
              </span>
            ) : (
              <StateCell row={r} now={now} />
            ),
        },
      ]}
      rowActions={(r) =>
        r.kind === 'outlet' ? (
          <div className="hidden w-52 md:block">
            <StageActions outlet={r.outlet} layout="stack" />
          </div>
        ) : null
      }
      cardActions={(r) => (r.kind === 'outlet' ? <StageActions outlet={r.outlet} layout="wrap" /> : null)}
    />
  );
}

/** A registration that was closed: who it was, and how to reach them. */
function ClosedRegistrationWho({ row }: { row: RegistrationBoardRow }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <p className="select-text text-sm font-medium text-text">{row.name}</p>
      <p className="mt-0.5 select-text text-xs text-text-subtle">
        SAP code <span className="font-mono">{row.sapCode}</span>
      </p>
      <div className="mt-0.5">
        <ContactLinks mobile={row.mobile} />
      </div>
    </div>
  );
}

/** An outlet: its code (a link to the dealer), its owner and how to reach them. */
function WhoCell({ row }: { row: OutletBoardRow }) {
  const o = row.outlet;
  const company = companyChipText(o.company);
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link
          to={`/dealers/${o.dealerId}?tab=info`}
          className="font-semibold text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {dealerCodeLabel(o.code)}
        </Link>
        {o.ownerName ? <span className="select-text text-text">{o.ownerName}</span> : null}
        {company ? <Badge>{company}</Badge> : null}
      </div>
      {o.mobile ? (
        <div className="mt-0.5">
          <ContactLinks mobile={o.mobile} />
        </div>
      ) : null}
      {o.origin || o.lastSignIn ? (
        <p className="mt-0.5 text-xs text-text-subtle">
          {[
            o.origin ? `Signed up: ${originLabel(o.origin)}` : null,
            o.lastSignIn ? `Uses: ${deviceUseLabel(o.lastSignIn.device)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {o.portalsNotNeeded.length > 0 ? (
        <p className="mt-0.5 text-xs text-text-subtle">
          {portalsLine(o.loginsNeeded, o.portalsNotNeeded)}
        </p>
      ) : null}
    </div>
  );
}

/** Where it stands: the stage, whose move it is, how long it has been there, and the bill when there is one. */
function StateCell({ row, now }: { row: OutletBoardRow; now: number }) {
  const o = row.outlet;
  const waiting = waitingLabel(o.waitingOn);
  const days = daysInStage(o.stageSince, now);
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge intent={stageIntent(o)}>{stageLabel(o)}</Badge>
      {waiting ? <span className="text-xs text-text-subtle">{waiting}</span> : null}
      {o.stage !== 'live' && o.stage !== 'lost' ? (
        <span className="text-xs text-text-subtle">{daysLabel(days)} in this step</span>
      ) : null}
      {o.stage === 'payment' && o.payment.amountPaise ? (
        <span className="text-xs text-text-subtle">
          {formatPaise(o.payment.amountPaise)}
          {o.payment.dueOn ? `, due ${ymdLabel(o.payment.dueOn)}` : ''}
        </span>
      ) : null}
      {o.stage === 'lost' && o.lost ? (
        <span className="text-xs text-text-subtle">{o.lost.reason}</span>
      ) : null}
      {o.stage === 'live' ? (
        <span className="text-xs text-text-subtle">{paymentLine(o.payment)}</span>
      ) : null}
      <OutletFollowUpLines outlet={o} />
    </span>
  );
}
