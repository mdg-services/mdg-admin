import { AlertTriangle, ArrowRight, ScanLine } from 'lucide-react';
import * as React from 'react';

import { Badge, Callout, Card, CardContent, Skeleton } from '@/components/ui';
import {
  useDealerLedgerFlags,
  useLedgerPeriodSummary,
} from '@/hooks/api/useLedgerWatch';
import { cn } from '@/lib/cn';
import { formatDmy, inrFormat, istTodayYmd } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type { LedgerFlagDto } from '@dk/shared';

import {
  bandFigures,
  bandFlags,
  flagSeverityIntent,
  ledgerBandTone,
  monthLabel,
} from './ledgerWatchFormat';

/**
 * The highlighted band at the top of a dealer's Credit & DOD screen: everything
 * that moved on this ledger that is NOT the routine buy-and-pay pair.
 *
 * WHY IT IS ON THIS SCREEN AND NOT ONLY IN THE VAULT
 * --------------------------------------------------
 * Ledger Watch has its own pane, and that pane is the full thing — every
 * finding, every month, the four-figure breakdown, the acknowledge and ignore
 * controls. But it is a dataset an admin has to go and choose, and nobody
 * chooses a dataset to find out about a problem they do not yet know exists.
 *
 * This screen is where the DUE AMOUNT and the DUE DATE are, and those two
 * figures are exactly what a fee, an interest posting or a licence-fee recovery
 * silently moved. So the band sits ABOVE the generate controls: before an admin
 * sends a dealer a card saying "deposit ₹X by the 6th", they have already seen
 * that ₹9,443 came off the account for a reason nobody named. Anything below
 * the report controls would be read after the report went out.
 *
 * IT IS ALLOWED TO BE QUIET
 * -------------------------
 * It is on screen every time, so it cannot be loud every time — a band that is
 * red daily is a band nobody reads by the second week, and fleet-card
 * settlements alone put an INFO on most dealers' ledgers most days.
 * {@link ledgerBandTone} takes the tone from the WORST thing present rather than
 * from the count, and a month with nothing unusual says so in one calm line
 * rather than disappearing — an absent band and a band that failed to load look
 * identical, and on a money screen those two must never be confusable.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * It cannot move `availed`, `dueAmount` or `dueDate`, and it does not try to
 * explain them. It reports what moved and links to the place where an admin can
 * rule on it. Ledger Watch observes; it never adjusts.
 */

/** Card surface per tone. The border is what makes it read as a band. */
const TONE_SURFACE: Record<Intent, string> = {
  danger: 'border-danger bg-danger-soft',
  warning: 'border-warning bg-warning-soft',
  info: 'border-info bg-info-soft',
  neutral: 'border-border bg-surface',
  success: 'border-border bg-surface',
};

/** The dot beside a finding, coloured by its severity. */
const DOT_COLOUR: Record<Intent, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  neutral: 'bg-neutral',
  success: 'bg-success',
};

interface Props {
  dealerId: string;
}

export function LedgerWatchBand({ dealerId }: Props) {
  /**
   * The month, from the IST business day.
   *
   * `istTodayYmd()` and never `new Date()`: the box runs UTC, so between 00:00
   * and 05:30 IST a local read is still on yesterday — and on the 1st of a month
   * that is still the previous month, which would show a summary one month
   * behind on the one morning of the month somebody is most likely to open it.
   * The backend resolves the month the same way, so the two agree.
   */
  const month = React.useMemo(() => istTodayYmd().slice(0, 7), []);

  const summaryQ = useLedgerPeriodSummary(dealerId, month);
  // Open findings only. The band is a "does this need me" question, and a
  // finding somebody already dismissed does not.
  const flagsQ = useDealerLedgerFlags(dealerId, { status: 'OPEN' });

  const counts = flagsQ.data?.pages[0]?.counts;
  const flags = React.useMemo(
    () => bandFlags(flagsQ.data?.pages.flatMap((p) => p.rows) ?? []),
    [flagsQ.data],
  );
  const tone = ledgerBandTone(counts);
  const figures = summaryQ.data ? bandFigures(summaryQ.data) : null;

  // A dealer whose Ledger Watch has never run has no findings and no summary,
  // which is not an error and must not be dressed as one. It reads as the
  // success case above ("nothing but fuel bought and money paid in"), which is
  // the honest reading of an empty result — and the moment the first run lands
  // the band fills in on its own.
  if (summaryQ.isLoading || flagsQ.isLoading) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  /**
   * A FAILED READ IS NOT A CLEAN LEDGER, and this branch is the only thing
   * standing between those two.
   *
   * With no data, `counts` is undefined, and `ledgerBandTone(undefined)` returns
   * the success case — "nothing on this ledger but fuel bought and money paid
   * in". That sentence is true of a quiet month and it is a lie about a failed
   * request, and the two are indistinguishable to the person reading it. This is
   * the same fault the whole product exists to catch: a screen stating something
   * the thing behind it does not actually say. So a failure says so, in a tone
   * that is plainly not the calm one.
   */
  if (summaryQ.isError || flagsQ.isError) {
    return (
      <Card className="border-2 border-warning bg-warning-soft">
        <CardContent className="grid gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-warning"
              aria-hidden
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">
                Other movements — could not be read
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                This is not the same as &ldquo;nothing unusual&rdquo; — the
                check did not run, so treat the figures below as unchecked.
                Reload, or open Ledger watch.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-2', TONE_SURFACE[tone.intent])}>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {tone.urgent ? (
              <AlertTriangle
                width={18}
                height={18}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-danger"
                aria-hidden
              />
            ) : (
              <ScanLine
                width={18}
                height={18}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-text-muted"
                aria-hidden
              />
            )}
            {/* THE MONTH IS NOT IN THIS HEADING, and that is deliberate. The
                three figures below cover one month; the findings below THEM are
                a to-do list and carry whatever is still open, which can be
                older. A heading reading "Other movements — September 2026" over
                both implied the July licence fee in the list was a September
                one. Each block now says what it covers, directly above itself. */}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">Other movements</h2>
              <p className="mt-0.5 text-sm text-text-muted">{tone.headline}</p>
            </div>
          </div>
          {counts && counts.total > 0 ? (
            <Badge intent={tone.intent} className="tabular-nums">
              {counts.total} open
            </Badge>
          ) : null}
        </div>

        {/* THE FIGURES.
            `minmax(0,1fr)` on every track, not `1fr`: a `1fr` track is sized by
            its min-content, so a long rupee figure pushes the grid wider than
            its box and `main` clips it — the failure this app has already paid
            for on three pages. */}
        {figures ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
              {monthLabel(month)}
            </p>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(0,12rem))] gap-x-6 gap-y-3">
              {figures.figures.map((f) => (
                <div key={f.key} className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-text-subtle">
                    {f.label}
                  </dt>
                  <dd
                    className={cn(
                      'mt-0.5 text-lg font-semibold tabular-nums',
                      f.key === 'net' && f.intent === 'success' && 'text-success',
                      f.key === 'net' && f.intent === 'danger' && 'text-danger',
                      f.key !== 'net' && 'text-text',
                    )}
                  >
                    {/* The net keeps its sign — "+₹21,657.45" and "−₹8,680.26"
                        say which way the month went at a glance, and the two
                        other figures are directional by their labels. */}
                    {f.key === 'net' && f.value !== 0
                      ? `${f.value > 0 ? '+' : '−'}${inrFormat(Math.abs(f.value))}`
                      : inrFormat(f.value)}
                  </dd>
                  <p className="mt-0.5 text-xs text-text-subtle">{f.hint}</p>
                </div>
              ))}
            </dl>

            {/* The one thing this product exists to stop: a headline the
                calculation behind it reads differently. When the server's own
                net disagrees with received − charged, both are shown and
                neither is picked. */}
            {!figures.netAgrees ? (
              <Callout intent="warning">
                These do not add up: {inrFormat(figures.net)} from the two figures
                above, {inrFormat(figures.reportedNet)} from the ledger. Open
                Ledger watch before quoting either.
              </Callout>
            ) : null}
          </>
        ) : null}

        {flags.length > 0 ? (
          <div className="grid gap-2">
            {/* Says "open", not the month: these are whatever still needs
                somebody, which may predate the figures above. */}
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
              Open findings
            </p>
            <ul className="grid gap-2">
              {flags.map((flag) => (
                <FindingLine key={flag.id} flag={flag} />
              ))}
            </ul>
          </div>
        ) : null}

        {counts && counts.total > 0 ? (
          <div className="flex justify-end">
            {/* A plain link and not a Button: it leaves this screen for the
                Vault's Ledger watch dataset, and the acknowledge / ignore
                controls live there. Deciding is a deliberate act on the screen
                built for it, not a click on a summary band. */}
            <a
              href="?tab=data-vault&vault=ledger-watch"
              className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
            >
              {counts.total > flags.length
                ? `See all ${counts.total}`
                : 'Open Ledger watch'}
              <ArrowRight width={14} height={14} strokeWidth={1.75} aria-hidden />
            </a>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * One finding: a coloured dot, the title, the figure and the date, then the
 * sentence.
 *
 * The sentence is `detailEn` verbatim from the server, where every rupee figure
 * in it was formatted in code out of the evidence stored beside it. This
 * component does not compose a sentence of its own and must not start: a figure
 * assembled on the client is a figure nobody can check against the record.
 */
function FindingLine({ flag }: { flag: LedgerFlagDto }) {
  const intent = flagSeverityIntent(flag.severity);
  return (
    <li className="flex min-w-0 items-start gap-2">
      <span
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT_COLOUR[intent])}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">
          {flag.titleEn}
          <span className="text-text-muted"> · {formatDmy(flag.date)}</span>
        </p>
        <p className="text-sm text-text-muted">{flag.detailEn}</p>
      </div>
    </li>
  );
}
