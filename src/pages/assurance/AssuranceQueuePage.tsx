import {
  AlertCircle,
  NotebookPen,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  HowThisWorks,
  Label,
  MobileCardList,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import {
  useAssuranceHolds,
  type AssuranceHoldRow,
} from '@/hooks/api/useAssuranceQueue';
import { useDealersQuery } from '@/hooks/api/useDealers';
import {
  DECISION_LABEL,
  DECISION_NOTE,
  HOLDS_SCAN_LIMIT,
  partitionHolds,
} from '@/lib/assuranceCatalogue';
import { formatYmd } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import { dealerCodeLabel } from '@dk/shared';

import { RemarksPanel } from './RemarksPanel';

/**
 * Everything the pre-send gate is withholding, across every dealer.
 *
 * WHY THIS SCREEN IS THE POINT OF THE WHOLE LAYER. Without it a hold is
 * discovered by trying to share — and on the automatic paths nobody is trying.
 * The Kavach daily digest posts on its own schedule, at its own hour, with no
 * admin in the loop, so a report it declines to send would never be looked at
 * by anyone. This is the only place an artefact nobody asked about surfaces.
 *
 * WHY IT MATTERS THAT IT IS PRE-SEND. Nothing is recallable: `routes/v1/messages`
 * has no delete and no edit, and every attachment is presigned with no prefix
 * check, so the instant a message row exists the dealer can fetch the cards.
 * That is also why the already-sent rows below are a separate, clearly-labelled
 * group — they are history, and no action on this page empties them.
 *
 * The colour rule this page obeys: a held row is NOT painted red. Every row
 * here is held, so red on all of them carries no information; the badge label
 * carries the one thing that varies, which is whether the report looks wrong or
 * we could not check it.
 */

/**
 * How many held rows to ask for.
 *
 * The server caps `limit` at 200 and stops scanning once it has that many, so
 * asking for 100 is a working list rather than a promise of completeness — the
 * page says so out loud when it comes back full.
 */
const HOLD_LIMIT = 100;

export function AssuranceQueuePage() {
  const holdsQ = useAssuranceHolds(HOLD_LIMIT);
  const rows = React.useMemo(() => holdsQ.data ?? [], [holdsQ.data]);
  const { queue, history } = React.useMemo(
    () => partitionHolds(rows),
    [rows],
  );

  // Which dealer's standing remarks are open. The id is held here, above the
  // drawer, so a row's Remarks button can set it — but the drawer itself is
  // MOUNTED only while open, which is what keeps its dealer-roster request off
  // the load of a page whose job is the queue.
  const [remarksOpen, setRemarksOpen] = React.useState(false);
  const [remarksDealerId, setRemarksDealerId] = React.useState<string>('');

  function openRemarks(dealerId: string) {
    setRemarksDealerId(dealerId);
    setRemarksOpen(true);
  }

  // Full response = the scan stopped at the limit, so there may be more behind
  // it. Said out loud rather than letting a truncated list read as the whole of
  // what is being withheld.
  const maybeTruncated = rows.length >= HOLD_LIMIT;

  return (
    <div>
      <PageHeader
        title="Withheld reports"
        subtitle="Every report the correctness gate is refusing to send, across every dealer. Nothing posted to a dealer can be recalled, so refusing to send is the only defence — and this is the only place a hold on an automatic path is ever seen."
        actions={
          <>
            <Badge
              intent={queue.length > 0 ? 'warning' : 'success'}
              className="h-7 px-3"
            >
              {queue.length} withheld
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                openRemarks(remarksDealerId || queue[0]?.dealerId || '')
              }
              leftIcon={
                <NotebookPen width={14} height={14} strokeWidth={1.75} />
              }
            >
              Standing remarks
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void holdsQ.refetch()}
              loading={holdsQ.isRefetching}
              leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
            >
              Refresh
            </Button>
            <HowThisWorks
              surface="admin-assurance-queue"
              label="Withheld reports"
              variant="icon"
            />
          </>
        }
      />

      {maybeTruncated ? (
        <Callout intent="warning" className="mb-4">
          Showing the first {HOLD_LIMIT} withheld reports. The scan stops there,
          so there may be more behind them — clear these and refresh.
        </Callout>
      ) : null}

      {holdsQ.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : holdsQ.isError ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the withheld reports"
              description={(holdsQ.error as Error).message}
              cta={
                <Button
                  onClick={() => void holdsQ.refetch()}
                  leftIcon={
                    <RotateCw width={16} height={16} strokeWidth={1.75} />
                  }
                >
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
              title="Nothing is being withheld"
              description={`The gate re-read the ${HOLDS_SCAN_LIMIT.toLocaleString('en-IN')} most recent reports when this page loaded and is withholding none of them. It runs the same checks again at the moment of every share, so this is a live answer and not a stored pass.`}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:gap-6">
          {queue.length > 0 ? (
            <HoldSection
              title="Not sent — waiting on you"
              subtitle="Held before reaching the dealer. Open the report to see the figures, regenerate it, or release it from its own panel with a reason."
              rows={queue}
              onRemarks={openRemarks}
            />
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  icon={
                    <ShieldCheck width={28} height={28} strokeWidth={1.75} />
                  }
                  title="Nothing is waiting on you"
                  description="Every report the gate is holding right now was already sent before it was flagged. Those are listed below as history."
                />
              </CardContent>
            </Card>
          )}

          {history.length > 0 ? (
            <HoldSection
              title="Already with the dealer"
              subtitle="Sent before the gate flagged them. There is no message delete and no message edit anywhere in the product, so these cannot be unsent and no action here empties them. Listed so they are not silently dropped — if the figures were wrong, the dealer has to be told in the chat."
              rows={history}
              onRemarks={openRemarks}
              tone="history"
            />
          ) : null}
        </div>
      )}

      {/* Mounted only while open. `Drawer` renders null when closed, but the
          hooks inside it would still run — and the dealer roster is a request
          this page has no other use for. */}
      {remarksOpen ? (
        <RemarksDrawer
          dealerId={remarksDealerId}
          onDealerChange={setRemarksDealerId}
          fallbackOutletCode={
            rows.find((r) => r.dealerId === remarksDealerId)?.outletCode ?? null
          }
          onClose={() => setRemarksOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The remarks drawer, with its own dealer picker.
 *
 * A separate component so the dealer roster is fetched the first time an admin
 * opens it and not on every visit to the queue. The picker is here rather than
 * inside `RemarksPanel` because the panel is meant to be droppable into a
 * dealer's own screen, where the dealer is already decided.
 */
function RemarksDrawer({
  dealerId,
  onDealerChange,
  fallbackOutletCode,
  onClose,
}: {
  dealerId: string;
  onDealerChange: (dealerId: string) => void;
  /** The code the queue already knows, used until the roster lands. */
  fallbackOutletCode: string | null;
  onClose: () => void;
}) {
  const dealersQ = useDealersQuery({ page: 1, pageSize: 200 });
  const dealers = dealersQ.data?.items ?? [];
  const outletCode =
    dealers.find((d) => d.id === dealerId)?.code ?? fallbackOutletCode;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Standing remarks
          <HowThisWorks
            surface="admin-standing-remarks"
            label="Standing remarks"
            variant="icon"
          />
        </span>
      }
      description="A fault that is real, physical and ongoing — a dead dip gauge, a nozzle out of service — written down once instead of explained on every report."
    >
      <div className="grid gap-4">
        <div>
          <Label htmlFor="remarks-dealer">Dealer</Label>
          <Select
            id="remarks-dealer"
            value={dealerId}
            onChange={(e) => onDealerChange(e.target.value)}
          >
            <option value="">Pick a dealer</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {dealerCodeLabel(d.code)}
              </option>
            ))}
          </Select>
          {dealersQ.isError ? (
            <Callout
              intent="warning"
              className="mt-2"
              onRetry={() => void dealersQ.refetch()}
            >
              The dealer list could not be loaded, so the picker above is empty.
            </Callout>
          ) : null}
        </div>

        {dealerId ? (
          <RemarksPanel dealerId={dealerId} outletCode={outletCode} />
        ) : (
          <EmptyState
            icon={<NotebookPen width={28} height={28} strokeWidth={1.75} />}
            title="Pick a dealer"
            description="Remarks are per dealer — a broken gauge is a fact about one outlet's tank, never about the fleet."
          />
        )}
      </div>
    </Drawer>
  );
}

/**
 * The decision as a chip.
 *
 * `ERROR` is the only one painted danger, and that is deliberate: on a page
 * where every row is already withheld, colour that marks all of them says
 * nothing. What varies is whose problem it is — a hold is a statement about the
 * report, an error is a statement about us, and only the second one means an
 * engineer rather than a regeneration.
 */
const DECISION_INTENT: Record<string, Intent> = {
  HOLD: 'warning',
  ERROR: 'danger',
  PASS: 'success',
};

function HoldSection({
  title,
  subtitle,
  rows,
  onRemarks,
  tone = 'queue',
}: {
  title: string;
  subtitle: string;
  rows: AssuranceHoldRow[];
  onRemarks: (dealerId: string) => void;
  tone?: 'queue' | 'history';
}) {
  const navigate = useNavigate();

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          {title} · {rows.length}
        </h2>
        <p className="mt-1 text-xs text-text-subtle">{subtitle}</p>
      </div>

      <Card>
        <CardContent padding="none" className="md:p-4">
          {/* Desktop table (≥ md) */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <TRow>
                  <TH>Outlet</TH>
                  <TH>Business date</TH>
                  <TH>Decision</TH>
                  <TH>Why it is being withheld</TH>
                  <TH />
                </TRow>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TRow
                    key={row.reportId}
                    clickable
                    className={tone === 'history' ? 'opacity-70' : undefined}
                    onClick={() => navigate(reportHref(row))}
                  >
                    <TD className="font-mono font-medium align-top">
                      {/* A real anchor inside the clickable row, so the code can
                          be long-pressed and copied and reads as a link to a
                          screen reader. The row's own handler is stopped here so
                          the navigation happens once. */}
                      <Link
                        to={reportHref(row)}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {dealerCodeLabel(row.outletCode)}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap align-top">
                      {formatYmd(row.businessDate)}
                    </TD>
                    <TD className="align-top">
                      <span className="flex flex-wrap gap-1">
                        <Badge intent={DECISION_INTENT[row.decision] ?? 'neutral'}>
                          {DECISION_LABEL[row.decision] ?? row.decision}
                        </Badge>
                        {row.neverChecked ? (
                          <Badge intent="info">Never checked</Badge>
                        ) : null}
                      </span>
                    </TD>
                    {/* min-w-0 + break-words: the reasons carry full sentences
                        with figures in them, and an unbroken one would push the
                        table past its scroller. */}
                    <TD className="min-w-0 max-w-xl align-top">
                      <Reasons row={row} />
                    </TD>
                    <TD className="align-top text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemarks(row.dealerId);
                        }}
                        leftIcon={
                          <NotebookPen
                            width={14}
                            height={14}
                            strokeWidth={1.75}
                          />
                        }
                      >
                        Remarks
                      </Button>
                    </TD>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>

          {/* Mobile card-stack (< md) */}
          <MobileCardList
            variant="rows"
            cards={rows.map((row) => ({
              key: row.reportId,
              tone: tone === 'history' ? ('muted' as const) : ('default' as const),
              onClick: () => navigate(reportHref(row)),
              primary: (
                <span className="block break-words font-mono font-medium text-text">
                  {dealerCodeLabel(row.outletCode)}
                </span>
              ),
              primaryRightWidth: 'clamp' as const,
              primaryRight: (
                <>
                  <Badge intent={DECISION_INTENT[row.decision] ?? 'neutral'}>
                    {DECISION_LABEL[row.decision] ?? row.decision}
                  </Badge>
                  {row.neverChecked ? (
                    <Badge intent="info">Never checked</Badge>
                  ) : null}
                </>
              ),
              secondary: <Reasons row={row} />,
              meta: `${formatYmd(row.businessDate)} · tap to open the report`,
            }))}
          />
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * Why the report is being withheld, in the gate's own words.
 *
 * The messages are printed verbatim and never summarised: each one carries the
 * real figures — "the variation of 2,646,765 L is larger than all the fuel this
 * outlet has held since the 2026-09-03 inspection (19,741 L)" — and a refusal an
 * admin cannot act on is just a broken button.
 */
function Reasons({ row }: { row: AssuranceHoldRow }) {
  return (
    <span className="block min-w-0">
      {row.neverChecked ? (
        // Not a failure. These reports were generated before the gate existed,
        // so they carry no verdict of their own and what follows is today's
        // live re-read of them. An admin who reads "never checked" as "checked
        // and failed" goes looking for a fault at the wrong moment in time.
        <span className="mb-1 block text-xs text-info">
          Built before this check existed, so it carries no verdict of its own.
          What follows is today&apos;s reading of it, not a failure recorded at
          the time.
        </span>
      ) : null}
      {/* SOURCE, NOT JUST TEXT. `row.reasons` is a bare array of sentences with
          no attribution, so a fallible suggestion printed here would sit in the
          same typeface, weight and position as a proved physical impossibility —
          on the one screen where a hold on an automatic path is ever seen.
          `row.findings` already carries `source`, so this costs no wire change. */}
      {row.findings.length === 0 ? (
        row.reasons.length === 0 ? (
          <span className="block text-sm text-text-muted">
            {DECISION_NOTE[row.decision] ?? 'No reason was recorded.'}
          </span>
        ) : (
          row.reasons.map((reason, i) => (
            <span key={i} className="mt-0.5 block break-words text-sm text-text-muted">
              {reason}
            </span>
          ))
        )
      ) : (
        row.findings.map((f, i) => (
          <span key={i} className="mt-0.5 block break-words text-sm text-text-muted">
            {f.source === 'MODEL' ? (
              <span className="mr-1 whitespace-nowrap text-xs text-text-subtle">
                AI review ·
              </span>
            ) : null}
            {f.message}
          </span>
        ))
      )}
    </span>
  );
}

/**
 * Straight to that dealer's DSR panel, pinned to that report.
 *
 * `?report=<id>` is how `DsrReportView` selects a day: without the pin it opens
 * the dealer's LATEST report, which on a back-dated hold is a different day's
 * figures entirely.
 */
function reportHref(row: AssuranceHoldRow): string {
  return `/dsr/dealers/${row.dealerId}?report=${row.reportId}`;
}
