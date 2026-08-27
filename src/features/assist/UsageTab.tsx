import { AlertCircle, BookOpen, RefreshCw } from 'lucide-react';
import * as React from 'react';

import {
  ColumnChart,
  Meter,
  StatTile,
  type ColumnDatum,
} from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useAssistKbQuery,
  useAssistUsageQuery,
  useReloadAssistKb,
} from '@/hooks/api/useAssist';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd } from '@/lib/format';

import { costSplitOf, formatPaise, spendSplitSentence } from './assistFormat';
import {
  USAGE_CHART_COLUMNS_BELOW_MD,
  USAGE_DAYS,
  sharePct,
  toneForSpend,
} from './assistParams';

/**
 * What the assistant is costing, and what it is answering from.
 *
 * The window is always the same thirty days, on every device: the tiles, the
 * split and the table all cover it. Only the chart narrows below md, to the
 * newest fourteen columns with a toggle for the rest — thirty columns in a
 * 296px card is 7.9px per column, and each column is the only tap target for
 * that day's figure.
 */
export function UsageTab() {
  const usageQ = useAssistUsageQuery(USAGE_DAYS);
  // Memoised so the empty-array fallback is not a fresh array every render —
  // the totals below fold over it and would recompute on every keystroke elsewhere.
  const days = React.useMemo(() => usageQ.data?.days ?? [], [usageQ.data]);

  const totals = React.useMemo(
    () =>
      days.reduce(
        (acc, d) => {
          // A day with no split counts nothing towards the split, rather than
          // being read as "all of it was the AI" — see `costSplitOf`.
          const split = costSplitOf(d);
          return {
            sessions: acc.sessions + d.sessions,
            calls: acc.calls + d.calls,
            leads: acc.leads + d.leads,
            escalations: acc.escalations + d.escalations,
            paise: acc.paise + d.estPaise,
            vertexPaise: acc.vertexPaise + (split?.vertexPaise ?? 0),
            voicePaise: acc.voicePaise + (split?.voicePaise ?? 0),
          };
        },
        {
          sessions: 0,
          calls: 0,
          leads: 0,
          escalations: 0,
          paise: 0,
          vertexPaise: 0,
          voicePaise: 0,
        },
      ),
    [days],
  );

  const splitTotal = totals.vertexPaise + totals.voicePaise;

  const chartData: ColumnDatum[] = days.map((d) => {
    const split = costSplitOf(d);
    const counts = `${d.sessions} ${d.sessions === 1 ? 'visit' : 'visits'} · ${d.calls} ${
      d.calls === 1 ? 'call' : 'calls'
    } · ${d.leads} ${d.leads === 1 ? 'lead' : 'leads'}`;
    return {
      key: d.date,
      tick: d.date.slice(8),
      label: formatYmd(d.date, { weekday: true }),
      value: d.estPaise,
      // The per-day split rides on the readout and the table underneath the
      // chart. The columns themselves stay one series: a stacked column needs a
      // second hue, and the chart primitives keep to one on purpose.
      note: split
        ? `${counts} · speech ${formatPaise(split.voicePaise)} · AI ${formatPaise(split.vertexPaise)}`
        : counts,
    };
  });

  const todayPaise = usageQ.data?.todayPaise ?? 0;
  const budgetPaise = usageQ.data?.budgetPaise ?? 0;
  const tone = toneForSpend(todayPaise, budgetPaise);
  const peak = days.reduce<(typeof days)[number] | null>(
    (best, d) => (best === null || d.estPaise > best.estPaise ? d : best),
    null,
  );

  if (usageQ.isLoading) {
    return (
      <div className="grid gap-3 md:gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (usageQ.isError) {
    return (
      <Card>
        <CardContent padding="none" className="md:p-4">
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load usage"
            description={
              usageQ.error instanceof ApiError ? usageQ.error.message : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void usageQ.refetch()}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    // `gap-3` below md: five stacked cards, each with a header of its own, pay
    // this gap four times before the last figure on the screen.
    <div className="grid gap-3 md:gap-4">
      {/* Two-up from 0px rather than from 640px. `sm` is 640, above every phone
          in the target set, so all four tiles used to stack: ~372px of scroll to
          read four integers, with the spend meter pushed off the first screen
          entirely. Only the 0-639px band changes; 640px up is untouched. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Visits"
          value={totals.sessions.toLocaleString('en-IN')}
          caption={`Last ${USAGE_DAYS} days`}
        />
        <StatTile
          label="Calls"
          value={totals.calls.toLocaleString('en-IN')}
          caption="Visitors who tapped Call and talked"
        />
        <StatTile
          label="Leads"
          value={totals.leads.toLocaleString('en-IN')}
          caption="Left a name, a place or a number"
        />
        <StatTile
          label="Asked for a person"
          value={totals.escalations.toLocaleString('en-IN')}
          caption="We owe these a call back"
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today&apos;s spend</CardTitle>
            <CardSubtitle>
              What the assistant has cost since midnight, against the daily cap
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          <Meter
            label="Spent today"
            value={todayPaise}
            limit={budgetPaise}
            tone={tone}
            valueLabel={`${formatPaise(todayPaise)} of ${formatPaise(budgetPaise)}`}
            caption={
              budgetPaise <= 0
                ? 'No daily cap is set, so nothing switches itself off.'
                : todayPaise >= budgetPaise
                  ? 'The cap is reached: calls are off and the chat is offering a callback instead. It clears at midnight.'
                  : tone === 'warning'
                    ? 'Close to the cap. When it is reached, calls switch off on their own and the chat offers a callback.'
                    : 'When the cap is reached, calls switch off on their own and the chat offers a callback.'
            }
          />
        </CardContent>
      </Card>

      {splitTotal > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Where the money goes</CardTitle>
              <CardSubtitle>
                {spendSplitSentence(
                  {
                    vertexPaise: totals.vertexPaise,
                    voicePaise: totals.voicePaise,
                    totalPaise: splitTotal,
                  },
                  `the last ${USAGE_DAYS} days`,
                )}
              </CardSubtitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:gap-4">
            {/* Two meters against the same total rather than a stacked column:
                one bill split two ways is a share, and the chart primitives keep
                to a single hue by house rule — a real second series needs a
                validated palette first. Same hue is right here anyway; both bars
                measure the same thing, rupees. */}
            <Meter
              label="Voice (ElevenLabs)"
              value={totals.voicePaise}
              limit={splitTotal}
              valueLabel={`${formatPaise(totals.voicePaise)} · ${sharePct(totals.voicePaise, splitTotal)}%`}
              caption="Listening to the visitor and speaking the answer back. Charged per character spoken."
            />
            <Meter
              label="AI (Google)"
              value={totals.vertexPaise}
              limit={splitTotal}
              valueLabel={`${formatPaise(totals.vertexPaise)} · ${sharePct(totals.vertexPaise, splitTotal)}%`}
              caption="Working out the answer, and the search over the guidelines. Charged per token."
            />
            {/* Named the table, not the hover. A phone has no hover, and the
                table below the chart is the only place a per-day split has ever
                been reachable without one. */}
            <p className="text-xs text-text-subtle">
              Nothing extra is stored for this — it is the same counters as the
              total above, priced per vendor. Open &ldquo;Show every day as a
              table&rdquo; below for each day&apos;s split.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What it costs, day by day</CardTitle>
            <CardSubtitle>
              Last {USAGE_DAYS} days · {formatPaise(totals.paise)} in total
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* The daily cap is deliberately NOT drawn as a threshold line here.
              The cap is sized for a busy day, so on an ordinary one it is many
              times the tallest column — and a scale stretched to reach it turns
              every real day into a stub. The cap has its own meter above; this
              chart's job is the shape of the days against each other. The
              busiest day is named in words underneath instead. */}
          <ColumnChart
            data={chartData}
            formatValue={formatPaise}
            // Neither "hover" nor "tab through" is available on a phone, and
            // the per-day split the old sentence pointed at was produced by
            // exactly those two events. Tapping a column now sets the readout
            // and leaves it there.
            idleReadout="Tap or hover a day — or open the table below — to see what it cost, and what speech and the AI cost within it."
            tableCaption="Show every day as a table"
            tableValueHeader="Spend"
            maxColumns={USAGE_CHART_COLUMNS_BELOW_MD}
            // The table is the primary form on a phone: it is the only shape in
            // which thirty days of rupee figures are actually readable. The
            // chart resolves the breakpoint itself — a caller-side `!isMd` here
            // opened a second subscription to the query it already holds.
            tableOpenBelowMd
          />
          {peak && budgetPaise > 0 ? (
            <p className="mt-2 text-xs text-text-subtle">
              Busiest day was {formatYmd(peak.date, { weekday: true })} at{' '}
              {formatPaise(peak.estPaise)} —{' '}
              {Math.round((peak.estPaise / budgetPaise) * 100)}% of one day&apos;s cap.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <KnowledgeBaseCard />
    </div>
  );
}

/**
 * What the assistant is answering FROM.
 *
 * The pack is loaded lazily on the first question and cached in the process, so
 * "loaded" here is a statement about this server since its last restart, not
 * about S3. Reload re-reads it without a deploy — that is the whole reason the
 * knowledge base lives in a bucket rather than in the build.
 */
function KnowledgeBaseCard() {
  const toast = useToast();
  const kbQ = useAssistKbQuery();
  const reload = useReloadAssistKb();
  const kb = kbQ.data;

  async function onReload() {
    try {
      const status = await reload.mutateAsync();
      toast.success(
        status.loaded
          ? `Reloaded — ${status.count.toLocaleString('en-IN')} passages, version ${status.version ?? 'unknown'}`
          : 'Reload finished, but nothing loaded. See the error on the card.',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not reload');
    }
  }

  return (
    <Card>
      {/* `action`, not a second child: as a child the `whitespace-nowrap`
          Reload button is just another item in a `justify-between` row that
          cannot wrap, and it squeezed the title's column to ~190px at 360px. */}
      <CardHeader
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void onReload()}
            loading={reload.isPending}
            disabled={kbQ.isLoading}
            leftIcon={<RefreshCw width={14} height={14} strokeWidth={1.75} />}
          >
            Reload
          </Button>
        }
      >
        <CardTitle>What it answers from</CardTitle>
        <CardSubtitle>
          The packed guidelines the assistant reads. Nothing else is used.
        </CardSubtitle>
      </CardHeader>
      <CardContent>
        {kbQ.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : kbQ.isError || !kb ? (
          <EmptyState
            icon={<BookOpen width={28} height={28} strokeWidth={1.75} />}
            title="Could not read the knowledge-base status"
            description={
              kbQ.error instanceof ApiError ? kbQ.error.message : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void kbQ.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge intent={kb.loaded ? 'success' : 'warning'}>
                {kb.loaded ? 'Loaded' : 'Not loaded yet'}
              </Badge>
              {kb.error ? <Badge intent="danger">Last try failed</Badge> : null}
            </div>
            {/* Two-up from 0px: four one-line facts as four full-width rows is
                ~200px of scroll for values that are 8-20 characters long. Four
                across only from md: at 640-767px the four columns are ~135px
                each and "Read at" prints a full date and time, which then wrapped
                to three lines and set the height of the whole row. */}
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <dt className="text-xs text-text-muted">Version</dt>
                <dd className="mt-0.5 break-words text-sm text-text">
                  {kb.version ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Passages</dt>
                <dd className="mt-0.5 text-sm tabular-nums text-text">
                  {kb.count ? kb.count.toLocaleString('en-IN') : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Read at</dt>
                <dd className="mt-0.5 text-sm text-text">
                  {kb.loadedAt ? formatDateTime(kb.loadedAt) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Came from</dt>
                <dd className="mt-0.5 text-sm text-text">
                  {kb.source === 's3'
                    ? 'The bucket'
                    : kb.source === 'disk'
                      ? "This server's own copy"
                      : '—'}
                </dd>
              </div>
            </dl>
            {kb.error ? (
              // `break-words` because this string is routinely an S3 URI —
              // `s3://mdg-assist-kb/packs/2026-08-21/pack.jsonl` is one
              // unbreakable token wider than a 296px card, and `main` clips
              // rather than scrolls. It is also the one line on the screen that
              // says why the assistant is not answering.
              <p className="break-words rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
                {kb.error}
              </p>
            ) : null}
            {!kb.loaded && !kb.error ? (
              <p className="text-xs text-text-subtle">
                Nothing has been asked since the last restart. The pack is read on
                the first question, never at boot — a bucket having a bad morning
                must not stop the API starting.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
