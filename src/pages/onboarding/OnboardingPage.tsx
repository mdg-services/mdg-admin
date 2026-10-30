import { CheckCircle2, ClipboardPen, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  ActionRow,
  Badge,
  Button,
  DataList,
  EmptyState,
  RefreshTool,
  SegmentedControl,
  useToast,
  HowThisWorks,
} from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { ApproveDialog } from '@/features/onboarding/ApproveDialog';
import { CloseDialog } from '@/features/onboarding/CloseDialog';
import { HeldMessagesSection } from '@/features/onboarding/HeldMessagesSection';
import { LogCallDialog, type CallTarget } from '@/features/onboarding/LogCallDialog';
import { MonthlyPriceTool } from '@/features/onboarding/MonthlyPriceTool';
import { OnboardingFunnel } from '@/features/onboarding/OnboardingFunnel';
import { PasswordHelpSection } from '@/features/onboarding/PasswordHelpSection';
import { OutletFollowUpLines } from '@/features/onboarding/SetupFollowUp';
import { StageActions } from '@/features/onboarding/StageActions';
import { useCloseRegistration, useOnboardingBoardQuery } from '@/hooks/api/useOnboarding';
import { agoLabel, istStamp } from '@/lib/intake';
import {
  boardRowKey,
  closeBody,
  companyChipText,
  daysInStage,
  daysLabel,
  formatPaise,
  mdgTurnCount,
  paymentLine,
  portalsLine,
  sortBoardRows,
  stageIntent,
  stageLabel,
  waitingLabel,
  ymdLabel,
  type RegistrationRow,
} from '@/lib/onboarding';
import { lastCallLine } from '@/lib/onboardingCalls';
import { deviceUseLabel, originLabel } from '@/lib/signupOrigin';
import { ageSince } from '@/pages/overview/format';
import { dealerCodeLabel, type OnboardingBoardRow, type OnboardingBoardView } from '@dk/shared';

function viewFromParam(v: string | null): OnboardingBoardView {
  return v === 'live' || v === 'lost' ? v : 'open';
}

const VIEW_EMPTY: Record<OnboardingBoardView, { title: string; description: string }> = {
  open: {
    title: 'Nothing waiting',
    description:
      'A new registration appears here for approval, and an outlet stays here until its services have started.',
  },
  live: {
    title: 'No live outlets from onboarding yet',
    description:
      'An outlet moves here once its watch is over. Outlets from before onboarding v2 are on the Dealers page.',
  },
  lost: {
    title: 'Nothing closed',
    description:
      'An outlet whose onboarding was closed with a reason appears here. A closed registration only leaves the Open list.',
  },
};

/**
 * From a registration to a live outlet, one row each.
 *
 * It replaces the Registrations list and the old seven-step tab. A registration
 * waits here for a yes; once approved it becomes an outlet row that moves through
 * the stages the server works out from facts (signed in, billing details saved, bill
 * sent, paid, logins saved, services started), and the row says whose move it is.
 * Amber is MDG's, blue is the dealer's, and the page lists MDG's first, so the top
 * of the list is always what an admin can do something about.
 *
 * The funnel on top is the last 90 days. The password-help requests sit above the
 * list because somebody is locked out and waiting for a call.
 *
 * The view lives in the URL (`?view=live`), so Back and a shared link land on the
 * same one. Kept fresh by `useOutletSetupLive` in the shell. Every admin sees every
 * button, approving a registration and recording a payment included (owner's
 * decision of 24 Oct).
 */
export function OnboardingPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const q = useOnboardingBoardQuery(view);
  const closeRegistration = useCloseRegistration();
  const [approving, setApproving] = React.useState<RegistrationRow | null>(null);
  const [closing, setClosing] = React.useState<RegistrationRow | null>(null);
  // ── reminders and calls ──
  const [calling, setCalling] = React.useState<CallTarget | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative ("3h 5m ago"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const rows = React.useMemo(() => sortBoardRows(q.data?.rows ?? []), [q.data?.rows]);
  const mdgCount = view === 'open' ? mdgTurnCount(rows) : 0;
  // No board at all, as opposed to an empty one: "Nothing waiting" under a failed
  // request is the one thing this page cannot say wrongly. `isPending`, not
  // `isLoading`, for the skeleton, so a request held back by an offline phone does
  // not fall through to the empty state.
  const failed = q.isError && !q.data;

  function setView(next: OnboardingBoardView) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'open') params.delete('view');
        else params.set('view', next);
        return params;
      },
      { replace: true },
    );
  }

  /** The buttons on a registration. */
  const registrationActions = (r: RegistrationRow, stacked: boolean) => (
    <ActionRow
      below="wrap"
      align="start"
      className={stacked ? 'flex-col !items-stretch' : undefined}
    >
      {/* Not greyed for an existing client: the dialog then offers only "Add as
          another outlet of …" (one person, several pumps) and refuses a plain approve. */}
      <Button size="sm" onClick={() => setApproving(r)}>
        Approve
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setClosing(r)}>
        Close…
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          setCalling({
            kind: 'registration',
            registrationId: r.registrationId,
            name: r.name,
            sapCode: r.sapCode,
          })
        }
      >
        Log call…
      </Button>
    </ActionRow>
  );

  // `stacked` is the table column: one button under another at one width. On a
  // phone card the buttons run in a wrapping row instead.
  const actions = (row: OnboardingBoardRow, stacked: boolean) =>
    row.kind === 'registration' ? (
      registrationActions(row as RegistrationRow, stacked)
    ) : (
      <StageActions outlet={row.outlet} layout={stacked ? 'stack' : 'wrap'} />
    );

  return (
    <div>
      <PageHeader
        title="Onboarding"
        subtitle="From a registration to a live outlet. Amber means the next move is MDG's."
        tools={
          <>
          <HowThisWorks surface="admin-onboarding" label="Onboarding" />
          <RefreshTool
            label="Refresh the onboarding list"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
          </>
        }
      />

      {q.data ? <OnboardingFunnel funnel={q.data.funnel} signups={q.data.signups} /> : null}
      <MonthlyPriceTool />

      {view === 'open' && q.data ? (
        <PasswordHelpSection rows={q.data.passwordHelp} now={now} />
      ) : null}

      {/* ── watch hold ── messages held for a new outlet's first days: send or drop */}
      {view === 'open' ? <HeldMessagesSection now={now} /> : null}

      <SegmentedControl<OnboardingBoardView>
        aria-label="Which outlets"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: 'open', label: mdgCount > 0 ? `Open (${mdgCount} for MDG)` : 'Open' },
          { value: 'live', label: 'Live' },
          { value: 'lost', label: 'Lost' },
        ]}
      />

      <DataList<OnboardingBoardRow>
        rows={rows}
        rowKey={boardRowKey}
        loading={q.isPending}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load onboarding"
              description="This does not mean nothing is waiting. Check the connection and try again."
              cta={
                <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={
                view === 'open' ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <ClipboardPen width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={VIEW_EMPTY[view].title}
              description={VIEW_EMPTY[view].description}
            />
          )
        }
        // Two columns and the buttons, as the Grievances table does: the details
        // need the room, and everything short rides with them.
        minWidth="46rem"
        columns={[
          {
            id: 'who',
            header: 'Who',
            mobile: 'primary',
            cell: (row) =>
              row.kind === 'registration' ? (
                <RegistrationCell r={row as RegistrationRow} now={now} />
              ) : (
                <OutletCell row={row} />
              ),
          },
          {
            id: 'state',
            header: 'Where it stands',
            width: '15rem',
            mobile: 'secondary',
            cell: (row) => <StateCell row={row} now={now} />,
          },
        ]}
        rowActions={(row) => <div className="hidden w-52 md:block">{actions(row, true)}</div>}
        cardActions={(row) => actions(row, false)}
      />

      <LogCallDialog
        target={calling}
        onClose={() => setCalling(null)}
        // "Not interested" offers to close the registration (an outlet's own Close sits on its row).
        onNotInterested={(t: CallTarget) => {
          const row = rows.find(
            (x) =>
              x.kind === 'registration' &&
              t.kind === 'registration' &&
              x.registrationId === t.registrationId,
          );
          if (row) setClosing(row as RegistrationRow);
        }}
      />
      <ApproveDialog row={approving} onClose={() => setApproving(null)} />
      <CloseDialog
        open={!!closing}
        title="Close this registration"
        subject={
          closing ? (
            <>
              <span className="font-medium">{closing.name}</span>
              <span className="text-text-muted"> · SAP code {closing.sapCode}</span>
            </>
          ) : null
        }
        confirmLabel="Close registration"
        pending={closeRegistration.isPending}
        onClose={() => setClosing(null)}
        onSubmit={async (reason) => {
          if (!closing) return;
          await closeRegistration.mutateAsync({ id: closing.registrationId, ...closeBody(reason) });
          toast.success('Registration closed.');
        }}
      />
    </div>
  );
}

/** A registration: who, how to reach them, and the tags that say whether to approve. */
function RegistrationCell({ r, now }: { r: RegistrationRow; now: number }) {
  return (
    // `overflow-wrap: anywhere`, not `break-words`: only the former lets a table
    // cell shrink, and one long pump name would otherwise widen the whole table
    // and push every button off the right edge.
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="select-text font-medium text-text">{r.name}</span>
        <Badge intent="warning">New registration</Badge>
        {/* Which form, and on what device: "App · Android". Absent from a backend older than 30 Oct 2026. */}
        {r.origin ? <Badge>{originLabel(r.origin)}</Badge> : null}
        {r.fromCampaign ? <Badge intent="info">From our campaign</Badge> : null}
        {r.alreadyClient ? (
          <Link to={`/dealers/${r.alreadyClient.dealerId}`}>
            <Badge intent="danger">Already a client: {dealerCodeLabel(r.alreadyClient.code)}</Badge>
          </Link>
        ) : null}
      </div>
      {r.pumpName ? (
        <p className="mt-0.5 select-text text-sm text-text-muted">{r.pumpName}</p>
      ) : null}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-subtle">
        <span className="select-text">
          SAP code <span className="font-mono">{r.sapCode}</span>
        </span>
        {r.siteType ? <Badge>{r.siteType}</Badge> : null}
      </p>
      <div className="mt-0.5">
        <ContactLinks mobile={r.mobile} />
      </div>
      {r.lastCall ? (
        <p className="mt-0.5 text-xs text-text-subtle">{lastCallLine(r.lastCall)}</p>
      ) : null}
      {/* The table has its own column for this; a phone card has no room for one. */}
      <p className="mt-0.5 text-xs text-text-subtle md:hidden">
        Sent {agoLabel(ageSince(r.submittedAt, now))}
      </p>
    </div>
  );
}

/** An outlet: its code (a link to the dealer), its owner and how to reach them. */
function OutletCell({ row }: { row: Extract<OnboardingBoardRow, { kind: 'outlet' }> }) {
  const o = row.outlet;
  const company = companyChipText(o.company);
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link
          to={`/dealers/${o.dealerId}`}
          className="font-semibold text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {dealerCodeLabel(o.code)}
        </Link>
        {o.ownerName ? <span className="select-text text-text">{o.ownerName}</span> : null}
        {/* BPCL or HPCL only: Indian Oil is the usual case and draws nothing (the Setup card names it). */}
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
      {/* A login the team said this outlet does not need, so a missing one is not a gap. */}
      {o.portalsNotNeeded.length > 0 ? (
        <p className="mt-0.5 text-xs text-text-subtle">
          {portalsLine(o.loginsNeeded, o.portalsNotNeeded)}
        </p>
      ) : null}
    </div>
  );
}

/** Where it stands: the stage, whose move it is, how long it has been there, and the bill when there is one. */
function StateCell({ row, now }: { row: OnboardingBoardRow; now: number }) {
  if (row.kind === 'registration') {
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge intent="warning">Waiting for approval</Badge>
        <span className="text-xs text-text-subtle">Waiting on MDG</span>
        <span className="hidden text-xs text-text-subtle md:inline">
          sent {agoLabel(ageSince(row.submittedAt, now))} · {istStamp(row.submittedAt, now)}
        </span>
      </span>
    );
  }
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
