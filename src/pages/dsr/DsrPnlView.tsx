import { ArrowLeftRight, IndianRupee, Share2 } from 'lucide-react';
import * as React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateRangeFilter,
  EmptyState,
  SegmentedControl,
  Skeleton,
  dateRangeForPreset,
  isValidDateRange,
  useToast,
  type DateRangeValue,
} from '@/components/ui';
import { useDsrPnl } from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { shareCardPng } from '@/lib/cardCanvas';
import { formatInrWhole, formatLitres, formatYmd, isYmd } from '@/lib/format';
import {
  computeFuelPnl,
  type FuelPnlSettings,
  SUSPICIOUS_GAIN_RATE,
  withDefaultRates,
  type PnlProduct,
  type TestingTreatment,
} from '@/lib/fuelPnl';
import { buildPnlCard } from '@/lib/pnlCard';
import { renderPnlCardPng } from '@/lib/pnlCardImage';
import { dealerCodeLabel } from '@dk/shared';

import { PnlAssumptions } from './pnl/PnlAssumptions';
import { PnlLoadsTable } from './pnl/PnlLoadsTable';

/**
 * What a dealer made on the fuel he bought — per delivery, and per grade.
 *
 * The DSR counts litres exactly and has never said what any of them were worth,
 * because no portal we read publishes a price. This screen supplies the two
 * missing rates in the open, shows every other constant that went into the
 * arithmetic beside the answer, and prices each tanker on its own.
 *
 * Nothing here is stored on the server. The rates live in this browser, against
 * this dealer, and the page says so — a profit figure the business acts on needs
 * a rate someone signed off, and until there is a place to sign one off, saying
 * "these are your numbers, on your machine" is the honest position.
 */

function storageKey(dealerId: string | undefined): string {
  return `mdg.fuelPnl.${dealerId ?? 'unknown'}`;
}

const EMPTY_SETTINGS: FuelPnlSettings = { rates: {}, testing: 'RETURNED', lossBasis: 'COST' };

/**
 * The testing switch lives HERE, beside the two answers it chooses between —
 * not in the Assumptions panel with the other three.
 *
 * The two scenario cards carry every affordance of a selected option (a brand
 * border, a filled ground, a "Showing" pill) and the control that actually
 * changed them used to sit two cards further down the page. That is what made
 * the comparison read as decoration rather than as a question with an answer.
 */
const TESTING_OPTIONS: { value: TestingTreatment; label: string }[] = [
  { value: 'RETURNED', label: 'Poured back in' },
  { value: 'SOLD', label: 'Sold' },
];

/**
 * The rates an admin last typed for THIS dealer.
 *
 * Per dealer, not global: two outlets in different states pay different VAT and
 * sell at different prices, so one shared set of rates would quietly price one
 * of them wrong. Wrapped in try/catch because a browser with site data blocked
 * throws on access rather than returning null, and a page that cannot remember
 * a rate should still render.
 */
function loadSettings(dealerId: string | undefined): FuelPnlSettings {
  try {
    const raw = window.localStorage.getItem(storageKey(dealerId));
    if (!raw) return EMPTY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FuelPnlSettings>;
    return {
      rates: parsed.rates ?? {},
      testing: parsed.testing === 'SOLD' ? 'SOLD' : 'RETURNED',
      lossBasis: parsed.lossBasis === 'RETAIL' ? 'RETAIL' : 'COST',
    };
  } catch {
    return EMPTY_SETTINGS;
  }
}

function saveSettings(dealerId: string | undefined, s: FuelPnlSettings): void {
  try {
    window.localStorage.setItem(storageKey(dealerId), JSON.stringify(s));
  } catch {
    /* a browser that refuses storage still gets a working page */
  }
}

/**
 * One headline figure.
 *
 * Sans with `tabular-nums`, not mono, and never `truncate`. Both were doing
 * real damage at 360px: a headline column is ~138px wide there, and
 * `−₹12,34,567` set in 24px JetBrains Mono is ~158px — so a lakh-scale figure
 * was not merely tight, it was silently clipped to a *different, smaller
 * number*. Inter's tabular figures are narrower, `break-words` wraps rather
 * than cuts, and it matches what every other big number in this admin is set
 * in (`VariationCard`, `Kpi`).
 */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Red. There is deliberately no green — see `lossTone`. */
  tone?: 'bad';
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</p>
      <p
        className={`mt-1 break-words text-xl font-semibold tabular-nums md:text-2xl ${
          tone === 'bad' ? 'text-danger' : 'text-text'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Red when fuel went missing; no colour at all otherwise.
 *
 * Two things this deliberately does not do. It does not paint a surplus green:
 * this page's own callout argues that an excess is almost always a delivery
 * missing from the records, so the success colour would tell an admin the
 * opposite of what the screen is saying. And it does not colour a value that is
 * still an em dash because no rate has been entered — a red "—" reads as a loss
 * somebody measured.
 */
function lossTone(litres: number, value: number | null): 'bad' | undefined {
  return value !== null && litres < 0 ? 'bad' : undefined;
}

/** "Fuel lost" unless there is an actual surplus to name. */
function lossLabel(litres: number): string {
  return litres > 0 ? 'Fuel gained' : 'Fuel lost';
}

export function DsrPnlView() {
  const { dealerId } = useParams<{ dealerId: string }>();
  const [search, setSearch] = useSearchParams();
  const toast = useToast();

  // The window lives in the URL so a figure someone is querying is a link they
  // can send, and so a refresh does not silently move the period under them.
  const [range, setRange] = React.useState<DateRangeValue>(() => {
    const from = search.get('from');
    const to = search.get('to');
    if (isYmd(from) && isYmd(to) && from <= to) return { preset: 'custom', from, to };
    return dateRangeForPreset('month');
  });

  React.useEffect(() => {
    const next = new URLSearchParams(search);
    next.set('from', range.from);
    next.set('to', range.to);
    setSearch(next, { replace: true });
    // `search`/`setSearch` are intentionally out of the dep list: including them
    // re-runs this on the very change it just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const [settings, setSettings] = React.useState<FuelPnlSettings>(() => loadSettings(dealerId));
  React.useEffect(() => setSettings(loadSettings(dealerId)), [dealerId]);
  const updateSettings = React.useCallback(
    (next: FuelPnlSettings) => {
      setSettings(next);
      saveSettings(dealerId, next);
    },
    [dealerId],
  );

  const q = useDsrPnl(dealerId, range.from, range.to, isValidDateRange(range));
  const data = q.data;

  /**
   * Give every grade a starting rate the first time it is seen.
   *
   * The grades are not known until the response lands, so this cannot happen in
   * `loadSettings`. `withDefaultRates` only ever ADDS a missing key, so a figure
   * an admin typed — or deliberately cleared to blank — survives; the key-count
   * guard is what stops this effect from re-running on the state it just set.
   */
  React.useEffect(() => {
    if (!data) return;
    const seeded = withDefaultRates(
      settings.rates,
      data.products.map((p) => p.productKey),
    );
    if (Object.keys(seeded).length === Object.keys(settings.rates).length) return;
    updateSettings({ ...settings, rates: seeded });
  }, [data, settings, updateSettings]);

  // Computed twice, always. The second run is what makes the testing question
  // answerable on the page instead of in someone's head.
  const primary = React.useMemo(
    () => (data ? computeFuelPnl(data.products, settings) : null),
    [data, settings],
  );
  const alternate = React.useMemo(
    () =>
      data
        ? computeFuelPnl(data.products, {
            ...settings,
            testing: settings.testing === 'SOLD' ? 'RETURNED' : 'SOLD',
          })
        : null,
    [data, settings],
  );

  const outletCode = data?.outletCode ?? null;
  const title = outletCode ? `Fuel P&L — ${dealerCodeLabel(outletCode)}` : 'Fuel P&L';

  const [sharing, setSharing] = React.useState(false);
  /**
   * The whole answer as one PNG.
   *
   * Built from `data` and `settings` — the same two inputs this screen renders
   * from — so the image can never show a figure the page does not. It carries
   * BOTH testing answers regardless of which one is selected here, because a
   * profit forwarded without the question behind it is a guess wearing a
   * number's clothes.
   */
  const onShare = React.useCallback(async () => {
    if (!data) return;
    setSharing(true);
    try {
      const png = await renderPnlCardPng(buildPnlCard(data, settings));
      const name = `fuel-pnl-${outletCode ?? 'dealer'}-${range.from}-to-${range.to}.png`;
      const res = await shareCardPng(png, name);
      if (res.outcome === 'downloaded') toast.success('Image saved.');
      else if (res.outcome === 'failed') {
        toast.error(res.reason ?? 'The image could not be saved.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The image could not be made.');
    } finally {
      setSharing(false);
    }
  }, [data, settings, outletCode, range.from, range.to, toast]);

  if (q.isLoading) {
    return (
      <>
        <PageHeader title="Fuel P&L" />
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (q.isError) {
    const notConfigured = q.error instanceof ApiError && q.error.status === 404;
    return (
      <>
        <PageHeader title="Fuel P&L" />
        <EmptyState
          // Sized like every other empty state in this admin: lucide's own
          // default is 24px at stroke 2, which reads heavier and smaller than
          // the 28 / 1.75 the rest of the product uses.
          icon={<IndianRupee width={28} height={28} strokeWidth={1.75} />}
          title={
            notConfigured
              ? 'This dealer has no Daily Sales Report yet'
              : 'Could not load the fuel figures'
          }
          description={
            notConfigured
              ? 'Fuel profit is worked out from the day book, so set the Daily Sales Report up for this dealer first.'
              : q.error instanceof Error
                ? q.error.message
                : 'Please try again.'
          }
        />
      </>
    );
  }

  // Neither loading nor an error, but nothing to render — most often a window
  // that closed before this dealer was set up. Returning `null` painted a white
  // page with no explanation, and an empty `products` did something worse: it
  // showed a confident zero.
  if (!data || !primary || !alternate || data.products.length === 0) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState
          icon={<IndianRupee width={28} height={28} strokeWidth={1.75} />}
          title="No fuel moved in this period"
          description="Nothing was delivered or sold between these dates. Try a wider period, or generate the Daily Sales Report for these days first."
        />
      </>
    );
  }

  const t = primary.totals;
  const swing =
    t.profit !== null && alternate.totals.profit !== null
      ? alternate.totals.profit - t.profit
      : null;

  // First visit: no rate has ever been typed for this dealer, so every rupee
  // figure is an em dash and the testing comparison is two identical empty
  // boxes. Showing that wall of dashes is worse than showing nothing — it looks
  // like the screen is broken rather than like it is waiting for two numbers.
  const anyPriced = primary.products.some((p) => p.priced);

  return (
    <>
      <PageHeader
        title={title}
        subtitle="What the fuel actually earned — every delivery priced, with every assumption on the page."
        breadcrumbs={[
          { label: 'Daily Sales Report', to: '/dsr' },
          ...(dealerId ? [{ label: outletCode ?? 'Dealer', to: `/dsr/dealers/${dealerId}` }] : []),
          { label: 'Fuel P&L' },
        ]}
        actions={
          <Button
            variant="secondary"
            leftIcon={<Share2 width={16} height={16} strokeWidth={1.75} />}
            onClick={onShare}
            loading={sharing}
          >
            Share as image
          </Button>
        }
      />

      <div className="space-y-3 md:space-y-5">
        <DateRangeFilter
          value={range}
          onChange={setRange}
          label="Period"
          mobilePresets="menu"
          mobileCustomInSheet
        />

        {/* ── headline ─────────────────────────────────────────────── */}
        {anyPriced ? (
          <Card>
            {/* Below md a headline column is ~138px, so the gutters and the 20px
                of vertical padding are the tallest thing in the card that is
                not a figure. Every step is gated at md, so the tablet and the
                desktop keep the spacing they have. */}
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 md:gap-5 md:py-5 lg:grid-cols-4">
              <Stat
                label="Fuel sold"
                value={formatLitres(t.soldLitres)}
                hint={`${formatLitres(t.receiptLitres)} bought`}
              />
              <Stat
                label="Margin on sales"
                value={formatInrWhole(t.grossMargin)}
                hint={
                  t.complete
                    ? 'Before any fuel loss'
                    : 'Part of the total only — some grades have no prices yet'
                }
              />
              <Stat
                label={lossLabel(t.lostLitres)}
                value={formatInrWhole(t.lostValue)}
                tone={lossTone(t.lostLitres, t.lostValue)}
                hint={formatLitres(t.lostLitres, { sign: true })}
              />
              <Stat
                label="Fuel profit"
                value={formatInrWhole(t.profit)}
                hint={
                  t.grossMargin && t.lostValue !== null && t.grossMargin !== 0
                    ? `${Math.abs((t.lostValue / t.grossMargin) * 100).toFixed(1)}% of the margin ${
                        t.lostValue < 0 ? 'lost' : 'added'
                      }`
                    : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          // The litres are real and measured, so they lead. Everything else on
          // the page waits on two numbers nobody has typed yet, and saying so
          // in one sentence beats printing four em dashes under four headings.
          <Card>
            <CardContent className="py-4 md:py-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:gap-5">
                <Stat label="Fuel sold" value={formatLitres(t.soldLitres)} />
                <Stat label="Fuel bought" value={formatLitres(t.receiptLitres)} />
              </div>
              <p className="mt-4 max-w-prose text-sm text-text-muted">
                Those litres are counted, not guessed. What they were worth is not: no portal we
                read publishes a fuel price. Put in what a litre cost and what it sold for, under{' '}
                <span className="font-medium text-text">Assumptions</span> just below, and every
                rupee figure on this page fills in.
              </p>
            </CardContent>
          </Card>
        )}

        {anyPriced && !t.complete ? (
          <Callout intent="info">
            Some grades still have no prices. Their litres are counted in the totals above; their
            money is not. Add a cost and a pump price for each one to get the full figure.
          </Callout>
        ) : null}

        {/* ── the testing question ─────────────────────────────────── */}
        {anyPriced ? (
          <Card>
            <CardHeader>
              <CardTitle>Was the testing fuel sold?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="max-w-prose text-sm text-text-muted">
                The report charges {data.config.testingPerActivePumpLitres} litres per active pump
                per day as testing, and assumes every one of them went back into the tank. Nobody
                measures it. If it was sold instead, it never went missing — and most of the
                shortage in the report is not a shortage at all. Pick an answer and the whole page
                follows it.
              </p>

              <SegmentedControl
                aria-label="Testing fuel was"
                value={settings.testing}
                onChange={(v) => updateSettings({ ...settings, testing: v })}
                options={TESTING_OPTIONS}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <ScenarioCard
                  heading="Poured back into the tank"
                  subheading="What the report assumes"
                  products={settings.testing === 'RETURNED' ? primary.products : alternate.products}
                  profit={
                    settings.testing === 'RETURNED' ? t.profit : alternate.totals.profit
                  }
                  active={settings.testing === 'RETURNED'}
                />
                <ScenarioCard
                  heading="Sold to customers"
                  subheading="Metered, paid for, gone"
                  products={settings.testing === 'SOLD' ? primary.products : alternate.products}
                  profit={settings.testing === 'SOLD' ? t.profit : alternate.totals.profit}
                  active={settings.testing === 'SOLD'}
                />
              </div>

              {swing !== null && Math.abs(swing) >= 1 ? (
                <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-sm text-text">
                  <ArrowLeftRight
                    width={16}
                    height={16}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-text-muted"
                    aria-hidden
                  />
                  <span>
                    Answering this one question moves the profit by{' '}
                    <strong className="tabular-nums">{formatInrWhole(Math.abs(swing))}</strong> over this
                    period.
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* ── the assumptions ──────────────────────────────────────── */}
        <PnlAssumptions data={data} settings={settings} onChange={updateSettings} />

        {/* ── per grade ────────────────────────────────────────────── */}
        {primary.products.map((p) => (
          <GradeSection key={p.productKey} product={p} />
        ))}

        <p className="text-sm text-text-muted">
          The prices you entered are kept in this browser only, against{' '}
          {outletCode ? dealerCodeLabel(outletCode) : 'this dealer'}. Nothing on this page is saved
          to the server or shown to the dealer — so a colleague opening the same screen sees their
          own prices, and their own profit figure, not yours.
        </p>
      </div>
    </>
  );
}

/** One side of the testing comparison. */
function ScenarioCard({
  heading,
  subheading,
  products,
  profit,
  active,
}: {
  heading: string;
  subheading: string;
  products: PnlProduct[];
  profit: number | null;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 md:p-4 ${
        active ? 'border-brand bg-brand-soft' : 'border-border bg-surface-2'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* h4, not h3: the card's own `CardTitle` ("Was the testing fuel
            sold?") is the h3 these two sit under. */}
        <h4 className="text-sm font-semibold text-text">{heading}</h4>
        {active ? (
          <span className="text-xs font-medium uppercase tracking-wide text-brand">Showing</span>
        ) : null}
      </div>
      <p className="text-xs text-text-muted">{subheading}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-text-subtle">Fuel profit</p>
      <p className="text-xl font-semibold tabular-nums text-text">{formatInrWhole(profit)}</p>
      <p className="mt-2 text-xs uppercase tracking-wide text-text-subtle">Stock variation</p>
      <dl className="space-y-0.5">
        {products.map((p) => (
          <div key={p.productKey} className="flex justify-between gap-2 text-xs">
            <dt className="truncate text-text-muted">{p.labelEn}</dt>
            <dd className="shrink-0 tabular-nums text-text">
              {p.loss ? formatLitres(p.loss.variationLitres, { sign: true }) : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One grade: its own summary line, then every delivery in the window. */
function GradeSection({ product }: { product: PnlProduct }) {
  const loss = product.loss;
  // A gain of this size is what a delivery missing from the portal looks like.
  // Counting it as profit would be the wrong lesson to draw from it.
  const suspiciousGain = !!loss && loss.lossRate > SUSPICIOUS_GAIN_RATE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{product.labelEn}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:gap-4 lg:grid-cols-4">
          <Stat label="Sold" value={formatLitres(product.soldLitres)} />
          <Stat label="Margin on sales" value={formatInrWhole(product.grossMargin)} />
          <Stat
            label={lossLabel(product.lostLitres)}
            value={formatInrWhole(product.lostValue)}
            tone={lossTone(product.lostLitres, product.lostValue)}
            hint={formatLitres(product.lostLitres, { sign: true })}
          />
          <Stat
            label="Fuel profit"
            value={formatInrWhole(product.profit)}
            hint={
              product.profitPerLitre === null
                ? undefined
                : `₹${product.profitPerLitre.toFixed(2)} / litre`
            }
          />
        </div>

        {loss ? (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-text-muted">
            How this grade&rsquo;s loss is shared out: the variation of{' '}
            <span className="tabular-nums text-text">
              {formatLitres(loss.variationLitres, { sign: true })}
            </span>{' '}
            measured on {formatYmd(loss.asOf)}, spread across the{' '}
            <span className="tabular-nums text-text">
              {formatLitres(loss.receiptsSinceInspection)}
            </span>{' '}
            received since the {formatYmd(loss.sinceDate)} inspection — that is{' '}
            <span className="tabular-nums text-text">{(loss.lossRate * 100).toFixed(4)}%</span> of
            every litre. The variation counts from that inspection onward and cannot be split by
            window, so the same rate is applied to this window&rsquo;s own litres.
          </p>
        ) : (
          <Callout intent="warning">
            No stock variation is available for this grade, so no fuel loss has been priced. The
            figures above are the margin alone. Generate a report for this dealer to get one.
          </Callout>
        )}

        {suspiciousGain ? (
          // No icon of our own: `Callout` already draws one, and two warning
          // glyphs side by side is what this looked like.
          <Callout intent="warning">
            This grade is showing more fuel than the books account for, and it is being counted
            here as profit. An excess this size almost always means a delivery is missing from the
            records rather than that the fuel was free — check the shift data before trusting the
            gain.
          </Callout>
        ) : null}

        <PnlLoadsTable product={product} />
      </CardContent>
    </Card>
  );
}
